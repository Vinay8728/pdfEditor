import { loadDoc, saveDoc } from './core';
import { rebuildFromRaster } from './rebuild';

export interface FlattenOptions {
  /**
   * 'forms'  — bakes AcroForm field values into page content and removes the
   *            interactive fields. Text stays selectable.
   * 'all'    — re-renders every page to an image. Nothing interactive survives:
   *            no form fields, no annotations, no links, no layers.
   */
  mode?: 'forms' | 'all';
  dpi?: number;
  password?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function flattenPdf(
  bytes: Uint8Array,
  options: FlattenOptions = {},
): Promise<Uint8Array> {
  const { mode = 'forms', dpi = 150, password, onProgress } = options;

  if (mode === 'all') {
    return rebuildFromRaster(bytes, {
      dpi,
      quality: 0.9,
      format: 'image/jpeg',
      password,
      onProgress,
    });
  }

  const doc = await loadDoc(bytes, { password });
  try {
    const form = doc.getForm();
    // Generating appearances first means fields that were filled
    // programmatically still render after they stop being fields.
    form.updateFieldAppearances();
    form.flatten();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The form fields in this PDF could not be flattened (${message}). Try "Flatten everything" instead.`,
    );
  }

  return saveDoc(doc);
}

/** True when the document has at least one AcroForm field. */
export async function hasFormFields(bytes: Uint8Array, password?: string): Promise<boolean> {
  try {
    const doc = await loadDoc(bytes, { password });
    return doc.getForm().getFields().length > 0;
  } catch {
    return false;
  }
}
