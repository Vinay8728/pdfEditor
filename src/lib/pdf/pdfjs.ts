/**
 * Thin, browser-only wrapper around pdf.js.
 *
 * pdf.js ships loose types across versions, so the surface we rely on is
 * declared explicitly here. Everything is lazily imported: nothing pdf.js
 * related may run during the static export build.
 */

import { withBase } from '../basePath';

export interface PdfTextItem {
  str: string;
  /** Key into the text content's `styles` map. */
  fontName?: string;
  /** [scaleX, skewX, skewY, scaleY, translateX, translateY] in PDF user space. */
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

export interface PdfTextStyle {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}

export interface PdfViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  transform: number[];
}

export interface PdfPageProxy {
  pageNumber: number;
  rotate: number;
  view: number[];
  getViewport(params: { scale: number; rotation?: number }): PdfViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
    background?: string;
  }): { promise: Promise<void>; cancel(): void };
  getTextContent(): Promise<{ items: PdfTextItem[]; styles?: Record<string, PdfTextStyle> }>;
  getAnnotations(params?: { intent?: string }): Promise<Record<string, unknown>[]>;
  cleanup(): void;
}

export interface PdfDocumentProxy {
  numPages: number;
  fingerprints: (string | null)[];
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  getData(): Promise<Uint8Array>;
  getMetadata(): Promise<{ info?: Record<string, unknown> }>;
  destroy(): Promise<void>;
}

/** Thrown when a PDF needs a password we do not have (or the one given is wrong). */
export class PdfPasswordRequiredError extends Error {
  readonly wrongPassword: boolean;
  constructor(wrongPassword: boolean) {
    super(wrongPassword ? 'Incorrect password.' : 'This PDF is password protected.');
    this.name = 'PdfPasswordRequiredError';
    this.wrongPassword = wrongPassword;
  }
}

type PdfjsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfjsModule> | null = null;

async function getPdfjs(): Promise<PdfjsModule> {
  if (typeof window === 'undefined') {
    throw new Error('pdf.js is browser-only and was reached during server rendering.');
  }
  if (!modulePromise) {
    modulePromise = import('pdfjs-dist').then((mod) => {
      // The worker is copied into /public by scripts/copy-pdf-worker.mjs.
      mod.GlobalWorkerOptions.workerSrc = withBase('/pdf.worker.min.mjs');
      return mod;
    });
  }
  return modulePromise;
}

/**
 * Opens a PDF for rendering/extraction.
 *
 * `bytes` is copied because pdf.js transfers the buffer to its worker, which
 * would detach an array the caller still needs for pdf-lib.
 */
export async function loadPdfDocument(
  bytes: Uint8Array,
  options: { password?: string } = {},
): Promise<PdfDocumentProxy> {
  const pdfjs = await getPdfjs();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  const task = pdfjs.getDocument({
    data: copy,
    password: options.password,
    cMapUrl: withBase('/pdfjs/cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: withBase('/pdfjs/standard_fonts/'),
    useSystemFonts: true,
    isEvalSupported: false,
  });

  try {
    return (await task.promise) as unknown as PdfDocumentProxy;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    const code = (error as { code?: number })?.code;
    if (name === 'PasswordException') {
      // pdf.js code 1 = password needed, 2 = incorrect password.
      throw new PdfPasswordRequiredError(code === 2);
    }
    throw error;
  }
}

export async function getPageCount(bytes: Uint8Array, password?: string): Promise<number> {
  const doc = await loadPdfDocument(bytes, { password });
  const count = doc.numPages;
  await doc.destroy();
  return count;
}
