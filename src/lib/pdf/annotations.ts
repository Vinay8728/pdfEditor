import type { FontFamily } from './fonts';

/**
 * The editor's own document model.
 *
 * Fabric.js drives the on-screen canvas, but we never persist raw Fabric JSON:
 * these plain objects are what undo/redo snapshots and what the PDF exporter
 * reads. Keeping them separate means the export is deterministic and does not
 * depend on Fabric internals.
 *
 * COORDINATES: visual page points with the origin at the TOP-LEFT, matching
 * both the DOM and the rendered canvas. The exporter converts to PDF user space.
 */

export interface BaseObject {
  id: string;
  pageIndex: number;
  /** Clockwise degrees, about the object's own centre. */
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}

export interface TextObject extends BaseObject {
  type: 'text';
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  bold?: boolean;
  italic?: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
}

export interface ImageObject extends BaseObject {
  type: 'image' | 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Data URL used for on-screen rendering. */
  src: string;
}

export interface RectObject extends BaseObject {
  type: 'rect' | 'ellipse' | 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineObject extends BaseObject {
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface PathObject extends BaseObject {
  type: 'draw';
  /** Flat list of points [x0, y0, x1, y1, ...] in visual top-left points. */
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface LinkObject extends BaseObject {
  type: 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
}

export type EditorObject =
  | TextObject
  | ImageObject
  | RectObject
  | LineObject
  | PathObject
  | LinkObject;

export type EditorObjectType = EditorObject['type'];

export function isBoxObject(
  object: EditorObject,
): object is ImageObject | RectObject | LinkObject {
  return (
    object.type === 'image' ||
    object.type === 'signature' ||
    object.type === 'rect' ||
    object.type === 'ellipse' ||
    object.type === 'highlight' ||
    object.type === 'link'
  );
}

/** Axis-aligned bounds in visual top-left points, used for selection and hit tests. */
export function boundsOf(object: EditorObject): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (object.type === 'line' || object.type === 'arrow') {
    return {
      x: Math.min(object.x1, object.x2),
      y: Math.min(object.y1, object.y2),
      width: Math.abs(object.x2 - object.x1),
      height: Math.abs(object.y2 - object.y1),
    };
  }

  if (object.type === 'draw') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < object.points.length; i += 2) {
      minX = Math.min(minX, object.points[i]);
      maxX = Math.max(maxX, object.points[i]);
      minY = Math.min(minY, object.points[i + 1]);
      maxY = Math.max(maxY, object.points[i + 1]);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  if (object.type === 'text') {
    const lines = Math.max(1, object.text.split(/\r?\n/).length);
    return {
      x: object.x,
      y: object.y,
      width: object.width,
      height: lines * object.fontSize * (object.lineHeight ?? 1.25),
    };
  }

  return { x: object.x, y: object.y, width: object.width, height: object.height };
}
