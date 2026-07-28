#!/usr/bin/env node
// Fails the build when the parts of nband that must agree have stopped agreeing.
//
// The premise of this repository is that hardware, firmware, database, and
// documentation are versioned together. That is only true if something checks.
// Four things are verified:
//
//   1. Generated bindings are current with respect to the canonical schema.
//   2. The Postgres enums match the enums in the schema files.
//   3. Every document declares a platform version that actually exists.
//   4. Every part referenced by a band, and every driver referenced by a part,
//      resolves to something real.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))
const readText = (p) => readFileSync(resolve(root, p), 'utf8')

const bands = read('schema/bands.json')
const spec = read('schema/spec.json')
const hardware = read('schema/hardware.json')
const version = readText('VERSION').trim()

const problems = []
const checks = []

function check(name, fn) {
  try {
    const detail = fn()
    checks.push({ name, ok: true, detail })
  } catch (err) {
    checks.push({ name, ok: false, detail: err.message })
    problems.push(`${name}: ${err.message}`)
  }
}

// 1. Generated bindings ------------------------------------------------------

check('generated bindings are current', () => {
  try {
    execFileSync('node', [join(root, 'tools/codegen.mjs'), '--check'], { stdio: 'pipe' })
  } catch (err) {
    throw new Error(
      'generated files are stale. Run `yarn codegen` and commit the result.\n' +
        String(err.stdout ?? '') + String(err.stderr ?? ''),
    )
  }
  return 'TypeScript and Python match the schema'
})

// 2. SQL enums match the schema ---------------------------------------------

check('Postgres enums match schema files', () => {
  const sql = readText('schema/sql/0001_init.sql')

  function sqlEnum(name) {
    const m = sql.match(new RegExp(`create type ${name}\\s+as enum \\(([^)]+)\\)`, 'i'))
    if (!m) throw new Error(`SQL is missing the '${name}' enum`)
    return m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  }

  const pairs = [
    ['band', bands.bands.map((b) => b.id)],
    ['tier', spec.enums.tier.values.map((v) => v.id)],
    ['node_status', spec.enums.nodeStatus.values.map((v) => v.id)],
    ['clock_quality', spec.enums.clockQuality.values.map((v) => v.id)],
    ['trigger_reason', spec.enums.triggerReason.values.map((v) => v.id)],
    ['classification', spec.enums.classification.values.map((v) => v.id)],
    ['corroboration', spec.enums.corroboration.values.map((v) => v.id)],
    ['artifact_kind', spec.enums.artifactKind.values.map((v) => v.id)],
    ['catalog_source', spec.enums.catalogSource.values.map((v) => v.id)],
    ['variant_status', spec.enums.variantStatus.values.map((v) => v.id)],
  ]

  for (const [sqlName, expected] of pairs) {
    const actual = sqlEnum(sqlName)
    const missing = expected.filter((v) => !actual.includes(v))
    const extra = actual.filter((v) => !expected.includes(v))
    if (missing.length || extra.length) {
      throw new Error(
        `enum '${sqlName}' drifted.` +
          (missing.length ? ` Missing from SQL: ${missing.join(', ')}.` : '') +
          (extra.length ? ` Present only in SQL: ${extra.join(', ')}.` : '') +
          ' A migration is required.',
      )
    }
  }

  // Band ordinals are persisted, so a reorder is a breaking change.
  const ordinals = bands.bands.map((b) => b.ordinal)
  const expectedOrdinals = bands.bands.map((_, i) => i)
  if (ordinals.join(',') !== expectedOrdinals.join(',')) {
    throw new Error('band ordinals are not contiguous from 0; they are persisted and cannot be reordered')
  }

  return `${pairs.length} enums verified`
})

// 3. Documentation declares a real version -----------------------------------

