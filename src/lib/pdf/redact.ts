import { rebuildFromRaster } from './rebuild';

/**
 * A region to destroy, in VISUAL page points with the origin at the TOP-LEFT —
 * the same coordinate space the on-screen overlay works in.
 */
export interface RedactionBox {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RedactOptions {
  dpi?: number;
  /** Colour of the redaction bar. Black by default. */
  fill?: string;
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Permanently removes content under each box.
 *
 * Drawing a black rectangle over text does NOT remove it — the text is still in
 * the file and can be copied straight back out. So every page carrying a
 * redaction is re-rendered to pixels with the bars burnt in, and the original
 * page object (with its text, images and metadata) is discarded entirely.
 * Pages without redactions are copied through untouched.
 */
export async function redactPdf(
  bytes: Uint8Array,
  boxes: RedactionBox[],
  options: RedactOptions = {},
): Promise<Uint8Array> {
  if (boxes.length === 0) throw new Error('Draw at least one redaction box.');

  const { dpi = 200, fill = '#000000', password, onProgress } = options;

  const byPage = new Map<number, RedactionBox[]>();
  for (const box of boxes) {
    const list = byPage.get(box.pageIndex) ?? [];
    list.push(box);
    byPage.set(box.pageIndex, list);
  }

  return rebuildFromRaster(bytes, {
    dpi,
    quality: 0.9,
    format: 'image/jpeg',
    password,
    onProgress,
    rasterizeOnly: Array.from(byPage.keys()).sort((a, b) => a - b),
    decorate: (canvas, pageIndex, pixelsPerPoint) => {
      const pageBoxes = byPage.get(pageIndex);
      if (!pageBoxes) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.fillStyle = fill;
      for (const box of pageBoxes) {
        ctx.fillRect(
          box.x * pixelsPerPoint,
          box.y * pixelsPerPoint,
          box.width * pixelsPerPoint,
          box.height * pixelsPerPoint,
        );
      }
      ctx.restore();
    },
  });
}
