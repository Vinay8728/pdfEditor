import { rebuildFromRaster } from './rebuild';

export interface GrayscaleOptions {
  dpi?: number;
  quality?: number;
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Converts every page to true greyscale.
 *
 * Colour lives inside each page's content stream, so the only way to remove it
 * for certain — without a full PDF re-writer — is to re-render each page and
 * convert the pixels. Output is raster, so text is no longer selectable.
 */
export async function grayscalePdf(
  bytes: Uint8Array,
  options: GrayscaleOptions = {},
): Promise<Uint8Array> {
  const { dpi = 150, quality = 0.85, password, onProgress } = options;
  return rebuildFromRaster(bytes, {
    dpi,
    quality,
    grayscale: true,
    format: 'image/jpeg',
    password,
    onProgress,
  });
}
