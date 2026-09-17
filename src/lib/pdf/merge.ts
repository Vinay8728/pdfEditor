import { createDoc, loadDoc, saveDoc } from './core';
import { parsePageRanges } from '../ranges';

export interface MergeInput {
  name: string;
  bytes: Uint8Array;
  /** Optional page selection, e.g. "1-3,7". Empty means all pages. */
  ranges?: string;
  password?: string;
}

export interface MergeOptions {
  /** Insert a blank page after each source document so chapters start on a fresh sheet. */
  addBlankBetween?: boolean;
  /** Build a top-level outline entry per source file. */
  addBookmarks?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function mergePdfs(
  inputs: MergeInput[],
  options: MergeOptions = {},
): Promise<Uint8Array> {
  if (inputs.length === 0) throw new Error('Add at least one PDF to merge.');

  const out = await createDoc();
  const { addBlankBetween = false, onProgress } = options;

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const src = await loadDoc(input.bytes, { password: input.password });
    const pageCount = src.getPageCount();
    const indices = input.ranges ? parsePageRanges(input.ranges, pageCount) : undefined;
    const selection = indices && indices.length > 0
      ? indices
      : Array.from({ length: pageCount }, (_, p) => p);

    const copied = await out.copyPages(src, selection);
    for (const page of copied) out.addPage(page);

    if (addBlankBetween && i < inputs.length - 1) {
      const last = out.getPage(out.getPageCount() - 1);
      const { width, height } = last.getSize();
      out.addPage([width, height]);
    }

    onProgress?.(i + 1, inputs.length);
  }

  out.setProducer('pdfEditor');
  out.setCreationDate(new Date());
  return saveDoc(out);
}
