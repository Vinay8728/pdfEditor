import { createDoc, loadDoc, saveDoc } from './core';
import { describeGroup, parsePageRanges, toContiguousGroups } from '../ranges';
import type { OutputFile } from '../download';
import { baseName } from '../utils';

export type SplitMode = 'ranges' | 'everyN' | 'each' | 'atPages';

export interface SplitOptions {
  mode: SplitMode;
  /** For `ranges`: "1-3, 5, 8-10" — each comma group becomes its own file. */
  ranges?: string;
  /** For `everyN`: chunk size. */
  size?: number;
  /** For `atPages`: split BEFORE these 1-based page numbers, e.g. "4, 9". */
  splitAt?: string;
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

/** Works out which zero-based pages belong to each output document. */
export function planSplit(pageCount: number, options: SplitOptions): number[][] {
  const { mode } = options;

  if (mode === 'each') {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }

  if (mode === 'everyN') {
    const size = Math.max(1, Math.floor(options.size ?? 1));
    const groups: number[][] = [];
    for (let start = 0; start < pageCount; start += size) {
      groups.push(
        Array.from({ length: Math.min(size, pageCount - start) }, (_, k) => start + k),
      );
    }
    return groups;
  }

  if (mode === 'atPages') {
    const cuts = parsePageRanges(options.splitAt ?? '', pageCount)
      .filter((index) => index > 0)
      .sort((a, b) => a - b);
    const boundaries = [0, ...cuts, pageCount];
    const groups: number[][] = [];
    for (let i = 0; i < boundaries.length - 1; i += 1) {
      const from = boundaries[i];
      const to = boundaries[i + 1];
      if (to > from) {
        groups.push(Array.from({ length: to - from }, (_, k) => from + k));
      }
    }
    return groups;
  }

  // 'ranges' — each comma-separated chunk is one output file.
  const parts = (options.ranges ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [Array.from({ length: pageCount }, (_, i) => i)];

  return parts
    .map((part) => parsePageRanges(part, pageCount))
    .filter((group) => group.length > 0);
}

export async function splitPdf(
  fileName: string,
  bytes: Uint8Array,
  options: SplitOptions,
): Promise<OutputFile[]> {
  const src = await loadDoc(bytes, { password: options.password });
  const pageCount = src.getPageCount();
  const groups = planSplit(pageCount, options);

  if (groups.length === 0) throw new Error('That selection produced no pages.');

  const stem = baseName(fileName);
  const outputs: OutputFile[] = [];

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const out = await createDoc();
    const copied = await out.copyPages(src, group);
    for (const page of copied) out.addPage(page);
    out.setProducer('pdfEditor');

    // Name by the contiguous runs the group actually covers.
    const label = toContiguousGroups(group).map(describeGroup).join('_');
    outputs.push({
      name: `${stem}_${label || i + 1}.pdf`,
      data: await saveDoc(out),
    });

    options.onProgress?.(i + 1, groups.length);
  }

  return outputs;
}
