'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import {
  Alert,
  Button,
  ColorInput,
  Field,
  SegmentedControl,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '@/components/ui/controls';
import { CORNERS, type Corner } from '@/lib/pdf/geometry';
import type { FontFamily } from '@/lib/pdf/fonts';
import { baseName } from '@/lib/utils';
import { parsePageRanges } from '@/lib/ranges';
import type { OutputFile } from '@/lib/download';

export const SIMPLE_TOOL_SLUGS = [
  'merge-pdf',
  'split-pdf',
  'rotate-pdf',
  'crop-pdf',
  'watermark-pdf',
  'page-numbers',
  'pdf-to-jpg',
  'jpg-to-pdf',
  'protect-pdf',
  'unlock-pdf',
  'flatten-pdf',
  'compress-pdf',
  'grayscale-pdf',
  'ocr-pdf',
  'repair-pdf',
  'extract-text',
];

const CORNER_LABELS: Record<Corner, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  'middle-center': 'Centre',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

interface Options {
  // shared
  pages: string;
  // merge
  addBlankBetween: boolean;
  // split
  splitMode: 'ranges' | 'everyN' | 'each' | 'atPages';
  splitRanges: string;
  splitSize: number;
  splitAt: string;
  // rotate
  rotation: number;
  // crop
  cropUnit: 'pt' | 'percent';
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
  // watermark
  wmKind: 'text' | 'image';
  wmText: string;
  wmImage: { name: string; bytes: Uint8Array } | null;
  wmPosition: Corner;
  wmAngle: number;
  wmOpacity: number;
  wmFontSize: number;
  wmColor: string;
  wmScale: number;
  wmTile: boolean;
  wmBehind: boolean;
  // page numbers
  pnPosition: Corner;
  pnFormat: string;
  pnFontSize: number;
  pnFontFamily: FontFamily;
  pnBold: boolean;
  pnColor: string;
  pnMargin: number;
  pnStartAt: number;
  // images
  imgFormat: 'image/jpeg' | 'image/png';
  imgDpi: number;
  imgQuality: number;
  pageSize: 'fit' | 'a4' | 'letter' | 'legal';
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: number;
  // protect
  password: string;
  confirmPassword: string;
  ownerPassword: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotating: boolean;
  allowForms: boolean;
  // flatten
  flattenMode: 'forms' | 'all';
  // compress
  compressMode: 'lossless' | 'images';
  compressLevel: 'light' | 'balanced' | 'strong' | 'extreme';
  // ocr
  ocrLanguage: string;
  ocrDpi: number;
}

const DEFAULTS: Options = {
  pages: '',
  addBlankBetween: false,
  splitMode: 'ranges',
  splitRanges: '1-1',
  splitSize: 1,
  splitAt: '',
  rotation: 90,
  cropUnit: 'pt',
  cropTop: 36,
  cropRight: 36,
  cropBottom: 36,
  cropLeft: 36,
  wmKind: 'text',
  wmText: 'CONFIDENTIAL',
  wmImage: null,
  wmPosition: 'middle-center',
  wmAngle: 45,
  wmOpacity: 0.25,
  wmFontSize: 56,
  wmColor: '#808080',
  wmScale: 0.4,
  wmTile: false,
  wmBehind: false,
  pnPosition: 'bottom-center',
  pnFormat: '{n}',
  pnFontSize: 11,
  pnFontFamily: 'Helvetica',
  pnBold: false,
  pnColor: '#000000',
  pnMargin: 28,
  pnStartAt: 1,
  imgFormat: 'image/jpeg',
  imgDpi: 150,
  imgQuality: 0.85,
  pageSize: 'fit',
  orientation: 'auto',
  margin: 0,
  password: '',
  confirmPassword: '',
  ownerPassword: '',
  allowPrinting: true,
  allowCopying: false,
  allowModifying: false,
  allowAnnotating: false,
  allowForms: true,
  flattenMode: 'forms',
  compressMode: 'images',
  compressLevel: 'balanced',
  ocrLanguage: 'eng',
  ocrDpi: 200,
};

