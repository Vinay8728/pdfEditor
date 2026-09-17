import { loadDoc, saveDoc } from './core';
import { rebuildFromRaster } from './rebuild';

export type CompressLevel = 'light' | 'balanced' | 'strong' | 'extreme';

export interface CompressOptions {
  /**
   * 'lossless' only restructures the file (object streams, dropped duplicates).
   * 'images' re-renders every page as a JPEG at a reduced DPI — far smaller,
   * but text stops being selectable.
   */
  mode?: 'lossless' | 'images';
  level?: CompressLevel;
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface CompressResult {
  data: Uint8Array;
  originalSize: number;
  newSize: number;
  /** Negative when the file grew. */
  savedPercent: number;
}

const PRESETS: Record<CompressLevel, { dpi: number; quality: number }> = {
  light: { dpi: 200, quality: 0.9 },
  balanced: { dpi: 150, quality: 0.78 },
  strong: { dpi: 110, quality: 0.62 },
  extreme: { dpi: 72, quality: 0.5 },
};

export async function compressPdf(
  bytes: Uint8Array,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const { mode = 'images', level = 'balanced', password, onProgress } = options;
  const originalSize = bytes.byteLength;

  let data: Uint8Array;

  if (mode === 'lossless') {
    const doc = await loadDoc(bytes, { password });
    data = await saveDoc(doc);
  } else {
    const preset = PRESETS[level];
    data = await rebuildFromRaster(bytes, {
      dpi: preset.dpi,
      quality: preset.quality,
      format: 'image/jpeg',
      password,
      onProgress,
    });
  }

  // Never hand back something larger than we were given.
  if (data.byteLength >= originalSize && mode === 'lossless') {
    data = bytes;
  }

  const newSize = data.byteLength;
  return {
    data,
    originalSize,
    newSize,
    savedPercent: originalSize > 0 ? Math.round(((originalSize - newSize) / originalSize) * 100) : 0,
  };
}
