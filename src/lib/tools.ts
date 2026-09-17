import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  Combine,
  Crop,
  Droplets,
  Eraser,
  FileImage,
  FileSearch,
  FileSignature,
  FileText,
  FileType2,
  Hash,
  Layers,
  ListOrdered,
  Lock,
  Minimize2,
  PencilRuler,
  RotateCw,
  Scissors,
  ScanText,
  Shield,
  SquareStack,
  Stamp,
  Table2,
  Unlock,
  Wrench,
} from 'lucide-react';

export type ToolGroup =
  | 'organise'
  | 'edit'
  | 'convert'
  | 'secure'
  | 'optimise'
  | 'advanced';

export interface ToolDefinition {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  Icon: LucideIcon;
  group: ToolGroup;
  /** false when the tool needs the serverless conversion endpoint. */
  clientSide: boolean;
  /** Accepted upload types for this tool's dropzone. */
  accept: string;
  multiple?: boolean;
  /** Opens the full editor rather than a single-purpose panel. */
  opensEditor?: boolean;
  popular?: boolean;
}

export const GROUP_LABELS: Record<ToolGroup, string> = {
  organise: 'Organise pages',
  edit: 'Edit content',
  convert: 'Convert',
  secure: 'Security',
  optimise: 'Optimise',
  advanced: 'Advanced',
};

const PDF_ONLY = 'application/pdf,.pdf';
const IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';

