'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, FileX2, Trash2 } from 'lucide-react';
import { useEditorStore, type PageGeometry } from '@/lib/editorStore';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { FabricOverlay } from '@/components/editor/FabricOverlay';
import { PdfPageRender } from '@/components/editor/PdfPageRender';
import { SignatureDialog } from '@/components/editor/SignatureDialog';
import { FileDropzone } from '@/components/FileDropzone';
import { Alert, Button, ProgressBar, Spinner } from '@/components/ui/controls';
import { usePdfThumbnails } from '@/lib/usePdfThumbnails';
import { loadPdfDocument } from '@/lib/pdf/pdfjs';
import { downloadFile } from '@/lib/download';
import { readAsDataUrl } from '@/lib/files';
import { baseName, cn } from '@/lib/utils';
import type { EditorObject } from '@/lib/pdf/annotations';

export default function EditorPage() {
  const {
    fileName,
    bytes,
    password,
    pageCount,
    geometry,
    currentPage,
    zoom,
    objects,
    redactions,
    setCurrentPage,
    setDocument,
    closeDocument,
    addObject,
    removeObject,
    removeRedaction,
    selectedId,
    undo,
    redo,
    clearAll,
  } = useEditorStore();

  const [signatureOpen, setSignatureOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);

  const page = geometry[currentPage];

  // Fit the page to the viewport the first time a document opens.
  const viewportRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ keyboard ------------------------------ */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) return;

      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeObject(selectedId);
      } else if (event.key === 'ArrowLeft' && !mod) {
        setCurrentPage(Math.max(0, currentPage - 1));
      } else if (event.key === 'ArrowRight' && !mod) {
        setCurrentPage(Math.min(pageCount - 1, currentPage + 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedId, removeObject, currentPage, pageCount, setCurrentPage]);

  /* ------------------------------ insertion ----------------------------- */
  const placeImage = useCallback(
    (dataUrl: string, kind: 'image' | 'signature') => {
      const geo = geometry[currentPage];
      if (!geo) return;

      const element = new Image();
      element.onload = () => {
        const maxWidth = geo.width * (kind === 'signature' ? 0.32 : 0.5);
        const width = Math.min(maxWidth, element.naturalWidth);
        const height = (element.naturalHeight / element.naturalWidth) * width;

        addObject({
          type: kind,
          pageIndex: currentPage,
          x: (geo.width - width) / 2,
          y: (geo.height - height) / 2,
          width,
          height,
          src: dataUrl,
        } as Omit<EditorObject, 'id'>);
        useEditorStore.getState().setTool('select');
      };
      element.onerror = () => setError('That image could not be decoded.');
      element.src = dataUrl;
    },
    [addObject, currentPage, geometry],
  );

  /* -------------------------------- apply ------------------------------- */
  const applyChanges = async () => {
    if (!bytes || !fileName) return;
    setBusy(true);
    setError(null);
    try {
      let output = bytes;

      if (objects.length > 0) {
        setProgress({ label: 'Writing your edits into the PDF', value: 10 });
        const { applyOverlay } = await import('@/lib/pdf/overlay');
        output = await applyOverlay(output, objects, {
          password,
          onProgress: (done, total) =>
            setProgress({ label: 'Writing your edits into the PDF', value: (done / total) * 60 }),
        });
      }

      if (redactions.length > 0) {
        setProgress({ label: 'Destroying redacted content', value: 70 });
        const { redactPdf } = await import('@/lib/pdf/redact');
        // Redaction runs last so anything drawn on top is burnt in too.
        output = await redactPdf(
          output,
          redactions.map((rect) => ({
            pageIndex: rect.pageIndex,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          })),
          {
            password: objects.length > 0 ? undefined : password,
            onProgress: (done, total) =>
              setProgress({
                label: 'Destroying redacted content',
                value: 70 + (done / total) * 25,
              }),
          },
        );
      }

      setProgress({ label: 'Preparing download', value: 98 });
      downloadFile({ name: `${baseName(fileName)}-edited.pdf`, data: output });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The changes could not be applied.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  /* ------------------------------ empty state --------------------------- */
  if (!bytes) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-2xl font-bold tracking-tight">PDF editor</h1>
        <p className="mt-1.5 text-muted">
          Drop a PDF to start editing. Everything happens on your device.
        </p>

        {error && (
          <Alert tone="error" className="mt-4">
            {error}
          </Alert>
        )}

        <div className="mt-6">
          {loadingDoc ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Opening the document…
            </p>
          ) : (
            <FileDropzone
              accept="application/pdf,.pdf"
              onFiles={async (files) => {
                const file = files[0];
                if (!file) return;
                setLoadingDoc(true);
                setError(null);
                try {
                  const doc = await loadPdfDocument(file.bytes);
                  const geo: PageGeometry[] = [];
                  for (let i = 1; i <= doc.numPages; i += 1) {
                    const pdfPage = await doc.getPage(i);
                    const viewport = pdfPage.getViewport({ scale: 1 });
                    geo.push({
                      width: viewport.width,
                      height: viewport.height,
                      rotation: pdfPage.rotate ?? 0,
                    });
                    pdfPage.cleanup();
                  }
                  const count = doc.numPages;
                  await doc.destroy();
                  setDocument({
                    fileName: file.name,
                    bytes: file.bytes,
                    pageCount: count,
                    geometry: geo,
                  });
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'That PDF could not be opened. If it is password protected, open it from the Unlock tool first.',
                  );
                } finally {
                  setLoadingDoc(false);
                }
              }}
              onError={setError}
            />
          )}
        </div>
      </div>
    );
  }

  const displayWidth = page ? page.width * zoom : 0;
  const displayHeight = page ? page.height * zoom : 0;
  const pageObjects = objects.filter((object) => object.pageIndex === currentPage).length;
  const pageRedactions = redactions.filter((rect) => rect.pageIndex === currentPage).length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <EditorToolbar
        onPickImage={() => imageInputRef.current?.click()}
        onPickSignature={() => setSignatureOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <PageSidebar />

        <div
          ref={viewportRef}
          className="flex min-w-0 flex-1 flex-col items-center overflow-auto bg-surface2 p-6 scroll-thin"
        >
          {error && (
            <Alert tone="error" className="mb-4 w-full max-w-2xl">
              {error}
            </Alert>
          )}

          {page && (
            <div
              className="page-sheet relative shrink-0"
              style={{ width: displayWidth, height: displayHeight }}
            >
              <PdfPageRender
                bytes={bytes}
                password={password}
                pageIndex={currentPage}
                widthPx={displayWidth}
                heightPx={displayHeight}
              />
              <FabricOverlay
                pageIndex={currentPage}
                widthPx={displayWidth}
                heightPx={displayHeight}
                zoom={zoom}
              />
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <button
              type="button"
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="rounded-lg p-1.5 transition hover:bg-surface hover:text-fg disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="tabular-nums">
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(Math.min(pageCount - 1, currentPage + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded-lg p-1.5 transition hover:bg-surface hover:text-fg disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-surface p-4 lg:flex">
          <h2 className="text-sm font-semibold">{fileName}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {pageCount} pages · {objects.length} edits · {redactions.length} redactions
          </p>

          <div className="mt-4 space-y-2 text-xs text-muted">
            <p>
              This page: {pageObjects} edit{pageObjects === 1 ? '' : 's'}
              {pageRedactions > 0 && `, ${pageRedactions} redaction${pageRedactions === 1 ? '' : 's'}`}
            </p>
          </div>

          {redactions.length > 0 && (
            <div className="mt-4">
              <p className="label">Redactions</p>
              <ul className="space-y-1">
                {redactions.map((rect) => (
                  <li
                    key={rect.id}
                    className="flex items-center justify-between rounded-md bg-surface2 px-2 py-1.5 text-xs"
                  >
                    <button
                      type="button"
                      className="truncate text-left transition hover:text-fg"
                      onClick={() => setCurrentPage(rect.pageIndex)}
                    >
                      Page {rect.pageIndex + 1} — {Math.round(rect.width)}×{Math.round(rect.height)} pt
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRedaction(rect.id)}
                      className="ml-2 shrink-0 text-muted transition hover:text-red-600"
                      aria-label="Remove redaction"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-auto space-y-3 border-t border-line pt-4">
            {progress && <ProgressBar value={progress.value} label={progress.label} />}

            <Button
              className="w-full"
              onClick={applyChanges}
              loading={busy}
              disabled={busy || (objects.length === 0 && redactions.length === 0)}
              icon={<Download className="h-4 w-4" />}
            >
              Apply changes
            </Button>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={clearAll}
                disabled={objects.length === 0 && redactions.length === 0}
              >
                Clear edits
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                icon={<FileX2 className="h-4 w-4" />}
                onClick={closeDocument}
              >
                Close
              </Button>
            </div>

            <Link
              href="/"
              className="block text-center text-xs text-muted transition hover:text-fg"
            >
              Back to all tools
            </Link>
          </div>
        </aside>
      </div>

      {/* Mobile action bar — the right-hand panel is hidden below lg. */}
      <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2 lg:hidden">
        <span className="truncate text-xs text-muted">
          {objects.length} edits · {redactions.length} redactions
        </span>
        <Button
          size="sm"
          className="ml-auto"
          onClick={applyChanges}
          loading={busy}
          disabled={busy || (objects.length === 0 && redactions.length === 0)}
          icon={<Download className="h-4 w-4" />}
        >
          Apply
        </Button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            placeImage(await readAsDataUrl(file), 'image');
          } catch {
            setError('That image could not be read.');
          }
        }}
      />

      <SignatureDialog
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onApply={(dataUrl) => {
          setSignatureOpen(false);
          placeImage(dataUrl, 'signature');
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Page thumbnails                              */
/* -------------------------------------------------------------------------- */

function PageSidebar() {
  const bytes = useEditorStore((state) => state.bytes);
  const password = useEditorStore((state) => state.password);
  const currentPage = useEditorStore((state) => state.currentPage);
  const setCurrentPage = useEditorStore((state) => state.setCurrentPage);
  const objects = useEditorStore((state) => state.objects);
  const redactions = useEditorStore((state) => state.redactions);

  const { thumbs, pageCount } = usePdfThumbnails(bytes, password, 150);

  const marks = useMemo(() => {
    const counts = new Map<number, number>();
    for (const object of objects) counts.set(object.pageIndex, (counts.get(object.pageIndex) ?? 0) + 1);
    for (const rect of redactions) counts.set(rect.pageIndex, (counts.get(rect.pageIndex) ?? 0) + 1);
    return counts;
  }, [objects, redactions]);

  return (
    <nav
      aria-label="Pages"
      className="hidden w-40 shrink-0 overflow-y-auto border-r border-line bg-surface p-2 scroll-thin sm:block"
    >
      <ul className="space-y-2">
        {Array.from({ length: pageCount }, (_, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => setCurrentPage(index)}
              aria-current={index === currentPage ? 'page' : undefined}
              className={cn(
                'relative block w-full rounded-lg border-2 p-1 transition',
                index === currentPage
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-transparent hover:border-line',
              )}
            >
              <span className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-white">
                {thumbs[index] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbs[index] as string} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Spinner className="text-muted" />
                )}
              </span>
              <span className="mt-1 block text-center text-[11px] text-muted">{index + 1}</span>
              {(marks.get(index) ?? 0) > 0 && (
                <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                  {marks.get(index)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
