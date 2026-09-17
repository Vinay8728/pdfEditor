import { loadDoc, saveDoc } from './core';
import { rgb, degrees } from './lib';
import { embedFont, sanitizeWinAnsi, type FontFamily } from './fonts';
import { cornerPosition, uprightAngle, visualSize, visualToUser, type Corner } from './geometry';
import { hexToRgb01 } from '../utils';
import { parsePageRanges } from '../ranges';

export interface PageNumberOptions {
  position?: Corner;
  /** Tokens: {n} current number, {total} count, {page} same as {n}. */
  format?: string;
  fontSize?: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  color?: string;
  margin?: number;
  /** Number printed on the first numbered page. */
  startAt?: number;
  /** Page selection to stamp, e.g. "2-" to skip a cover. Empty = all pages. */
  pages?: string;
  password?: string;
}

export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions = {},
): Promise<Uint8Array> {
  const {
    position = 'bottom-center',
    format = '{n}',
    fontSize = 11,
    fontFamily = 'Helvetica',
    bold = false,
    color = '#000000',
    margin = 28,
    startAt = 1,
    pages = '',
    password,
  } = options;

  const doc = await loadDoc(bytes, { password });
  const font = await embedFont(doc, { family: fontFamily, bold });
  const { r, g, b } = hexToRgb01(color);
  const allPages = doc.getPages();

  const targets = pages.trim()
    ? parsePageRanges(pages, allPages.length)
    : allPages.map((_, i) => i);
  const targetSet = new Set(targets);

  let counter = startAt;
  const totalNumbered = targets.length;

  allPages.forEach((page, index) => {
    if (!targetSet.has(index)) return;

    const label = sanitizeWinAnsi(
      format
        .replace(/\{n\}/g, String(counter))
        .replace(/\{page\}/g, String(counter))
        .replace(/\{total\}/g, String(totalNumbered + startAt - 1)),
    );

    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    const visual = visualSize(width, height, rotation);

    const textWidth = font.widthOfTextAtSize(label, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    const { vx, vy } = cornerPosition(
      position,
      visual.width,
      visual.height,
      textWidth,
      textHeight,
      margin,
    );
    const { x, y } = visualToUser(vx, vy, width, height, rotation);

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      rotate: degrees(uprightAngle(rotation)),
    });

    counter += 1;
  });

  return saveDoc(doc);
}