check('documentation versions are real', () => {
  const dir = resolve(root, 'content')
  if (!existsSync(dir)) return 'no content directory'
  const docs = readdirSync(dir).filter((f) => f.endsWith('.md'))
  if (docs.length === 0) throw new Error('content directory is empty')

  const stale = []
  for (const f of docs) {
    const text = readFileSync(join(dir, f), 'utf8')
    const m = text.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m)
    if (!m) {
      stale.push(`${f} declares no version`)
      continue
    }
    // A document written against a future version is always a mistake. A
    // document written against an older one is surfaced on the page itself.
    if (m[1].trim() > version) {
      stale.push(`${f} claims v${m[1].trim()} but the platform is v${version}`)
    }
  }
  if (stale.length) throw new Error(stale.join('; '))
  return `${docs.length} documents, all at or below v${version}`
})

// 4. Cross-references resolve ------------------------------------------------

check('hardware and band cross-references resolve', () => {
  const partIds = new Set(hardware.parts.map((p) => p.id))
  const bandIds = new Set(bands.bands.map((b) => b.id))
  const errors = []

  for (const p of hardware.parts) {
    if (p.band !== null && !bandIds.has(p.band)) {
      errors.push(`part '${p.id}' references unknown band '${p.band}'`)
    }
    for (const alt of p.alternatives ?? []) {
      if (!partIds.has(alt)) {
        errors.push(`part '${p.id}' lists unknown alternative '${alt}'`)
      }
    }
    if (typeof p.priceUsd !== 'number' || !p.priceAsOf || !p.sourceUrl) {
      errors.push(`part '${p.id}' is missing a sourced price (priceUsd, priceAsOf, sourceUrl)`)
    }
  }

  const hypClasses = new Set(spec.enums.classification.values.map((v) => v.id))
  let priorSum = 0
  for (const h of spec.hypotheses.defaults) {
    priorSum += h.prior
    if (!hypClasses.has(h.classification)) {
      errors.push(`hypothesis '${h.id}' maps to unknown classification '${h.classification}'`)
    }
  }
  if (Math.abs(priorSum - 1) > 1e-9) {
    errors.push(`hypothesis priors sum to ${priorSum.toFixed(4)}, not 1.0`)
  }

  if (errors.length) throw new Error(errors.join('; '))
  return `${hardware.parts.length} parts, ${spec.hypotheses.defaults.length} hypotheses`
})

// 5. Power sizing matches the parts it is sold with --------------------------

check('off-grid power sizing matches the tier load', () => {
  const errors = []

  for (const tier of ['t1', 't2', 't3']) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier))
    const activeW = parts.reduce((sum, p) => sum + (p.electrical?.activeW ?? 0), 0)
    const dailyWh = activeW * 24

    const power = parts.find((p) => p.category === 'power')
    if (!power) continue

    const panelW = Number(power.keySpecs?.panelW ?? 0)
    const batteryWh = Number(power.keySpecs?.batteryWh ?? 0)

    // Four peak-sun-hours with a 35 percent margin; three days at 50 percent
    // usable depth of discharge. A BOM that ships a panel too small for the
    // node it is sold with strands a remote build, and that shipped once.
    const neededPanelW = (dailyWh / 4) * 1.35
    const neededBatteryWh = dailyWh * 3 * 2

    if (panelW < neededPanelW * 0.9) {
      errors.push(
        `${tier}: '${power.id}' specifies a ${panelW} W panel but the parts draw ` +
          `${activeW.toFixed(1)} W (${dailyWh.toFixed(0)} Wh/day), needing about ` +
          `${Math.ceil(neededPanelW)} W`,
      )
    }
    if (batteryWh < neededBatteryWh * 0.9) {
      errors.push(
        `${tier}: '${power.id}' specifies ${batteryWh} Wh of battery but three days of ` +
          `autonomy at this load needs about ${Math.ceil(neededBatteryWh)} Wh`,
      )
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return 'panel and battery cover the summed draw of every tier that ships them'
})

// ---------------------------------------------------------------------------

console.log(`nband drift check — platform v${version}, schema v${spec.schemaVersion}\n`)
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (c.detail) {
    for (const line of String(c.detail).split('\n')) {
      if (line.trim()) console.log(`        ${line.trim()}`)
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed. Docs that drift from the hardware are worse than no docs.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
