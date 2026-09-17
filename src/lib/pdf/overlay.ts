import { loadDoc, saveDoc } from './core';
import { BlendMode, LineCapStyle, PDFName, PDFString, degrees, rgb } from './lib';
import type { PDFDocument, PDFPage } from './lib';
import { embedFont, sanitizeWinAnsi, wrapText } from './fonts';
import { embedImageAuto } from './images';
import { uprightAngle, visualSize, visualToUser } from './geometry';
import { hexToRgb01 } from '../utils';
import type { EditorObject, TextObject } from './annotations';

/**
 * Writes the editor's objects into a real PDF.
 *
 * Everything is exported as vector content — text stays selectable, shapes stay
 * crisp at any zoom — rather than flattening the overlay to a bitmap.
 */

interface Placement {
  x: number;
  y: number;
  angle: number;
}

/**
 * Positions a box so it lands exactly where the user put it on screen.
 *
 * `vxLeft`/`vyTop` are visual points from the page's top-left. pdf-lib draws
 * from an object's bottom-left corner and rotates counter-clockwise about that
 * point, so both the page's own /Rotate and the object's rotation are folded in
 * here, about the box's centre.
 */
function placeBox(
  vxLeft: number,
  vyTop: number,
  boxWidth: number,
  boxHeight: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
  objectRotation = 0,
): Placement {
  const visual = visualSize(pageWidth, pageHeight, pageRotation);

  // Flip to a bottom-left origin within visual space.
  const vyBottom = visual.height - (vyTop + boxHeight);

  // Rotate the box about its own centre. Object rotation is clockwise on screen,
  // which is negative in PDF's counter-clockwise convention.
  const theta = (-objectRotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = boxWidth / 2;
  const halfH = boxHeight / 2;
  const centreVx = vxLeft + halfW;
  const centreVy = vyBottom + halfH;

  const anchorVx = centreVx - (halfW * cos - halfH * sin);
  const anchorVy = centreVy - (halfW * sin + halfH * cos);

  const point = visualToUser(anchorVx, anchorVy, pageWidth, pageHeight, pageRotation);
  return {
    x: point.x,
    y: point.y,
    angle: uprightAngle(pageRotation) - objectRotation,
  };
}

/** Maps a bare visual point (no box) into user space. */
function placePoint(
  vx: number,
  vyTop: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
) {
  const visual = visualSize(pageWidth, pageHeight, pageRotation);
  return visualToUser(vx, visual.height - vyTop, pageWidth, pageHeight, pageRotation);
}

type AnyDoc = InstanceType<typeof PDFDocument>;

async function drawText(
  doc: AnyDoc,
  page: PDFPage,
  object: TextObject,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
) {
  const font = await embedFont(doc, {
    family: object.fontFamily,
    bold: object.bold,
    italic: object.italic,
  });

  const size = object.fontSize;
  const lineHeight = size * (object.lineHeight ?? 1.25);
  const safe = sanitizeWinAnsi(object.text);
  const lines = wrapText(safe, font, size, Math.max(1, object.width));
  const { r, g, b } = hexToRgb01(object.color);
  const ascent = font.heightAtSize(size, { descender: false });

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    let offsetX = 0;
    if (object.align === 'center') offsetX = (object.width - lineWidth) / 2;
    else if (object.align === 'right') offsetX = object.width - lineWidth;

    // Baseline sits one ascent below the top of the line box.
    const baselineTop = object.y + index * lineHeight + ascent;
    const placement = placeBox(
      object.x + offsetX,
      baselineTop,
      lineWidth,
      0,
      pageWidth,
      pageHeight,
      pageRotation,
      object.rotation ?? 0,
    );

    page.drawText(line, {
      x: placement.x,
      y: placement.y,
      size,
      font,
      color: rgb(r, g, b),
      opacity: object.opacity ?? 1,
      rotate: degrees(placement.angle),
    });
  });
}

/** Builds an SVG path string from freehand points, in top-left visual space. */
function pointsToSvgPath(points: number[]): string {
  if (points.length < 4) return '';
  const parts: string[] = ['M ' + points[0] + ' ' + points[1]];
  for (let i = 2; i < points.length; i += 2) {
    parts.push('L ' + points[i] + ' ' + points[i + 1]);
  }
  return parts.join(' ');
}

export interface ApplyOverlayOptions {
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function applyOverlay(
  bytes: Uint8Array,
  objects: EditorObject[],
  options: ApplyOverlayOptions = {},
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, { password: options.password });
  const pages = doc.getPages();

  const byPage = new Map<number, EditorObject[]>();
  for (const object of objects) {
    const list = byPage.get(object.pageIndex) ?? [];
    list.push(object);
    byPage.set(object.pageIndex, list);
  }

