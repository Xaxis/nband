#!/usr/bin/env node
// Builds the client-side search index from real content.
//
// Everything searchable on this site already exists as structured data: the
// navigation manifest, the band taxonomy, the hardware registry, the
// classification ladder, and the headings inside the flat-file documents. So
// the index is generated from those rather than maintained by hand, which
// means a new band or part becomes searchable by existing rather than by
// somebody remembering to add it.
//
// Output is a single JSON file imported by the search dialog. At this size
// (a few hundred entries) that is far simpler and faster than a search service,
// and it works offline.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

const bands = read('schema/bands.json')
const spec = read('schema/spec.json')
const hardware = read('schema/hardware.json')

const entries = []
const add = (e) => entries.push(e)

// --- pages, from the navigation manifest ------------------------------------

const navSrc = readFileSync(resolve(root, 'apps/web/lib/nav.ts'), 'utf8')
for (const m of navSrc.matchAll(
  /href:\s*'(\/[^']*)',\s*\n\s*label:\s*'([^']*)',\s*\n\s*summary:\s*\n?\s*'([^']*)'/g,
)) {
  add({ kind: 'page', title: m[2], href: m[1], text: m[3] })
}

// --- headings inside the documents ------------------------------------------

const contentDir = resolve(root, 'content')
// Where each document is actually routed. A heading is useless if the link
// under it 404s, which is what happened when schema.md and api.md were written
// before their routes existed.
const DOC_ROUTES = {
  build: '/build',
  software: '/software',
  safety: '/safety',
  contribute: '/contribute',
  schema: '/reference/schema',
  api: '/reference/api',
}

function slugify(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

if (existsSync(contentDir)) {
  for (const file of readdirSync(contentDir).filter((f) => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '')
    const href = DOC_ROUTES[slug]
    if (!href) {
      console.error(`search: content/${file} has no route in DOC_ROUTES; skipping`)
      continue
    }
    const src = readFileSync(join(contentDir, file), 'utf8')
    const docTitle = (src.match(/^title:\s*(.+)$/m)?.[1] ?? slug).replace(/^["']|["']$/g, '')

    // Split on H2s so each section carries its own body text as context.
    const sections = src.split(/^## /m).slice(1)
    for (const section of sections) {
      const heading = section.split('\n')[0].trim()
      const body = section.slice(heading.length).replace(/[#*`>\[\]()]/g, ' ').replace(/\s+/g, ' ')
      add({
        kind: 'section',
        title: heading,
        href: `${href}#${slugify(heading)}`,
        parent: docTitle,
        text: body.slice(0, 400),
      })
    }
  }
}

// --- panels inside the panelled pages ---------------------------------------
//
// /hardware and /bands are TSX rather than markdown, so the walk above indexed
// them as a single entry each: the nav summary, pointing at a bare route. That
// summary promises "wiring diagrams, pinout, and the power budget", none of
// which is visible when you land, and DocTabs renders closed panels `hidden`,
// which takes them out of find-on-page too. Searching "pinout" returned the
// page and dropped the reader on the bill of materials with no onward signal,
// and "carrier board" returned nothing at all.
//
// The tab definitions are the real source, so they are read from it. The hint
// each panel already carries is written as a one-line description of that
// panel, which is exactly what a search snippet is.
const PANELLED = { '/hardware': 'Hardware', '/bands': 'Bands' }
let panelCount = 0
for (const [route, parent] of Object.entries(PANELLED)) {
  const src = readFileSync(resolve(root, `apps/web/app/(docs)${route}/page.tsx`), 'utf8')
  // Matches the tab object literal: id, then label, then hint, in that order.
  // The label alternation covers the template-literal form, which one tab uses
  // to interpolate a band count; matching only quoted strings dropped it and
  // left the largest panel on /bands unfindable.
  const re =
    /id:\s*'([a-z0-9-]+)',\s*\n\s*label:\s*(?:'([^']*)'|`([^`]*)`),\s*\n\s*hint:\s*\n?\s*'([^']*)'/g
  for (const m of src.matchAll(re)) {
    // A template literal keeps its ${...} as written. Strip the interpolation
    // rather than print it: "All ${DETECTION_BANDS.length} bands" as a search
    // result title is worse than "All bands".
    const title = (m[2] ?? m[3]).replace(/\$\{[^}]*\}\s*/g, '').replace(/\s+/g, ' ').trim()
    add({ kind: 'section', title, href: `${route}#${m[1]}`, parent, text: m[4] })
    panelCount += 1
  }
}
if (panelCount === 0) {
  // A silently empty match here would restore the exact gap this block closes,
  // and it would look like a working index.
  throw new Error('no DocTabs panels matched: the tab literal shape changed, so panels are unindexed')
}

// --- bands ------------------------------------------------------------------

for (const b of bands.bands) {
  add({
    kind: 'band',
    title: b.label,
    href: `/bands#${b.id}`,
    parent: 'Bands',
    text: `${b.shortDescription} ${b.whatItSees} ${b.limits} ${b.unitDefault} ${b.typicalSensors.join(' ')}`,
  })
}

// --- parts ------------------------------------------------------------------

for (const p of hardware.parts) {
  add({
    kind: 'part',
    title: p.model,
    href: p.tiers?.length ? `/hardware#${p.tiers[0]}` : '/hardware/variants',
    parent: p.vendor,
    text: `${p.notes} ${p.interface} ${p.driver ?? ''} ${p.category} ${Object.values(p.keySpecs ?? {}).join(' ')}`,
    meta: p.priceUsd ? `$${p.priceUsd.toFixed(0)}` : undefined,
  })
}

// --- concepts: the enums people will actually search for --------------------

// Every one of these used to point at a bare '/discriminator'. Fourteen results
// all landed the reader at the top of a six-and-a-half-thousand-pixel page with
// no indication of where the thing they searched for actually was, which is a
// search index that finds the page rather than the answer.
for (const v of spec.enums.classification.values) {
  add({
    kind: 'concept',
    title: v.label,
    href: `/discriminator#class-${v.id}`,
    parent: 'Classification',
    text: v.summary,
  })
}
for (const v of spec.enums.catalogSource.values) {
  add({
    kind: 'concept',
    title: v.label,
    href: `/discriminator#catalog-${v.id}`,
    parent: 'Catalogue',
    text: v.summary,
  })
}
for (const v of spec.enums.clockQuality.values) {
  add({
    kind: 'concept',
    title: v.label,
    href: '/reference/schema',
    parent: 'Clock quality',
    text: v.summary,
  })
}

// ---------------------------------------------------------------------------

const dest = resolve(root, 'apps/web/lib/search-index.json')
mkdirSync(dirname(dest), { recursive: true })
writeFileSync(dest, JSON.stringify({ entries }, null, 0) + '\n')

const byKind = entries.reduce((a, e) => ({ ...a, [e.kind]: (a[e.kind] ?? 0) + 1 }), {})
const kb = (readFileSync(dest, 'utf8').length / 1024).toFixed(1)
console.log(`Search index: ${entries.length} entries, ${kb} kB`)
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} ${k}`)
}
