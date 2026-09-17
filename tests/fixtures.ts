import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * Sample documents for the end-to-end tests, generated at run time so the repo
 * carries no binary fixtures and the page contents are known exactly.
 */

export const fixtureDir = mkdtempSync(join(tmpdir(), 'pdfeditor-e2e-'));

export async function makePdf(
  name: string,
  pageCount: number,
  label = 'Page',
): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`${label} ${i + 1}`, {
      x: 72,
      y: 720,
      size: 36,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawRectangle({
      x: 72,
      y: 600,
      width: 200,
      height: 80,
      color: rgb(0.2, 0.45, 0.9),
    });
  }

  const path = join(fixtureDir, name);
  writeFileSync(path, await doc.save());
  return path;
}

export async function makeImage(name: string): Promise<string> {
  // A 2x2 PNG, written byte by byte so the tests need no image tooling.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8DwnwEJMKEL0EwQAG3xAv/6dOkfAAAAAElFTkSuQmCC',
    'base64',
  );
  const path = join(fixtureDir, name);
  writeFileSync(path, png);
  return path;
}

/** Reads a produced PDF back so assertions can be made about its contents. */
export async function pageCountOf(bytes: Uint8Array, password?: string): Promise<number> {
  const doc = await PDFDocument.load(bytes, {
    password,
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return doc.getPageCount();
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    return false;
  } catch {
    return true;
  }
}
