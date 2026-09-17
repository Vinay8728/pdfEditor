'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { cn, formatBytes } from '@/lib/utils';
import { MAX_FILE_BYTES, matchesAccept, toLoadedFile, type LoadedFile } from '@/lib/files';

export interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  onFiles: (files: LoadedFile[]) => void;
  onError?: (message: string) => void;
  label?: string;
  hint?: string;
  compact?: boolean;
  className?: string;
}

export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  onError,
  label,
  hint,
  compact = false,
  className,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const inputId = useId();

  const ingest = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;

      const accepted = incoming.filter((file) => matchesAccept(file, accept));
      const rejected = incoming.length - accepted.length;

      if (accepted.length === 0) {
        onError?.(
          rejected === 1
            ? 'That file type is not supported by this tool.'
            : 'None of those files are supported by this tool.',
        );
        return;
      }

      const chosen = multiple ? accepted : accepted.slice(0, 1);

      setBusy(true);
      try {
        const loaded: LoadedFile[] = [];
        for (const file of chosen) {
          try {
            loaded.push(await toLoadedFile(file));
          } catch (error) {
            onError?.(error instanceof Error ? error.message : 'That file could not be read.');
          }
        }
        if (loaded.length > 0) onFiles(loaded);
        if (rejected > 0) {
          onError?.(`${rejected} file${rejected === 1 ? ' was' : 's were'} skipped — wrong type.`);
        }
      } finally {
        setBusy(false);
      }
    },
    [accept, multiple, onFiles, onError],
  );

  // Paste a file straight onto the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) void ingest(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [ingest]);

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (event.dataTransfer?.files?.length) void ingest(event.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition',
          compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-14',
          dragging
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-line bg-surface hover:border-brand-400 hover:bg-surface2',
        )}
      >
        <span
          className={cn(
            'grid place-items-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-300',
            compact ? 'h-9 w-9' : 'h-14 w-14',
          )}
        >
          {dragging ? (
            <FileUp className={compact ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden />
          ) : (
            <Upload className={compact ? 'h-4 w-4' : 'h-6 w-6'} aria-hidden />
          )}
        </span>

        <span className={cn('font-semibold text-fg', compact ? 'text-sm' : 'text-lg')}>
          {busy
            ? 'Reading files…'
            : label ?? (multiple ? 'Drop files here' : 'Drop a file here')}
        </span>

        <span className="text-sm text-muted">
          {hint ?? (
            <>
              or <span className="font-medium text-brand-600 dark:text-brand-300">browse</span> —
              you can paste too
            </>
          )}
        </span>

        {!compact && (
          <span className="text-xs text-muted/80">
            Processed on your device. Up to {formatBytes(MAX_FILE_BYTES, 0)} per file.
          </span>
        )}

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) void ingest(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
