/**
 * Signature helpers. All three Sejda-style sources produce the same thing:
 * a trimmed PNG data URL with a transparent background, ready to drop on a page.
 */

export const SIGNATURE_FONTS = [
  { id: 'cursive', label: 'Signature', css: '"Segoe Script", "Brush Script MT", "Apple Chancery", cursive' },
  { id: 'formal', label: 'Formal', css: 'Georgia, "Times New Roman", serif' },
  { id: 'print', label: 'Print', css: '"Segoe UI", Helvetica, Arial, sans-serif' },
  { id: 'mono', label: 'Typewriter', css: '"Courier New", monospace' },
] as const;

export type SignatureFontId = (typeof SIGNATURE_FONTS)[number]['id'];

/** Renders typed text as a signature image. */
export function typedSignatureToDataUrl(
  text: string,
  fontId: SignatureFontId = 'cursive',
  color = '#1a1a2e',
): string {
  const font = SIGNATURE_FONTS.find((entry) => entry.id === fontId) ?? SIGNATURE_FONTS[0];
  const fontSize = 96;
  const padding = 24;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Canvas is unavailable in this browser.');
  measure.font = `${fontSize}px ${font.css}`;
  const width = Math.ceil(measure.measureText(text || ' ').width) + padding * 2;
  const height = Math.ceil(fontSize * 1.8);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  ctx.font = `${fontSize}px ${font.css}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, padding, height / 2);

  return trimTransparent(canvas).toDataURL('image/png');
}

/** Crops fully transparent margins so the signature sits tight in its box. */
export function trimTransparent(canvas: HTMLCanvasElement, alphaThreshold = 8): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return canvas; // Nothing drawn.

  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(canvas.width - 1, maxX + pad);
  maxY = Math.min(canvas.height - 1, maxY + pad);

  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas;
  outCtx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Knocks the white paper out of a photographed or scanned signature so it can
 * sit over page content instead of covering it with a white block.
 */
export async function removeBackground(
  dataUrl: string,
  threshold = 235,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('That image could not be read.'));
    element.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.drawImage(image, 0, 0);

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      pixels[i + 3] = 0;
    } else {
      // Feather near-white pixels so edges do not look cut out.
      const brightness = (r + g + b) / 3;
      if (brightness > threshold - 40) {
        pixels[i + 3] = Math.round(
          pixels[i + 3] * (1 - (brightness - (threshold - 40)) / 40),
        );
      }
    }
  }
  ctx.putImageData(frame, 0, 0);

  return trimTransparent(canvas).toDataURL('image/png');
}

/** Turns drawn strokes (in canvas pixels) into a transparent PNG. */
export function strokesToDataUrl(
  strokes: number[][],
  width: number,
  height: number,
  color = '#1a1a2e',
  lineWidth = 3,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.length < 4) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0], stroke[1]);
    for (let i = 2; i < stroke.length; i += 2) {
      ctx.lineTo(stroke[i], stroke[i + 1]);
    }
    ctx.stroke();
  }

  return trimTransparent(canvas).toDataURL('image/png');
}
