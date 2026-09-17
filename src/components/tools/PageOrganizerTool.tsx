'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckSquare,
  Copy,
  Download,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import { Alert, Button, Spinner } from '@/components/ui/controls';
import { usePdfThumbnails } from '@/lib/usePdfThumbnails';
import { cn, baseName, uid } from '@/lib/utils';

interface PageCard {
  /** Stable key for drag and drop; a page can be duplicated, so this is not the index. */
  key: string;
  sourceIndex: number;
  rotation: number;
}

export function PageOrganizerTool({ files, runJob, busy }: PanelProps) {
  const file = files[0];
  const { thumbs, pageCount, loading, error } = usePdfThumbnails(
    file?.bytes ?? null,
    file?.password,
  );

  const [cards, setCards] = useState<PageCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<PageCard[][]>([]);

  // Rebuild the working set whenever a different document is loaded.
  useEffect(() => {
    setCards(
      Array.from({ length: pageCount }, (_, index) => ({
        key: `p${index}`,
        sourceIndex: index,
        rotation: 0,
      })),
    );
    setSelected(new Set());
    setHistory([]);
  }, [pageCount, file?.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const push = (next: PageCard[]) => {
    setHistory((current) => [...current, cards].slice(-40));
    setCards(next);
  };

  const undo = () => {
    setHistory((current) => {
      if (current.length === 0) return current;
      setCards(current[current.length - 1]);
      return current.slice(0, -1);
    });
  };

  const targetKeys = useMemo(
    () => (selected.size > 0 ? selected : new Set(cards.map((card) => card.key))),
    [selected, cards],
  );

  const rotate = (delta: number) =>
    push(
      cards.map((card) =>
        targetKeys.has(card.key)
          ? { ...card, rotation: (((card.rotation + delta) % 360) + 360) % 360 }
          : card,
      ),
    );

  const removeSelected = () => {
    if (selected.size === 0) return;
    const next = cards.filter((card) => !selected.has(card.key));
    if (next.length === 0) return;
    push(next);
    setSelected(new Set());
  };

  const duplicateSelected = () => {
    if (selected.size === 0) return;
    const next: PageCard[] = [];
    for (const card of cards) {
      next.push(card);
      if (selected.has(card.key)) next.push({ ...card, key: uid('page') });
    }
    push(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = cards.findIndex((card) => card.key === active.id);
    const to = cards.findIndex((card) => card.key === over.id);
    if (from < 0 || to < 0) return;
    push(arrayMove(cards, from, to));
  };

  const toggle = (key: string, shiftKey: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (shiftKey && current.size > 0) {
        // Range-select from the last selected card.
        const keys = cards.map((card) => card.key);
        const anchor = keys.findIndex((entry) => current.has(entry));
        const target = keys.indexOf(key);
        const [lo, hi] = anchor < target ? [anchor, target] : [target, anchor];
        for (let i = lo; i <= hi; i += 1) next.add(keys[i]);
        return next;
      }
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyChanges = (mode: 'all' | 'extract') => {
    const ops =
      mode === 'extract'
        ? cards.filter((card) => selected.has(card.key))
        : cards;

    if (ops.length === 0) return;

    void runJob(async (report) => {
      const { applyPageOps } = await import('@/lib/pdf/organize');
      report('Rebuilding document', 1, 2);
      const data = await applyPageOps(
        file.bytes,
        ops.map((card) => ({ sourceIndex: card.sourceIndex, rotation: card.rotation })),
        { password: file.password },
      );
      report('Rebuilding document', 2, 2);
      const stem = baseName(file.name);
      return [
        { name: mode === 'extract' ? `${stem}-extracted.pdf` : `${stem}-organised.pdf`, data },
      ];
    });
  };

  if (error) return <Alert tone="error">{error}</Alert>;

  const changed =
    cards.length !== pageCount ||
    cards.some((card, index) => card.sourceIndex !== index || card.rotation !== 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
        <Button
          size="sm"
          variant="secondary"
          icon={selected.size === cards.length && cards.length > 0 ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          onClick={() =>
            setSelected((current) =>
              current.size === cards.length ? new Set() : new Set(cards.map((card) => card.key)),
            )
          }
        >
          {selected.size === cards.length && cards.length > 0 ? 'Deselect all' : 'Select all'}
        </Button>

        <span className="mx-1 h-6 w-px bg-line" />

        <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => rotate(-90)}>
          Left
        </Button>
        <Button size="sm" variant="secondary" icon={<RotateCw className="h-4 w-4" />} onClick={() => rotate(90)}>
          Right
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Copy className="h-4 w-4" />}
          onClick={duplicateSelected}
          disabled={selected.size === 0}
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={removeSelected}
          disabled={selected.size === 0 || selected.size === cards.length}
        >
          Delete
        </Button>

        <span className="mx-1 h-6 w-px bg-line" />

        <Button
          size="sm"
          variant="ghost"
          icon={<Undo2 className="h-4 w-4" />}
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </Button>

        <span className="ml-auto text-xs text-muted">
          {selected.size > 0
            ? `${selected.size} selected — actions apply to the selection`
            : `${cards.length} pages — actions apply to all`}
        </span>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Rendering page previews…
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={cards.map((card) => card.key)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {cards.map((card, index) => (
              <SortablePage
                key={card.key}
                card={card}
                position={index + 1}
                thumb={thumbs[card.sourceIndex] ?? null}
                selected={selected.has(card.key)}
                onToggle={(shiftKey) => toggle(card.key, shiftKey)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button
          onClick={() => applyChanges('all')}
          loading={busy}
          disabled={busy || cards.length === 0}
          icon={<Download className="h-4 w-4" />}
        >
          Apply changes
        </Button>
        <Button
          variant="secondary"
          onClick={() => applyChanges('extract')}
          disabled={busy || selected.size === 0}
        >
          Extract {selected.size > 0 ? `${selected.size} page${selected.size === 1 ? '' : 's'}` : 'selection'}
        </Button>
        {changed && <span className="text-xs text-muted">You have unsaved changes.</span>}
      </div>
    </div>
  );
}

function SortablePage({
  card,
  position,
  thumb,
  selected,
  onToggle,
}: {
  card: PageCard;
  position: number;
  thumb: string | null;
  selected: boolean;
  onToggle: (shiftKey: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.key,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        onClick={(event) => onToggle(event.shiftKey)}
        {...attributes}
        {...listeners}
        className={cn(
          'group block w-full cursor-grab rounded-lg border-2 bg-surface2 p-2 text-left transition active:cursor-grabbing',
          selected ? 'border-brand-500 ring-2 ring-brand-500/25' : 'border-line hover:border-brand-400',
        )}
        aria-pressed={selected}
        aria-label={`Page ${card.sourceIndex + 1}, now at position ${position}`}
      >
        <span className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-white">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="max-h-full max-w-full object-contain transition-transform"
              style={{ transform: `rotate(${card.rotation}deg)` }}
            />
          ) : (
            <Spinner className="text-muted" />
          )}
        </span>
        <span className="mt-1.5 flex items-center justify-between text-xs text-muted">
          <span className="font-medium text-fg">{position}</span>
          <span>
            was {card.sourceIndex + 1}
            {card.rotation !== 0 && ` · ${card.rotation}°`}
          </span>
        </span>
      </button>
    </li>
  );
}
