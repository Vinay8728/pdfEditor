import { createDoc, saveDoc, readFileBytes } from './core';
import type { PDFDocument, PDFImage } from './lib';
import { rasterizePdf, type RasterFormat } from './rasterize';
import type { OutputFile } from '../download';
import { baseName } from '../utils';

export type ImageKind = 'png' | 'jpg' | 'other';

export function detectImageKind(bytes: Uint8Array): ImageKind {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  return 'other';
}

/**
 * Embeds any browser-decodable image. PDF only natively carries JPEG and PNG,
 * so WebP/GIF/BMP/AVIF are transcoded to PNG through a canvas first.
 */
export async function embedImageAuto(
  doc: PDFDocument,
  bytes: Uint8Array,
): Promise<PDFImage> {
  const kind = detectImageKind(bytes);
  if (kind === 'png') return doc.embedPng(bytes);
  if (kind === 'jpg') return doc.embedJpg(bytes);

  const png = await transcodeToPng(bytes);
  return doc.embedPng(png);
}

async function transcodeToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy]);
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadHtmlImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a canvas context to convert this image.');
    ctx.drawImage(image, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!out) throw new Error('This image format could not be converted.');
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be decoded by the browser.'));
    image.src = src;
  });
}

export type PageSizeName = 'fit' | 'a4' | 'letter' | 'legal';
export type Orientation = 'auto' | 'portrait' | 'landscape';

const SIZES: Record<Exclude<PageSizeName, 'fit'>, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

export interface ImagesToPdfOptions {
  pageSize?: PageSizeName;
  orientation?: Orientation;
  /** Points of white space around the image. Ignored when pageSize is 'fit'. */
  margin?: number;
  onProgress?: (done: number, total: number) => void;
}

/** JPG/PNG/WebP… -> a single PDF, one image per page. */
export async function imagesToPdf(
  files: { name: string; bytes: Uint8Array }[],
  options: ImagesToPdfOptions = {},
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error('Add at least one image.');
  const { pageSize = 'fit', orientation = 'auto', margin = 0, onProgress } = options;

  const doc = await createDoc();

  for (let i = 0; i < files.length; i += 1) {
    const image = await embedImageAuto(doc, files[i].bytes);
    const imgW = image.width;
    const imgH = image.height;

    if (pageSize === 'fit') {
      const page = doc.addPage([imgW + margin * 2, imgH + margin * 2]);
      page.drawImage(image, { x: margin, y: margin, width: imgW, height: imgH });
    } else {
      let [pw, ph] = SIZES[pageSize];
      const wantLandscape =
        orientation === 'landscape' || (orientation === 'auto' && imgW > imgH);
      if (wantLandscape) [pw, ph] = [ph, pw];

      const page = doc.addPage([pw, ph]);
      const boxW = Math.max(1, pw - margin * 2);
      const boxH = Math.max(1, ph - margin * 2);
      const scale = Math.min(boxW / imgW, boxH / imgH);
      const drawW = imgW * scale;
      const drawH = imgH * scale;

      page.drawImage(image, {
        x: (pw - drawW) / 2,
        y: (ph - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }

    onProgress?.(i + 1, files.length);
  }

  doc.setProducer('pdfEditor');
  return saveDoc(doc);
}

export interface PdfToImagesOptions {
  dpi?: number;
  format?: RasterFormat;
  quality?: number;
  pages?: number[];
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

/** PDF -> one JPG/PNG per page. */
export async function pdfToImages(
  fileName: string,
  bytes: Uint8Array,
  options: PdfToImagesOptions = {},
): Promise<OutputFile[]> {
  const { format = 'image/jpeg', ...rest } = options;
  const rendered = await rasterizePdf(bytes, { ...rest, format });
  const stem = baseName(fileName);
  const ext = format === 'image/png' ? 'png' : 'jpg';

  const outputs: OutputFile[] = [];
  for (const page of rendered) {
    outputs.push({
      name: `${stem}_page_${String(page.index + 1).padStart(3, '0')}.${ext}`,
      data: new Uint8Array(await page.blob.arrayBuffer()),
      mime: format,
    });
  }
  return outputs;
}

export { readFileBytes };
