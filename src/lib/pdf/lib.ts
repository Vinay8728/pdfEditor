/**
 * Single entry point for PDF document manipulation.
 *
 * We use `@cantoo/pdf-lib` — an MIT-licensed, API-compatible fork of `pdf-lib`
 * that adds AES-256 encryption and decryption. That is what makes "Protect" and
 * "Unlock" genuinely client-side; upstream pdf-lib can do neither.
 *
 * Everything else in this app imports from here, so swapping the implementation
 * back to upstream pdf-lib is a one-file change.
 */
export {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  PDFName,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFBool,
  PDFRef,
  PDFRawStream,
  StandardFonts,
  rgb,
  grayscale,
  cmyk,
  degrees,
  radians,
  BlendMode,
  TextAlignment,
  LineCapStyle,
  PageSizes,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFButton,
  PDFSignature,
} from '@cantoo/pdf-lib';

export type { Color, Degrees, PDFForm, PDFField } from '@cantoo/pdf-lib';
