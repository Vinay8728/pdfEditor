/**
 * Page-range parsing shared by split / extract / delete / rotate tools.
 * Accepts human syntax: "1-3, 5, 8-", "odd", "even", "all", "last".
 * Returns ZERO-BASED page indices, de-duplicated and sorted ascending.
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const text = (input || '').trim().toLowerCase();
  if (!text || text === 'all' || text === '*') {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const out = new Set<number>();

  for (const rawPart of text.split(/[,\s]+/)) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part === 'odd') {
      for (let i = 0; i < pageCount; i += 2) out.add(i);
      continue;
    }
    if (part === 'even') {
      for (let i = 1; i < pageCount; i += 2) out.add(i);
      continue;
    }
    if (part === 'last') {
      if (pageCount > 0) out.add(pageCount - 1);
      continue;
    }

    const range = part.match(/^(\d+)?\s*-\s*(\d+)?$/);
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : 1;
      const end = range[2] ? parseInt(range[2], 10) : pageCount;
      const lo = Math.max(1, Math.min(start, end));
      const hi = Math.min(pageCount, Math.max(start, end));
      for (let p = lo; p <= hi; p += 1) out.add(p - 1);
      continue;
    }

    const single = parseInt(part, 10);
    if (Number.isFinite(single) && single >= 1 && single <= pageCount) {
      out.add(single - 1);
    }
  }

  return Array.from(out).sort((a, b) => a - b);
}

/** Splits a selection into contiguous runs — used to name split output files. */
export function toContiguousGroups(indices: number[]): number[][] {
  const sorted = [...indices].sort((a, b) => a - b);
  const groups: number[][] = [];
  let current: number[] = [];

  for (const index of sorted) {
    if (current.length === 0 || index === current[current.length - 1] + 1) {
      current.push(index);
    } else {
      groups.push(current);
      current = [index];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Human label for a run of zero-based indices, e.g. [0,1,2] -> "1-3". */
export function describeGroup(group: number[]): string {
  if (group.length === 0) return '';
  const first = group[0] + 1;
  const last = group[group.length - 1] + 1;
  return first === last ? `${first}` : `${first}-${last}`;
}

/** Everything NOT in `indices`. */
export function invertSelection(indices: number[], pageCount: number): number[] {
  const set = new Set(indices);
  const out: number[] = [];
  for (let i = 0; i < pageCount; i += 1) if (!set.has(i)) out.push(i);
  return out;
}

export function isValidRangeInput(input: string, pageCount: number): boolean {
  return parsePageRanges(input, pageCount).length > 0;
}
