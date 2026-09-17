import { PDFDocument } from './lib';

export interface LoadOptions {
  password?: string;
  /** Open even if encrypted without supplying the password (works for owner-password-only files). */
  ignoreEncryption?: boolean;
}

/**
 * Loads a PDF for editing. Tries the supplied password first, then falls back to
 * ignoring encryption, which succeeds for the very common "owner password only"
 * case where the file has no user password at all.
 */
export async function loadDoc(bytes: Uint8Array, options: LoadOptions = {}) {
  const { password, ignoreEncryption = true } = options;
  try {
    return await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (error) {
    if (!ignoreEncryption) throw error;
    return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  }
}

export async function createDoc() {
  return PDFDocument.create();
}

/** Standard save settings: object streams keep output small. */
export async function saveDoc(
  doc: PDFDocument,
): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

export async function readFileBytes(file: File | Blob): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Copies metadata that pdf-lib would otherwise drop when rebuilding a document. */
export function copyMetadata(
  from: PDFDocument,
  to: PDFDocument,
) {
  try {
    const title = from.getTitle();
    const author = from.getAuthor();
    const subject = from.getSubject();
    const keywords = from.getKeywords();
    if (title) to.setTitle(title);
    if (author) to.setAuthor(author);
    if (subject) to.setSubject(subject);
    if (keywords) to.setKeywords(keywords.split(/[,;]\s*/));
  } catch {
    // Metadata is best-effort; a malformed Info dict must not fail the job.
  }
}
