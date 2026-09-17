import { loadDoc, saveDoc } from './core';
import { rgb } from './lib';
import { embedFont, sanitizeWinAnsi } from './fonts';
import { visualSize, visualToUser, uprightAngle } from './geometry';
import { degrees } from './lib';
import { rasterizePdf } from './rasterize';

/**
 * Adds a searchable text layer to a scanned PDF.
 *
 * Each page is rendered to an image, run through Tesseract in the browser, and
 * the recognised words are written back onto the ORIGINAL page as invisible
 * text positioned over the matching pixels. The visible page is untouched —
 * it just becomes searchable and selectable.
 */

export interface OcrWord {
  text: string;
  confidence: number;
  /** Pixel bounding box within the rendered page image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrProgress {
  stage: 'render' | 'recognise' | 'write';
  page: number;
  totalPages: number;
  /** 0..1 within the current page's recognition pass. */
  detail?: number;
}

export interface OcrOptions {
  /** Tesseract language code(s), e.g. 'eng' or 'eng+deu'. */
  language?: string;
  dpi?: number;
  /** Words below this confidence are dropped. */
  minConfidence?: number;
  pages?: number[];
  password?: string;
  onProgress?: (progress: OcrProgress) => void;
}

export interface OcrResult {
  data: Uint8Array;
  /** Plain text per page, in reading order — handy for preview and for Compare. */
  text: string[];
  wordCount: number;
}

interface RawWord {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

/** Tesseract's shape has moved around between versions; dig words out of either. */
function collectWords(data: unknown): OcrWord[] {
  const out: OcrWord[] = [];

  const push = (word: RawWord) => {
    if (!word?.text || !word.bbox) return;
    out.push({
      text: word.text,
      confidence: word.confidence ?? 0,
      x0: word.bbox.x0,
      y0: word.bbox.y0,
      x1: word.bbox.x1,
      y1: word.bbox.y1,
    });
  };

  const root = data as {
    words?: RawWord[];
    blocks?: { paragraphs?: { lines?: { words?: RawWord[] }[] }[] }[];
  };

  if (Array.isArray(root?.words) && root.words.length > 0) {
    root.words.forEach(push);
    return out;
  }

  for (const block of root?.blocks ?? []) {
    for (const paragraph of block?.paragraphs ?? []) {
      for (const line of paragraph?.lines ?? []) {
        (line?.words ?? []).forEach(push);
      }
    }
  }
  return out;
}

export async function ocrPdf(bytes: Uint8Array, options: OcrOptions = {}): Promise<OcrResult> {
  const {
    language = 'eng',
    dpi = 200,
    minConfidence = 45,
    password,
    onProgress,
  } = options;

  const { createWorker } = await import('tesseract.js');

  const doc = await loadDoc(bytes, { password });
  const pages = doc.getPages();
  const targets = options.pages ?? pages.map((_, i) => i);
  const font = await embedFont(doc);

  onProgress?.({ stage: 'render', page: 0, totalPages: targets.length });

  const rendered = await rasterizePdf(bytes, {
    dpi,
    format: 'image/png',
    password,
    pages: targets,
    onProgress: (done) =>
      onProgress?.({ stage: 'render', page: done, totalPages: targets.length }),
  });

  const worker = await createWorker(language);
  const pageText: string[] = [];
  let wordCount = 0;

  try {
    for (let i = 0; i < rendered.length; i += 1) {
      const raster = rendered[i];
      onProgress?.({ stage: 'recognise', page: i + 1, totalPages: rendered.length });

      const { data } = await worker.recognize(raster.blob);
      const words = collectWords(data).filter(
        (word) => word.confidence >= minConfidence && word.text.trim().length > 0,
      );

      pageText.push(
        (data as { text?: string }).text ?? words.map((word) => word.text).join(' '),
      );

      const page = pages[raster.index];
      if (!page) continue;

      const { width, height } = page.getSize();
      const rotation = page.getRotation().angle;
      const visual = visualSize(width, height, rotation);

      // Rendered pixels -> visual points.
      const scaleX = visual.width / raster.width;
      const scaleY = visual.height / raster.height;

      for (const word of words) {
        const text = sanitizeWinAnsi(word.text).trim();
        if (!text) continue;

        const boxLeft = word.x0 * scaleX;
        const boxTop = word.y0 * scaleY;
        const boxWidth = (word.x1 - word.x0) * scaleX;
        const boxHeight = (word.y1 - word.y0) * scaleY;
        if (boxWidth <= 0 || boxHeight <= 0) continue;

        // Size the glyphs so the invisible text spans the same width as the
        // pixels it covers — that is what makes selection land correctly.
        const unitWidth = font.widthOfTextAtSize(text, 1);
        const size = unitWidth > 0
          ? Math.min(boxWidth / unitWidth, boxHeight * 1.2)
          : boxHeight;
        if (!Number.isFinite(size) || size <= 0) continue;

        // Baseline sits near the bottom of the glyph box.
        const baselineTop = boxTop + boxHeight * 0.82;
        const point = visualToUser(
          boxLeft,
          visual.height - baselineTop,
          width,
          height,
          rotation,
        );

        page.drawText(text, {
          x: point.x,
          y: point.y,
          size,
          font,
          color: rgb(0, 0, 0),
          opacity: 0, // Invisible, but real, selectable text.
          rotate: degrees(uprightAngle(rotation)),
        });
        wordCount += 1;
      }

      onProgress?.({ stage: 'write', page: i + 1, totalPages: rendered.length });
    }
  } finally {
    await worker.terminate();
  }

  return { data: await saveDoc(doc), text: pageText, wordCount };
}

export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'hin', label: 'Hindi' },
  { code: 'ara', label: 'Arabic' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'rus', label: 'Russian' },
];
