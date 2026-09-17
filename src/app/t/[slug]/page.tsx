import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TOOLS, getTool } from '@/lib/tools';
import { ToolWorkbench } from '@/components/tools/ToolWorkbench';

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return { title: 'Tool not found' };

  return {
    title: tool.name,
    description: tool.description,
    alternates: { canonical: `/t/${tool.slug}/` },
    openGraph: { title: `${tool.name} — pdfEditor`, description: tool.description },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1 text-sm text-muted">
        <Link href="/" className="transition hover:text-fg">
          Tools
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span className="text-fg">{tool.name}</span>
      </nav>

      <header className="mb-7 flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
          <tool.Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1.5 max-w-3xl text-muted">{tool.description}</p>
        </div>
      </header>

      <ToolWorkbench slug={tool.slug} />
    </div>
  );
}
