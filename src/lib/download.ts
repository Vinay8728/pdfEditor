export interface OutputFile {
  name: string;
  /** Raw bytes. Stored as Uint8Array so pdf-lib output can be used directly. */
  data: Uint8Array;
  mime?: string;
}

function toBlob(file: OutputFile): Blob {
  // Copy into a fresh ArrayBuffer: pdf-lib may hand back a view over a larger
  // pooled buffer, and Blob would otherwise capture the whole thing.
  const copy = new Uint8Array(file.data.byteLength);
  copy.set(file.data);
  return new Blob([copy], { type: file.mime ?? 'application/pdf' });
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke late — Safari needs the URL alive until the download actually starts.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadFile(file: OutputFile) {
  saveBlob(toBlob(file), file.name);
}

/** Bundles several outputs into one .zip so users get a single download. */
export async function downloadAsZip(files: OutputFile[], zipName: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const file of files) {
    const copy = new Uint8Array(file.data.byteLength);
    copy.set(file.data);
    zip.file(file.name, copy);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  saveBlob(blob, zipName);
}

/** One file downloads directly; several are zipped. */
export async function downloadResults(files: OutputFile[], zipName: string) {
  if (files.length === 0) return;
  if (files.length === 1) {
    downloadFile(files[0]);
    return;
  }
  await downloadAsZip(files, zipName);
}

export function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}
