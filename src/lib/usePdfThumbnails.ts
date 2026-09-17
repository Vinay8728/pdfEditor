'use client';

import { useEffect, useState } from 'react';
import { loadPdfDocument, type PdfDocumentProxy } from './pdf/pdfjs';
import { renderThumbnail } from './pdf/rasterize';
import type { PageGeometry } from './editorStore';

export interface PdfThumbnails {
  pageCount: number;
  /** Data URLs, filled in progressively as each page renders. */
  thumbs: (string | null)[];
  geometry: PageGeometry[];
  loading: boolean;
  error: string | null;
}

/**
 * Renders a thumbnail for every page, one at a time so the UI stays responsive
 * on large documents, and reports each page's visual size for the editor.
 */
export function usePdfThumbnails(
  bytes: Uint8Array | null,
  password?: string,
  width = 190,
): PdfThumbnails {
  const [state, setState] = useState<PdfThumbnails>({
    pageCount: 0,
    thumbs: [],
    geometry: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!bytes) {
      setState({ pageCount: 0, thumbs: [], geometry: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    let doc: PdfDocumentProxy | null = null;

    (async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        doc = await loadPdfDocument(bytes, { password });
        if (cancelled) return;

        const pageCount = doc.numPages;
        const geometry: PageGeometry[] = [];

        for (let i = 0; i < pageCount; i += 1) {
          const page = await doc.getPage(i + 1);
          const viewport = page.getViewport({ scale: 1 });
          geometry.push({
            width: viewport.width,
            height: viewport.height,
            rotation: page.rotate ?? 0,
          });
          page.cleanup();
        }
        if (cancelled) return;

        setState({
          pageCount,
          thumbs: new Array(pageCount).fill(null),
          geometry,
          loading: true,
          error: null,
        });

        for (let i = 0; i < pageCount; i += 1) {
          if (cancelled) return;
          try {
            const url = await renderThumbnail(doc, i, width);
            if (cancelled) return;
            setState((current) => {
              const thumbs = [...current.thumbs];
              thumbs[i] = url;
              return { ...current, thumbs };
            });
          } catch {
            // A single unrenderable page should not stop the rest.
          }
        }

        if (!cancelled) setState((current) => ({ ...current, loading: false }));
      } catch (error) {
        if (cancelled) return;
        setState({
          pageCount: 0,
          thumbs: [],
          geometry: [],
          loading: false,
          error: error instanceof Error ? error.message : 'This PDF could not be opened.',
        });
      }
    })();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [bytes, password, width]);

  return state;
}
