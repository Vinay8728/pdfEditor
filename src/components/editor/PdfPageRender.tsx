'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPdfDocument, type PdfDocumentProxy } from '@/lib/pdf/pdfjs';
import { Spinner } from '@/components/ui/controls';

/**
 * Renders a single PDF page into a canvas at the current zoom.
 *
 * The pdf.js document is opened once per file and kept in a ref, so paging
 * through a large document does not re-parse it every time. `docVersion` is what
 * tells the render effect that the document has finished opening.
 */
export function PdfPageRender({
  bytes,
  password,
  pageIndex,
  widthPx,
  heightPx,
  className,
}: {
  bytes: Uint8Array;
  password?: string;
  pageIndex: number;
  /** CSS size the page should occupy. */
  widthPx: number;
  heightPx: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDocumentProxy | null>(null);
  const renderToken = useRef(0);

  const [docVersion, setDocVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRendering(true);

    (async () => {
      try {
        const doc = await loadPdfDocument(bytes, { password });
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setDocVersion((version) => version + 1);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'This page could not be rendered.');
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const doc = docRef.current;
      docRef.current = null;
      void doc?.destroy();
    };
  }, [bytes, password]);

  useEffect(() => {
    if (docVersion === 0) return;

    let cancelled = false;
    const token = ++renderToken.current;

    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas || widthPx <= 0) return;

      setRendering(true);
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled || token !== renderToken.current) return;

        const base = page.getViewport({ scale: 1 });
        // Render at device resolution so text stays sharp on high-DPI screens.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (widthPx / base.width) * dpr });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('This browser did not provide a canvas context.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();
      } catch (cause) {
        if (!cancelled && token === renderToken.current) {
          setError(cause instanceof Error ? cause.message : 'This page could not be rendered.');
        }
      } finally {
        if (!cancelled && token === renderToken.current) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docVersion, pageIndex, widthPx]);

  return (
    <div className={className} style={{ width: widthPx, height: heightPx, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        aria-label={`Page ${pageIndex + 1}`}
      />
      {rendering && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Spinner className="h-5 w-5 text-muted" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-surface/90 p-4 text-center text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
