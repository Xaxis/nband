import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nband.space'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The ingest endpoints are signed-write-only and the telemetry read is
        // a live query; neither is useful to a crawler and both cost the grid.
        disallow: ['/api/'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  }
}
