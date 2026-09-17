'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Eraser, X } from 'lucide-react';
import { Button, Field, SegmentedControl, Select, TextInput, Toggle } from '@/components/ui/controls';
import { SIGNATURE_FONTS, type SignatureFontId } from '@/lib/pdf/sign';
import { readAsDataUrl } from '@/lib/files';

export function SignatureDialog({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (dataUrl: string) => void;
}) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedText, setTypedText] = useState('');
  const [fontId, setFontId] = useState<SignatureFontId>('cursive');
  const [colour, setColour] = useState('#1a1a2e');
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [knockout, setKnockout] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<number[][]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open) {
      strokes.current = [];
      setTypedText('');
      setUploaded(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== 'draw') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [mode, open]);

  if (!open) return null;

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes.current) {
      if (stroke.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0], stroke[1]);
      for (let i = 2; i < stroke.length; i += 2) ctx.lineTo(stroke[i], stroke[i + 1]);
      ctx.stroke();
    }
  };

  const apply = async () => {
    setError(null);
    try {
      if (mode === 'draw') {
        if (strokes.current.length === 0) {
          setError('Draw your signature first.');
          return;
        }
        const { strokesToDataUrl } = await import('@/lib/pdf/sign');
        const canvas = canvasRef.current;
        onApply(
          strokesToDataUrl(
            strokes.current,
            canvas?.width ?? 600,
            canvas?.height ?? 200,
            colour,
            3,
          ),
        );
        return;
      }

      if (mode === 'type') {
        if (!typedText.trim()) {
          setError('Type your name first.');
          return;
        }
        const { typedSignatureToDataUrl } = await import('@/lib/pdf/sign');
        onApply(typedSignatureToDataUrl(typedText, fontId, colour));
        return;
      }

      if (!uploaded) {
        setError('Choose an image first.');
        return;
      }
      if (knockout) {
        const { removeBackground } = await import('@/lib/pdf/sign');
        onApply(await removeBackground(uploaded));
      } else {
        onApply(uploaded);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That signature could not be created.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create a signature"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Create a signature</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'draw', label: 'Draw' },
              { value: 'type', label: 'Type' },
              { value: 'upload', label: 'Upload' },
            ]}
          />

          {mode === 'draw' && (
            <div>
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full cursor-crosshair rounded-lg border border-dashed border-line bg-white touch-none"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drawing.current = true;
                  const point = pointFrom(event);
                  strokes.current.push([point.x, point.y]);
                }}
                onPointerMove={(event) => {
                  if (!drawing.current) return;
                  const point = pointFrom(event);
                  strokes.current[strokes.current.length - 1].push(point.x, point.y);
                  redraw();
                }}
                onPointerUp={() => {
                  drawing.current = false;
                }}
                onPointerLeave={() => {
                  drawing.current = false;
                }}
              />
              <button
                type="button"
                onClick={() => {
                  strokes.current = [];
                  redraw();
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
              >
                <Eraser className="h-3.5 w-3.5" aria-hidden /> Clear
              </button>
            </div>
          )}

          {mode === 'type' && (
            <div className="space-y-3">
              <Field label="Your name">
                <TextInput
                  value={typedText}
                  onChange={(event) => setTypedText(event.target.value)}
                  placeholder="Alex Morgan"
                  autoFocus
                />
              </Field>
              <Field label="Style">
                <Select
                  value={fontId}
                  onChange={(event) => setFontId(event.target.value as SignatureFontId)}
                >
                  {SIGNATURE_FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div
                className="grid h-24 place-items-center rounded-lg border border-line bg-white px-4"
                style={{
                  fontFamily: SIGNATURE_FONTS.find((font) => font.id === fontId)?.css,
                  fontSize: 40,
                  color: colour,
                }}
              >
                {typedText || 'Preview'}
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <div className="space-y-3">
              <Field label="Signature image" hint="A photo or scan of a signature on white paper.">
                <input
                  type="file"
                  accept="image/*"
                  className="input file:mr-3 file:rounded file:border-0 file:bg-surface2 file:px-3 file:py-1 file:text-sm"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      setUploaded(await readAsDataUrl(file));
                    } catch {
                      setError('That image could not be read.');
                    }
                  }}
                />
              </Field>
              <Toggle
                checked={knockout}
                onChange={setKnockout}
                label="Remove the white background"
                hint="Makes the paper transparent so the signature sits over page content."
              />
              {uploaded && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={uploaded}
                  alt="Uploaded signature preview"
                  className="max-h-28 rounded-lg border border-line bg-white p-2"
                />
              )}
            </div>
          )}

          {mode !== 'upload' && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted">Ink colour</span>
              <input
                type="color"
                value={colour}
                onChange={(event) => {
                  setColour(event.target.value);
                  if (mode === 'draw') requestAnimationFrame(redraw);
                }}
                className="h-8 w-12 cursor-pointer rounded border border-line bg-surface p-0.5"
                aria-label="Ink colour"
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} icon={<Check className="h-4 w-4" />}>
            Place signature
          </Button>
        </div>
      </div>
    </div>
  );
}
