# pdfEditor

A complete, browser-based PDF toolkit — a Sejda-style editor built with Next.js.

**Every core operation runs on the user's own device.** Files are read into page
memory, processed by JavaScript and WebAssembly in the browser, and written back
out as a download. Nothing is uploaded. The single exception is Office-format
conversion, which is opt-in and clearly labelled (see [Phase 2](#phase-2--server-assisted)).

---

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15** (App Router, `output: 'export'`) | Static export deploys to Netlify's CDN with no server runtime. |
| Rendering | **pdf.js** | Page rasterisation, text extraction, password handling, thumbnails. |
| Manipulation | **`@cantoo/pdf-lib`** | An MIT, API-compatible fork of `pdf-lib` that adds AES encryption **and** decryption. See [note below](#why-cantoopdf-lib-instead-of-pdf-lib). |
| Canvas overlay | **Fabric.js 6** | Interactive text, shapes, images and freehand drawing on top of the page. |
| OCR | **Tesseract.js** | Runs in the browser; recognised words become an invisible, searchable text layer. |
| Styling | **Tailwind CSS 3** | Dark/light theming through CSS variables. |
| State | **Zustand** | Editor document model plus undo/redo history. |

### Why `@cantoo/pdf-lib` instead of `pdf-lib`?

Upstream `pdf-lib` can neither encrypt nor decrypt. That would make "Protect PDF"
a lie (a viewer hint rather than real encryption) and "Unlock PDF" impossible
without a server. `@cantoo/pdf-lib` is a maintained MIT fork with the same
`PDFDocument.load/create/save` API plus `doc.encrypt({...})` and
`load(bytes, { password })`.

Every import goes through [`src/lib/pdf/lib.ts`](src/lib/pdf/lib.ts), so switching
back to upstream `pdf-lib` is a one-file change.

---

## Features

### Phase 1 — fully client-side

| Tool | Notes |
| --- | --- |
| **Merge** | Any number of files, drag to reorder, per-file page ranges. |
| **Split** | By ranges, every N pages, at chosen pages, or one file per page. Output zipped. |
| **Organise pages** | Drag-and-drop reorder, rotate, duplicate, delete, extract. |
| **Rotate** | 90° steps, whole document or a page selection, written into the file. |
| **Crop** | Uniform margins in points or percent; sets both CropBox and MediaBox. |
| **Edit** | Text, images, rectangles, ellipses, lines, arrows, highlights, freehand, links. Exported as **real vector content** — text stays selectable. |
| **Page numbers** | Nine positions, custom format tokens, font, size, colour, start value. |
| **Watermark** | Text or image; position, angle, opacity, tiling, over or behind content. |
| **Sign** | Draw, type (four handwriting faces), or upload a photo with white-background knockout. |
| **Forms** | Detects AcroForm fields and fills them; also creates new text/checkbox/dropdown/radio fields. |
| **Protect** | Real AES-256 encryption with granular permissions. |
| **Unlock** | Removes user and owner password protection. |
| **Redact** | **Genuinely destructive** — see below. |
| **JPG ↔ PDF** | Images to PDF (fit/A4/Letter/Legal); PDF pages to JPG or PNG at any DPI. |
| **Flatten** | Form fields only (text stays selectable), or everything (rasterised). |
| **Compress** | Lossless restructure, or image downsampling at four strengths. Reports before/after. |
| **Grayscale** | True luminance conversion of every page. |
| **OCR** | Tesseract in-browser; adds an invisible text layer over the original page. |
| **Compare** | Word-level LCS text diff per page plus a pixel-difference overlay. |
| **Repair** | Three escalating recovery strategies; tells you which one worked. |
| **Extract text** | Plain text of every page as `.txt`. |
| **Document info** | Page count, page sizes, encryption, field count, structural health. |

#### Redaction is real

Drawing a black box over text in most editors leaves the text in the file, where
it can be copied straight back out. Here, every page carrying a redaction is
re-rendered to pixels with the bars burnt in, and the original page object — with
its text, images and metadata — is discarded. Pages without redactions are copied
through untouched so the rest of the document keeps its quality and selectable
text. See [`src/lib/pdf/redact.ts`](src/lib/pdf/redact.ts).

### Phase 2 — server-assisted

**PDF → Word/Excel/PowerPoint** and **Office/HTML → PDF** need a full Office
rendering engine, which cannot run in a browser. These two tools — and only these
two — post the file to a Netlify Function.

The function ([`netlify/functions/convert.mjs`](netlify/functions/convert.mjs)) is
**provider-agnostic and disabled by default**. With no key configured it returns
`501` and the UI shows the feature as unavailable. To enable it, set **one** of
these in Netlify → Site settings → Environment variables:

```
CONVERT_PROVIDER = convertapi
CONVERTAPI_SECRET = <your secret>
```

```
CONVERT_PROVIDER = cloudconvert
CLOUDCONVERT_API_KEY = <your api key>
```

Both adapters are already written. Netlify's synchronous function payload limit
caps uploads at ~5.5 MB.

---

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

`npm run dev` and `npm run build` both run `scripts/copy-pdf-worker.mjs` first,
which copies the pdf.js worker, CMaps and standard fonts out of `node_modules`
into `public/`. Those copied files are gitignored — they are regenerated on every
install.

```bash
npm run typecheck   # tsc --noEmit
npm run build       # static export into out/
```

---

## Deploying to Netlify

1. Push this repository to GitHub.
2. In Netlify, **Add new site → Import an existing project** and pick the repo.
3. Netlify reads [`netlify.toml`](netlify.toml), so the build command (`npm run build`),
   publish directory (`out`) and functions directory (`netlify/functions`) are
   already set. Leave them as detected.
4. Deploy. Every push to `main` redeploys automatically.

> **Do not add `@netlify/plugin-nextjs`.** This project uses `output: 'export'`
> and serves plain static files; the plugin expects a server runtime and will
> conflict with it.

### Custom domain (`vinaybi.in`)

1. Netlify → **Domain management → Add a domain** → enter `vinaybi.in`.
2. Choose **Netlify DNS** when prompted. Netlify gives you four nameservers.
3. At your registrar, replace the existing nameservers with those four.
   Propagation usually takes under an hour but can take up to 24.
4. Netlify issues a free Let's Encrypt certificate automatically once DNS
   resolves. Turn on **Force HTTPS** afterwards.
5. Set the primary domain (apex `vinaybi.in` or `www`) — Netlify redirects the
   other automatically.

If you prefer to keep DNS at your registrar, add an `A` record for the apex
pointing at `75.2.60.5` and a `CNAME` for `www` pointing at your
`<site>.netlify.app` hostname instead of step 2–3.

---

## Project layout

```
src/
  app/
    page.tsx              landing page and tool directory
    t/[slug]/page.tsx     one static page per tool
    editor/page.tsx       the full editor
    privacy/page.tsx
  components/
    tools/                per-tool panels, driven by ToolWorkbench
    editor/               toolbar, page renderer, Fabric overlay, signature dialog
    ui/controls.tsx       buttons, fields, alerts, progress
  lib/
    pdf/                  every PDF operation (one module per concern)
    tools.ts              the tool registry that drives navigation and routing
    editorStore.ts        Zustand store with undo/redo
netlify/functions/        the one server-side endpoint
```

### Coordinate systems

Three spaces are in play, and mixing them up is the easiest way to break this
codebase:

- **PDF user space** — origin bottom-left, y up, ignores `/Rotate`. What pdf-lib draws in.
- **Visual space** — origin bottom-left of the page *as the reader sees it*, after `/Rotate`.
- **Overlay space** — origin **top-left**, y down, in points. What the editor, redaction boxes and OCR boxes use, because it matches the DOM.

[`src/lib/pdf/geometry.ts`](src/lib/pdf/geometry.ts) converts between the first
two; [`src/lib/pdf/overlay.ts`](src/lib/pdf/overlay.ts) handles the third.

---

## Licence

MIT.
