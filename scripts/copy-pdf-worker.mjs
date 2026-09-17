// Copies pdf.js runtime assets out of node_modules into /public so the static
// export serves them from its own origin. Runs before `dev` and `build`.
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules', 'pdfjs-dist');

if (!existsSync(pkg)) {
  console.warn('[copy-pdf-worker] pdfjs-dist not installed yet — skipping.');
  process.exit(0);
}

mkdirSync(join(root, 'public'), { recursive: true });

// 1. The worker itself.
const workerCandidates = [
  'build/pdf.worker.min.mjs',
  'build/pdf.worker.mjs',
  'build/pdf.worker.min.js',
];
const worker = workerCandidates.map((c) => join(pkg, c)).find((p) => existsSync(p));
if (worker) {
  copyFileSync(worker, join(root, 'public', 'pdf.worker.min.mjs'));
  console.log('[copy-pdf-worker] worker -> public/pdf.worker.min.mjs');
} else {
  console.warn('[copy-pdf-worker] no worker build found in pdfjs-dist.');
}

// 2. CMaps (CJK text) and standard fonts (PDFs that do not embed Helvetica etc).
for (const dir of ['cmaps', 'standard_fonts']) {
  const from = join(pkg, dir);
  if (!existsSync(from)) continue;
  const to = join(root, 'public', 'pdfjs', dir);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-pdf-worker] ${dir} -> public/pdfjs/${dir}`);
}
