import { createDoc, loadDoc, saveDoc } from './core';
import { degrees } from './lib';
import { rasterizePdf, type RasterOptions } from './rasterize';

export interface RebuildOptions extends RasterOptions {
  /** Pages NOT listed here are copied through untouched (used by Redact). */
  rasterizeOnly?: number[];
}

/**
 * Re-renders pages to images and assembles them into a new PDF at the original
 * page dimensions. This is the mechanism behind Compress (image mode),
 * Grayscale and Redact — it guarantees the original vector/text content is gone.
 */
export async function rebuildFromRaster(
  bytes: Uint8Array,
  options: RebuildOptions = {},
): Promise<Uint8Array> {
  const src = await loadDoc(bytes, { password: options.password });
  const pageCount = src.getPageCount();

  const rasterIndices = options.rasterizeOnly ?? Array.from({ length: pageCount }, (_, i) => i);
  const rasterSet = new Set(rasterIndices);

  const rendered = await rasterizePdf(bytes, { ...options, pages: rasterIndices });
  const byIndex = new Map(rendered.map((page) => [page.index, page]));

  const out = await createDoc();

  // Copy the untouched pages in one call so shared resources stay shared.
  const passthrough = Array.from({ length: pageCount }, (_, i) => i).filter(
    (i) => !rasterSet.has(i),
  );
  const copied = passthrough.length ? await out.copyPages(src, passthrough) : [];
  const copiedByIndex = new Map(passthrough.map((sourceIndex, k) => [sourceIndex, copied[k]]));

  const usePng = options.format === 'image/png';

  for (let i = 0; i < pageCount; i += 1) {
    const existing = copiedByIndex.get(i);
    if (existing) {
      out.addPage(existing);
      continue;
    }

    const raster = byIndex.get(i);
    if (!raster) continue;

    const data = new Uint8Array(await raster.blob.arrayBuffer());
    const image = usePng ? await out.embedPng(data) : await out.embedJpg(data);

    // The raster already has the page's rotation baked in, so the new page is
    // created at the *visual* size with no /Rotate of its own.
    const aspect = raster.height / raster.width;
    const width = raster.pointWidth;
    const height = Math.abs(aspect * width - raster.pointHeight) < 1
      ? raster.pointHeight
      : width * aspect;

    const page = out.addPage([width, height]);
    page.setRotation(degrees(0));
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  out.setProducer('pdfEditor');
  return saveDoc(out);
}
