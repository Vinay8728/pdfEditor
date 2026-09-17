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
