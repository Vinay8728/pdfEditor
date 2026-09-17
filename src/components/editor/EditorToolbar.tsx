'use client';

import {
  ArrowUpRight,
  Circle,
  Eraser,
  Highlighter,
  ImagePlus,
  Link2,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  TextCursorInput,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEditorStore, type EditorTool } from '@/lib/editorStore';
import { Button, Select } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

const GROUPS: { label: string; tools: { id: EditorTool; label: string; Icon: typeof Type }[] }[] = [
  {
    label: 'Select',
    tools: [{ id: 'select', label: 'Select', Icon: MousePointer2 }],
  },
  {
    label: 'Text',
    tools: [
      { id: 'edittext', label: 'Edit text', Icon: TextCursorInput },
      { id: 'text', label: 'Add text', Icon: Type },
    ],
  },
  {
    label: 'Images & sign',
    tools: [
      { id: 'image', label: 'Image', Icon: ImagePlus },
      { id: 'signature', label: 'Sign', Icon: Pencil },
    ],
  },
  {
    label: 'Annotate',
    tools: [
      { id: 'draw', label: 'Draw', Icon: Pencil },
      { id: 'highlight', label: 'Highlight', Icon: Highlighter },
      { id: 'link', label: 'Link', Icon: Link2 },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { id: 'rect', label: 'Rectangle', Icon: Square },
      { id: 'ellipse', label: 'Ellipse', Icon: Circle },
      { id: 'line', label: 'Line', Icon: Minus },
      { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
    ],
  },
  {
    label: 'Redact',
    tools: [{ id: 'redact', label: 'Redact', Icon: Eraser }],
  },
];

export function EditorToolbar({
  onPickImage,
  onPickSignature,
}: {
  onPickImage: () => void;
  onPickSignature: () => void;
}) {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setTool = useEditorStore((state) => state.setTool);
  const style = useEditorStore((state) => state.style);
  const setStyle = useEditorStore((state) => state.setStyle);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const past = useEditorStore((state) => state.past.length);
  const future = useEditorStore((state) => state.future.length);
  const selectedId = useEditorStore((state) => state.selectedId);
  const removeObject = useEditorStore((state) => state.removeObject);

  const pick = (tool: EditorTool) => {
    if (tool === 'image') {
      onPickImage();
      return;
    }
    if (tool === 'signature') {
      onPickSignature();
      return;
    }
    setTool(tool);
  };

  const showTextStyles = activeTool === 'text' || activeTool === 'select';
  const showStrokeStyles = ['draw', 'rect', 'ellipse', 'line', 'arrow'].includes(activeTool);

  return (
    <div className="no-print border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1 px-3 py-2">
        {GROUPS.map((group, index) => (
          <div key={group.label} className="flex items-center gap-1">
            {index > 0 && <span className="mx-1 h-8 w-px bg-line" />}
            {group.tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="toolbar-btn"
                aria-pressed={activeTool === tool.id}
                onClick={() => pick(tool.id)}
                title={tool.label}
              >
                <tool.Icon className="h-[18px] w-[18px]" aria-hidden />
                {tool.label}
              </button>
            ))}
          </div>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="toolbar-btn"
            onClick={undo}
            disabled={past === 0}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-[18px] w-[18px]" aria-hidden />
            Undo
          </button>
          <button
            type="button"
            className="toolbar-btn"
            onClick={redo}
            disabled={future === 0}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-[18px] w-[18px]" aria-hidden />
            Redo
          </button>

          <span className="mx-1 h-8 w-px bg-line" />

          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setZoom(zoom - 0.15)}
            title="Zoom out"
          >
            <ZoomOut className="h-[18px] w-[18px]" aria-hidden />
            Out
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setZoom(zoom + 0.15)}
            title="Zoom in"
          >
            <ZoomIn className="h-[18px] w-[18px]" aria-hidden />
            In
          </button>
        </div>
      </div>

      {/* Contextual style strip */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 border-t border-line bg-surface2 px-3 py-2 text-sm',
        )}
      >
        {showTextStyles && (
          <>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Font</span>
              <Select
                className="h-8 w-32 py-0 text-xs"
                value={style.fontFamily}
                onChange={(event) =>
                  setStyle({ fontFamily: event.target.value as typeof style.fontFamily })
                }
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </Select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Size</span>
              <input
                type="number"
                min={4}
                max={200}
                value={style.fontSize}
                onChange={(event) => setStyle({ fontSize: Number(event.target.value) || 12 })}
                className="input h-8 w-16 py-0 text-xs"
              />
            </label>
            <button
              type="button"
              aria-pressed={style.bold}
              onClick={() => setStyle({ bold: !style.bold })}
              className="toolbar-btn px-2 font-bold"
            >
              B
            </button>
            <button
              type="button"
              aria-pressed={style.italic}
              onClick={() => setStyle({ italic: !style.italic })}
              className="toolbar-btn px-2 italic"
            >
              I
            </button>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Colour</span>
              <input
                type="color"
                value={style.color}
                onChange={(event) => setStyle({ color: event.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
                aria-label="Text colour"
              />
            </label>
          </>
        )}

        {showStrokeStyles && (
          <>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Stroke</span>
              <input
                type="color"
                value={style.stroke}
                onChange={(event) => setStyle({ stroke: event.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
                aria-label="Stroke colour"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-muted">Width</span>
              <input
                type="number"
                min={0.5}
                max={40}
                step={0.5}
                value={style.strokeWidth}
                onChange={(event) => setStyle({ strokeWidth: Number(event.target.value) || 1 })}
                className="input h-8 w-16 py-0 text-xs"
              />
            </label>
          </>
        )}

        {activeTool === 'highlight' && (
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-muted">Highlight</span>
            <input
              type="color"
              value={style.fill}
              onChange={(event) => setStyle({ fill: event.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
              aria-label="Highlight colour"
            />
          </label>
        )}

        {activeTool === 'edittext' && (
          <span className="text-xs text-muted">
            Click any text on the page to change it. The replacement keeps the original position,
            size and colour — check the result before sending the file on.
          </span>
        )}

        {activeTool === 'redact' && (
          <span className="text-xs text-muted">
            Drag a box over anything sensitive. Affected pages are re-rendered on apply, so the
            content underneath is destroyed.
          </span>
        )}

        {selectedId && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => removeObject(selectedId)}
          >
            Delete selected
          </Button>
        )}
      </div>
    </div>
  );
}
