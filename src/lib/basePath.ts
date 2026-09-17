/**
 * Sub-path the site is served from.
 *
 * Empty for a normal root deployment (Netlify, a custom domain). Set to
 * something like "/pdfEditor" for the GitHub Pages preview, which serves the
 * site from a folder rather than the domain root.
 *
 * Next rewrites its own links and chunks automatically; this exists for the
 * handful of absolute URLs we build by hand — the pdf.js worker, its font data,
 * and the conversion endpoint.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}
