'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import { Alert, Button, Spinner } from '@/components/ui/controls';
import type { PdfHealth } from '@/lib/pdf/repair';
import { formatBytes } from '@/lib/utils';

interface Report {
  health: PdfHealth;
  fieldCount: number;
  pageSizes: { label: string; count: number }[];
}

export function DocumentInfoTool({ files, setError }: PanelProps) {
  const file = files[0];
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const inspect = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const [{ inspectPdf }, { readFormFields }, { loadPdfDocument }] = await Promise.all([
        import('@/lib/pdf/repair'),
        import('@/lib/pdf/forms'),
        import('@/lib/pdf/pdfjs'),
      ]);

      const health = await inspectPdf(file.bytes, file.password);

      let fieldCount = 0;
      try {
        fieldCount = (await readFormFields(file.bytes, file.password)).length;
      } catch {
        // A document that will not open structurally still gets a report.
      }

      const sizes = new Map<string, number>();
      if (health.readable) {
        const doc = await loadPdfDocument(file.bytes, { password: file.password });
        for (let i = 1; i <= doc.numPages; i += 1) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const label = describeSize(viewport.width, viewport.height);
          sizes.set(label, (sizes.get(label) ?? 0) + 1);
          page.cleanup();
        }
        await doc.destroy();
      }

      setReport({
        health,
        fieldCount,
        pageSizes: Array.from(sizes, ([label, count]) => ({ label, count })).sort(
          (a, b) => b.count - a.count,
        ),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'This file could not be inspected.');
    } finally {
      setLoading(false);
    }
  }, [file, setError]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Inspecting the document…
      </p>
    );
  }

  if (!report) return null;

  const { health } = report;

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pages" value={String(health.pageCount)} />
        <Stat label="File size" value={formatBytes(file.size)} />
        <Stat label="Encrypted" value={health.encrypted ? 'Yes' : 'No'} />
        <Stat label="Form fields" value={String(report.fieldCount)} />
      </dl>

      {report.pageSizes.length > 0 && (
        <div>
          <p className="label">Page sizes</p>
          <ul className="space-y-1 text-sm">
            {report.pageSizes.map((size) => (
              <li key={size.label} className="flex justify-between border-b border-line py-1.5">
                <span>{size.label}</span>
                <span className="tabular-nums text-muted">
                  {size.count} page{size.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {health.problems.length > 0 ? (
        <Alert tone="warning" title="Issues found">
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {health.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Try the Repair tool if this file will not open elsewhere.</p>
        </Alert>
      ) : (
        <Alert tone="success" title="No structural problems found">
          The file parses cleanly and every page can be rendered.
        </Alert>
      )}

      <Button variant="secondary" onClick={() => void inspect()} icon={<RefreshCw className="h-4 w-4" />}>
        Inspect again
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface2 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Names the common paper sizes, within a couple of points of tolerance. */
function describeSize(width: number, height: number): string {
  const known: { name: string; w: number; h: number }[] = [
    { name: 'A3', w: 841.89, h: 1190.55 },
    { name: 'A4', w: 595.28, h: 841.89 },
    { name: 'A5', w: 419.53, h: 595.28 },
    { name: 'Letter', w: 612, h: 792 },
    { name: 'Legal', w: 612, h: 1008 },
    { name: 'Tabloid', w: 792, h: 1224 },
  ];

  const mm = (points: number) => Math.round((points / 72) * 25.4);

  for (const entry of known) {
    const portrait = Math.abs(width - entry.w) < 3 && Math.abs(height - entry.h) < 3;
    const landscape = Math.abs(width - entry.h) < 3 && Math.abs(height - entry.w) < 3;
    if (portrait) return `${entry.name} portrait`;
    if (landscape) return `${entry.name} landscape`;
  }

  return `${mm(width)} × ${mm(height)} mm`;
}
