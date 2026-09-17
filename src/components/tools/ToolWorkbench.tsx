'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, GripVertical, KeyRound, RotateCcw, Trash2, X } from 'lucide-react';
import { getTool } from '@/lib/tools';
import type { LoadedFile } from '@/lib/files';
import { isPdf } from '@/lib/files';
import { FileDropzone } from '@/components/FileDropzone';
import { Alert, Button, ProgressBar, TextInput } from '@/components/ui/controls';
import { downloadResults, type OutputFile } from '@/lib/download';
import { cn, formatBytes } from '@/lib/utils';
import { getPageCount, PdfPasswordRequiredError } from '@/lib/pdf/pdfjs';

import { SimpleToolPanel, SIMPLE_TOOL_SLUGS } from './SimpleToolPanel';
import { PageOrganizerTool } from './PageOrganizerTool';
import { CompareTool } from './CompareTool';
import { FormsTool } from './FormsTool';
import { DocumentInfoTool } from './DocumentInfoTool';
import { ConvertTool } from './ConvertTool';
import { EditorHandoff } from './EditorHandoff';

export type ProgressReporter = (label: string, done: number, total: number) => void;
export type ToolJob = (report: ProgressReporter) => Promise<OutputFile[]>;

export interface PanelProps {
  files: LoadedFile[];
  setFiles: React.Dispatch<React.SetStateAction<LoadedFile[]>>;
  runJob: (job: ToolJob, zipName?: string) => Promise<void>;
  busy: boolean;
  setError: (message: string | null) => void;
}