export const TOOLS: ToolDefinition[] = [
  // ---------------------------------------------------------------- organise
  {
    slug: 'merge-pdf',
    name: 'Merge PDF',
    tagline: 'Combine files into one',
    description:
      'Join any number of PDFs into a single document. Drag to reorder, pick page ranges from each file, and optionally start each document on a fresh page.',
    Icon: Combine,
    group: 'organise',
    clientSide: true,
    accept: PDF_ONLY,
    multiple: true,
    popular: true,
  },
  {
    slug: 'split-pdf',
    name: 'Split PDF',
    tagline: 'Break one file into many',
    description:
      'Split by page ranges, into fixed-size chunks, at chosen page numbers, or into one file per page. Outputs arrive as a single zip.',
    Icon: Scissors,
    group: 'organise',
    clientSide: true,
    accept: PDF_ONLY,
    popular: true,
  },
  {
    slug: 'organise-pages',
    name: 'Organise pages',
    tagline: 'Reorder, delete, rotate',
    description:
      'A visual page organiser. Drag thumbnails to reorder, rotate individually or in bulk, delete what you do not need, and extract a selection into its own file.',
    Icon: SquareStack,
    group: 'organise',
    clientSide: true,
    accept: PDF_ONLY,
    popular: true,
  },
  {
    slug: 'rotate-pdf',
    name: 'Rotate PDF',
    tagline: 'Fix page orientation',
    description:
      'Turn every page, or just the ones you choose, in 90-degree steps. The rotation is written into the file, so it stays fixed everywhere.',
    Icon: RotateCw,
    group: 'organise',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'crop-pdf',
    name: 'Crop PDF',
    tagline: 'Trim page margins',
    description:
      'Cut away margins by an exact amount or by dragging a crop box over the page. Apply the same crop to every page or only to a selection.',
    Icon: Crop,
    group: 'organise',
    clientSide: true,
    accept: PDF_ONLY,
  },

  // -------------------------------------------------------------------- edit
  {
    slug: 'edit-pdf',
    name: 'Edit PDF',
    tagline: 'Text, images, shapes, drawing',
    description:
      'The full editor. Add and style text, drop in images, draw shapes and freehand strokes, highlight, and add links — then apply your changes to a new PDF.',
    Icon: PencilRuler,
    group: 'edit',
    clientSide: true,
    accept: PDF_ONLY,
    opensEditor: true,
    popular: true,
  },
  {
    slug: 'sign-pdf',
    name: 'Sign PDF',
    tagline: 'Draw, type or upload',
    description:
      'Create a signature by drawing it, typing it in a handwriting face, or uploading a photo of one. Place it anywhere, on any page, at any size.',
    Icon: FileSignature,
    group: 'edit',
    clientSide: true,
    accept: PDF_ONLY,
    opensEditor: true,
    popular: true,
  },
  {
    slug: 'fill-forms',
    name: 'Fill & create forms',
    tagline: 'AcroForm fields',
    description:
      'Detects existing form fields and lets you fill them in, or add brand-new text boxes, checkboxes, dropdowns and radio groups to any page.',
    Icon: ListOrdered,
    group: 'edit',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'watermark-pdf',
    name: 'Watermark',
    tagline: 'Stamp text or an image',
    description:
      'Add a text or image watermark with control over position, angle, opacity and tiling. Place it over the content or behind it.',
    Icon: Stamp,
    group: 'edit',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'page-numbers',
    name: 'Page numbers',
    tagline: 'Number every page',
    description:
      'Add page numbers in any of nine positions, with your own format, font, size and colour. Skip a cover page or start counting from any number.',
    Icon: Hash,
    group: 'edit',
    clientSide: true,
    accept: PDF_ONLY,
  },

  // ----------------------------------------------------------------- convert
  {
    slug: 'pdf-to-jpg',
    name: 'PDF to JPG',
    tagline: 'Pages as images',
    description:
      'Render every page to a JPG or PNG at the resolution you choose. Pick specific pages and get them back as a zip.',
    Icon: FileImage,
    group: 'convert',
    clientSide: true,
    accept: PDF_ONLY,
    popular: true,
  },
  {
    slug: 'jpg-to-pdf',
    name: 'JPG to PDF',
    tagline: 'Images into a document',
    description:
      'Turn JPG, PNG, WebP, GIF or BMP images into a PDF. Choose a fixed page size or let each page fit its image exactly.',
    Icon: FileType2,
    group: 'convert',
    clientSide: true,
    accept: IMAGES,
    multiple: true,
    popular: true,
  },
  {
    slug: 'pdf-to-office',
    name: 'PDF to Office',
    tagline: 'Word, Excel, PowerPoint',
    description:
      'Convert a PDF into an editable .docx, .xlsx or .pptx. This is the one feature that needs a server, because Office rendering cannot run in a browser.',
    Icon: Table2,
    group: 'convert',
    clientSide: false,
    accept: PDF_ONLY,
  },
  {
    slug: 'office-to-pdf',
    name: 'Office to PDF',
    tagline: 'Word, Excel, PPT, HTML',
    description:
      'Convert .docx, .xlsx, .pptx, .html or .txt into a PDF with the original layout intact. Uses the same server-side conversion endpoint.',
    Icon: FileText,
    group: 'convert',
    clientSide: false,
    accept:
      '.docx,.doc,.xlsx,.xls,.pptx,.ppt,.html,.htm,.txt,.rtf',
  },

  // ------------------------------------------------------------------ secure
  {
    slug: 'protect-pdf',
    name: 'Protect PDF',
    tagline: 'Add a password',
    description:
      'Encrypt a PDF with AES-256 and set exactly what recipients may do — print, copy text, edit, or fill forms. The encryption happens on your device.',
    Icon: Lock,
    group: 'secure',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'unlock-pdf',
    name: 'Unlock PDF',
    tagline: 'Remove a password',
    description:
      'Strip password protection and usage restrictions from a PDF you have the password for, so it opens freely everywhere.',
    Icon: Unlock,
    group: 'secure',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'redact-pdf',
    name: 'Redact PDF',
    tagline: 'Permanently remove content',
    description:
      'Draw boxes over anything sensitive. The content underneath is destroyed, not merely covered — it cannot be copied back out.',
    Icon: Eraser,
    group: 'secure',
    clientSide: true,
    accept: PDF_ONLY,
    opensEditor: true,
  },
  {
    slug: 'flatten-pdf',
    name: 'Flatten PDF',
    tagline: 'Freeze forms and annotations',
    description:
      'Bake form values and annotations into the page so nothing can be changed or accidentally cleared by a viewer.',
    Icon: Layers,
    group: 'secure',
    clientSide: true,
    accept: PDF_ONLY,
  },

  // ---------------------------------------------------------------- optimise
  {
    slug: 'compress-pdf',
    name: 'Compress PDF',
    tagline: 'Make the file smaller',
    description:
      'Shrink a PDF by restructuring it losslessly, or by downsampling page images for a much bigger saving. You see the exact before and after sizes.',
    Icon: Minimize2,
    group: 'optimise',
    clientSide: true,
    accept: PDF_ONLY,
    popular: true,
  },
  {
    slug: 'grayscale-pdf',
    name: 'Grayscale PDF',
    tagline: 'Remove all colour',
    description:
      'Convert every page to true greyscale — useful before printing, and it usually makes the file smaller too.',
    Icon: Droplets,
    group: 'optimise',
    clientSide: true,
    accept: PDF_ONLY,
  },

  // ---------------------------------------------------------------- advanced
  {
    slug: 'ocr-pdf',
    name: 'OCR PDF',
    tagline: 'Make scans searchable',
    description:
      'Recognise text in a scanned document and add an invisible text layer over it, so the PDF becomes searchable and selectable. Runs on your device.',
    Icon: ScanText,
    group: 'advanced',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'compare-pdf',
    name: 'Compare PDFs',
    tagline: 'See what changed',
    description:
      'Put two versions side by side. Get a word-level text diff per page plus a pixel overlay showing exactly what moved.',
    Icon: ArrowLeftRight,
    group: 'advanced',
    clientSide: true,
    accept: PDF_ONLY,
    multiple: true,
  },
  {
    slug: 'repair-pdf',
    name: 'Repair PDF',
    tagline: 'Recover a damaged file',
    description:
      'Diagnose and rebuild a PDF that will not open. Three recovery strategies are tried in turn, keeping as much of the original as possible.',
    Icon: Wrench,
    group: 'advanced',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'extract-text',
    name: 'Extract text',
    tagline: 'Pull out the words',
    description:
      'Get the plain text of every page as a .txt file, ready to paste elsewhere or feed into another tool.',
    Icon: FileSearch,
    group: 'advanced',
    clientSide: true,
    accept: PDF_ONLY,
  },
  {
    slug: 'sign-and-shield',
    name: 'Document info',
    tagline: 'Inspect a PDF',
    description:
      'Check page count, page sizes, encryption status, form fields and structural health before you do anything else.',
    Icon: Shield,
    group: 'advanced',
    clientSide: true,
    accept: PDF_ONLY,
  },
];

export const TOOLS_BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

export function getTool(slug: string): ToolDefinition | undefined {
  return TOOLS_BY_SLUG.get(slug);
}

export function toolsByGroup(): { group: ToolGroup; tools: ToolDefinition[] }[] {
  const order: ToolGroup[] = ['organise', 'edit', 'convert', 'secure', 'optimise', 'advanced'];
  return order.map((group) => ({
    group,
    tools: TOOLS.filter((tool) => tool.group === group),
  }));
}

export const POPULAR_TOOLS = TOOLS.filter((tool) => tool.popular);
