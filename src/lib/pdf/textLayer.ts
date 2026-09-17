import { loadPdfDocument, type PdfTextStyle } from './pdfjs';
import { multiplyTransform } from './geometry';
import { renderPageToCanvas } from './rasterize';
import type { FontFamily } from './fonts';

/**
 * Finds the text that is already inside a PDF, so it can be edited in place.
 *
 * A PDF has no notion of an editable text box: it holds positioned glyph runs
 * drawn with a subset of an embedded font. Rewriting a glyph run in place would
 * mean re-encoding that font subset, which is not something we can do reliably
 * in a browser. So editing works the way every browser-based PDF editor does it:
 * the original run is covered with a patch of the page's own background colour,
 * and the replacement is drawn on top in a matched standard font.
 *
 * That makes two things matter a great deal, and both are measured from the
 * rendered page rather than guessed: the colour *behind* the text (so the patch
 * is invisible) and the colour *of* the text (so the replacement matches).
 */

export interface PdfTextRun {
  /** Stable within a page, so edits survive a re-extraction. */
  id: string;
  pageIndex: number;
  text: string;

  /** Visual points, origin at the page's TOP-left — the editor's own space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Distance from the top of the box down to the glyph baseline. */
  baselineOffset: number;

  fontSize: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;

  /** Sampled from the rendered page. */
  color: string;
  background: string;
}

export interface ExtractOptions {
  password?: string;
  /** Resolution used for colour sampling only. */
  sampleDpi?: number;
}

function familyOf(style: PdfTextStyle | undefined, fontName: string): FontFamily {
  const haystack = `${style?.fontFamily ?? ''} ${fontName}`.toLowerCase();
  if (haystack.includes('mono') || haystack.includes('courier')) return 'Courier';
  if (haystack.includes('serif') && !haystack.includes('sans')) return 'Times';
  if (haystack.includes('times') || haystack.includes('georgia') || haystack.includes('roman')) {
    return 'Times';
  }
  return 'Helvetica';
}

function toHex(r: number, g: number, b: number): string {
  const part = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Samples pixels and returns the most common colour among them. */
function dominantColour(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  points: [number, number][],
): string | null {
  const tally = new Map<string, number>();

  for (const [px, py] of points) {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) continue;
    const offset = (y * canvasWidth + x) * 4;
    // Quantise so near-identical anti-aliased pixels group together.
    const key = toHex(
      Math.round(data[offset] / 8) * 8,
      Math.round(data[offset + 1] / 8) * 8,
      Math.round(data[offset + 2] / 8) * 8,
    );
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [colour, count] of tally) {
    if (count > bestCount) {
      best = colour;
      bestCount = count;
    }
  }
  return best;
}

/** Darkest pixel inside the run, which is as close to the ink colour as we get. */
function inkColour(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): string | null {
  let best: string | null = null;
  let bestLuma = Infinity;

  const stepX = Math.max(1, Math.floor((right - left) / 40));
  const stepY = Math.max(1, Math.floor((bottom - top) / 12));

  for (let y = Math.max(0, Math.round(top)); y < Math.min(canvasHeight, Math.round(bottom)); y += stepY) {
    for (let x = Math.max(0, Math.round(left)); x < Math.min(canvasWidth, Math.round(right)); x += stepX) {
      const offset = (y * canvasWidth + x) * 4;
      const luma = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      if (luma < bestLuma) {
        bestLuma = luma;
        best = toHex(data[offset], data[offset + 1], data[offset + 2]);
      }
    }
  }

  // An all-pale box means we never actually hit a glyph; fall back to black.
  return bestLuma < 210 ? best : null;
}

export async function extractTextRuns(
  bytes: Uint8Array,
  pageIndex: number,
  options: ExtractOptions = {},
): Promise<PdfTextRun[]> {
  const { password, sampleDpi = 110 } = options;

  const doc = await loadPdfDocument(bytes, { password });
  try {
    if (pageIndex < 0 || pageIndex >= doc.numPages) return [];

    const page = await doc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    // One render of the page gives us every colour sample we need.
    const canvas = await renderPageToCanvas(page, sampleDpi);
    const ctx = canvas.getContext('2d');
    const image = ctx?.getImageData(0, 0, canvas.width, canvas.height);
    const pxPerPt = canvas.width / viewport.width;

    const runs: PdfTextRun[] = [];

    content.items.forEach((item, index) => {
      const text = item.str;
      if (!text || !text.trim()) return;

      // Compose the item's text matrix with the viewport's, which lands us
      // directly in top-left-origin space and handles page rotation for free.
      const m = multiplyTransform(viewport.transform, item.transform);
      const fontSize = Math.hypot(m[2], m[3]) || item.height || 10;
      if (fontSize <= 0) return;

      const width = item.width || fontSize * 0.5 * text.length;
      if (width <= 0) return;

      // m[4], m[5] is the baseline's left end.
      const baselineOffset = fontSize * 0.8;
      const x = m[4];
      const y = m[5] - baselineOffset;
      const height = fontSize * 1.18;

      const fontName = item.fontName ?? '';
      const style = content.styles?.[fontName];
      const lowered = `${style?.fontFamily ?? ''} ${fontName}`.toLowerCase();

      let color = '#111111';
      let background = '#ffffff';

      if (image) {
        const left = x * pxPerPt;
        const top = y * pxPerPt;
        const right = (x + width) * pxPerPt;
        const bottom = (y + height) * pxPerPt;

        const ink = inkColour(image.data, canvas.width, canvas.height, left, top, right, bottom);
        if (ink) color = ink;

        // Sample a ring just outside the run. A band above and below is the most
        // reliable read of the fill behind it — table rows, tinted panels, etc.
        const pad = Math.max(2, fontSize * 0.25 * pxPerPt);
        const samples: [number, number][] = [];
        for (let i = 0; i <= 12; i += 1) {
          const sx = left + ((right - left) * i) / 12;
          samples.push([sx, top - pad], [sx, bottom + pad]);
        }
        samples.push([left - pad, (top + bottom) / 2], [right + pad, (top + bottom) / 2]);

        const behind = dominantColour(image.data, canvas.width, canvas.height, samples);
        if (behind) background = behind;
      }

      runs.push({
        id: `p${pageIndex}-r${index}`,
        pageIndex,
        text,
        x,
        y,
        width,
        height,
        baselineOffset,
        fontSize,
        family: familyOf(style, fontName),
        bold: lowered.includes('bold') || lowered.includes('black') || lowered.includes('heavy'),
        italic: lowered.includes('italic') || lowered.includes('oblique'),
        color,
        background,
      });
    });

    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return runs;
  } finally {
    await doc.destroy();
  }
}
