import type { MetadataRoute } from 'next'
import { listDocs } from '../lib/content'
import { NAV_FLAT } from '../lib/nav'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nband.space'

/**
 * Generated from the navigation manifest, not from a second hand-written list.
 *
 * The first version kept its own array and immediately fell behind: it was
 * still emitting /schema and /api after those pages moved under /reference, and
 * it never knew about /docs at all. tools/check-links.mjs now asserts that
 * every route in the manifest appears here, so the two cannot drift again.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Documents carry their own last-edited date; everything else uses today.
  const docDates = new Map(listDocs().map((d) => [d.slug, d.updated]))

  const priorityFor = (href: string) =>
    href === '/docs' || href === '/bands' || href === '/hardware' || href === '/build' ? 0.9 : 0.7

  return [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...NAV_FLAT.map((item) => {
      const slug = item.href.split('/').pop() ?? ''
      const updated = docDates.get(slug)
      return {
        url: `${SITE}${item.href}`,
        lastModified: updated ? new Date(updated) : now,
        changeFrequency: (item.live ? 'daily' : 'monthly') as 'daily' | 'monthly',
        priority: priorityFor(item.href),
      }
    }),
  ]
}
