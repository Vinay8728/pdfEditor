import { StandardFonts } from './lib';
import type { PDFDocument, PDFFont } from './lib';

export type FontFamily = 'Helvetica' | 'Times' | 'Courier';

export interface FontStyle {
  family?: FontFamily;
  bold?: boolean;
  italic?: boolean;
}

const TABLE: Record<FontFamily, Record<string, StandardFonts>> = {
  Helvetica: {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    bolditalic: StandardFonts.HelveticaBoldOblique,
  },
  Times: {
    regular: StandardFonts.TimesRoman,
    bold: StandardFonts.TimesRomanBold,
    italic: StandardFonts.TimesRomanItalic,
    bolditalic: StandardFonts.TimesRomanBoldItalic,
  },
  Courier: {
    regular: StandardFonts.Courier,
    bold: StandardFonts.CourierBold,
    italic: StandardFonts.CourierOblique,
    bolditalic: StandardFonts.CourierBoldOblique,
  },
};

export function standardFontFor(style: FontStyle = {}): StandardFonts {
  const family = style.family ?? 'Helvetica';
  const key = style.bold && style.italic ? 'bolditalic' : style.bold ? 'bold' : style.italic ? 'italic' : 'regular';
  return TABLE[family][key];
}

export async function embedFont(
  doc: InstanceType<typeof PDFDocument>,
  style: FontStyle = {},
): Promise<PDFFont> {
  return doc.embedFont(standardFontFor(style));
}

/**
 * The 14 standard PDF fonts only cover WinAnsi. Anything outside it (emoji,
 * CJK, most non-Latin scripts) would make pdf-lib throw mid-save, so we replace
 * unsupported characters rather than lose the whole document.
 */
export function sanitizeWinAnsi(text: string, replacement = '?'): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\n' || char === '\r' || char === '\t') {
      out += char;
    } else if (code >= 32 && code <= 126) {
      out += char;
    } else if (code >= 160 && code <= 255) {
      out += char;
    } else if (code === 8216 || code === 8217) {
      out += "'";
    } else if (code === 8220 || code === 8221) {
      out += '"';
    } else if (code === 8211 || code === 8212) {
      out += '-';
    } else if (code === 8230) {
      out += '...';
    } else {
      out += replacement;
    }
  }
  return out;
}

/** Greedy word wrap measured against the real embedded font. */
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
