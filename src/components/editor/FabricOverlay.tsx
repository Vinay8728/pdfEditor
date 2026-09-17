'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore, type EditorTool } from '@/lib/editorStore';
import type { EditorObject } from '@/lib/pdf/annotations';

/**
 * The interactive editing layer, drawn with Fabric.js on top of the rendered
 * page.
 *
 * The Zustand store is the source of truth: Fabric is only the input device.
 * Fabric works in CSS pixels; the store works in PDF points with the origin at
 * the page's top-left, and `zoom` is the conversion factor between them.
 *
 * Fabric is imported dynamically because it touches `document` at construction
 * time, which must not happen during the static export build.
 */

type FabricModule = typeof import('fabric');
type FabricCanvas = InstanceType<FabricModule['Canvas']>;
type FabricObject = InstanceType<FabricModule['FabricObject']> & { editorId?: string };

const DRAG_TOOLS: EditorTool[] = ['rect', 'ellipse', 'highlight', 'redact', 'line', 'arrow', 'link'];

export function FabricOverlay({
  pageIndex,
  widthPx,
  heightPx,
  zoom,
}: {
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  zoom: number;
}) {
  const canvasElementRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const moduleRef = useRef<FabricModule | null>(null);
  /** Objects array we ourselves just wrote — used to avoid a rebuild loop. */
  const selfWrite = useRef<EditorObject[] | null>(null);
  /**
   * Fabric's event handlers are registered once, so they would close over the
   * zoom from that first render. Reading it from a ref keeps them current.
   */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const objects = useEditorStore((state) => state.objects);
  const redactions = useEditorStore((state) => state.redactions);
  const activeTool = useEditorStore((state) => state.activeTool);
  const style = useEditorStore((state) => state.style);

  /* ------------------------------ create canvas ----------------------------- */
  useEffect(() => {
    let disposed = false;

    (async () => {
      const fabric = await import('fabric');
      if (disposed || !canvasElementRef.current) return;
      moduleRef.current = fabric;

      const canvas = new fabric.Canvas(canvasElementRef.current, {
        width: widthPx,
        height: heightPx,
        selection: true,
        preserveObjectStacking: true,
        backgroundColor: 'transparent',
        enableRetinaScaling: true,
      });
      fabricRef.current = canvas as FabricCanvas;

      canvas.on('object:modified', (event) => {
        const target = event.target as FabricObject | undefined;
        if (target) writeBack(target);
      });
      canvas.on('selection:created', (event) => {
        const target = (event.selected?.[0] ?? null) as FabricObject | null;
        useEditorStore.getState().select(target?.editorId ?? null);
      });
      canvas.on('selection:updated', (event) => {
        const target = (event.selected?.[0] ?? null) as FabricObject | null;
        useEditorStore.getState().select(target?.editorId ?? null);
      });
      canvas.on('selection:cleared', () => useEditorStore.getState().select(null));
      canvas.on('path:created', (event) => {
        const path = (event as unknown as { path: FabricObject }).path;
        if (path) absorbFreehandPath(path);
      });

      installDrawingHandlers(canvas);
      rebuild();
    })();

    return () => {
      disposed = true;
      const canvas = fabricRef.current;
      fabricRef.current = null;
      void canvas?.dispose();
    };
    // Recreate the canvas only when the surface itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex]);

  /* ------------------------------- keep sized ------------------------------- */
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: widthPx, height: heightPx });
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthPx, heightPx, zoom]);

  /* ------------------------------- tool modes ------------------------------- */
  useEffect(() => {
    const canvas = fabricRef.current;
    const fabric = moduleRef.current;
    if (!canvas || !fabric) return;

    canvas.isDrawingMode = activeTool === 'draw';
    if (canvas.isDrawingMode) {
      const brush = new fabric.PencilBrush(canvas);
      brush.color = style.stroke;
      brush.width = style.strokeWidth * zoom;
      canvas.freeDrawingBrush = brush;
    }

    canvas.selection = activeTool === 'select';
    canvas.forEachObject((object) => {
      const selectable = activeTool === 'select';
      object.selectable = selectable;
      object.evented = selectable;
    });
    canvas.defaultCursor = DRAG_TOOLS.includes(activeTool) || activeTool === 'text' ? 'crosshair' : 'default';
    canvas.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, style.stroke, style.strokeWidth, zoom]);

  /* ---------------------------- store -> fabric ----------------------------- */
  useEffect(() => {
    if (selfWrite.current === objects) {
      selfWrite.current = null;
      return;
    }
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objects, redactions]);

  /* -------------------------------- helpers -------------------------------- */

  function rebuild() {
    const canvas = fabricRef.current;
    const fabric = moduleRef.current;
    if (!canvas || !fabric) return;
    const zoom = zoomRef.current;

    canvas.remove(...canvas.getObjects());

    const state = useEditorStore.getState();
    const selectable = state.activeTool === 'select';

    for (const object of state.objects) {
      if (object.pageIndex !== pageIndex) continue;
      const shape = buildFabricObject(fabric, object, zoom);
      if (!shape) continue;
      shape.editorId = object.id;
      shape.selectable = selectable;
      shape.evented = selectable;
      canvas.add(shape);
    }

    // Redaction boxes are drawn but are not editor objects; they get their own
    // solid black rendering so what you see is what gets destroyed.
    for (const rect of state.redactions) {
      if (rect.pageIndex !== pageIndex) continue;
      const shape = new fabric.Rect({
        left: rect.x * zoom,
        top: rect.y * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
        fill: '#000000',
        stroke: '#ef4444',
        strokeWidth: 1,
        selectable: false,
        evented: false,
      }) as FabricObject;
      shape.editorId = rect.id;
      canvas.add(shape);
    }

    canvas.requestRenderAll();
  }

  function writeBack(target: FabricObject) {
    const zoom = zoomRef.current;
    const id = target.editorId;
    if (!id) return;

    const store = useEditorStore.getState();
    const existing = store.objects.find((object) => object.id === id);
    if (!existing) return;

    const patch = readGeometry(target, existing, zoom);
    store.updateObject(id, patch);
    selfWrite.current = useEditorStore.getState().objects;
  }

  function absorbFreehandPath(path: FabricObject) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const zoom = zoomRef.current;

    // Convert Fabric's path into our own point list, then let `rebuild` redraw
    // it from the store so there is exactly one representation of the stroke.
    const raw = (path as unknown as { path?: (string | number)[][] }).path ?? [];
    const points: number[] = [];
    for (const segment of raw) {
      for (let i = 1; i < segment.length; i += 2) {
        const x = Number(segment[i]);
        const y = Number(segment[i + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push(x / zoom, y / zoom);
        }
      }
    }

    canvas.remove(path);
    if (points.length < 4) return;

    const store = useEditorStore.getState();
    store.addObject({
      type: 'draw',
      pageIndex,
      points,
      stroke: store.style.stroke,
      strokeWidth: store.style.strokeWidth,
      opacity: store.style.opacity,
    } as Omit<EditorObject, 'id'>);
  }

  function installDrawingHandlers(canvas: FabricCanvas) {
    const zoomOf = () => zoomRef.current;
    let startX = 0;
    let startY = 0;
    let preview: FabricObject | null = null;

    canvas.on('mouse:down', (event) => {
      const store = useEditorStore.getState();
      const tool = store.activeTool;
      const fabric = moduleRef.current;
      if (!fabric || tool === 'select' || tool === 'draw') return;

      const pointer = scenePoint(canvas, event.e);
      startX = pointer.x;
      startY = pointer.y;

      if (tool === 'text') {
        const id = store.addObject({
          type: 'text',
          pageIndex,
          x: startX / zoomOf(),
          y: startY / zoomOf(),
          width: 240,
          text: 'Type here',
          fontSize: store.style.fontSize,
          fontFamily: store.style.fontFamily,
          bold: store.style.bold,
          italic: store.style.italic,
          color: store.style.color,
          align: 'left',
          opacity: store.style.opacity,
        } as Omit<EditorObject, 'id'>);
        store.setTool('select');
        store.select(id);
        return;
      }

      if (!DRAG_TOOLS.includes(tool)) return;

      preview = makePreview(fabric, tool, startX, startY, store.style) as FabricObject;
      if (preview) {
        preview.selectable = false;
        preview.evented = false;
        canvas.add(preview);
      }
    });

    canvas.on('mouse:move', (event) => {
      if (!preview) return;
      const pointer = scenePoint(canvas, event.e);
      const left = Math.min(startX, pointer.x);
      const top = Math.min(startY, pointer.y);
      const width = Math.abs(pointer.x - startX);
      const height = Math.abs(pointer.y - startY);

      const tool = useEditorStore.getState().activeTool;
      if (tool === 'line' || tool === 'arrow') {
        (preview as unknown as { set: (values: Record<string, number>) => void }).set({
          x1: startX,
          y1: startY,
          x2: pointer.x,
          y2: pointer.y,
        });
      } else if (tool === 'ellipse') {
        (preview as unknown as { set: (values: Record<string, number>) => void }).set({
          left,
          top,
          rx: width / 2,
          ry: height / 2,
        });
      } else {
        preview.set({ left, top, width, height });
      }
      canvas.requestRenderAll();
    });

    canvas.on('mouse:up', (event) => {
      if (!preview) return;
      const canvasRef = fabricRef.current;
      const pointer = scenePoint(canvas, event.e);
      const store = useEditorStore.getState();
      const tool = store.activeTool;

      canvasRef?.remove(preview);
      preview = null;

      const left = Math.min(startX, pointer.x) / zoomOf();
      const top = Math.min(startY, pointer.y) / zoomOf();
      const width = Math.abs(pointer.x - startX) / zoomOf();
      const height = Math.abs(pointer.y - startY) / zoomOf();

      if (tool === 'line' || tool === 'arrow') {
        if (Math.hypot(pointer.x - startX, pointer.y - startY) < 4) return;
        store.addObject({
          type: tool,
          pageIndex,
          x1: startX / zoomOf(),
          y1: startY / zoomOf(),
          x2: pointer.x / zoomOf(),
          y2: pointer.y / zoomOf(),
          stroke: store.style.stroke,
          strokeWidth: store.style.strokeWidth,
          opacity: store.style.opacity,
        } as Omit<EditorObject, 'id'>);
        return;
      }

      if (width < 3 || height < 3) return;

      if (tool === 'redact') {
        store.addRedaction({ pageIndex, x: left, y: top, width, height });
        return;
      }

      if (tool === 'link') {
        const url = window.prompt('Link destination (https://…)');
        if (!url) return;
        store.addObject({
          type: 'link',
          pageIndex,
          x: left,
          y: top,
          width,
          height,
          url,
        } as Omit<EditorObject, 'id'>);
        return;
      }

      store.addObject({
        type: tool,
        pageIndex,
        x: left,
        y: top,
        width,
        height,
        fill: tool === 'highlight' ? store.style.fill : undefined,
        stroke: tool === 'highlight' ? undefined : store.style.stroke,
        strokeWidth: tool === 'highlight' ? 0 : store.style.strokeWidth,
        opacity: tool === 'highlight' ? 0.4 : store.style.opacity,
      } as Omit<EditorObject, 'id'>);
    });
  }

  // Fabric replaces the canvas with a wrapper div of its own containing two
  // canvases. Positioning has to go on an element we control *outside* that
  // wrapper — putting it on the canvas itself leaves the wrapper in normal flow,
  // where it doubles the height of the page sheet and covers the controls below.
  return (
    <div className="absolute left-0 top-0">
      <canvas ref={canvasElementRef} width={widthPx} height={heightPx} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        store object  ->  fabric object                     */
/* -------------------------------------------------------------------------- */

function buildFabricObject(
  fabric: FabricModule,
  object: EditorObject,
  zoom: number,
): FabricObject | null {
  const common = {
    angle: object.rotation ?? 0,
    opacity: object.opacity ?? 1,
  };

  switch (object.type) {
    case 'text':
      return new fabric.Textbox(object.text, {
        ...common,
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        fontSize: object.fontSize * zoom,
        fontFamily: fontStackFor(object.fontFamily),
        fontWeight: object.bold ? 'bold' : 'normal',
        fontStyle: object.italic ? 'italic' : 'normal',
        fill: object.color,
        textAlign: object.align ?? 'left',
        lineHeight: object.lineHeight ?? 1.25,
        editable: true,
      }) as FabricObject;

    case 'image':
    case 'signature': {
      // Images load asynchronously; a placeholder keeps layout stable until the
      // element is ready, then the real image replaces it.
      const element = new Image();
      element.src = object.src;
      const image = new fabric.FabricImage(element, {
        ...common,
        left: object.x * zoom,
        top: object.y * zoom,
      });
      image.scaleToWidth(object.width * zoom);
      if (!element.complete) {
        element.onload = () => {
          image.scaleToWidth(object.width * zoom);
          image.canvas?.requestRenderAll();
        };
      }
      return image as FabricObject;
    }

    case 'rect':
    case 'highlight':
      return new fabric.Rect({
        ...common,
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        height: object.height * zoom,
        fill: object.fill ?? 'transparent',
        stroke: object.stroke,
        strokeWidth: (object.strokeWidth ?? 0) * zoom,
      }) as FabricObject;

    case 'ellipse':
      return new fabric.Ellipse({
        ...common,
        left: object.x * zoom,
        top: object.y * zoom,
        rx: (object.width * zoom) / 2,
        ry: (object.height * zoom) / 2,
        fill: object.fill ?? 'transparent',
        stroke: object.stroke,
        strokeWidth: (object.strokeWidth ?? 0) * zoom,
      }) as FabricObject;

    case 'line':
    case 'arrow':
      return new fabric.Line(
        [object.x1 * zoom, object.y1 * zoom, object.x2 * zoom, object.y2 * zoom],
        {
          ...common,
          stroke: object.stroke,
          strokeWidth: object.strokeWidth * zoom,
          strokeLineCap: 'round',
        },
      ) as FabricObject;

    case 'draw': {
      const path = pointsToPath(object.points, zoom);
      if (!path) return null;
      return new fabric.Path(path, {
        ...common,
        fill: undefined,
        stroke: object.stroke,
        strokeWidth: object.strokeWidth * zoom,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      }) as FabricObject;
    }

    case 'link':
      return new fabric.Rect({
        ...common,
        left: object.x * zoom,
        top: object.y * zoom,
        width: object.width * zoom,
        height: object.height * zoom,
        fill: 'rgba(47,131,247,0.10)',
        stroke: '#2f83f7',
        strokeWidth: 1,
        strokeDashArray: [4, 3],
      }) as FabricObject;

    default:
      return null;
  }
}

function pointsToPath(points: number[], zoom: number): string {
  if (points.length < 4) return '';
  let path = `M ${points[0] * zoom} ${points[1] * zoom}`;
  for (let i = 2; i < points.length; i += 2) {
    path += ` L ${points[i] * zoom} ${points[i + 1] * zoom}`;
  }
  return path;
}

function fontStackFor(family: string): string {
  if (family === 'Times') return 'Times New Roman, Times, serif';
  if (family === 'Courier') return 'Courier New, Courier, monospace';
  return 'Helvetica, Arial, sans-serif';
}

/* -------------------------------------------------------------------------- */
/*                        fabric object  ->  store patch                      */
/* -------------------------------------------------------------------------- */

function readGeometry(
  target: FabricObject,
  existing: EditorObject,
  zoom: number,
): Partial<EditorObject> {
  const left = (target.left ?? 0) / zoom;
  const top = (target.top ?? 0) / zoom;
  const scaleX = target.scaleX ?? 1;
  const scaleY = target.scaleY ?? 1;
  const rotation = target.angle ?? 0;

  if (existing.type === 'line' || existing.type === 'arrow') {
    const line = target as unknown as { x1: number; y1: number; x2: number; y2: number };
    return {
      x1: line.x1 / zoom,
      y1: line.y1 / zoom,
      x2: line.x2 / zoom,
      y2: line.y2 / zoom,
      rotation,
    } as Partial<EditorObject>;
  }

  if (existing.type === 'text') {
    const textbox = target as unknown as { text?: string; width?: number; fontSize?: number };
    return {
      x: left,
      y: top,
      width: ((textbox.width ?? 0) * scaleX) / zoom,
      fontSize: ((textbox.fontSize ?? 12) * scaleY) / zoom,
      text: textbox.text ?? existing.text,
      rotation,
    } as Partial<EditorObject>;
  }

  if (existing.type === 'draw') {
    // Freehand strokes are moved as a whole; shift every point by the delta.
    const bounds = target.getBoundingRect();
    return {
      rotation,
      points: existing.points.map((value, index) =>
        index % 2 === 0
          ? value + (bounds.left / zoom - minOf(existing.points, 0))
          : value + (bounds.top / zoom - minOf(existing.points, 1)),
      ),
    } as Partial<EditorObject>;
  }

  const width = ((target.width ?? 0) * scaleX) / zoom;
  const height = ((target.height ?? 0) * scaleY) / zoom;
  return { x: left, y: top, width, height, rotation } as Partial<EditorObject>;
}

function minOf(points: number[], offset: 0 | 1): number {
  let min = Infinity;
  for (let i = offset; i < points.length; i += 2) min = Math.min(min, points[i]);
  return Number.isFinite(min) ? min : 0;
}

function makePreview(
  fabric: FabricModule,
  tool: EditorTool,
  x: number,
  y: number,
  style: { stroke: string; strokeWidth: number; fill: string },
) {
  if (tool === 'line' || tool === 'arrow') {
    return new fabric.Line([x, y, x, y], {
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      strokeLineCap: 'round',
    });
  }

  if (tool === 'ellipse') {
    return new fabric.Ellipse({
      left: x,
      top: y,
      rx: 0,
      ry: 0,
      fill: 'transparent',
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
    });
  }

  const isRedact = tool === 'redact';
  const isHighlight = tool === 'highlight';

  return new fabric.Rect({
    left: x,
    top: y,
    width: 0,
    height: 0,
    fill: isRedact ? 'rgba(0,0,0,0.85)' : isHighlight ? style.fill : 'transparent',
    stroke: isRedact ? '#ef4444' : style.stroke,
    strokeWidth: isHighlight ? 0 : style.strokeWidth,
    opacity: isHighlight ? 0.4 : 1,
  });
}


/**
 * Fabric renamed `getPointer` to `getScenePoint` in v6. Supporting both keeps
 * the overlay working across minor version bumps of the library.
 */
function scenePoint(canvas: FabricCanvas, event: unknown): { x: number; y: number } {
  const target = canvas as unknown as {
    getScenePoint?: (event: unknown) => { x: number; y: number };
    getPointer?: (event: unknown) => { x: number; y: number };
  };
  if (typeof target.getScenePoint === 'function') return target.getScenePoint(event);
  if (typeof target.getPointer === 'function') return target.getPointer(event);
  return { x: 0, y: 0 };
}