  let done = 0;
  for (const [pageIndex, pageObjects] of byPage) {
    const page = pages[pageIndex];
    if (!page) continue;

    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    const visual = visualSize(width, height, rotation);

    for (const object of pageObjects) {
      const opacity = object.opacity ?? 1;

      if (object.type === 'text') {
        await drawText(doc, page, object, width, height, rotation);
        continue;
      }

      if (object.type === 'image' || object.type === 'signature') {
        const data = dataUrlToBytes(object.src);
        if (!data) continue;
        const image = await embedImageAuto(doc, data);
        const placement = placeBox(
          object.x,
          object.y,
          object.width,
          object.height,
          width,
          height,
          rotation,
          object.rotation ?? 0,
        );
        page.drawImage(image, {
          x: placement.x,
          y: placement.y,
          width: object.width,
          height: object.height,
          opacity,
          rotate: degrees(placement.angle),
        });
        continue;
      }

      if (object.type === 'rect' || object.type === 'highlight' || object.type === 'ellipse') {
        const placement = placeBox(
          object.x,
          object.y,
          object.width,
          object.height,
          width,
          height,
          rotation,
          object.rotation ?? 0,
        );
        const fill = object.fill ? hexToRgb01(object.fill) : null;
        const stroke = object.stroke ? hexToRgb01(object.stroke) : null;
        // Highlighter has to multiply or it hides the text underneath.
        const blendMode = object.type === 'highlight' ? BlendMode.Multiply : undefined;

        if (object.type === 'ellipse') {
          // drawEllipse is centre-anchored and rotates about that centre, so the
          // centre is mapped directly rather than derived from the corner.
          const centre = placeBox(
            object.x + object.width / 2,
            object.y + object.height / 2,
            0,
            0,
            width,
            height,
            rotation,
            object.rotation ?? 0,
          );
          page.drawEllipse({
            x: centre.x,
            y: centre.y,
            xScale: object.width / 2,
            yScale: object.height / 2,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            borderColor: stroke ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
            borderWidth: object.strokeWidth ?? 0,
            opacity: fill ? opacity : undefined,
            borderOpacity: stroke ? opacity : undefined,
            rotate: degrees(placement.angle),
            blendMode,
          });
        } else {
          page.drawRectangle({
            x: placement.x,
            y: placement.y,
            width: object.width,
            height: object.height,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            borderColor: stroke ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
            borderWidth: object.strokeWidth ?? 0,
            opacity: fill ? opacity : undefined,
            borderOpacity: stroke ? opacity : undefined,
            rotate: degrees(placement.angle),
            blendMode,
          });
        }
        continue;
      }

      if (object.type === 'line' || object.type === 'arrow') {
        const start = placePoint(object.x1, object.y1, width, height, rotation);
        const end = placePoint(object.x2, object.y2, width, height, rotation);
        const stroke = hexToRgb01(object.stroke);

        page.drawLine({
          start,
          end,
          thickness: object.strokeWidth,
          color: rgb(stroke.r, stroke.g, stroke.b),
          opacity,
          lineCap: LineCapStyle.Round,
        });

        if (object.type === 'arrow') {
          drawArrowHead(page, start, end, object.strokeWidth, stroke, opacity);
        }
        continue;
      }

      if (object.type === 'draw') {
        const path = pointsToSvgPath(object.points);
        if (!path) continue;
        const stroke = hexToRgb01(object.stroke);
        // drawSvgPath treats y as increasing downward from the anchor, which is
        // exactly the space the points are already in.
        const anchor = visualToUser(0, visual.height, width, height, rotation);
        page.drawSvgPath(path, {
          x: anchor.x,
          y: anchor.y,
          borderColor: rgb(stroke.r, stroke.g, stroke.b),
          borderWidth: object.strokeWidth,
          borderOpacity: opacity,
          borderLineCap: LineCapStyle.Round,
          rotate: degrees(uprightAngle(rotation)),
          scale: 1,
        });
        continue;
      }

      if (object.type === 'link') {
        const placement = placeBox(
          object.x,
          object.y,
          object.width,
          object.height,
          width,
          height,
          rotation,
          0,
        );
        addLinkAnnotation(doc, page, placement.x, placement.y, object.width, object.height, object.url);
      }
    }

    done += 1;
    options.onProgress?.(done, byPage.size);
  }

  return saveDoc(doc);
}

function drawArrowHead(
  page: PDFPage,
  start: { x: number; y: number },
  end: { x: number; y: number },
  thickness: number,
  color: { r: number; g: number; b: number },
  opacity: number,
) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = Math.max(6, thickness * 4);
  const spread = Math.PI / 7;

  for (const direction of [angle + Math.PI - spread, angle + Math.PI + spread]) {
    page.drawLine({
      start: end,
      end: {
        x: end.x + Math.cos(direction) * size,
        y: end.y + Math.sin(direction) * size,
      },
      thickness,
      color: rgb(color.r, color.g, color.b),
      opacity,
      lineCap: LineCapStyle.Round,
    });
  }
}

/** Adds a clickable URI annotation — pdf-lib has no helper for this. */
function addLinkAnnotation(
  doc: AnyDoc,
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  url: string,
) {
  const context = doc.context;
  // `context.obj` turns bare strings into PDFName, so the URI — which must be a
  // string object, not a name — is built explicitly.
  const annotation = context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + width, y + height],
    Border: [0, 0, 0],
    C: [0, 0, 1],
    A: context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(url) }),
  });

  const ref = context.register(annotation);
  const existing = page.node.Annots();
  if (existing) {
    existing.push(ref);
  } else {
    page.node.set(PDFName.of('Annots'), context.obj([ref]));
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const isBase64 = Boolean(match[2]);
  const payload = match[3];

  if (!isBase64) {
    const text = decodeURIComponent(payload);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
    return out;
  }

  const binary = atob(payload);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export { dataUrlToBytes };
