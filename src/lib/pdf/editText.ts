import { loadDoc, saveDoc } from './core';
import { degrees, rgb } from './lib';
import { embedFont, sanitizeWinAnsi } from './fonts';
import { placeBox, uprightAngle } from './geometry';
import { hexToRgb01 } from '../utils';
import type { FontFamily } from './fonts';

/**
 * Replaces text that is already in the PDF.
 *
 * See the note in `textLayer.ts` for why this patches rather than rewrites: the
 * original run is covered with the page's own background colour and the new
 * text is drawn on top in a matched standard font.
 */

export interface TextEdit {
  id: string;
  pageIndex: number;
  original: string;
  text: string;

  /** Visual points, origin at the page's TOP-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  baselineOffset: number;

  fontSize: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  background: string;
}

export interface ApplyTextEditsOptions {
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function applyTextEdits(
  bytes: Uint8Array,
  edits: TextEdit[],
  options: ApplyTextEditsOptions = {},
): Promise<Uint8Array> {
  const changed = edits.filter((edit) => edit.text !== edit.original);
  if (changed.length === 0) return bytes;

  const doc = await loadDoc(bytes, { password: options.password });
  const pages = doc.getPages();

  const byPage = new Map<number, TextEdit[]>();
  for (const edit of changed) {
    const list = byPage.get(edit.pageIndex) ?? [];
    list.push(edit);
    byPage.set(edit.pageIndex, list);
  }

  let done = 0;
  for (const [pageIndex, pageEdits] of byPage) {
    const page = pages[pageIndex];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const rotation = page.getRotation().angle;

    for (const edit of pageEdits) {
      const font = await embedFont(doc, {
        family: edit.family,
        bold: edit.bold,
        italic: edit.italic,
      });

      // 1. Cover the original. A small bleed hides anti-aliased glyph edges,
      //    which would otherwise leave a faint ghost of the old text.
      const bleed = Math.max(0.6, edit.fontSize * 0.08);
      const patch = placeBox(
        edit.x - bleed,
        edit.y - bleed,
        edit.width + bleed * 2,
        edit.height + bleed * 2,
        pageWidth,
        pageHeight,
        rotation,
      );
      const fill = hexToRgb01(edit.background);

      page.drawRectangle({
        x: patch.x,
        y: patch.y,
        width: edit.width + bleed * 2,
        height: edit.height + bleed * 2,
        color: rgb(fill.r, fill.g, fill.b),
        rotate: degrees(patch.angle),
      });

      // 2. Draw the replacement on the original baseline. If the new text is
      //    wider than the space it has, shrink it rather than let it run into
      //    whatever sits alongside.
      const safe = sanitizeWinAnsi(edit.text);
      if (safe.length > 0) {
        let size = edit.fontSize;
        const natural = font.widthOfTextAtSize(safe, size);
        // Allow a little growth past the original run, but not unbounded.
        const allowed = edit.width * 1.25;
        if (natural > allowed && natural > 0) {
          size = Math.max(size * 0.5, (size * allowed) / natural);
        }

        const baseline = placeBox(
          edit.x,
          edit.y + edit.baselineOffset,
          font.widthOfTextAtSize(safe, size),
          0,
          pageWidth,
          pageHeight,
          rotation,
        );
        const ink = hexToRgb01(edit.color);

        page.drawText(safe, {
          x: baseline.x,
          y: baseline.y,
          size,
          font,
          color: rgb(ink.r, ink.g, ink.b),
          rotate: degrees(uprightAngle(rotation)),
        });
      }

      done += 1;
      options.onProgress?.(done, changed.length);
    }
  }

  return saveDoc(doc);
}
