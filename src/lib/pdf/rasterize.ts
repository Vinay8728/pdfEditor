import { loadPdfDocument, type PdfDocumentProxy, type PdfPageProxy } from './pdfjs';
import { nextFrame } from '../utils';

export type RasterFormat = 'image/jpeg' | 'image/png';

export interface RasterOptions {
  /** Render scale where 1 = 72 DPI. `dpi` is the friendlier knob. */
  dpi?: number;
  format?: RasterFormat;
  /** JPEG quality 0..1. Ignored for PNG. */
  quality?: number;
  grayscale?: boolean;
  /** Zero-based page indices; defaults to every page. */
  pages?: number[];
  password?: string;
  /** Hook to paint on top of a rendered page before it is encoded (used by Redact). */
  decorate?: (canvas: HTMLCanvasElement, pageIndex: number, pixelsPerPoint: number) => void;
  onProgress?: (done: number, total: number) => void;
}

export interface RasterPage {
  index: number;
  blob: Blob;
  width: number;
  height: number;
  /** Original PDF page box in points, so we can rebuild a same-size PDF. */
  pointWidth: number;
  pointHeight: number;
}

// Browsers refuse to allocate unbounded canvases. Keep every render inside a
// budget and scale down rather than throwing on huge pages.
const MAX_SIDE = 8192;
const MAX_PIXELS = 26_000_000;

function fitScale(baseWidth: number, baseHeight: number, desired: number): number {
  let scale = desired;
  const side = Math.max(baseWidth, baseHeight) * scale;
  if (side > MAX_SIDE) scale = (MAX_SIDE / Math.max(baseWidth, baseHeight)) * 0.999;
  const pixels = baseWidth * scale * baseHeight * scale;
  if (pixels > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (baseWidth * baseHeight)) * 0.999;
  return Math.max(0.05, scale);
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: RasterFormat,
  quality = 0.82,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas could not be encoded.'))),
      format,
      format === 'image/jpeg' ? quality : undefined,
    );
  });
}

/** In-place luminance conversion (Rec. 601 weights). */
export function applyGrayscale(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
  }
  ctx.putImageData(image, 0, 0);
}

export async function renderPageToCanvas(
  page: PdfPageProxy,
  dpi: number,
  opts: { grayscale?: boolean; background?: string } = {},
): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const scale = fitScale(base.width, base.height, dpi / 72);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser did not provide a 2D canvas context.');

  // JPEG has no alpha — paint white first or transparent areas turn black.
  ctx.fillStyle = opts.background ?? '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  if (opts.grayscale) applyGrayscale(canvas);
  return canvas;
}

/** Renders selected pages of a PDF to image blobs. */
export async function rasterizePdf(
  bytes: Uint8Array,
  options: RasterOptions = {},
): Promise<RasterPage[]> {
  const {
    dpi = 150,
    format = 'image/jpeg',
    quality = 0.82,
    grayscale = false,
    password,
    decorate,
    onProgress,
  } = options;

  const doc: PdfDocumentProxy = await loadPdfDocument(bytes, { password });
  try {
    const indices = options.pages ?? Array.from({ length: doc.numPages }, (_, i) => i);
    const results: RasterPage[] = [];

    for (let i = 0; i < indices.length; i += 1) {
      const pageIndex = indices[i];
      const page = await doc.getPage(pageIndex + 1);
      const pointViewport = page.getViewport({ scale: 1 });
      const canvas = await renderPageToCanvas(page, dpi, { grayscale });
      decorate?.(canvas, pageIndex, canvas.width / pointViewport.width);
      const blob = await canvasToBlob(canvas, format, quality);

      results.push({
        index: pageIndex,
        blob,
        width: canvas.width,
        height: canvas.height,
        pointWidth: pointViewport.width,
        pointHeight: pointViewport.height,
      });

      // Release the backing store immediately — these get large.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      onProgress?.(i + 1, indices.length);
      await nextFrame();
    }

    return results;
  } finally {
    await doc.destroy();
  }
}

/** Renders one page to a data URL — used for sidebar thumbnails and previews. */
export async function renderThumbnail(
  doc: PdfDocumentProxy,
  pageIndex: number,
  maxWidth = 200,
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const dpi = Math.max(24, (maxWidth / base.width) * 72);
  const canvas = await renderPageToCanvas(page, dpi);
  const url = canvas.toDataURL('image/jpeg', 0.7);
  canvas.width = 0;
  canvas.height = 0;
  page.cleanup();
  return url;
}
