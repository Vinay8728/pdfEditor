import { PDFDocument } from './lib';
import { createDoc, saveDoc } from './core';
import { loadPdfDocument } from './pdfjs';
import { rebuildFromRaster } from './rebuild';

/**
 * Attempts to recover a damaged PDF, escalating through three strategies.
 * Each one recovers less than the last, so we stop at the first that works.
 */

export type RepairStrategy = 'resave' | 'page-copy' | 'rasterize';

export interface RepairResult {
  data: Uint8Array;
  strategy: RepairStrategy;
  pagesRecovered: number;
  pagesLost: number;
  notes: string[];
}

export interface RepairOptions {
  password?: string;
  /** Render DPI for the last-resort rasterise pass. */
  dpi?: number;
  onProgress?: (label: string, done: number, total: number) => void;
}

export async function repairPdf(
  bytes: Uint8Array,
  options: RepairOptions = {},
): Promise<RepairResult> {
  const { password, dpi = 150, onProgress } = options;
  const notes: string[] = [];

  // Strategy 1 — parse leniently and write a clean file. Fixes broken xref
  // tables, bad trailers and stale object offsets while keeping everything.
  try {
    onProgress?.('Rebuilding file structure', 1, 3);
    const doc = await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const pageCount = doc.getPageCount();
    if (pageCount > 0) {
      return {
        data: await saveDoc(doc),
        strategy: 'resave',
        pagesRecovered: pageCount,
        pagesLost: 0,
        notes: ['The file structure was rebuilt. All content was preserved.'],
      };
    }
    notes.push('The document parsed but reported no pages.');
  } catch (error) {
    notes.push(`Structural repair failed: ${messageOf(error)}`);
  }

  // Strategy 2 — copy pages one at a time into a fresh document, skipping any
  // page whose object graph is too damaged to follow.
  try {
    onProgress?.('Recovering pages individually', 2, 3);
    const source = await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const out = await createDoc();
    const total = source.getPageCount();
    let recovered = 0;

    for (let i = 0; i < total; i += 1) {
      try {
        const [page] = await out.copyPages(source, [i]);
        out.addPage(page);
        recovered += 1;
      } catch (error) {
        notes.push(`Page ${i + 1} could not be recovered: ${messageOf(error)}`);
      }
      onProgress?.('Recovering pages individually', i + 1, total);
    }

    if (recovered > 0) {
      return {
        data: await saveDoc(out),
        strategy: 'page-copy',
        pagesRecovered: recovered,
        pagesLost: total - recovered,
        notes,
      };
    }
  } catch (error) {
    notes.push(`Page-by-page recovery failed: ${messageOf(error)}`);
  }

  // Strategy 3 — pdf.js is far more forgiving than pdf-lib. If it can render
  // the pages at all, we capture them as images. Text is lost, content is not.
  onProgress?.('Recovering page images', 3, 3);
  const probe = await loadPdfDocument(bytes, { password });
  const pageCount = probe.numPages;
  await probe.destroy();

  if (pageCount === 0) {
    throw new Error(
      'This file could not be recovered. It may not be a PDF, or the content may be missing entirely.',
    );
  }

  const data = await rebuildFromRaster(bytes, {
    dpi,
    quality: 0.92,
    format: 'image/jpeg',
    password,
    onProgress: (done, total) => onProgress?.('Recovering page images', done, total),
  });

  notes.push(
    'Only the rendered appearance could be recovered, so text is no longer selectable. Run OCR to make it searchable again.',
  );

  return { data, strategy: 'rasterize', pagesRecovered: pageCount, pagesLost: 0, notes };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PdfHealth {
  readable: boolean;
  pageCount: number;
  encrypted: boolean;
  problems: string[];
}

/** Quick diagnostic shown before the user commits to a repair. */
export async function inspectPdf(bytes: Uint8Array, password?: string): Promise<PdfHealth> {
  const problems: string[] = [];
  let pageCount = 0;
  let readable = false;
  let encrypted = false;

  const header = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!header.includes('%PDF-')) {
    problems.push('The file does not start with a %PDF header.');
  }

  try {
    const doc = await loadPdfDocument(bytes, { password });
    pageCount = doc.numPages;
    readable = true;
    await doc.destroy();
  } catch (error) {
    if ((error as { name?: string })?.name === 'PdfPasswordRequiredError') {
      encrypted = true;
      problems.push('The document is encrypted.');
    } else {
      problems.push(messageOf(error));
    }
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    if (pageCount === 0) pageCount = doc.getPageCount();
  } catch (error) {
    problems.push(`Object structure is damaged: ${messageOf(error)}`);
  }

  return { readable, pageCount, encrypted, problems };
}
