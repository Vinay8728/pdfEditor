// Minimal static server for the exported site, used by the end-to-end tests.
// Written by hand rather than pulled in as a dependency mainly because the
// pdf.js worker is an .mjs file that must be served as JavaScript — several
// off-the-shelf servers label it application/octet-stream, and the browser then
// refuses to start the worker.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  // Strip the query, decode, and refuse anything that escapes the root.
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = normalize(join(root, clean));
  if (!candidate.startsWith(root)) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  const indexed = join(candidate, 'index.html');
  if (existsSync(indexed)) return indexed;

  const withHtml = `${candidate}.html`;
  if (existsSync(withHtml)) return withHtml;

  return null;
}

createServer((request, response) => {
  const file = resolveFile(request.url ?? '/');

  if (!file) {
    const notFound = join(root, '404.html');
    if (existsSync(notFound)) {
      response.writeHead(404, { 'content-type': TYPES['.html'] });
      createReadStream(notFound).pipe(response);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, () => {
  console.log(`Serving ${root} on http://127.0.0.1:${port}`);
});