export function SimpleToolPanel({ slug, files, runJob, busy, setError }: PanelProps & { slug: string }) {
  const [options, setOptions] = useState<Options>(DEFAULTS);
  const [note, setNote] = useState<string | null>(null);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const primary = files[0];
  const pageCount = primary?.pageCount ?? 0;

  const start = () => {
    setNote(null);
    void runJob(async (report) => runTool(slug, files, options, report, setNote), outputZipName(slug));
  };

  const actionLabel = ACTION_LABELS[slug] ?? 'Apply';
  const disabled = busy || files.length === 0 || !!validate(slug, options, files.length);
  const problem = validate(slug, options, files.length);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {slug === 'merge-pdf' && (
          <div className="sm:col-span-2">
            <Toggle
              checked={options.addBlankBetween}
              onChange={(value) => set('addBlankBetween', value)}
              label="Start each document on a new sheet"
              hint="Inserts a blank page between files so double-sided printing lines up."
            />
          </div>
        )}

        {slug === 'split-pdf' && (
          <>
            <div className="sm:col-span-2">
              <SegmentedControl
                label="Split by"
                value={options.splitMode}
                onChange={(value) => set('splitMode', value)}
                options={[
                  { value: 'ranges', label: 'Ranges' },
                  { value: 'everyN', label: 'Every N pages' },
                  { value: 'atPages', label: 'At pages' },
                  { value: 'each', label: 'Each page' },
                ]}
              />
            </div>
            {options.splitMode === 'ranges' && (
              <Field
                label="Page ranges"
                className="sm:col-span-2"
                hint={`Each comma group becomes its own file. ${rangeSummary(options.splitRanges, pageCount)}`}
              >
                <TextInput
                  value={options.splitRanges}
                  onChange={(event) => set('splitRanges', event.target.value)}
                  placeholder="1-3, 4-8, 9-"
                />
              </Field>
            )}
            {options.splitMode === 'everyN' && (
              <Field label="Pages per file">
                <TextInput
                  type="number"
                  min={1}
                  value={options.splitSize}
                  onChange={(event) => set('splitSize', Math.max(1, Number(event.target.value)))}
                />
              </Field>
            )}
            {options.splitMode === 'atPages' && (
              <Field
                label="Split before pages"
                className="sm:col-span-2"
                hint="A new file starts at each of these page numbers."
              >
                <TextInput
                  value={options.splitAt}
                  onChange={(event) => set('splitAt', event.target.value)}
                  placeholder="4, 9, 15"
                />
              </Field>
            )}
          </>
        )}

        {slug === 'rotate-pdf' && (
          <>
            <SegmentedControl<string>
              label="Turn by"
              value={String(options.rotation)}
              onChange={(value) => set('rotation', Number(value))}
              options={[
                { value: '90', label: '90° right' },
                { value: '180', label: '180°' },
                { value: '270', label: '90° left' },
              ]}
            />
            <PagesField options={options} set={set} pageCount={pageCount} />
          </>
        )}

        {slug === 'crop-pdf' && (
          <>
            <div className="sm:col-span-2">
              <SegmentedControl
                label="Units"
                value={options.cropUnit}
                onChange={(value) => set('cropUnit', value)}
                options={[
                  { value: 'pt', label: 'Points' },
                  { value: 'percent', label: 'Percent' },
                ]}
              />
            </div>
            <Field label="Top"><NumberInput value={options.cropTop} onChange={(v) => set('cropTop', v)} /></Field>
            <Field label="Right"><NumberInput value={options.cropRight} onChange={(v) => set('cropRight', v)} /></Field>
            <Field label="Bottom"><NumberInput value={options.cropBottom} onChange={(v) => set('cropBottom', v)} /></Field>
            <Field label="Left"><NumberInput value={options.cropLeft} onChange={(v) => set('cropLeft', v)} /></Field>
            <div className="sm:col-span-2">
              <PagesField options={options} set={set} pageCount={pageCount} />
            </div>
          </>
        )}

        {slug === 'watermark-pdf' && (
          <>
            <div className="sm:col-span-2">
              <SegmentedControl
                label="Watermark"
                value={options.wmKind}
                onChange={(value) => set('wmKind', value)}
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'image', label: 'Image' },
                ]}
              />
            </div>

            {options.wmKind === 'text' ? (
              <>
                <Field label="Text" className="sm:col-span-2">
                  <TextInput
                    value={options.wmText}
                    onChange={(event) => set('wmText', event.target.value)}
                  />
                </Field>
                <Slider
                  label="Font size"
                  value={options.wmFontSize}
                  onChange={(value) => set('wmFontSize', value)}
                  min={8}
                  max={200}
                  suffix=" pt"
                />
                <ColorInput
                  label="Colour"
                  value={options.wmColor}
                  onChange={(value) => set('wmColor', value)}
                />
              </>
            ) : (
              <>
                <Field label="Image file" className="sm:col-span-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="input file:mr-3 file:rounded file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      try {
                        const bytes = new Uint8Array(await file.arrayBuffer());
                        set('wmImage', { name: file.name, bytes });
                      } catch {
                        setError('That image could not be read.');
                      }
                    }}
                  />
                </Field>
                <Slider
                  label="Width"
                  value={Math.round(options.wmScale * 100)}
                  onChange={(value) => set('wmScale', value / 100)}
                  min={5}
                  max={100}
                  suffix="% of page"
                />
              </>
            )}

            <Field label="Position">
              <Select
                value={options.wmPosition}
                onChange={(event) => set('wmPosition', event.target.value as Corner)}
                disabled={options.wmTile}
              >
                {CORNERS.map((corner) => (
                  <option key={corner} value={corner}>
                    {CORNER_LABELS[corner]}
                  </option>
                ))}
              </Select>
            </Field>
            <Slider
              label="Angle"
              value={options.wmAngle}
              onChange={(value) => set('wmAngle', value)}
              min={0}
              max={359}
              suffix="°"
            />
            <Slider
              label="Opacity"
              value={Math.round(options.wmOpacity * 100)}
              onChange={(value) => set('wmOpacity', value / 100)}
              min={5}
              max={100}
              suffix="%"
            />
            <PagesField options={options} set={set} pageCount={pageCount} />
            <div className="space-y-3 sm:col-span-2">
              <Toggle
                checked={options.wmTile}
                onChange={(value) => set('wmTile', value)}
                label="Repeat across the whole page"
              />
              <Toggle
                checked={options.wmBehind}
                onChange={(value) => set('wmBehind', value)}
                label="Place behind the page content"
                hint="Rebuilds each page so the mark sits under the text. Interactive form fields are not carried over."
              />
            </div>
          </>
        )}

        {slug === 'page-numbers' && (
          <>
            <Field label="Position">
              <Select
                value={options.pnPosition}
                onChange={(event) => set('pnPosition', event.target.value as Corner)}
              >
                {CORNERS.map((corner) => (
                  <option key={corner} value={corner}>
                    {CORNER_LABELS[corner]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" hint="Use {n} for the number and {total} for the count.">
              <TextInput
                value={options.pnFormat}
                onChange={(event) => set('pnFormat', event.target.value)}
                placeholder="Page {n} of {total}"
              />
            </Field>
            <Field label="Font">
              <Select
                value={options.pnFontFamily}
                onChange={(event) => set('pnFontFamily', event.target.value as FontFamily)}
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
              </Select>
            </Field>
            <ColorInput
              label="Colour"
              value={options.pnColor}
              onChange={(value) => set('pnColor', value)}
            />
            <Slider
              label="Size"
              value={options.pnFontSize}
              onChange={(value) => set('pnFontSize', value)}
              min={6}
              max={48}
              suffix=" pt"
            />
            <Slider
              label="Margin"
              value={options.pnMargin}
              onChange={(value) => set('pnMargin', value)}
              min={0}
              max={120}
              suffix=" pt"
            />
            <Field label="Start numbering at">
              <NumberInput value={options.pnStartAt} onChange={(v) => set('pnStartAt', v)} />
            </Field>
            <PagesField
              options={options}
              set={set}
              pageCount={pageCount}
              hint="Leave blank for every page, or use 2- to skip a cover."
            />
            <div className="sm:col-span-2">
              <Toggle
                checked={options.pnBold}
                onChange={(value) => set('pnBold', value)}
                label="Bold"
              />
            </div>
          </>
        )}

        {slug === 'pdf-to-jpg' && (
          <>
            <SegmentedControl
              label="Format"
              value={options.imgFormat}
              onChange={(value) => set('imgFormat', value)}
              options={[
                { value: 'image/jpeg', label: 'JPG' },
                { value: 'image/png', label: 'PNG' },
              ]}
            />
            <Slider
              label="Resolution"
              value={options.imgDpi}
              onChange={(value) => set('imgDpi', value)}
              min={72}
              max={600}
              step={2}
              suffix=" DPI"
            />
            {options.imgFormat === 'image/jpeg' && (
              <Slider
                label="Quality"
                value={Math.round(options.imgQuality * 100)}
                onChange={(value) => set('imgQuality', value / 100)}
                min={30}
                max={100}
                suffix="%"
              />
            )}
            <PagesField options={options} set={set} pageCount={pageCount} />
          </>
        )}

        {slug === 'jpg-to-pdf' && (
          <>
            <Field label="Page size">
              <Select
                value={options.pageSize}
                onChange={(event) => set('pageSize', event.target.value as Options['pageSize'])}
              >
                <option value="fit">Fit each image exactly</option>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="legal">US Legal</option>
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={options.orientation}
                onChange={(event) => set('orientation', event.target.value as Options['orientation'])}
                disabled={options.pageSize === 'fit'}
              >
                <option value="auto">Match each image</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Select>
            </Field>
            <Slider
              label="Margin"
              value={options.margin}
              onChange={(value) => set('margin', value)}
              min={0}
              max={120}
              suffix=" pt"
            />
          </>
        )}

        {slug === 'protect-pdf' && (
          <>
            <Field label="Password" hint="Required to open the document.">
              <TextInput
                type="password"
                value={options.password}
                onChange={(event) => set('password', event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password">
              <TextInput
                type="password"
                value={options.confirmPassword}
                onChange={(event) => set('confirmPassword', event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field
              label="Owner password (optional)"
              className="sm:col-span-2"
              hint="Lets you change permissions later without the opening password. Defaults to the same password."
            >
              <TextInput
                type="password"
                value={options.ownerPassword}
                onChange={(event) => set('ownerPassword', event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <div className="space-y-3 sm:col-span-2">
              <p className="label mb-0">What recipients may do</p>
              <Toggle checked={options.allowPrinting} onChange={(v) => set('allowPrinting', v)} label="Print" />
              <Toggle checked={options.allowCopying} onChange={(v) => set('allowCopying', v)} label="Copy text and images" />
              <Toggle checked={options.allowModifying} onChange={(v) => set('allowModifying', v)} label="Edit the document" />
              <Toggle checked={options.allowAnnotating} onChange={(v) => set('allowAnnotating', v)} label="Add comments and annotations" />
              <Toggle checked={options.allowForms} onChange={(v) => set('allowForms', v)} label="Fill in form fields" />
            </div>
          </>
        )}

        {slug === 'unlock-pdf' && (
          <div className="sm:col-span-2">
            <Alert tone="info">
              If the file asks for a password to open, type it next to the file above. Files that
              only carry usage restrictions unlock without one.
            </Alert>
          </div>
        )}

        {slug === 'flatten-pdf' && (
          <div className="sm:col-span-2">
            <SegmentedControl
              label="How much to flatten"
              value={options.flattenMode}
              onChange={(value) => set('flattenMode', value)}
              options={[
                { value: 'forms', label: 'Form fields only' },
                { value: 'all', label: 'Everything' },
              ]}
            />
            <p className="mt-2 text-xs text-muted">
              {options.flattenMode === 'forms'
                ? 'Field values are baked into the page and the fields are removed. Text stays selectable.'
                : 'Every page is re-rendered as an image. Nothing interactive survives, and text stops being selectable.'}
            </p>
          </div>
        )}

        {slug === 'compress-pdf' && (
          <>
            <div className="sm:col-span-2">
              <SegmentedControl
                label="Method"
                value={options.compressMode}
                onChange={(value) => set('compressMode', value)}
                options={[
                  { value: 'lossless', label: 'Lossless' },
                  { value: 'images', label: 'Downsample images' },
                ]}
              />
            </div>
            {options.compressMode === 'images' && (
              <div className="sm:col-span-2">
                <SegmentedControl
                  label="Strength"
                  value={options.compressLevel}
                  onChange={(value) => set('compressLevel', value)}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'strong', label: 'Strong' },
                    { value: 'extreme', label: 'Extreme' },
                  ]}
                />
                <p className="mt-2 text-xs text-muted">
                  Pages are re-rendered at a lower resolution, so the file gets much smaller but
                  text is no longer selectable.
                </p>
              </div>
            )}
            {options.compressMode === 'lossless' && (
              <div className="sm:col-span-2">
                <Alert tone="info">
                  Rewrites the file structure without touching image quality. Safe, but the saving
                  is modest — often 5–20%.
                </Alert>
              </div>
            )}
          </>
        )}

        {slug === 'grayscale-pdf' && (
          <div className="sm:col-span-2">
            <Slider
              label="Resolution"
              value={options.imgDpi}
              onChange={(value) => set('imgDpi', value)}
              min={72}
              max={400}
              step={2}
              suffix=" DPI"
            />
            <p className="mt-2 text-xs text-muted">
              Colour is stored inside each page&rsquo;s drawing instructions, so pages are
              re-rendered in grey. Higher DPI keeps more detail and makes a bigger file.
            </p>
          </div>
        )}

        {slug === 'ocr-pdf' && (
          <>
            <Field label="Language">
              <Select
                value={options.ocrLanguage}
                onChange={(event) => set('ocrLanguage', event.target.value)}
              >
                {OCR_LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Slider
              label="Scan resolution"
              value={options.ocrDpi}
              onChange={(value) => set('ocrDpi', value)}
              min={100}
              max={400}
              step={10}
              suffix=" DPI"
            />
            <div className="sm:col-span-2">
              <Alert tone="info">
                Recognition runs on your device and the language data downloads on first use, so
                the first page takes noticeably longer than the rest.
              </Alert>
            </div>
          </>
        )}

        {slug === 'repair-pdf' && (
          <div className="sm:col-span-2">
            <Alert tone="info">
              Three recovery strategies are tried in order, keeping as much of the original as
              possible. You will be told which one succeeded.
            </Alert>
          </div>
        )}

        {slug === 'extract-text' && (
          <div className="sm:col-span-2">
            <PagesField options={options} set={set} pageCount={pageCount} />
          </div>
        )}
      </div>

      {problem && <Alert tone="warning">{problem}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button onClick={start} disabled={disabled} loading={busy} icon={<Play className="h-4 w-4" />}>
          {actionLabel}
        </Button>
        <span className="text-xs text-muted">
          {files.length} file{files.length === 1 ? '' : 's'} ready
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const OCR_LANGUAGE_OPTIONS = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
  { code: 'hin', label: 'Hindi' },
  { code: 'ara', label: 'Arabic' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'rus', label: 'Russian' },
];

const ACTION_LABELS: Record<string, string> = {
  'merge-pdf': 'Merge files',
  'split-pdf': 'Split file',
  'rotate-pdf': 'Rotate pages',
  'crop-pdf': 'Crop pages',
  'watermark-pdf': 'Add watermark',
  'page-numbers': 'Add page numbers',
  'pdf-to-jpg': 'Convert to images',
  'jpg-to-pdf': 'Build PDF',
  'protect-pdf': 'Protect file',
  'unlock-pdf': 'Remove protection',
  'flatten-pdf': 'Flatten file',
  'compress-pdf': 'Compress file',
  'grayscale-pdf': 'Convert to greyscale',
  'ocr-pdf': 'Run OCR',
  'repair-pdf': 'Repair file',
  'extract-text': 'Extract text',
};

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <TextInput
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

function PagesField({
  options,
  set,
  pageCount,
  hint,
}: {
  options: Options;
  set: <K extends keyof Options>(key: K, value: Options[K]) => void;
  pageCount: number;
  hint?: string;
}) {
  return (
    <Field
      label="Pages"
      hint={hint ?? `Blank means every page. ${rangeSummary(options.pages, pageCount)}`}
    >
      <TextInput
        value={options.pages}
        onChange={(event) => set('pages', event.target.value)}
        placeholder="all — or 1-3, 7, odd, last"
      />
    </Field>
  );
}

function rangeSummary(input: string, pageCount: number): string {
  if (!pageCount) return '';
  const count = parsePageRanges(input, pageCount).length;
  return `Selects ${count} of ${pageCount} pages.`;
}

function validate(slug: string, options: Options, fileCount: number): string | null {
  if (slug === 'merge-pdf' && fileCount < 2) return 'Add at least two PDFs to merge.';
  if (slug === 'protect-pdf') {
    if (!options.password) return 'Enter a password.';
    if (options.password !== options.confirmPassword) return 'The two passwords do not match.';
    if (options.password.length < 4) return 'Use a password of at least four characters.';
  }
  if (slug === 'watermark-pdf') {
    if (options.wmKind === 'text' && !options.wmText.trim()) return 'Enter the watermark text.';
    if (options.wmKind === 'image' && !options.wmImage) return 'Choose a watermark image.';
  }
  if (slug === 'split-pdf' && options.splitMode === 'ranges' && !options.splitRanges.trim()) {
    return 'Enter at least one page range.';
  }
  return null;
}

function outputZipName(slug: string): string {
  return `${slug}-output.zip`;
}

/* -------------------------------------------------------------------------- */
/*                                   Runner                                   */
/* -------------------------------------------------------------------------- */

async function runTool(
  slug: string,
  files: PanelProps['files'],
  options: Options,
  report: (label: string, done: number, total: number) => void,
  setNote: (note: string | null) => void,
): Promise<OutputFile[]> {
  const primary = files[0];
  const stem = primary ? baseName(primary.name) : 'document';

  switch (slug) {
    case 'merge-pdf': {
      const { mergePdfs } = await import('@/lib/pdf/merge');
      const data = await mergePdfs(
        files.map((file) => ({ name: file.name, bytes: file.bytes, password: file.password })),
        {
          addBlankBetween: options.addBlankBetween,
          onProgress: (done, total) => report('Merging', done, total),
        },
      );
      return [{ name: 'merged.pdf', data }];
    }

    case 'split-pdf': {
      const { splitPdf } = await import('@/lib/pdf/split');
      return splitPdf(primary.name, primary.bytes, {
        mode: options.splitMode,
        ranges: options.splitRanges,
        size: options.splitSize,
        splitAt: options.splitAt,
        password: primary.password,
        onProgress: (done, total) => report('Writing files', done, total),
      });
    }

    case 'rotate-pdf': {
      const { rotatePages } = await import('@/lib/pdf/organize');
      const { parsePageRanges: parse } = await import('@/lib/ranges');
      report('Rotating', 1, 2);
      const indices = parse(options.pages, primary.pageCount ?? 0);
      const data = await rotatePages(primary.bytes, indices, options.rotation, {
        password: primary.password,
      });
      report('Rotating', 2, 2);
      return [{ name: `${stem}-rotated.pdf`, data }];
    }

    case 'crop-pdf': {
      const { cropPdf } = await import('@/lib/pdf/crop');
      report('Cropping', 1, 2);
      const data = await cropPdf(primary.bytes, {
        mode: 'margins',
        unit: options.cropUnit,
        margins: {
          top: options.cropTop,
          right: options.cropRight,
          bottom: options.cropBottom,
          left: options.cropLeft,
        },
        pages: options.pages,
        password: primary.password,
      });
      report('Cropping', 2, 2);
      return [{ name: `${stem}-cropped.pdf`, data }];
    }

    case 'watermark-pdf': {
      const { addWatermark } = await import('@/lib/pdf/watermark');
      report('Stamping', 1, 2);
      const data = await addWatermark(primary.bytes, {
        kind: options.wmKind,
        text: options.wmText,
        imageBytes: options.wmImage?.bytes,
        position: options.wmPosition,
        angle: options.wmAngle,
        opacity: options.wmOpacity,
        fontSize: options.wmFontSize,
        color: options.wmColor,
        imageScale: options.wmScale,
        tile: options.wmTile,
        behindContent: options.wmBehind,
        pages: options.pages,
        password: primary.password,
      });
      report('Stamping', 2, 2);
      return [{ name: `${stem}-watermarked.pdf`, data }];
    }

    case 'page-numbers': {
      const { addPageNumbers } = await import('@/lib/pdf/pageNumbers');
      report('Numbering', 1, 2);
      const data = await addPageNumbers(primary.bytes, {
        position: options.pnPosition,
        format: options.pnFormat,
        fontSize: options.pnFontSize,
        fontFamily: options.pnFontFamily,
        bold: options.pnBold,
        color: options.pnColor,
        margin: options.pnMargin,
        startAt: options.pnStartAt,
        pages: options.pages,
        password: primary.password,
      });
      report('Numbering', 2, 2);
      return [{ name: `${stem}-numbered.pdf`, data }];
    }

    case 'pdf-to-jpg': {
      const { pdfToImages } = await import('@/lib/pdf/images');
      const { parsePageRanges: parse } = await import('@/lib/ranges');
      const selection = options.pages.trim()
        ? parse(options.pages, primary.pageCount ?? 0)
        : undefined;
      return pdfToImages(primary.name, primary.bytes, {
        dpi: options.imgDpi,
        format: options.imgFormat,
        quality: options.imgQuality,
        pages: selection,
        password: primary.password,
        onProgress: (done, total) => report('Rendering pages', done, total),
      });
    }

    case 'jpg-to-pdf': {
      const { imagesToPdf } = await import('@/lib/pdf/images');
      const data = await imagesToPdf(
        files.map((file) => ({ name: file.name, bytes: file.bytes })),
        {
          pageSize: options.pageSize,
          orientation: options.orientation,
          margin: options.margin,
          onProgress: (done, total) => report('Adding images', done, total),
        },
      );
      return [{ name: 'images.pdf', data }];
    }

    case 'protect-pdf': {
      const { protectPdf } = await import('@/lib/pdf/protect');
      report('Encrypting', 1, 2);
      const data = await protectPdf(primary.bytes, {
        userPassword: options.password,
        ownerPassword: options.ownerPassword || undefined,
        currentPassword: primary.password,
        permissions: {
          printing: options.allowPrinting,
          highQualityPrinting: options.allowPrinting,
          copying: options.allowCopying,
          modifying: options.allowModifying,
          annotating: options.allowAnnotating,
          fillingForms: options.allowForms,
          contentAccessibility: true,
          documentAssembly: options.allowModifying,
        },
      });
      report('Encrypting', 2, 2);
      setNote('The file is encrypted with AES-256. Keep the password safe — it cannot be recovered.');
      return [{ name: `${stem}-protected.pdf`, data }];
    }

    case 'unlock-pdf': {
      const { unlockPdf } = await import('@/lib/pdf/protect');
      report('Decrypting', 1, 2);
      const result = await unlockPdf(primary.bytes, primary.password);
      report('Decrypting', 2, 2);
      return [{ name: `${stem}-unlocked.pdf`, data: result.data }];
    }

    case 'flatten-pdf': {
      const { flattenPdf } = await import('@/lib/pdf/flatten');
      const data = await flattenPdf(primary.bytes, {
        mode: options.flattenMode,
        password: primary.password,
        onProgress: (done, total) => report('Flattening', done, total),
      });
      return [{ name: `${stem}-flattened.pdf`, data }];
    }

    case 'compress-pdf': {
      const { compressPdf } = await import('@/lib/pdf/compress');
      const result = await compressPdf(primary.bytes, {
        mode: options.compressMode,
        level: options.compressLevel,
        password: primary.password,
        onProgress: (done, total) => report('Compressing', done, total),
      });
      const { formatBytes } = await import('@/lib/utils');
      setNote(
        result.savedPercent > 0
          ? `${formatBytes(result.originalSize)} → ${formatBytes(result.newSize)}, ${result.savedPercent}% smaller.`
          : `This file was already well optimised — the result is ${formatBytes(result.newSize)}. Try a stronger setting for a bigger saving.`,
      );
      return [{ name: `${stem}-compressed.pdf`, data: result.data }];
    }

    case 'grayscale-pdf': {
      const { grayscalePdf } = await import('@/lib/pdf/grayscale');
      const data = await grayscalePdf(primary.bytes, {
        dpi: options.imgDpi,
        password: primary.password,
        onProgress: (done, total) => report('Converting pages', done, total),
      });
      return [{ name: `${stem}-grayscale.pdf`, data }];
    }

    case 'ocr-pdf': {
      const { ocrPdf } = await import('@/lib/pdf/ocr');
      const result = await ocrPdf(primary.bytes, {
        language: options.ocrLanguage,
        dpi: options.ocrDpi,
        password: primary.password,
        onProgress: (progress) =>
          report(
            progress.stage === 'render'
              ? 'Rendering pages'
              : progress.stage === 'recognise'
                ? `Recognising text on page ${progress.page}`
                : 'Writing text layer',
            progress.page,
            progress.totalPages,
          ),
      });
      setNote(`${result.wordCount} words recognised and added as a searchable layer.`);
      return [{ name: `${stem}-searchable.pdf`, data: result.data }];
    }

    case 'repair-pdf': {
      const { repairPdf } = await import('@/lib/pdf/repair');
      const result = await repairPdf(primary.bytes, {
        password: primary.password,
        onProgress: (label, done, total) => report(label, done, total),
      });
      const strategyLabel =
        result.strategy === 'resave'
          ? 'the file structure was rebuilt with everything intact'
          : result.strategy === 'page-copy'
            ? `${result.pagesRecovered} pages were recovered individually`
            : 'only the rendered appearance could be recovered';
      setNote(`Recovered — ${strategyLabel}.`);
      return [{ name: `${stem}-repaired.pdf`, data: result.data }];
    }

    case 'extract-text': {
      const { extractText } = await import('@/lib/pdf/compare');
      const { parsePageRanges: parse } = await import('@/lib/ranges');
      const pages = await extractText(primary.bytes, primary.password, (done, total) =>
        report('Reading pages', done, total),
      );
      const selection = options.pages.trim()
        ? new Set(parse(options.pages, pages.length))
        : null;

      const text = pages
        .map((content, index) =>
          !selection || selection.has(index)
            ? `----- Page ${index + 1} -----\n${content}\n`
            : null,
        )
        .filter(Boolean)
        .join('\n');

      return [
        {
          name: `${stem}.txt`,
          data: new TextEncoder().encode(text),
          mime: 'text/plain;charset=utf-8',
        },
      ];
    }

    default:
      throw new Error(`No runner is registered for "${slug}".`);
  }
}
