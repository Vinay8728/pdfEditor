import { PDFDocument } from './lib';
import { saveDoc } from './core';
import { loadPdfDocument, PdfPasswordRequiredError } from './pdfjs';

export interface PermissionSet {
  printing?: boolean;
  highQualityPrinting?: boolean;
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
}

export interface ProtectOptions {
  userPassword: string;
  /** Defaults to the user password when omitted. */
  ownerPassword?: string;
  permissions?: PermissionSet;
  algorithm?: 'AES-256' | 'AES-128' | 'RC4-128' | 'RC4-40';
  /** Password of the source file, if it is already encrypted. */
  currentPassword?: string;
}

/**
 * Adds real PDF encryption. This is genuine AES encryption performed in the
 * browser by @cantoo/pdf-lib — not a viewer hint.
 */
export async function protectPdf(
  bytes: Uint8Array,
  options: ProtectOptions,
): Promise<Uint8Array> {
  if (!options.userPassword) throw new Error('Enter a password.');

  const doc = await PDFDocument.load(bytes, {
    password: options.currentPassword,
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const p = options.permissions ?? {};

  doc.encrypt({
    userPassword: options.userPassword,
    ownerPassword: options.ownerPassword || options.userPassword,
    permissions: {
      printing: p.highQualityPrinting ? 'highResolution' : p.printing ? 'lowResolution' : undefined,
      modifying: p.modifying,
      copying: p.copying,
      annotating: p.annotating,
      fillingForms: p.fillingForms,
      contentAccessibility: p.contentAccessibility,
      documentAssembly: p.documentAssembly,
    },
  });

  return doc.save({ useObjectStreams: false, addDefaultPage: false });
}

export interface UnlockResult {
  data: Uint8Array;
  /** True when we had to fall back to rasterising because the file could not be decrypted structurally. */
  rasterized: boolean;
}

/**
 * Removes password protection.
 *
 * Two cases are handled:
 *  - Owner-password-only files (no password needed to open): re-saved without encryption.
 *  - User-password files: decrypted with the supplied password, then re-saved clean.
 */
export async function unlockPdf(
  bytes: Uint8Array,
  password?: string,
): Promise<UnlockResult> {
  // Confirm the password up-front so we can give a precise error.
  if (password !== undefined) {
    const probe = await loadPdfDocument(bytes, { password });
    await probe.destroy();
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      password,
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return { data: await saveDoc(doc), rasterized: false };
  } catch (error) {
    if (error instanceof PdfPasswordRequiredError) throw error;
    throw new Error(
      'This PDF could not be decrypted. Check the password and try again.',
    );
  }
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await loadPdfDocument(bytes);
    await doc.destroy();
    return false;
  } catch (error) {
    return error instanceof PdfPasswordRequiredError;
  }
}
