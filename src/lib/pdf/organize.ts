import { createDoc, copyMetadata, loadDoc, saveDoc } from './core';
import { degrees } from './lib';
import { invertSelection } from '../ranges';

/**
 * One entry per page of the OUTPUT document. This single structure expresses
 * reorder, delete, duplicate and rotate together, which is exactly what the
 * drag-and-drop page organizer produces.
 */
export interface PageOp {
  /** Zero-based index in the SOURCE document. */
  sourceIndex: number;
  /** Absolute rotation in degrees, normalised to 0/90/180/270. */
  rotation: number;
}

export function normaliseRotation(value: number): number {
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}

/** Applies an arbitrary reorder/delete/rotate plan in one pass. */
export async function applyPageOps(
  bytes: Uint8Array,
  ops: PageOp[],
  options: { password?: string } = {},
): Promise<Uint8Array> {
  if (ops.length === 0) throw new Error('A PDF must keep at least one page.');

  const src = await loadDoc(bytes, { password: options.password });
  const out = await createDoc();

  const copied = await out.copyPages(
    src,
    ops.map((op) => op.sourceIndex),
  );

  copied.forEach((page, i) => {
    const existing = page.getRotation().angle;
    page.setRotation(degrees(normaliseRotation(existing + ops[i].rotation)));
    out.addPage(page);
  });

  copyMetadata(src, out);
  out.setProducer('pdfEditor');
  return saveDoc(out);
}

export async function rotatePages(
  bytes: Uint8Array,
  indices: number[],
  delta: number,
  options: { password?: string } = {},
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, { password: options.password });
  const target = new Set(indices);
  doc.getPages().forEach((page, i) => {
    if (!target.has(i)) return;
    page.setRotation(degrees(normaliseRotation(page.getRotation().angle + delta)));
  });
  return saveDoc(doc);
}

export async function deletePages(
  bytes: Uint8Array,
  indices: number[],
  options: { password?: string } = {},
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, { password: options.password });
  const keep = invertSelection(indices, doc.getPageCount());
  if (keep.length === 0) throw new Error('You cannot delete every page.');
  return applyPageOps(bytes, keep.map((sourceIndex) => ({ sourceIndex, rotation: 0 })), options);
}

export async function extractPages(
  bytes: Uint8Array,
  indices: number[],
  options: { password?: string } = {},
): Promise<Uint8Array> {
  if (indices.length === 0) throw new Error('Select at least one page to extract.');
  return applyPageOps(bytes, indices.map((sourceIndex) => ({ sourceIndex, rotation: 0 })), options);
}
