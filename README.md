# pdfEditor

A complete, browser-based PDF toolkit — a Sejda-style editor built with Next.js.

> ### Just want it live? Start here.
>
> **You do not need to download or upload any files.**
>
> 1. **Try it first** — every push publishes a live preview to GitHub Pages:
>    **https://vinay8728.github.io/pdfEditor/**
>    (One-time: repo **Settings → Pages → Source: GitHub Actions**, if it is not on already.)
> 2. **Go live** — at [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub → `pdfEditor` → Deploy**.
>    Netlify reads [`netlify.toml`](netlify.toml), so leave every setting as detected.
> 3. **Custom domain** — Netlify → **Domain management → Add a domain → `vinaybi.in`**, then
>    follow [the domain steps below](#custom-domain-vinaybiin).
>
> **Prefer to upload a single file instead?** Open the newest run under the repo's
> **Actions** tab, download the **`netlify-site`** artifact (one `.zip`), and drag it
> onto [app.netlify.com/drop](https://app.netlify.com/drop). Note that the
> Office-conversion endpoint does not exist in a drag-and-drop deploy — everything
> else works, because it all runs in the browser.

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
| **Edit existing text** | Click text that is already in the PDF and change it. Position, size, font, colour and the background behind it are all measured from the page — see below. |
| **Add** | Text, images, rectangles, ellipses, lines, arrows, highlights, freehand, links. Exported as **real vector content** — text stays selectable. |
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

#### How editing existing text works, and where it falls short

A PDF has no editable text boxes. It stores positioned glyph runs drawn with a
*subset* of an embedded font — often only the handful of glyphs that page
actually uses. Rewriting a run in place would mean re-encoding that subset,
which is not something to attempt in a browser.

So this works the way every browser-based PDF editor works: the original run is
covered with a patch, and the replacement is drawn on top. Two measurements make
that convincing, and both are read from the rendered page rather than assumed:

- **The colour behind the text**, sampled from a ring just outside the run, so
  the patch matches tinted table rows and panels rather than always being white.
- **The colour of the text itself**, taken from the darkest pixel inside the run.

Font family, size, weight and slant come from the PDF's own font metadata.

Know the limits before relying on it:

- The replacement is drawn in a standard font (Helvetica, Times or Courier), not
  the document's original typeface. On a distinctive font, it will not match.
- A run sitting on a photo, gradient or patterned background will show its patch.
- Text much longer than the original is shrunk to fit rather than overrunning
  whatever sits beside it.
- Reflow does not happen. Editing one line does not move the paragraph around it.

For a payslip, invoice, form or report — flat backgrounds, ordinary fonts — the
result is clean. **Always look at the output before sending it on.**

See [`src/lib/pdf/textLayer.ts`](src/lib/pdf/textLayer.ts) for the extraction and
[`src/lib/pdf/editText.ts`](src/lib/pdf/editText.ts) for the patching.

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
npm run test:e2e    # Playwright against the real export (needs a build first)
```

### Commit a lockfile

There is **no `package-lock.json` in this repo yet**, because it was authored on
a machine without Node installed. Builds therefore resolve dependency versions
fresh each time, which means a bad minor release upstream could break a deploy.

Fix it once, either way:

```bash
npm install && git add package-lock.json && git commit -m "Add lockfile"
```

Or, without installing Node: open the latest CI run on GitHub, download the
**package-lock** artifact, drop the file in the project root and commit it.
After that you can also add `cache: npm` back to the `setup-node` step in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) for faster builds.

### Tests

[`tests/smoke.spec.ts`](tests/smoke.spec.ts) drives the built site in Chromium
and asserts on the bytes that come back out — merging a three-page and a
two-page file must yield five pages, splitting must return a real zip, and
protecting must produce a file that genuinely will not open without the
password. They run on every push.

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
