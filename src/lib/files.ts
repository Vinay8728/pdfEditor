import { uid } from './utils';

export interface LoadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  bytes: Uint8Array;
  /** Filled in lazily for PDFs. */
  pageCount?: number;
  encrypted?: boolean;
  /** Password the user supplied to open this file. */
  password?: string;
  error?: string;
}

export const MAX_FILE_BYTES = 300 * 1024 * 1024;

export async function toLoadedFile(file: File): Promise<LoadedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Very large files can exhaust the browser's memory.`,
    );
  }
  const buffer = await file.arrayBuffer();
  return {
    id: uid('file'),
    name: file.name,
    size: file.size,
    type: file.type || guessType(file.name),
    bytes: new Uint8Array(buffer),
  };
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function isPdf(file: LoadedFile): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Matches a file against an `accept` string the same way a file input does,
 * so drag-and-drop rejects the same things the browse dialog would.
 */
export function matchesAccept(file: File, accept: string): boolean {
  if (!accept.trim()) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return accept.split(',').some((rawRule) => {
    const rule = rawRule.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/** Reads a File as a data URL — used for signature and image pickers. */
export function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}
