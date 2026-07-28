import type { Metadata } from 'next'

/**
 * Page metadata, set in one place per page.
 *
 * Next does not derive `openGraph.title` from `title`, and a parent's
 * openGraph.title template only applies to pages that set openGraph.title
 * themselves. The result was that every page on the site shared one Open Graph
 * title, so any link shared anywhere claimed to be the homepage. This helper
 * exists so a page states its title once and the document title, the Open Graph
 * title, and the Twitter title all follow.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string
  description: string
  /** Absolute path, used for the canonical URL. */
  path?: string
}): Metadata {
  // The site suffix comes from the openGraph.title template in the root
  // layout, so the bare title is passed here. Appending it as well produced
  // "Data schema, nband, nband".
  return {
    title,
    description, ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: { title, description, ...(path ? { url: path } : {}) },
    twitter: { title, description },
  }
}
