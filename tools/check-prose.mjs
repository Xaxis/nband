#!/usr/bin/env node
/**
 * The house style, enforced rather than swept.
 *
 * CLAUDE.md states the conventions: no em-dashes, no rhetorical questions, no
 * "imagine", no bullet lists inside body prose, declarative sentence-case
 * headings. They were being applied by periodically reading everything, which
 * does not scale and did not work. Seventy-six em-dashes accumulated before
 * anyone counted, and the regex sweep that removed them replaced placeholder
 * glyphs along with the punctuation and broke a geometry check, because a
 * cosmetic pass run by hand over a whole repository has no way to tell a dash
 * in prose from a dash in an array destructure.
 *
 * So the rules are checked on every build, and each one is narrow enough to
 * mean something. Anything this file cannot judge safely it does not judge:
 * there is no heuristic here for "is this sentence good", only for the specific
 * mechanical things the conventions name.
 *
 * Prose lives in three places and all three are covered: the flat-file
 * documents, the registry fields that are rendered verbatim on the site, and
 * the copy embedded in TSX. Code comments count too, which is why the scan does
 * not stop at string literals.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(root, p)

function walk(dir, exts, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist' || entry.startsWith('.')) {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, exts, acc)
    else if (exts.some((e) => entry.endsWith(e))) acc.push(full)
  }
  return acc
}

const problems = []
const report = (file, line, rule, detail) => problems.push({ file: rel(file), line, rule, detail })

// This file necessarily contains every glyph it forbids, in the patterns that
// match them. Scanning itself would report five violations that are the rules.
const SELF = resolve(root, 'tools/check-prose.mjs')

const sources = [
  ...walk(resolve(root, 'content'), ['.md']),
  ...walk(resolve(root, 'apps/web/app'), ['.tsx', '.ts']),
  ...walk(resolve(root, 'apps/web/components'), ['.tsx', '.ts']),
  ...walk(resolve(root, 'apps/web/lib'), ['.ts', '.mjs']),
  ...walk(resolve(root, 'tools'), ['.mjs']),
  resolve(root, 'schema/hardware.json'),
  resolve(root, 'schema/bands.json'),
  resolve(root, 'schema/spec.json'),
  // The three files a contributor reads before anything else. All three held
  // em-dashes while the conventions they describe forbid them, which is the
  // most expensive place to be inconsistent.
  resolve(root, 'README.md'),
  resolve(root, 'CLAUDE.md'),
  resolve(root, 'Makefile'),
].filter((f) => f !== SELF)

// --- 1. No em-dashes --------------------------------------------------------
//
// The en dash is allowed between two numbers, where it is the correct glyph for
// a range and is not standing in for a comma or a full stop. Everything else
// goes. This is the rule the sweep was trying to apply, expressed precisely
// enough that it cannot also eat an array hole.
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    if (line.includes('—')) report(file, i + 1, 'em-dash', line.trim().slice(0, 100))
    for (const m of line.matchAll(/–/g)) {
      const before = line.slice(Math.max(0, m.index - 12), m.index)
      const after = line.slice(m.index + 1, m.index + 13)
      // A literal number on both sides, or a template interpolation on both
      // sides, which is how a formatted range is written in code: the band
      // wavelength row renders "1 mm – 10 mm" from two calls, and reading only
      // the adjacent characters sees braces rather than digits.
      const isRange =
        (/[\d)]\s*$/.test(before) && /^\s*[\d(]/.test(after)) ||
        (/\}\s*$/.test(before) && /^\s*\$\{/.test(after))
      if (!isRange) report(file, i + 1, 'en-dash outside a numeric range', line.trim().slice(0, 100))
    }
  })
}

// --- 2. No rhetorical questions --------------------------------------------
//
// Only prose is scanned. A question mark in a regular expression, a ternary, a
// URL query or an optional-chaining operator is not a rhetorical question, and
// a check that flags those is a check people learn to ignore.
const QUESTION = /[a-z,)]\s*\?(\s|$|["'`<])/
for (const file of sources.filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8')
  let fenced = false
  text.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced
    if (fenced || line.trimStart().startsWith('    ')) return
    if (QUESTION.test(line)) report(file, i + 1, 'rhetorical question', line.trim().slice(0, 100))
  })
}

// Registry fields are rendered as prose on the site, so they follow the same
// rule. These are the fields that reach a reader verbatim.
const PROSE_FIELDS = [
  'notes',
  'summary',
  'shortDescription',
  'whatItSees',
  'limits',
  'note',
  'featureNote',
  'detail',
  'description',
]
const walkJson = (node, file, path = []) => {
  if (typeof node === 'string') {
    const field = path[path.length - 1]
    if (typeof field === 'string' && PROSE_FIELDS.includes(field)) {
      if (QUESTION.test(node)) report(file, 0, 'rhetorical question', `${path.join('.')}: ${node.slice(0, 80)}`)
      if (/\bimagine\b/i.test(node)) report(file, 0, 'imagine', `${path.join('.')}`)
    }
    return
  }
  if (Array.isArray(node)) return node.forEach((v, i) => walkJson(v, file, [...path, i]))
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkJson(v, file, [...path, k])
  }
}
for (const file of sources.filter((f) => f.endsWith('.json'))) {
  walkJson(JSON.parse(readFileSync(file, 'utf8')), file)
}

// --- 3. No "imagine" --------------------------------------------------------
//
// CLAUDE.md is where the conventions are written down, so it necessarily
// contains the word it forbids. Every other file is scanned.
const RULES_FILE = resolve(root, 'CLAUDE.md')
for (const file of sources.filter((f) => f !== RULES_FILE)) {
  const text = readFileSync(file, 'utf8')
  text.split('\n').forEach((line, i) => {
    if (/\bimagine\b/i.test(line)) report(file, i + 1, 'imagine', line.trim().slice(0, 100))
  })
}

// --- 4. Declarative sentence-case headings ---------------------------------
//
// Title Case Like This is the thing being caught. Proper nouns and acronyms are
// left alone, so the test is whether an ordinary word that is not first in the
// heading has been capitalised. A heading ending in a question mark is also a
// rhetorical question, which rule two only scans body lines for.
const ALLCAPS_OR_PROPER = /^([A-Z]{2,}|[A-Z][a-z]+([A-Z]|\d))/
const KNOWN_PROPER = new Set([
  'Anthropic', 'API', 'BOM', 'CSI', 'Ed25519', 'ELF', 'GNSS', 'GPIO', 'GPS', 'HAT', 'I2C', 'I2S',
  'InGaAs', 'LiFePO4', 'Linux', 'MPPT', 'NDJSON', 'Pi', 'Postgres', 'PPS', 'PureThermal', 'Python',
  'Raspberry', 'RF', 'SDR', 'SPI', 'SQL', 'Supabase', 'TVS', 'UART', 'USB', 'UV', 'VLF', 'Vercel',
  'Ah', 'Wh', 'Hz', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'CsI', 'SiPM', 'Lepton', 'FLIR', 'MEMS',
])
for (const file of sources.filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8')
  let fenced = false
  text.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced
    if (fenced) return
    const m = /^#{1,6}\s+(.*)$/.exec(line)
    if (!m) return
    const heading = m[1].trim()
    if (heading.endsWith('?')) {
      report(file, i + 1, 'heading is a question', heading.slice(0, 80))
    }
    const words = heading.split(/\s+/).slice(1)
    const titleCased = words.filter(
      (w) =>
        /^[A-Z][a-z]{2,}$/.test(w) && !KNOWN_PROPER.has(w) && !ALLCAPS_OR_PROPER.test(w.slice(1)),
    )
    // Two or more is a pattern; one is a proper noun this list has not learned.
    if (titleCased.length >= 2) {
      report(file, i + 1, 'heading is Title Case', `${heading.slice(0, 70)} (${titleCased.join(', ')})`)
    }
  })
}

// --- 5. No bullet lists inside body prose -----------------------------------
//
// Lists are fine as a document's own structure. What the convention refuses is
// a paragraph that breaks into bullets mid-argument, so this flags a list that
// begins immediately under a sentence rather than under a heading or a lead-in
// line ending in a colon.
for (const file of sources.filter((f) => f.endsWith('.md'))) {
  const lines = readFileSync(file, 'utf8').split('\n')
  let fenced = false
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('```')) fenced = !fenced
    if (fenced) return
    if (!/^\s*[-*]\s+\S/.test(line)) return
    // Walk back to the nearest non-blank, non-list line.
    let j = i - 1
    while (j >= 0 && /^\s*$/.test(lines[j])) j -= 1
    while (j >= 0 && /^\s*[-*]\s+/.test(lines[j])) j -= 1
    if (j < 0) return
    const previous = lines[j].trim()
    if (!previous) return
    if (previous.startsWith('#')) return // under a heading
    if (previous.endsWith(':')) return // a lead-in
    if (previous.startsWith('|') || previous.startsWith('>')) return
    if (/^(version|title|summary|updated):/i.test(previous)) return
    report(file, i + 1, 'bullet list inside body prose', `after "${previous.slice(-60)}"`)
  })
}

// --- report -----------------------------------------------------------------

const byRule = new Map()
for (const p of problems) byRule.set(p.rule, (byRule.get(p.rule) ?? 0) + 1)

console.log(`Prose check: ${sources.length} files against the conventions in CLAUDE.md\n`)

if (problems.length === 0) {
  console.log('  no em-dashes, no rhetorical questions, no "imagine", no Title Case headings,')
  console.log('  no bullet lists interrupting body prose.')
  console.log('\nAll prose conventions hold.')
  process.exit(0)
}

for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${count} x ${rule}`)
  for (const p of problems.filter((x) => x.rule === rule).slice(0, 12)) {
    console.error(`      ${p.file}${p.line ? `:${p.line}` : ''}  ${p.detail}`)
  }
  const hidden = problems.filter((x) => x.rule === rule).length - 12
  if (hidden > 0) console.error(`      ... and ${hidden} more`)
}
console.error(`\n${problems.length} prose convention violation(s).`)
process.exit(1)