export function ToolWorkbench({ slug }: { slug: string }) {
  const tool = getTool(slug);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [outputs, setOutputs] = useState<OutputFile[] | null>(null);

  const addFiles = useCallback(
    (incoming: LoadedFile[]) => {
      setError(null);
      setOutputs(null);
      setFiles((current) => (tool?.multiple ? [...current, ...incoming] : incoming.slice(0, 1)));
    },
    [tool?.multiple],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
    setOutputs(null);
  }, []);

  const runJob = useCallback(
    async (job: ToolJob, zipName = 'pdfeditor-output.zip') => {
      setError(null);
      setOutputs(null);
      setBusy(true);
      setProgress({ label: 'Starting', value: 0 });

      try {
        const report: ProgressReporter = (label, done, total) => {
          setProgress({ label, value: total > 0 ? (done / total) * 100 : 0 });
        };
        const result = await job(report);
        setOutputs(result);
        if (result.length > 0) await downloadResults(result, zipName);
      } catch (cause) {
        setError(
          cause instanceof PdfPasswordRequiredError
            ? `${cause.message} Enter it next to the file above.`
            : cause instanceof Error
              ? cause.message
              : 'Something went wrong while processing this file.',
        );
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [],
  );

  if (!tool) return null;

  const panelProps: PanelProps = { files, setFiles, runJob, busy, setError };

  return (
    <div className="space-y-5">
      {files.length === 0 ? (
        <FileDropzone
          accept={tool.accept}
          multiple={tool.multiple}
          onFiles={addFiles}
          onError={setError}
          label={tool.multiple ? `Drop your files here` : `Drop your file here`}
        />
      ) : (
        <FileList
          files={files}
          multiple={Boolean(tool.multiple)}
          accept={tool.accept}
          onAdd={addFiles}
          onRemove={removeFile}
          onReorder={setFiles}
          onPassword={(id, password) =>
            setFiles((current) =>
              current.map((file) => (file.id === id ? { ...file, password } : file)),
            )
          }
          onError={setError}
          disabled={busy}
        />
      )}

      {error && (
        <Alert tone="error" title="That did not work">
          {error}
        </Alert>
      )}

      {progress && <ProgressBar value={progress.value} label={progress.label} />}

      {files.length > 0 && (
        <div className="card p-5">
          {tool.opensEditor ? (
            <EditorHandoff {...panelProps} slug={slug} />
          ) : slug === 'organise-pages' ? (
            <PageOrganizerTool {...panelProps} />
          ) : slug === 'compare-pdf' ? (
            <CompareTool {...panelProps} />
          ) : slug === 'fill-forms' ? (
            <FormsTool {...panelProps} />
          ) : slug === 'sign-and-shield' ? (
            <DocumentInfoTool {...panelProps} />
          ) : slug === 'pdf-to-office' || slug === 'office-to-pdf' ? (
            <ConvertTool {...panelProps} slug={slug} />
          ) : SIMPLE_TOOL_SLUGS.includes(slug) ? (
            <SimpleToolPanel {...panelProps} slug={slug} />
          ) : (
            <Alert tone="warning">This tool is not wired up yet.</Alert>
          )}
        </div>
      )}

      {outputs && outputs.length > 0 && (
        <Alert tone="success" title="Done">
          <div className="mt-1 space-y-1">
            {outputs.slice(0, 6).map((file) => (
              <div key={file.name} className="flex items-center gap-2 text-xs">
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{file.name}</span>
                <span className="ml-auto shrink-0 tabular-nums opacity-70">
                  {formatBytes(file.data.byteLength)}
                </span>
              </div>
            ))}
            {outputs.length > 6 && (
              <p className="text-xs opacity-70">and {outputs.length - 6} more…</p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            icon={<Download className="h-4 w-4" />}
            onClick={() => void downloadResults(outputs, 'pdfeditor-output.zip')}
          >
            Download again
          </Button>
        </Alert>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  File list                                 */
/* -------------------------------------------------------------------------- */

function FileList({
  files,
  multiple,
  accept,
  onAdd,
  onRemove,
  onReorder,
  onPassword,
  onError,
  disabled,
}: {
  files: LoadedFile[];
  multiple: boolean;
  accept: string;
  onAdd: (files: LoadedFile[]) => void;
  onRemove: (id: string) => void;
  onReorder: React.Dispatch<React.SetStateAction<LoadedFile[]>>;
  onPassword: (id: string, password: string) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    onReorder((current) => {
      if (to < 0 || to >= current.length || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {files.map((file, index) => (
          <li
            key={file.id}
            draggable={multiple && !disabled}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            className={cn(
              'card flex items-center gap-3 p-3',
              multiple && 'cursor-grab active:cursor-grabbing',
              dragIndex === index && 'opacity-50',
            )}
          >
            {multiple && (
              <GripVertical className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            )}
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface2 text-muted">
              <FileText className="h-4 w-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">
                {formatBytes(file.size)}
                {typeof file.pageCount === 'number' && ` · ${file.pageCount} pages`}
                {file.encrypted && ' · password protected'}
              </p>
            </div>

            {file.encrypted && (
              <div className="flex w-48 items-center gap-1.5">
                <KeyRound className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                <TextInput
                  type="password"
                  placeholder="Password"
                  defaultValue={file.password ?? ''}
                  onBlur={(event) => onPassword(file.id, event.target.value)}
                  className="h-8 py-1 text-xs"
                  aria-label={`Password for ${file.name}`}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => onRemove(file.id)}
              disabled={disabled}
              className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-red-600 disabled:opacity-40"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <PdfProbe files={files} onReorder={onReorder} />

      <div className="flex flex-wrap items-center gap-2">
        {multiple && (
          <FileDropzone
            accept={accept}
            multiple
            compact
            onFiles={onAdd}
            onError={onError}
            label="Add more files"
            hint="or paste"
            className="flex-1"
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => onReorder([])}
          disabled={disabled}
        >
          Clear all
        </Button>
        {multiple && files.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => onReorder((current) => [...current].reverse())}
            disabled={disabled}
          >
            Reverse order
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Reads page counts and encryption status for newly added PDFs, so the file
 * list can show them and prompt for a password before anything is run.
 */
function PdfProbe({
  files,
  onReorder,
}: {
  files: LoadedFile[];
  onReorder: React.Dispatch<React.SetStateAction<LoadedFile[]>>;
}) {
  // Each (file, password) pair is probed at most once. Without this, writing
  // `encrypted: true` back into state would re-trigger the effect forever.
  const attempted = useRef(new Set<string>());

  const pending = useMemo(
    () =>
      files.filter(
        (file) =>
          isPdf(file) &&
          file.pageCount === undefined &&
          !file.error &&
          !attempted.current.has(`${file.id}:${file.password ?? ''}`),
      ),
    [files],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for (const file of pending) {
        attempted.current.add(`${file.id}:${file.password ?? ''}`);
        try {
          const pageCount = await getPageCount(file.bytes, file.password);
          if (cancelled) return;
          onReorder((current) =>
            current.map((entry) =>
              entry.id === file.id ? { ...entry, pageCount, encrypted: false } : entry,
            ),
          );
        } catch (error) {
          if (cancelled) return;
          const encrypted = error instanceof PdfPasswordRequiredError;
          onReorder((current) =>
            current.map((entry) =>
              entry.id === file.id
                ? {
                    ...entry,
                    encrypted,
                    error: encrypted ? undefined : 'This file could not be read as a PDF.',
                    pageCount: encrypted ? undefined : 0,
                  }
                : entry,
            ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pending, onReorder]);

  const broken = files.filter((file) => file.error);
  if (broken.length === 0) return null;

  return (
    <Alert tone="warning" title="Some files could not be read">
      <ul className="mt-1 list-inside list-disc text-xs">
        {broken.map((file) => (
          <li key={file.id}>
            {file.name} — {file.error}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs">Try the Repair tool on these.</p>
    </Alert>
  );
}
