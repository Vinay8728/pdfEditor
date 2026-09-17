'use client';

import { useEffect, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import { Alert, Button, Field, Select, Spinner } from '@/components/ui/controls';
import { baseName, formatBytes } from '@/lib/utils';

interface EndpointStatus {
  configured: boolean;
  provider: string | null;
  formats: Record<string, string[]>;
  maxBytes: number;
  message: string;
}

const TARGET_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word (.docx)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
  txt: 'Plain text (.txt)',
  html: 'HTML',
};

export function ConvertTool({ files, busy, setError, slug }: PanelProps & { slug: string }) {
  const [status, setStatus] = useState<EndpointStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [target, setTarget] = useState('');
  const [converting, setConverting] = useState(false);

  const file = files[0];
  const sourceExt = file?.name.split('.').pop()?.toLowerCase() ?? '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/convert', { method: 'GET' });
        const body = (await response.json()) as EndpointStatus;
        if (!cancelled) setStatus(body);
      } catch {
        if (!cancelled) {
          setStatus({
            configured: false,
            provider: null,
            formats: {},
            maxBytes: 0,
            message:
              'The conversion endpoint could not be reached. It only exists on the deployed site, not in a plain static preview.',
          });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const available = status?.formats?.[sourceExt] ?? (slug === 'office-to-pdf' ? ['pdf'] : []);

  useEffect(() => {
    if (available.length > 0 && !available.includes(target)) setTarget(available[0]);
  }, [available, target]);

  const convert = async () => {
    if (!file || !target) return;
    setError(null);
    setConverting(true);
    try {
      const body = new FormData();
      const blobCopy = new Uint8Array(file.bytes.byteLength);
      blobCopy.set(file.bytes);
      body.append('file', new Blob([blobCopy]), file.name);
      body.append('from', sourceExt);
      body.append('to', target);

      const response = await fetch('/api/convert', { method: 'POST', body });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          (detail as { message?: string })?.message ??
            `The conversion service returned ${response.status}.`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${baseName(file.name)}.${target}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The conversion failed.');
    } finally {
      setConverting(false);
    }
  };

  if (checking) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Checking the conversion service…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Alert tone={status?.configured ? 'warning' : 'info'} title="This tool uses a server">
        <p>
          Office formats need a rendering engine that cannot run in a browser, so this is the one
          place where your file leaves your device. Every other tool on this site is fully local.
        </p>
        {!status?.configured && <p className="mt-2 font-medium">{status?.message}</p>}
      </Alert>

      {status?.configured && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <Select value={sourceExt} disabled>
                <option value={sourceExt}>{sourceExt.toUpperCase() || 'Unknown'}</option>
              </Select>
            </Field>
            <Field label="To">
              <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                {available.map((format) => (
                  <option key={format} value={format}>
                    {TARGET_LABELS[format] ?? format.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {available.length === 0 && (
            <Alert tone="warning">
              Files of type &ldquo;{sourceExt || 'unknown'}&rdquo; cannot be converted by this tool.
            </Alert>
          )}

          {file && status.maxBytes > 0 && file.size > status.maxBytes && (
            <Alert tone="error">
              This file is {formatBytes(file.size)}. The conversion endpoint accepts up to{' '}
              {formatBytes(status.maxBytes)}.
            </Alert>
          )}

          <div className="border-t border-line pt-4">
            <Button
              onClick={convert}
              loading={converting || busy}
              disabled={
                converting ||
                busy ||
                available.length === 0 ||
                (status.maxBytes > 0 && (file?.size ?? 0) > status.maxBytes)
              }
              icon={<CloudUpload className="h-4 w-4" />}
            >
              Convert with {status.provider}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
