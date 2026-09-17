'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileStack, Menu, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { GROUP_LABELS, toolsByGroup } from '@/lib/tools';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const groups = toolsByGroup();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur no-print">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <FileStack className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span>pdfEditor</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-fg"
            >
              All tools
              <ChevronDown
                className={cn('h-4 w-4 transition', menuOpen && 'rotate-180')}
                aria-hidden
              />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-1 w-[min(74vw,58rem)] animate-fade-in rounded-xl border border-line bg-surface p-4 shadow-pop">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-3">
                  {groups.map(({ group, tools }) => (
                    <div key={group}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {GROUP_LABELS[group]}
                      </p>
                      <ul className="space-y-0.5">
                        {tools.map((tool) => (
                          <li key={tool.slug}>
                            <Link
                              href={`/t/${tool.slug}/`}
                              onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg transition hover:bg-surface2"
                            >
                              <tool.Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                              {tool.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/t/edit-pdf/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-fg"
          >
            Editor
          </Link>
          <Link
            href="/privacy/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-fg"
          >
            Privacy
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 lg:inline">
            Files never leave your device
          </span>
          <ThemeToggle />
          <button
            type="button"
            className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-fg md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="max-h-[70vh] overflow-y-auto border-t border-line bg-surface px-4 py-3 md:hidden scroll-thin">
          {groups.map(({ group, tools }) => (
            <div key={group} className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {GROUP_LABELS[group]}
              </p>
              <ul className="grid grid-cols-2 gap-1">
                {tools.map((tool) => (
                  <li key={tool.slug}>
                    <Link
                      href={`/t/${tool.slug}/`}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition hover:bg-surface2"
                    >
                      <tool.Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
