/**
 * The site's information architecture, in one place.
 *
 * Sidebar, previous/next links, breadcrumbs, the documentation index, the
 * footer, and the sitemap are all generated from this. That is not tidiness for
 * its own sake: the footer previously linked to two pages that did not exist,
 * because the footer kept its own hand-written list. A single manifest makes
 * that class of mistake impossible to write, and `tools/check-links.mjs` fails
 * the build if any entry here points at a route that is not on disk.
 *
 * Routes are flat rather than nested under /docs. The shared chrome comes from
 * the (docs) route group, which gives every page the same shell without putting
 * a prefix in front of URLs people will paste into build threads.
 */

export interface NavItem {
  href: string
  label: string
  /** One line, used on the index and in link cards. */
  summary: string
  /** Who this page is written for. Shown on the index. */
  audience?: string
  /** Live data rather than reference material. */
  live?: boolean
}

export interface NavSection {
  id: string
  label: string
  summary: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    id: 'start',
    label: 'Start here',
    summary: 'What the platform is and whether you want one.',
    items: [
      {
        href: '/docs',
        label: 'Overview',
        summary: 'How the pieces fit together, and the shortest path through them.',
      },
      {
        href: '/bands',
        label: 'The fourteen bands',
        summary:
          'What each band physically detects, how far it reaches, what weather kills it, and what it costs to open.',
        audience: 'Deciding whether to build one',
      },
      {
        href: '/discriminator',
        label: 'How verdicts work',
        summary:
          'Known-source subtraction, hypothesis scoring, and the four gates guarding the top of the ladder. Runs live.',
        audience: 'Anyone who wants to trust the archive',
      },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    summary: 'Everything needed to put a node in the sky.',
    items: [
      {
        href: '/hardware',
        label: 'Hardware and BOM',
        summary:
          'Three tiers with sourced prices, wiring diagrams, pinout, and the power budget. Generated from the registry.',
        audience: 'Pricing a build',
      },
      {
        href: '/build',
        label: 'Build guide',
        summary:
          'Ten ordered steps, each ending in something you can verify before spending money on the next.',
        audience: 'Mid-build, soldering iron down',
      },
      {
        href: '/software',
        label: 'Software and config',
        summary: 'Flashing, the configuration file, trigger thresholds, and calibration.',
        audience: 'Node running, changing behaviour',
      },
      {
        href: '/hardware/variants',
        label: 'Variant registry',
        summary:
          'Every part the grid knows how to calibrate, including community substitutes, and how to register one.',
        audience: 'Building with different parts',
      },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    summary: 'The contracts everything else is written against.',
    items: [
      {
        href: '/reference/schema',
        label: 'Data schema',
        summary:
          'The contract shared by every node, the database, the discriminator, and this site. What each table means.',
        audience: 'Reading or writing the archive',
      },
      {
        href: '/reference/api',
        label: 'API reference',
        summary: 'The four signed endpoints a node speaks to the grid, and the public read surface.',
        audience: 'Writing a client',
      },
    ],
  },
  {
    id: 'live',
    label: 'Live data',
    summary: 'What the grid is doing right now.',
    items: [
      {
        href: '/archive',
        label: 'The archive',
        summary: 'Every event recorded, the verdict reached, and the reasoning behind it.',
      },
      {
        href: '/grid',
        label: 'The grid',
        summary: 'Every node reporting, and whether its clock is good enough to contribute geometry.',
        live: true,
      },
      {
        href: '/telemetry',
        label: 'Live telemetry',
        summary: 'Band-by-band charts with historical scrub and discriminator verdicts overlaid.',
        live: true,
      },
    ],
  },
  {
    id: 'participate',
    label: 'Participate',
    summary: 'Extending the platform, and the rules that keep it honest.',
    items: [
      {
        href: '/contribute',
        label: 'Contributing',
        summary: 'Adding variants, drivers, catalogues, and documentation without breaking the archive.',
      },
      {
        href: '/safety',
        label: 'Safety and regulation',
        summary: 'Optical, radio, electrical, and radiological hazards, and the rules covering each.',
      },
    ],
  },
]

/** Flattened reading order, used for previous/next. */
export const NAV_FLAT: NavItem[] = NAV.flatMap((s) => s.items)

export function findNav(pathname: string): {
  section: NavSection
  item: NavItem
  prev: NavItem | null
  next: NavItem | null
} | null {
  for (const section of NAV) {
    const item = section.items.find((i) => i.href === pathname)
    if (!item) continue
    const idx = NAV_FLAT.findIndex((i) => i.href === item.href)
    return {
      section,
      item,
      prev: idx > 0 ? NAV_FLAT[idx - 1] : null,
      next: idx < NAV_FLAT.length - 1 ? NAV_FLAT[idx + 1] : null,
    }
  }
  return null
}

/** Every route the manifest claims exists. Checked against disk in CI. */
export const ALL_HREFS: string[] = NAV_FLAT.map((i) => i.href)
