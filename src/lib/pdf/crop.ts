import { loadDoc, saveDoc } from './core';
import { visualSize, visualToUser } from './geometry';
import { parsePageRanges } from '../ranges';

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A crop rectangle expressed in the page's VISUAL space, origin bottom-left. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropOptions {
  mode: 'margins' | 'rect';
  /** For `margins`: trim amounts. Units follow `unit`. */
  margins?: CropMargins;
  /** 'pt' = PDF points, 'percent' = share of the page's own width/height. */
  unit?: 'pt' | 'percent';
  /** For `rect`: keep this region. Applied to every selected page. */
  rect?: CropRect;
  /** Per-page override for `rect` mode, keyed by zero-based page index. */
  rectByPage?: Record<number, CropRect>;
  pages?: string;
  password?: string;
}

export async function cropPdf(bytes: Uint8Array, options: CropOptions): Promise<Uint8Array> {
  const { mode, margins, unit = 'pt', rect, rectByPage, pages = '', password } = options;

  const doc = await loadDoc(bytes, { password });
  const all = doc.getPages();
  const targets = pages.trim()
    ? new Set(parsePageRanges(pages, all.length))
    : new Set(all.map((_, i) => i));

  all.forEach((page, index) => {
    if (!targets.has(index)) return;

    // Crop is relative to whatever box the page currently shows.
    const box = page.getCropBox();
    const rotation = page.getRotation().angle;
    const visual = visualSize(box.width, box.height, rotation);

    let visualRect: CropRect;

    if (mode === 'rect') {
      const chosen = rectByPage?.[index] ?? rect;
      if (!chosen) return;
      visualRect = chosen;
    } else {
      const m = margins ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const toPt = (value: number, span: number) =>
        unit === 'percent' ? (value / 100) * span : value;

      const left = toPt(m.left, visual.width);
      const right = toPt(m.right, visual.width);
      const top = toPt(m.top, visual.height);
      const bottom = toPt(m.bottom, visual.height);

      visualRect = {
        x: left,
        y: bottom,
        width: visual.width - left - right,
        height: visual.height - top - bottom,
      };
    }

    if (visualRect.width <= 1 || visualRect.height <= 1) {
      throw new Error(`The crop area on page ${index + 1} would be empty.`);
    }

    // Map the two opposite corners back into user space, then normalise.
    const a = visualToUser(visualRect.x, visualRect.y, box.width, box.height, rotation);
    const b = visualToUser(
      visualRect.x + visualRect.width,
      visualRect.y + visualRect.height,
      box.width,
      box.height,
      rotation,
    );

    const x = Math.min(a.x, b.x) + box.x;
    const y = Math.min(a.y, b.y) + box.y;
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);

    page.setCropBox(x, y, width, height);
    // Keep MediaBox in step so viewers that ignore CropBox still show the crop.
    page.setMediaBox(x, y, width, height);
  });

  return saveDoc(doc);
}
