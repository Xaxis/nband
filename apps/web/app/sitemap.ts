import type { MetadataRoute } from 'next'
import { listDocs } from '../lib/content'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nband.space'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const fixed = [
    { path: '', priority: 1.0, freq: 'weekly' as const },
    { path: '/bands', priority: 0.9, freq: 'monthly' as const },
    { path: '/hardware', priority: 0.9, freq: 'weekly' as const },
    { path: '/hardware/variants', priority: 0.7, freq: 'weekly' as const },
    { path: '/discriminator', priority: 0.8, freq: 'monthly' as const },
    { path: '/grid', priority: 0.7, freq: 'daily' as const },
    { path: '/telemetry', priority: 0.7, freq: 'daily' as const },
  ]

  return [
    ...fixed.map((f) => ({
      url: `${SITE}${f.path}`,
      lastModified: now,
      changeFrequency: f.freq,
      priority: f.priority,
    })),
    ...listDocs().map((d) => ({
      url: `${SITE}/${d.slug}`,
      lastModified: d.updated ? new Date(d.updated) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
