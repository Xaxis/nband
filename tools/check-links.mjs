#!/usr/bin/env node
// Every internal link must resolve to a route that exists on disk.
//
// This exists because the footer shipped links to /software/schema and
// /software/api, neither of which was ever built, and an earlier version of
// this check missed them: it only matched JSX `href="..."` attributes, and the
// footer built its links from an object literal. A checker that only finds the
// mistakes you thought of is worse than none, because it grants confidence it
// has not earned.
//
// So this one collects candidate paths from every form they appear in
// (attributes, object literals, markdown links, and the navigation manifest)
// and resolves each against the App Router's actual folder structure.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP = resolve(root, 'apps/web/app')

// --- what routes actually exist --------------------------------------------

function collectRoutes(dir = APP, segments = []) {
  const out = new Set()
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) {
      // A page.tsx makes the current segment path a real route.
      if (entry === 'page.tsx' || entry === 'page.mdx') {
        out.add('/' + segments.join('/'))
      }
      // Static metadata files map to conventional paths.
      if (entry === 'robots.ts') out.add('/robots.txt')
      if (entry === 'sitemap.ts') out.add('/sitemap.xml')
      if (entry === 'icon.svg') out.add('/icon.svg')
      continue
    }
    // Route groups "(name)" and private folders "_name" add no URL segment.
    const isGroup = entry.startsWith('(') && entry.endsWith(')')
    const isPrivate = entry.startsWith('_')
    if (isPrivate) continue
    for (const r of collectRoutes(full, isGroup ? segments : [...segments, entry])) {
      out.add(r)
    }
  }
  return out
}

const routes = collectRoutes()
routes.add('/') // app/page.tsx yields '/' from the empty segment list

// API route handlers are reachable but are not pages; record them separately so
// a link to one is reported as a mistake rather than silently accepted.
function collectHandlers(dir = APP, segments = []) {
  const out = new Set()
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) {
      if (entry === 'route.ts') out.add('/' + segments.join('/'))
      continue
    }
    const isGroup = entry.startsWith('(') && entry.endsWith(')')
    for (const r of collectHandlers(full, isGroup ? segments : [...segments, entry])) out.add(r)
  }
  return out
}
const handlers = collectHandlers()

// --- what the code links to -------------------------------------------------

function walk(dir, exts, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, exts, acc)
    else if (exts.some((e) => entry.endsWith(e))) acc.push(full)
  }
  return acc
}

const navSrcEarly = readFileSync(resolve(root, 'apps/web/lib/nav.ts'), 'utf8')

const found = new Map() // path -> Set(source files)
const record = (p, src) => {
  const clean = p.split('#')[0].split('?')[0].replace(/\/$/, '') || '/'
  if (!clean.startsWith('/')) return
  if (!found.has(clean)) found.set(clean, new Set())
  found.get(clean).add(src.replace(root + '/', ''))
}

const PATTERNS = [
  /href="(\/[^"]*)"/g, // JSX attribute
  /href:\s*'(\/[^']*)'/g, // object literal, the form the footer used
  /href:\s*"(\/[^"]*)"/g,
  /href=\{`(\/[^`${]*)`\}/g, // template literal with no interpolation
]

for (const file of walk(resolve(root, 'apps/web'), ['.tsx', '.ts'])) {
  if (file.includes('/node_modules/')) continue
  const src = readFileSync(file, 'utf8')
  for (const re of PATTERNS) {
    for (const m of src.matchAll(re)) record(m[1], file)
  }
}

for (const file of walk(resolve(root, 'content'), ['.md'])) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(/\]\((\/[^)]*)\)/g)) record(m[1], file)
}

// The navigation manifest is the source of truth for the site's shape, so every
// entry in it must exist even if nothing happens to link to it yet.
const navSrc = navSrcEarly
for (const m of navSrc.matchAll(/href:\s*'(\/[^']*)'/g)) record(m[1], 'apps/web/lib/nav.ts')

// Documents rendered by DocPage are linked by slug, which is resolved through
// the manifest at build time. A document with no entry in nav.ts produced a
// link to /<slug>, and two of them 404'd for days because the pattern list
// above skips interpolated template literals -- exactly the form that bug took.
// A checker is only worth the failure modes it was built to see, so this closes
// the one it demonstrably missed.
const unroutedDocs = []
{
  const docSlugs = existsSync(resolve(root, 'content'))
    ? readdirSync(resolve(root, 'content'))
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
    : []
  const navHrefs = [...navSrc.matchAll(/href:\s*'(\/[^']*)'/g)].map((m) => m[1])
  for (const slug of docSlugs) {
    if (!navHrefs.some((h) => h === `/${slug}` || h.endsWith(`/${slug}`))) {
      unroutedDocs.push(slug)
    }
  }
}

// --- compare ----------------------------------------------------------------

const broken = []

for (const slug of unroutedDocs) {
  broken.push({
    path: `/${slug}`,
    sources: new Set([`content/${slug}.md (rendered by DocPage)`]),
    why: 'document has no route in lib/nav.ts, so DocPage would link to a 404',
  })
}

for (const [path, sources] of [...found].sort()) {
  if (routes.has(path)) continue
  if (handlers.has(path)) {
    broken.push({ path, sources, why: 'is an API route handler, not a page' })
    continue
  }
  broken.push({ path, sources, why: 'has no page.tsx' })
}

// The sitemap is another place that used to keep its own copy of the site's
// shape, and it fell behind within a day. Assert it derives from the manifest.
const sitemapSrc = readFileSync(resolve(root, 'apps/web/app/sitemap.ts'), 'utf8')
if (!/NAV_FLAT/.test(sitemapSrc)) {
  console.error(
    '  BROKEN  apps/web/app/sitemap.ts does not derive from lib/nav.ts.\n' +
      '          A hand-maintained sitemap drifts from the routes it describes.',
  )
  process.exit(1)
}

// Same for the chrome: header and footer must read the manifest, not a list.
const chromeSrc = readFileSync(resolve(root, 'apps/web/components/Chrome.tsx'), 'utf8')
if (!/from '\.\.\/lib\/nav'/.test(chromeSrc)) {
  console.error('  BROKEN  apps/web/components/Chrome.tsx does not read lib/nav.ts.')
  process.exit(1)
}

console.log(`Link check: ${found.size} distinct internal paths against ${routes.size} routes\n`)

if (broken.length) {
  for (const b of broken) {
    console.error(`  BROKEN  ${b.path}  (${b.why})`)
    for (const s of b.sources) console.error(`            from ${s}`)
  }
  console.error(`\n${broken.length} broken internal link(s).`)
  process.exit(1)
}

// Report routes nothing links to. Not fatal, but an unreachable page is usually
// an oversight rather than a decision.
const orphans = [...routes].filter(
  (r) => r !== '/' && !found.has(r) && !r.startsWith('/robots') && !r.startsWith('/sitemap') && !r.startsWith('/icon'),
)
if (orphans.length) {
  console.log('  Reachable but unlinked:')
  for (const o of orphans) console.log(`    ${o}`)
  console.log('')
}

console.log(`All ${found.size} internal links resolve.`)
