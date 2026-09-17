'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/lib/editorStore';
import { extractTextRuns, type PdfTextRun } from '@/lib/pdf/textLayer';
import { Spinner } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

/**
 * Makes the text already inside the PDF clickable and editable.
 *
 * Each run detected on the page gets a box in exactly the place it is drawn.
 * Clicking one turns it into an input; committing records the replacement in
 * the store, which the exporter then patches into the real document.
 *
 * This only mounts while the "Edit text" tool is active, so the extraction pass
 * (which renders the page to sample colours) is not paid for otherwise.
 */
export function TextEditLayer({
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
  const bytes = useEditorStore((state) => state.bytes);
  const password = useEditorStore((state) => state.password);
  const textEdits = useEditorStore((state) => state.textEdits);
  const setTextEdit = useEditorStore((state) => state.setTextEdit);

  const [runs, setRuns] = useState<PdfTextRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelling = useRef(false);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;

    setRuns(null);
    setError(null);
    setEditingId(null);

    (async () => {
      try {
        const found = await extractTextRuns(bytes, pageIndex, { password });
        if (!cancelled) setRuns(found);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'The text on this page could not be read.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes, password, pageIndex]);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commit = (run: PdfTextRun) => {
    // Escape unmounts the input, which fires onBlur; without this the cancelled
    // value would be committed anyway.
    if (cancelling.current) {
      cancelling.current = false;
      return;
    }
    setTextEdit({
      id: run.id,
      pageIndex: run.pageIndex,
      original: run.text,
      text: draft,
      x: run.x,
      y: run.y,
      width: run.width,
      height: run.height,
      baselineOffset: run.baselineOffset,
      fontSize: run.fontSize,
      family: run.family,
      bold: run.bold,
      italic: run.italic,
      color: run.color,
      background: run.background,
    });
    setEditingId(null);
  };

  if (error) {
    return (
      <div className="absolute inset-x-0 top-2 z-20 mx-auto w-max rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white shadow-pop">
        {error}
      </div>
    );
  }

  if (!runs) {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-white/60">
        <span className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted shadow-pop">
          <Spinner /> Finding the text on this page…
        </span>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-0 z-20" style={{ width: widthPx, height: heightPx }}>
      {runs.length === 0 && (
        <div className="absolute inset-x-0 top-2 mx-auto w-max rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-pop">
          No editable text here — this page is a scan. Run OCR first.
        </div>
      )}

      {runs.map((run) => {
        const edit = textEdits[run.id];
        const shown = edit ? edit.text : run.text;
        const isEditing = editingId === run.id;

        const box = {
          left: run.x * zoom,
          top: run.y * zoom,
          width: Math.max(run.width * zoom, 8),
          height: Math.max(run.height * zoom, 10),
        } as const;

        if (isEditing) {
          return (
            <input
              key={run.id}
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => commit(run)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  // Blur rather than commit directly: unmounting the input fires
                  // onBlur anyway, and committing twice doubles the undo entry.
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelling.current = true;
                  setEditingId(null);
                }
              }}
              aria-label={`Edit text: ${run.text}`}
              className="absolute z-30 rounded-sm border-2 border-brand-500 bg-white px-0.5 text-black outline-none"
              style={{
                left: box.left,
                top: box.top,
                width: Math.max(box.width + 24 * zoom, 60),
                height: box.height,
                fontSize: run.fontSize * zoom,
                fontFamily:
                  run.family === 'Times'
                    ? 'Times New Roman, serif'
                    : run.family === 'Courier'
                      ? 'Courier New, monospace'
                      : 'Helvetica, Arial, sans-serif',
                fontWeight: run.bold ? 700 : 400,
                fontStyle: run.italic ? 'italic' : 'normal',
              }}
            />
          );
        }

        return (
          <button
            key={run.id}
            type="button"
            // The box is otherwise empty, so without this it has no accessible
            // name at all and cannot be reached by keyboard or screen reader.
            aria-label={`Edit text: ${run.text}`}
            title={edit ? `Changed from “${run.text}”` : 'Click to edit this text'}
            onClick={() => {
              setDraft(shown);
              setEditingId(run.id);
            }}
            className={cn(
              'absolute cursor-text rounded-sm border transition',
              edit
                ? 'border-brand-500 bg-brand-500/20'
                : 'border-transparent hover:border-brand-400 hover:bg-brand-500/10',
            )}
            style={box}
          >
            {edit && (
              // The patched value is previewed here; the page underneath still
              // shows the original until the changes are applied.
              <span
                className="absolute inset-0 flex items-center overflow-hidden whitespace-pre px-0.5 text-left"
                style={{
                  background: run.background,
                  color: run.color,
                  fontSize: run.fontSize * zoom,
                  fontFamily:
                    run.family === 'Times'
                      ? 'Times New Roman, serif'
                      : run.family === 'Courier'
                        ? 'Courier New, monospace'
                        : 'Helvetica, Arial, sans-serif',
                  fontWeight: run.bold ? 700 : 400,
                  fontStyle: run.italic ? 'italic' : 'normal',
                }}
              >
                {edit.text}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
