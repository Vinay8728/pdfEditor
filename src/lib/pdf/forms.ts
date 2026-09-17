import { loadDoc, saveDoc } from './core';
import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  rgb,
} from './lib';
import type { PDFDocument } from './lib';
import { embedFont, sanitizeWinAnsi } from './fonts';

export type FormFieldType =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'optionlist'
  | 'signature'
  | 'button';

export interface FormFieldInfo {
  name: string;
  type: FormFieldType;
  value: string | boolean | string[];
  options?: string[];
  readOnly: boolean;
  required: boolean;
  multiline?: boolean;
  maxLength?: number;
  /** Zero-based page the first widget sits on, when we can work it out. */
  pageIndex?: number;
  /** Widget rectangle in PDF user space, when available. */
  rect?: { x: number; y: number; width: number; height: number };
}

type AnyDoc = PDFDocument;

/** Maps each annotation dictionary to the page it lives on. */
function buildWidgetPageMap(doc: AnyDoc): Map<unknown, number> {
  const map = new Map<unknown, number>();
  doc.getPages().forEach((page, pageIndex) => {
    try {
      const annots = page.node.Annots();
      if (!annots) return;
      for (let i = 0; i < annots.size(); i += 1) {
        const dict = doc.context.lookup(annots.get(i));
        if (dict) map.set(dict, pageIndex);
      }
    } catch {
      // A malformed /Annots entry should not stop us reading the rest.
    }
  });
  return map;
}

function describeType(field: unknown): FormFieldType {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'optionlist';
  if (field instanceof PDFSignature) return 'signature';
  return 'button';
}

