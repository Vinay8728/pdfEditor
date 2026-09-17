import { loadPdfDocument } from './pdfjs';
import { createCanvas, renderPageToCanvas } from './rasterize';
import { nextFrame } from '../utils';

/**
 * Two-way PDF comparison: a word-level text diff plus a pixel overlay that
 * highlights what moved. Both run entirely in the browser.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffToken {
  kind: DiffKind;
  text: string;
}

export interface PageComparison {
  pageNumber: number;
  /** Null when one document has fewer pages. */
  leftExists: boolean;
  rightExists: boolean;
  tokens: DiffToken[];
  addedWords: number;
  removedWords: number;
  /** Share of pixels that differ, 0..1. Undefined until the visual pass runs. */
  pixelDifference?: number;
}

export interface CompareResult {
  pages: PageComparison[];
  totalAdded: number;
  totalRemoved: number;
  identical: boolean;
}

/** Pulls plain text out of every page, preserving reading order. */
export async function extractText(
  bytes: Uint8Array,
  password?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const doc = await loadPdfDocument(bytes, { password });
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str + (item.hasEOL ? '\n' : ''))
        .join(' ');
      out.push(text.replace(/[ \t]+/g, ' ').trim());
      page.cleanup();
      onProgress?.(i, doc.numPages);
      await nextFrame();
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

const MAX_DIFF_TOKENS = 4000;

/** Word-level diff via longest common subsequence. */
export function diffWords(left: string, right: string): DiffToken[] {
  let a = tokenize(left);
  let b = tokenize(right);

  // Guard the quadratic table on pathologically dense pages.
  if (a.length > MAX_DIFF_TOKENS) a = a.slice(0, MAX_DIFF_TOKENS);
  if (b.length > MAX_DIFF_TOKENS) b = b.slice(0, MAX_DIFF_TOKENS);

  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  if (n === 0) return b.map((text) => ({ kind: 'added' as const, text }));
  if (m === 0) return a.map((text) => ({ kind: 'removed' as const, text }));

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      tokens.push({ kind: 'removed', text: a[i] });
      i += 1;
    } else {
      tokens.push({ kind: 'added', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    tokens.push({ kind: 'removed', text: a[i] });
    i += 1;
  }
  while (j < m) {
    tokens.push({ kind: 'added', text: b[j] });
    j += 1;
  }

  return tokens;
}

export async function comparePdfs(
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  options: {
    leftPassword?: string;
    rightPassword?: string;
    onProgress?: (label: string, done: number, total: number) => void;
  } = {},
): Promise<CompareResult> {
  const { onProgress } = options;

  const leftText = await extractText(leftBytes, options.leftPassword, (done, total) =>
    onProgress?.('Reading original', done, total),
  );
  const rightText = await extractText(rightBytes, options.rightPassword, (done, total) =>
    onProgress?.('Reading revision', done, total),
  );

  const pageCount = Math.max(leftText.length, rightText.length);
  const pages: PageComparison[] = [];
  let totalAdded = 0;
  let totalRemoved = 0;

  for (let i = 0; i < pageCount; i += 1) {
    const tokens = diffWords(leftText[i] ?? '', rightText[i] ?? '');
    const addedWords = tokens.filter((token) => token.kind === 'added').length;
    const removedWords = tokens.filter((token) => token.kind === 'removed').length;

    totalAdded += addedWords;
    totalRemoved += removedWords;

    pages.push({
      pageNumber: i + 1,
      leftExists: i < leftText.length,
      rightExists: i < rightText.length,
      tokens,
      addedWords,
      removedWords,
    });

    onProgress?.('Comparing text', i + 1, pageCount);
    await nextFrame();
  }

  return {
    pages,
    totalAdded,
    totalRemoved,
    identical: totalAdded === 0 && totalRemoved === 0 && leftText.length === rightText.length,
  };
}

export interface VisualDiff {
  /** PNG data URL: unchanged pixels greyed back, differences tinted red. */
  imageUrl: string;
  difference: number;
}

/** Renders one page from each document and highlights the pixels that differ. */
export async function visualDiffPage(
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  pageIndex: number,
  options: { dpi?: number; leftPassword?: string; rightPassword?: string } = {},
): Promise<VisualDiff | null> {
  const dpi = options.dpi ?? 110;

  const leftDoc = await loadPdfDocument(leftBytes, { password: options.leftPassword });
  const rightDoc = await loadPdfDocument(rightBytes, { password: options.rightPassword });

  try {
    if (pageIndex >= leftDoc.numPages || pageIndex >= rightDoc.numPages) return null;

    const leftCanvas = await renderPageToCanvas(await leftDoc.getPage(pageIndex + 1), dpi);
    const rightCanvas = await renderPageToCanvas(await rightDoc.getPage(pageIndex + 1), dpi);

    const width = Math.max(leftCanvas.width, rightCanvas.width);
    const height = Math.max(leftCanvas.height, rightCanvas.height);

    const leftData = readInto(leftCanvas, width, height);
    const rightData = readInto(rightCanvas, width, height);

    const out = createCanvas(width, height);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const result = ctx.createImageData(width, height);

    let changed = 0;
    for (let i = 0; i < result.data.length; i += 4) {
      const dr = Math.abs(leftData[i] - rightData[i]);
      const dg = Math.abs(leftData[i + 1] - rightData[i + 1]);
      const db = Math.abs(leftData[i + 2] - rightData[i + 2]);
      const delta = dr + dg + db;

      if (delta > 45) {
        changed += 1;
        result.data[i] = 220;
        result.data[i + 1] = 38;
        result.data[i + 2] = 60;
        result.data[i + 3] = 255;
      } else {
        // Fade unchanged content so the differences stand out.
        const luma = 0.299 * rightData[i] + 0.587 * rightData[i + 1] + 0.114 * rightData[i + 2];
        const faded = 255 - (255 - luma) * 0.25;
        result.data[i] = faded;
        result.data[i + 1] = faded;
        result.data[i + 2] = faded;
        result.data[i + 3] = 255;
      }
    }

    ctx.putImageData(result, 0, 0);
    const imageUrl = out.toDataURL('image/png');

    leftCanvas.width = 0;
    rightCanvas.width = 0;

    return { imageUrl, difference: changed / (width * height) };
  } finally {
    await leftDoc.destroy();
    await rightDoc.destroy();
  }
}

/** Copies a canvas onto a white page of the given size and returns its pixels. */
function readInto(source: HTMLCanvasElement, width: number, height: number): Uint8ClampedArray {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8ClampedArray(width * height * 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = 0;
  canvas.height = 0;
  return data;
}
