'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import {
  Alert,
  Button,
  Field,
  SegmentedControl,
  Select,
  Spinner,
  TextInput,
  Toggle,
} from '@/components/ui/controls';
import type { FormFieldInfo, FormValues, NewFieldDef } from '@/lib/pdf/forms';
import { baseName, uid } from '@/lib/utils';

export function FormsTool({ files, runJob, busy, setError }: PanelProps) {
  const file = files[0];
  const [mode, setMode] = useState<'fill' | 'create'>('fill');
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [flatten, setFlatten] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newFields, setNewFields] = useState<(NewFieldDef & { key: string })[]>([]);

  const load = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { readFormFields } = await import('@/lib/pdf/forms');
      const detected = await readFormFields(file.bytes, file.password);
      setFields(detected);

      const initial: FormValues = {};
      for (const field of detected) initial[field.name] = field.value;
      setValues(initial);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The form fields could not be read.');
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [file, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveFilled = () => {
    void runJob(async (report) => {
      const { fillFormFields } = await import('@/lib/pdf/forms');
      report('Filling fields', 1, 2);
      const data = await fillFormFields(file.bytes, values, {
        flatten,
        password: file.password,
      });
      report('Filling fields', 2, 2);
      return [{ name: `${baseName(file.name)}-filled.pdf`, data }];
    });
  };

  const saveNewFields = () => {
    void runJob(async (report) => {
      const { addFormFields } = await import('@/lib/pdf/forms');
      report('Adding fields', 1, 2);
      const data = await addFormFields(
        file.bytes,
        newFields.map(({ key, ...def }) => {
          void key;
          return def;
        }),
        file.password,
      );
      report('Adding fields', 2, 2);
      return [{ name: `${baseName(file.name)}-form.pdf`, data }];
    });
  };

  const addBlankField = () => {
    setNewFields((current) => [
      ...current,
      {
        key: uid('field'),
        type: 'text',
        name: `field_${current.length + 1}`,
        pageIndex: 0,
        x: 72,
        y: 600 - current.length * 44,
        width: 220,
        height: 28,
        options: [],
      },
    ]);
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Looking for form fields…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: 'fill', label: `Fill existing (${fields?.length ?? 0})` },
          { value: 'create', label: 'Add new fields' },
        ]}
      />

      {mode === 'fill' ? (
        fields && fields.length > 0 ? (
          <>
            <div className="space-y-4">
              {fields.map((field) => (
                <FieldEditor
                  key={field.name}
                  field={field}
                  value={values[field.name]}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.name]: value }))
                  }
                />
              ))}
            </div>

            <Toggle
              checked={flatten}
              onChange={setFlatten}
              label="Flatten after filling"
              hint="Bakes the values into the page so they cannot be changed. Recommended before sending a completed form."
            />

            <div className="border-t border-line pt-4">
              <Button onClick={saveFilled} loading={busy} icon={<Save className="h-4 w-4" />}>
                Save filled form
              </Button>
            </div>
          </>
        ) : (
          <Alert tone="info" title="No form fields found">
            This PDF has no AcroForm fields. Switch to &ldquo;Add new fields&rdquo; to create some,
            or use the editor to add plain text instead.
          </Alert>
        )
      ) : (
        <>
          {newFields.length === 0 && (
            <Alert tone="info">
              Add a field, then set which page it belongs on and where. Coordinates are in points
              from the bottom-left of the page — 72 points is one inch.
            </Alert>
          )}

          <div className="space-y-3">
            {newFields.map((field, index) => (
              <div key={field.key} className="rounded-lg border border-line bg-surface2 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <Select
                      value={field.type}
                      onChange={(event) =>
                        updateNewField(setNewFields, index, {
                          type: event.target.value as NewFieldDef['type'],
                        })
                      }
                    >
                      <option value="text">Text box</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="radio">Radio group</option>
                    </Select>
                  </Field>
                  <Field label="Name" className="sm:col-span-2">
                    <TextInput
                      value={field.name}
                      onChange={(event) =>
                        updateNewField(setNewFields, index, { name: event.target.value })
                      }
                    />
                  </Field>

                  <Field label="Page">
                    <TextInput
                      type="number"
                      min={1}
                      value={field.pageIndex + 1}
                      onChange={(event) =>
                        updateNewField(setNewFields, index, {
                          pageIndex: Math.max(0, Number(event.target.value) - 1),
                        })
                      }
                    />
                  </Field>
                  <Field label="X / Y (pt)">
                    <div className="flex gap-2">
                      <TextInput
                        type="number"
                        value={field.x}
                        onChange={(event) =>
                          updateNewField(setNewFields, index, { x: Number(event.target.value) })
                        }
                      />
                      <TextInput
                        type="number"
                        value={field.y}
                        onChange={(event) =>
                          updateNewField(setNewFields, index, { y: Number(event.target.value) })
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Width / Height (pt)">
                    <div className="flex gap-2">
                      <TextInput
                        type="number"
                        value={field.width}
                        onChange={(event) =>
                          updateNewField(setNewFields, index, { width: Number(event.target.value) })
                        }
                      />
                      <TextInput
                        type="number"
                        value={field.height}
                        onChange={(event) =>
                          updateNewField(setNewFields, index, {
                            height: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  </Field>

                  {(field.type === 'dropdown' || field.type === 'radio') && (
                    <Field label="Choices" className="sm:col-span-3" hint="One per comma.">
                      <TextInput
                        value={(field.options ?? []).join(', ')}
                        onChange={(event) =>
                          updateNewField(setNewFields, index, {
                            options: event.target.value
                              .split(',')
                              .map((option) => option.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Yes, No, Maybe"
                      />
                    </Field>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setNewFields((current) => current.filter((_, i) => i !== index))}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove field
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={addBlankField} icon={<Plus className="h-4 w-4" />}>
              Add a field
            </Button>
            <Button
              onClick={saveNewFields}
              loading={busy}
              disabled={newFields.length === 0}
              icon={<Save className="h-4 w-4" />}
            >
              Save with new fields
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function updateNewField(
  setNewFields: React.Dispatch<React.SetStateAction<(NewFieldDef & { key: string })[]>>,
  index: number,
  patch: Partial<NewFieldDef>,
) {
  setNewFields((current) =>
    current.map((field, i) => (i === index ? { ...field, ...patch } : field)),
  );
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: FormFieldInfo;
  value: FormValues[string];
  onChange: (value: FormValues[string]) => void;
}) {
  const label = `${field.name}${field.required ? ' *' : ''}${
    field.pageIndex !== undefined ? ` — page ${field.pageIndex + 1}` : ''
  }`;

  if (field.type === 'checkbox') {
    return (
      <Toggle
        checked={value === true}
        onChange={onChange}
        label={label}
        disabled={field.readOnly}
      />
    );
  }

  if (field.type === 'signature') {
    return (
      <Field label={label} hint="Signature fields cannot be filled here — use the Sign tool.">
        <TextInput value="" disabled placeholder="Signature field" />
      </Field>
    );
  }

  if (field.options && field.options.length > 0) {
    return (
      <Field label={label}>
        <Select
          value={Array.isArray(value) ? (value[0] ?? '') : String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
          disabled={field.readOnly}
        >
          <option value="">— not set —</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  return (
    <Field label={label} hint={field.readOnly ? 'This field is read-only.' : undefined}>
      <TextInput
        value={typeof value === 'string' ? value : ''}
        maxLength={field.maxLength}
        disabled={field.readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
