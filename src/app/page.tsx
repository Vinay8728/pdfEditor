import Link from 'next/link';
import { ArrowRight, Cpu, Lock, Zap } from 'lucide-react';
import { GROUP_LABELS, POPULAR_TOOLS, toolsByGroup } from '@/lib/tools';

const PROMISES = [
  {
    Icon: Lock,
    title: 'Your files stay with you',
    body: 'Every core tool runs inside this browser tab. Nothing is uploaded, so there is nothing to leak, nothing to delete later, and no file-size queue.',
  },
  {
    Icon: Zap,
    title: 'No waiting, no accounts',
    body: 'Work starts the moment you drop a file. There is no sign-up, no watermark on the output, and no daily limit.',
  },
  {
    Icon: Cpu,
    title: 'Real edits, not overlays',
    body: 'Text stays selectable, redactions genuinely destroy content, and passwords are real AES encryption — not a viewer setting.',
  },
];

export default function HomePage() {
  const groups = toolsByGroup();

  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-500/10 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Runs entirely in your browser
          </span>

          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Every PDF tool you need,{' '}
            <span className="text-brand-600 dark:text-brand-400">without the upload</span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Merge, split, edit, sign, redact, compress and convert PDF files. The work happens on
            your own device, so your documents never travel anywhere.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/t/edit-pdf/"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              Open the editor
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="#all-tools"
              className="inline-flex h-12 items-center rounded-lg border border-line bg-surface px-6 font-medium transition hover:bg-surface2"
            >
              Browse all tools
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Most used</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/t/${tool.slug}/`}
              className="card group flex flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-pop"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <tool.Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="font-semibold">{tool.name}</span>
              <span className="text-sm text-muted">{tool.tagline}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:grid-cols-3">
          {PROMISES.map(({ Icon, title, body }) => (
            <div key={title}>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="all-tools" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">All tools</h2>
        <p className="mt-1 text-muted">
          {groups.reduce((total, group) => total + group.tools.length, 0)} tools, grouped by what
          they do.
        </p>

        <div className="mt-8 space-y-10">
          {groups.map(({ group, tools }) => (
            <div key={group}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {GROUP_LABELS[group]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <Link
                    key={tool.slug}
                    href={`/t/${tool.slug}/`}
                    className="card flex gap-3 p-4 transition hover:border-brand-400 hover:shadow-pop"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface2 text-muted">
                      <tool.Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-semibold">
                        {tool.name}
                        {!tool.clientSide && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            Server
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{tool.tagline}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
