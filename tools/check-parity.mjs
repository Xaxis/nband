#!/usr/bin/env node
// Holds the browser discriminator port to the Python engine.
//
// The interactive playground scores client-side, so the scoring logic exists
// twice. That is a drift risk of exactly the kind this repository is built to
// eliminate, so it is made checkable rather than trusted: Python is
// authoritative, tools/gen-fixtures.py records what the real engine produces
// for a fixed set of cases, and this runs the same cases through the browser
// port and compares.
//
// If this fails, mirror the engine.py change into
// apps/web/lib/discriminator/core.mjs. Never regenerate the fixtures to make it
// pass; that just moves the disagreement somewhere nobody is looking.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

// core.mjs is plain JavaScript precisely so this import needs no build step.
const port = await import(
  new URL('../apps/web/lib/discriminator/core.mjs', import.meta.url).href
)

const cases = read('discriminator/fixtures/cases.json').cases
const expected = read('discriminator/fixtures/expected.json')

const failures = []
console.log('Discriminator parity: browser port vs Python engine\n')

for (const c of cases) {
  const exp = expected[c.id]
  if (!exp) {
    failures.push(c.id)
    console.log(`  FAIL  ${c.id} — missing from expected.json (run gen-fixtures.py)`)
    continue
  }

  const got = port.evaluate({
    bands: c.bands,
    clock: c.clock,
    nodeCount: c.node_count,
    rangeM: c.range_m,
    durationS: c.duration_s,
    peakZ: c.peak_z,
    angularRateDps: null,
    catalogs: c.catalogs,
  })

  const diffs = []
  if (got.classification !== exp.classification) {
    diffs.push(`classification: port ${got.classification}, engine ${exp.classification}`)
  }
  if (Math.abs(got.anomalyScore - exp.anomaly_score) > 0.05) {
    diffs.push(`score: port ${got.anomalyScore}, engine ${exp.anomaly_score}`)
  }
  if (got.corroboration !== exp.corroboration) {
    diffs.push(`corroboration: port ${got.corroboration}, engine ${exp.corroboration}`)
  }
  if (got.hypotheses[0].id !== exp.top_hypothesis) {
    diffs.push(`top hypothesis: port ${got.hypotheses[0].id}, engine ${exp.top_hypothesis}`)
  }
  if (got.unavailableCatalogs.join(',') !== exp.unavailable_catalogs.join(',')) {
    diffs.push(
      `unavailable: port [${got.unavailableCatalogs}], engine [${exp.unavailable_catalogs}]`,
    )
  }
  // Posteriors drift most quietly: a wrong likelihood can leave the
  // classification intact while changing the reasoning behind it.
  for (const [id, p] of Object.entries(exp.posteriors)) {
    const mine = got.hypotheses.find((h) => h.id === id)?.posterior ?? -1
    if (Math.abs(mine - p) > 0.005) {
      diffs.push(`posterior ${id}: port ${mine.toFixed(4)}, engine ${p}`)
    }
  }

  if (diffs.length) {
    failures.push(c.id)
    console.log(`  FAIL  ${c.id}`)
    for (const d of diffs) console.log(`          ${d}`)
  } else {
    console.log(
      `  PASS  ${c.id.padEnd(30)} ${got.classification.padEnd(21)} ${String(got.anomalyScore).padStart(6)}`,
    )
  }
}

if (failures.length) {
  console.error(
    `\n${failures.length} case(s) disagree with the Python engine. Mirror the change into ` +
      `apps/web/lib/discriminator/core.mjs rather than regenerating the fixtures.`,
  )
  process.exit(1)
}
console.log(`\nAll ${cases.length} cases agree with the engine.`)
