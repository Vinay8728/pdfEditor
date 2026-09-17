import Link from 'next/link';
import { GROUP_LABELS, toolsByGroup } from '@/lib/tools';

export function SiteFooter() {
  const groups = toolsByGroup();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-surface no-print">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map(({ group, tools }) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {GROUP_LABELS[group]}
              </p>
              <ul className="space-y-1">
                {tools.map((tool) => (
                  <li key={tool.slug}>
                    <Link
                      href={`/t/${tool.slug}/`}
                      className="text-sm text-muted transition hover:text-fg"
                    >
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} pdfEditor. Built for privacy — your files stay on your device.</p>
          <div className="flex gap-4">
            <Link href="/privacy/" className="transition hover:text-fg">
              Privacy
            </Link>
            <a
              href="https://github.com/Vinay8728/pdfEditor"
              target="_blank"
              rel="noreferrer noopener"
              className="transition hover:text-fg"
            >
              Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
