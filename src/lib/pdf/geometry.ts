/**
 * PDF pages carry a /Rotate flag, so "bottom-centre of the page as the reader
 * sees it" is not the same as "bottom-centre in user space". These helpers map
 * between the two, and are shared by page numbers, watermarks and stamps.
 */

export type Corner =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const CORNERS: Corner[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

export function normaliseRotation(angle: number): 0 | 90 | 180 | 270 {
  const value = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return value as 0 | 90 | 180 | 270;
}

/** Page size as the reader sees it, after /Rotate is applied. */
export function visualSize(width: number, height: number, rotation: number) {
  const r = normaliseRotation(rotation);
  return r === 90 || r === 270
    ? { width: height, height: width }
    : { width, height };
}

/**
 * Converts a point in visual space (origin bottom-left of the rotated page)
 * into PDF user space (origin bottom-left of the unrotated page).
 */
export function visualToUser(
  vx: number,
  vy: number,
  width: number,
  height: number,
  rotation: number,
): { x: number; y: number } {
  switch (normaliseRotation(rotation)) {
    case 90:
      return { x: width - vy, y: vx };
    case 180:
      return { x: width - vx, y: height - vy };
    case 270:
      return { x: vy, y: height - vx };
    default:
      return { x: vx, y: vy };
  }
}

/**
 * Angle to draw content at so it appears upright once the viewer applies
 * the page's own /Rotate. pdf-lib angles are counter-clockwise.
 */
export function uprightAngle(rotation: number): number {
  return normaliseRotation(rotation);
}

/**
 * Places a box of `boxWidth` x `boxHeight` at `corner`, inset by `margin`,
 * inside the visual page. Returns the box's bottom-left corner in visual space.
 */
export function cornerPosition(
  corner: Corner,
  pageWidth: number,
  pageHeight: number,
  boxWidth: number,
  boxHeight: number,
  margin: number,
): { vx: number; vy: number } {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'];

  let vx: number;
  if (horizontal === 'left') vx = margin;
  else if (horizontal === 'right') vx = pageWidth - margin - boxWidth;
  else vx = (pageWidth - boxWidth) / 2;

  let vy: number;
  if (vertical === 'bottom') vy = margin;
  else if (vertical === 'top') vy = pageHeight - margin - boxHeight;
  else vy = (pageHeight - boxHeight) / 2;

  return { vx, vy };
}

/** Rotates a size by an angle and returns its axis-aligned bounding box. */
export function rotatedBounds(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

export interface Placement {
  x: number;
  y: number;
  angle: number;
}

/**
 * Positions a box so it lands exactly where it appears on screen.
 *
 * `vxLeft`/`vyTop` are visual points measured from the page's TOP-left — the
 * space the editor, redaction boxes and extracted text runs all work in.
 * pdf-lib draws from an object's bottom-left corner and rotates
 * counter-clockwise about that point, so the page's own /Rotate and the
 * object's own rotation are both folded in here, about the box's centre.
 */
export function placeBox(
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

  // Object rotation is clockwise on screen, which is negative in PDF's
  // counter-clockwise convention.
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

/** Maps a bare point (no box) from top-left visual space into user space. */
export function placePoint(
  vx: number,
  vyTop: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
) {
  const visual = visualSize(pageWidth, pageHeight, pageRotation);
  return visualToUser(vx, visual.height - vyTop, pageWidth, pageHeight, pageRotation);
}

/** 2D affine matrix multiply, matching pdf.js's own Util.transform. */
export function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