export async function readFormFields(
  bytes: Uint8Array,
  password?: string,
): Promise<FormFieldInfo[]> {
  const doc = await loadDoc(bytes, { password });
  const form = doc.getForm();
  const widgetPages = buildWidgetPageMap(doc);

  return form.getFields().map((field) => {
    const type = describeType(field);

    let value: string | boolean | string[] = '';
    let options: string[] | undefined;
    let multiline: boolean | undefined;
    let maxLength: number | undefined;

    try {
      if (field instanceof PDFTextField) {
        value = field.getText() ?? '';
        multiline = field.isMultiline();
        maxLength = field.getMaxLength() ?? undefined;
      } else if (field instanceof PDFCheckBox) {
        value = field.isChecked();
      } else if (field instanceof PDFRadioGroup) {
        value = field.getSelected() ?? '';
        options = field.getOptions();
      } else if (field instanceof PDFDropdown) {
        const selected = field.getSelected();
        value = selected.length > 0 ? selected[0] : '';
        options = field.getOptions();
      } else if (field instanceof PDFOptionList) {
        value = field.getSelected();
        options = field.getOptions();
      }
    } catch {
      // Some producers write values we cannot interpret; show the field anyway.
    }

    let pageIndex: number | undefined;
    let rect: FormFieldInfo['rect'];
    try {
      // getWidgets only exists on terminal acro fields, so it is reached
      // defensively rather than through the base PDFAcroField type.
      const acro = field.acroField as unknown as {
        getWidgets?: () => {
          dict: unknown;
          getRectangle: () => { x: number; y: number; width: number; height: number };
        }[];
      };
      const widget = acro.getWidgets?.()[0];
      if (widget) {
        pageIndex = widgetPages.get(widget.dict);
        const r = widget.getRectangle();
        rect = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
    } catch {
      // Widget geometry is optional, used only to position overlay editors.
    }

    return {
      name: field.getName(),
      type,
      value,
      options,
      readOnly: field.isReadOnly(),
      required: field.isRequired(),
      multiline,
      maxLength,
      pageIndex,
      rect,
    };
  });
}

export type FormValues = Record<string, string | boolean | string[]>;

export interface FillOptions {
  flatten?: boolean;
  password?: string;
}

export async function fillFormFields(
  bytes: Uint8Array,
  values: FormValues,
  options: FillOptions = {},
): Promise<Uint8Array> {
  const doc = await loadDoc(bytes, { password: options.password });
  const form = doc.getForm();
  const helvetica = await embedFont(doc);

  for (const [name, value] of Object.entries(values)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      continue; // Field disappeared or was never there, skip rather than fail.
    }

    try {
      if (field instanceof PDFTextField) {
        field.setText(sanitizeWinAnsi(String(value ?? '')));
      } else if (field instanceof PDFCheckBox) {
        if (value === true || value === 'true' || value === 'on') field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        const selection = String(value ?? '');
        if (selection) field.select(selection);
      } else if (field instanceof PDFDropdown) {
        const selection = Array.isArray(value) ? value[0] : String(value ?? '');
        if (selection) field.select(selection);
      } else if (field instanceof PDFOptionList) {
        const selection = Array.isArray(value) ? value : [String(value ?? '')];
        const valid = selection.filter(Boolean);
        if (valid.length) field.select(valid);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error('Could not set "' + name + '": ' + detail);
    }
  }

  // Appearance streams must be regenerated or many viewers show stale values.
  form.updateFieldAppearances(helvetica);
  if (options.flatten) form.flatten();

  return saveDoc(doc);
}

export interface NewFieldDef {
  type: 'text' | 'checkbox' | 'dropdown' | 'radio';
  name: string;
  pageIndex: number;
  /** PDF user space, origin bottom-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  options?: string[];
  required?: boolean;
  multiline?: boolean;
  fontSize?: number;
}

/** Adds brand-new interactive fields to a document. */
export async function addFormFields(
  bytes: Uint8Array,
  defs: NewFieldDef[],
  password?: string,
): Promise<Uint8Array> {
  if (defs.length === 0) throw new Error('Add at least one field.');

  const doc = await loadDoc(bytes, { password });
  const form = doc.getForm();
  const font = await embedFont(doc);
  const pages = doc.getPages();
  const used = new Set(form.getFields().map((field) => field.getName()));

  for (const def of defs) {
    const page = pages[def.pageIndex];
    if (!page) continue;

    // Field names must be unique within the AcroForm.
    const base = def.name.trim() || def.type + '_' + (def.pageIndex + 1);
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = base + '_' + suffix;
      suffix += 1;
    }
    used.add(name);

    const box = { x: def.x, y: def.y, width: def.width, height: def.height };
    const borderColor = rgb(0.55, 0.6, 0.68);

    if (def.type === 'text') {
      const field = form.createTextField(name);
      if (def.multiline) field.enableMultiline();
      if (def.required) field.enableRequired();
      if (def.value) field.setText(sanitizeWinAnsi(def.value));
      field.addToPage(page, {
        ...box,
        font,
        textColor: rgb(0, 0, 0),
        borderColor,
        borderWidth: 1,
      });
      if (def.fontSize) field.setFontSize(def.fontSize);
    } else if (def.type === 'checkbox') {
      const field = form.createCheckBox(name);
      if (def.required) field.enableRequired();
      field.addToPage(page, { ...box, borderColor, borderWidth: 1 });
      if (def.value === 'true') field.check();
    } else if (def.type === 'dropdown') {
      const field = form.createDropdown(name);
      field.setOptions((def.options ?? []).map((option) => sanitizeWinAnsi(option)));
      if (def.required) field.enableRequired();
      if (def.value) field.select(sanitizeWinAnsi(def.value));
      field.addToPage(page, { ...box, font, borderColor, borderWidth: 1 });
    } else {
      const field = form.createRadioGroup(name);
      const choices = def.options && def.options.length ? def.options : ['Option 1', 'Option 2'];
      const rowHeight = def.height / choices.length;
      choices.forEach((choice, i) => {
        field.addOptionToPage(sanitizeWinAnsi(choice), page, {
          x: def.x,
          y: def.y + (choices.length - 1 - i) * rowHeight,
          width: Math.min(rowHeight, def.width),
          height: rowHeight,
          borderColor,
          borderWidth: 1,
        });
      });
      if (def.value) field.select(sanitizeWinAnsi(def.value));
    }
  }

  form.updateFieldAppearances(font);
  return saveDoc(doc);
}
