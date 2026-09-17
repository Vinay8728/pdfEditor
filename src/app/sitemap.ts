import type { MetadataRoute } from 'next';
import { TOOLS } from '@/lib/tools';

// Required for `output: 'export'` — the sitemap is written once at build time.
export const dynamic = 'force-static';

const BASE = 'https://vinaybi.in';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: `${BASE}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/editor/`, lastModified, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/privacy/`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    ...TOOLS.map((tool) => ({
      url: `${BASE}/t/${tool.slug}/`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: tool.popular ? 0.9 : 0.7,
    })),
  ];
}
