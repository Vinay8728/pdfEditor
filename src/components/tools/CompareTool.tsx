'use client';

import { useState } from 'react';
import { Eye, GitCompare } from 'lucide-react';
import type { PanelProps } from './ToolWorkbench';
import { Alert, Button, Spinner } from '@/components/ui/controls';
import type { CompareResult } from '@/lib/pdf/compare';
import { cn } from '@/lib/utils';

export function CompareTool({ files, busy, setError }: PanelProps) {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [visual, setVisual] = useState<{ page: number; url: string; difference: number } | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);

  const [left, right] = files;
  const ready = files.length === 2;

  const compare = async () => {
    if (!ready) return;
    setError(null);
    setResult(null);
    setVisual(null);
    setRunning(true);
    try {
      const { comparePdfs } = await import('@/lib/pdf/compare');
      const output = await comparePdfs(left.bytes, right.bytes, {
        leftPassword: left.password,
        rightPassword: right.password,
        onProgress: (label, done, total) => setStatus(`${label} — ${done}/${total}`),
      });
      setResult(output);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The comparison failed.');
    } finally {
      setRunning(false);
      setStatus('');
    }
  };

  const showVisual = async (pageIndex: number) => {
    setVisualBusy(true);
    setError(null);
    try {
      const { visualDiffPage } = await import('@/lib/pdf/compare');
      const diff = await visualDiffPage(left.bytes, right.bytes, pageIndex, {
        leftPassword: left.password,
        rightPassword: right.password,
      });
      if (diff) setVisual({ page: pageIndex, url: diff.imageUrl, difference: diff.difference });
      else setError('That page does not exist in both documents.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The visual comparison failed.');
    } finally {
      setVisualBusy(false);
    }
  };

  if (!ready) {
    return (
      <Alert tone="info" title="Add two files">
        Drop the original and the revised PDF above. The first file is treated as the original.
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Original</p>
          <p className="mt-0.5 truncate text-sm font-medium">{left.name}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface2 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Revision</p>
          <p className="mt-0.5 truncate text-sm font-medium">{right.name}</p>
        </div>
      </div>

      <Button
        onClick={compare}
        loading={running || busy}
        disabled={running || busy}
        icon={<GitCompare className="h-4 w-4" />}
      >
        Compare documents
      </Button>

      {status && <p className="text-sm text-muted">{status}</p>}

      {result && (
        <div className="space-y-4">
          {result.identical ? (
            <Alert tone="success" title="No text differences">
              Both documents contain the same text on every page. Layout or image changes may still
              exist — check a page visually below.
            </Alert>
          ) : (
            <Alert tone="info">
              <strong className="text-emerald-600 dark:text-emerald-400">
                +{result.totalAdded} added
              </strong>{' '}
              ·{' '}
              <strong className="text-red-600 dark:text-red-400">
                −{result.totalRemoved} removed
              </strong>{' '}
              across {result.pages.length} pages.
            </Alert>
          )}

          <div className="space-y-3">
            {result.pages.map((page) => {
              const unchanged = page.addedWords === 0 && page.removedWords === 0;
              return (
                <details
                  key={page.pageNumber}
                  open={!unchanged}
                  className="rounded-lg border border-line bg-surface2"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                    <span className="text-sm font-semibold">Page {page.pageNumber}</span>
                    {unchanged ? (
                      <span className="text-xs text-muted">unchanged</span>
                    ) : (
                      <span className="text-xs">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{page.addedWords}
                        </span>{' '}
                        <span className="text-red-600 dark:text-red-400">
                          −{page.removedWords}
                        </span>
                      </span>
                    )}
                    {(!page.leftExists || !page.rightExists) && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-300">
                        {page.leftExists ? 'Only in original' : 'Only in revision'}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      icon={<Eye className="h-3.5 w-3.5" />}
                      onClick={(event) => {
                        event.preventDefault();
                        void showVisual(page.pageNumber - 1);
                      }}
                      disabled={visualBusy || !page.leftExists || !page.rightExists}
                    >
                      Visual diff
                    </Button>
                  </summary>

                  <div className="max-h-72 overflow-y-auto border-t border-line p-3 text-sm leading-relaxed scroll-thin">
                    {page.tokens.length === 0 ? (
                      <p className="text-muted">This page has no extractable text.</p>
                    ) : (
                      page.tokens.map((token, index) => (
                        <span
                          key={index}
                          className={cn(
                            token.kind === 'added' &&
                              'rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-200',
                            token.kind === 'removed' &&
                              'rounded bg-red-500/20 text-red-800 line-through dark:text-red-200',
                            token.kind === 'same' && 'text-muted',
                          )}
                        >
                          {token.text}{' '}
                        </span>
                      ))
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {visualBusy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Rendering both pages…
        </p>
      )}

      {visual && (
        <div>
          <p className="mb-2 text-sm">
            Page {visual.page + 1} — {(visual.difference * 100).toFixed(2)}% of pixels differ.{' '}
            <span className="text-muted">Differences are marked in red.</span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visual.url}
            alt={`Visual differences on page ${visual.page + 1}`}
            className="w-full rounded-lg border border-line bg-white"
          />
        </div>
      )}
    </div>
  );
}
