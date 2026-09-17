import { createDoc, copyMetadata, loadDoc, saveDoc } from './core';
import { degrees, rgb } from './lib';
import type { PDFPage, PDFImage, PDFFont } from './lib';
import { embedFont, sanitizeWinAnsi, type FontFamily } from './fonts';
import { embedImageAuto } from './images';
import { cornerPosition, rotatedBounds, visualSize, visualToUser, type Corner } from './geometry';
import { hexToRgb01 } from '../utils';
import { parsePageRanges } from '../ranges';

export interface WatermarkOptions {
  kind: 'text' | 'image';
  text?: string;
  imageBytes?: Uint8Array;

  position?: Corner;
  /** Extra rotation on top of the page's own orientation, in degrees CCW. */
  angle?: number;
  opacity?: number;
  margin?: number;

  // Text-only
  fontSize?: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  color?: string;

  // Image-only: fraction of the page width the image should span (0..1).
  imageScale?: number;

  /** Repeat the mark across the whole page in a grid. */
  tile?: boolean;
  tileGap?: number;

  /** Draw underneath existing content instead of on top. */
  behindContent?: boolean;

  pages?: string;
  password?: string;
}

interface Mark {
  width: number;
  height: number;
  draw: (page: PDFPage, x: number, y: number, angle: number) => void;
}

function buildTextMark(
  text: string,
  font: PDFFont,
  size: number,
  color: string,
  opacity: number,
): Mark {
  const safe = sanitizeWinAnsi(text);
  const width = font.widthOfTextAtSize(safe, size);
  const height = font.heightAtSize(size);
  const { r, g, b } = hexToRgb01(color);

  return {
    width,
    height,
    draw: (page, x, y, angle) =>
      page.drawText(safe, {
        x,
        y,
        size,
        font,
        opacity,
        color: rgb(r, g, b),
        rotate: degrees(angle),
      }),
  };
}

function buildImageMark(image: PDFImage, width: number, height: number, opacity: number): Mark {
  return {
    width,
    height,
    draw: (page, x, y, angle) =>
      page.drawImage(image, { x, y, width, height, opacity, rotate: degrees(angle) }),
  };
}

export async function addWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const {
    kind,
    text = '',
    imageBytes,
    position = 'middle-center',
    angle = 45,
    opacity = 0.25,
    margin = 24,
    fontSize = 56,
    fontFamily = 'Helvetica',
    bold = true,
    color = '#808080',
    imageScale = 0.4,
    tile = false,
    tileGap = 60,
    behindContent = false,
    pages = '',
    password,
  } = options;

  if (kind === 'text' && !text.trim()) throw new Error('Enter the watermark text.');
  if (kind === 'image' && !imageBytes) throw new Error('Choose a watermark image.');

  const src = await loadDoc(bytes, { password });

  // Drawing *behind* existing content is only possible by rebuilding each page:
  // watermark first, then the original page stamped on top as a form XObject.
  const doc = behindContent ? await createDoc() : src;
  if (behindContent) copyMetadata(src, doc);

  const font = kind === 'text' ? await embedFont(doc, { family: fontFamily, bold }) : null;
  const image = kind === 'image' && imageBytes ? await embedImageAuto(doc, imageBytes) : null;

  const sourcePages = src.getPages();
  const targets = pages.trim()
    ? new Set(parsePageRanges(pages, sourcePages.length))
    : new Set(sourcePages.map((_, i) => i));

  const embedded = behindContent ? await doc.embedPages(sourcePages) : [];

  for (let index = 0; index < sourcePages.length; index += 1) {
    const sourcePage = sourcePages[index];
    const { width, height } = sourcePage.getSize();
    const rotation = sourcePage.getRotation().angle;

    const page: PDFPage = behindContent ? doc.addPage([width, height]) : sourcePage;
    if (behindContent) page.setRotation(degrees(rotation));

    const shouldMark = targets.has(index);

    if (shouldMark) {
      const visual = visualSize(width, height, rotation);

      let mark: Mark;
      if (kind === 'text' && font) {
        mark = buildTextMark(text, font, fontSize, color, opacity);
      } else if (image) {
        const drawWidth = visual.width * Math.min(Math.max(imageScale, 0.02), 1);
        const drawHeight = (image.height / image.width) * drawWidth;
        mark = buildImageMark(image, drawWidth, drawHeight, opacity);
      } else {
        throw new Error('Watermark source is missing.');
      }

      const totalAngle = (angle + rotation) % 360;
      const bounds = rotatedBounds(mark.width, mark.height, angle);

      if (tile) {
        drawTiled(page, mark, visual, width, height, rotation, angle, bounds, tileGap);
      } else {
        const { vx, vy } = cornerPosition(
          position,
          visual.width,
          visual.height,
          bounds.width,
          bounds.height,
          margin,
        );
        // Offset so the mark rotates about its own centre rather than its corner.
        const centreVx = vx + bounds.width / 2;
        const centreVy = vy + bounds.height / 2;
        const anchor = anchorFor(mark, angle, centreVx, centreVy);
        const { x, y } = visualToUser(anchor.vx, anchor.vy, width, height, rotation);
        mark.draw(page, x, y, totalAngle);
      }
    }

    if (behindContent) {
      page.drawPage(embedded[index], { x: 0, y: 0, width, height });
    }
  }

  doc.setProducer('pdfEditor');
  return saveDoc(doc);
}

/** Bottom-left draw point such that the rotated mark is centred on (cx, cy). */
function anchorFor(mark: Mark, angle: number, cx: number, cy: number) {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const halfW = mark.width / 2;
  const halfH = mark.height / 2;
  return {
    vx: cx - (halfW * cos - halfH * sin),
    vy: cy - (halfW * sin + halfH * cos),
  };
}

function drawTiled(
  page: PDFPage,
  mark: Mark,
  visual: { width: number; height: number },
  width: number,
  height: number,
  rotation: number,
  angle: number,
  bounds: { width: number; height: number },
  gap: number,
) {
  const stepX = bounds.width + gap;
  const stepY = bounds.height + gap;
  const totalAngle = (angle + rotation) % 360;

  for (let vy = -bounds.height; vy < visual.height + bounds.height; vy += stepY) {
    for (let vx = -bounds.width; vx < visual.width + bounds.width; vx += stepX) {
      const anchor = anchorFor(mark, angle, vx + bounds.width / 2, vy + bounds.height / 2);
      const point = visualToUser(anchor.vx, anchor.vy, width, height, rotation);
      mark.draw(page, point.x, point.y, totalAngle);
    }
  }
}
