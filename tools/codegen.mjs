#!/usr/bin/env node
// Generates language bindings from the canonical schema files.
//
// The whole point of this file is that NBAND's band taxonomy, enum values,
// and platform thresholds exist in exactly one place. Firmware running on a
// mast in the desert, the Postgres enum backing the archive, and the colour a
// chart uses for the LWIR trace all derive from schema/bands.json and
// schema/spec.json. Docs that drift from the hardware are worse than no docs,
// and the same is true of type definitions.
//
//   node tools/codegen.mjs            write generated files
//   node tools/codegen.mjs --check    exit 1 if anything is stale

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

const bands = read('schema/bands.json')
const spec = read('schema/spec.json')
const hardware = read('schema/hardware.json')
const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim()

const checkOnly = process.argv.includes('--check')
const stale = []

function emit(relPath, contents) {
  const abs = resolve(root, relPath)
  const existing = existsSync(abs) ? readFileSync(abs, 'utf8') : null
  if (existing === contents) return
  if (checkOnly) {
    stale.push(relPath)
    return
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, contents)
  console.log(`  wrote ${relPath}`)
}

const BANNER = (comment) =>
  `${comment} GENERATED FILE - DO NOT EDIT.\n` +
  `${comment} Source: schema/bands.json, schema/spec.json, schema/hardware.json\n` +
  `${comment} Regenerate with: yarn codegen\n` +
  `${comment} Platform version: ${version}  Schema version: ${spec.schemaVersion}\n`

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

function tsUnion(values) {
  return values.map((v) => `'${v}'`).join(' | ')
}

function generateTypeScript() {
  const enumBlocks = Object.entries(spec.enums)
    .map(([name, def]) => {
      const Name = name[0].toUpperCase() + name.slice(1)
      const ids = def.values.map((v) => v.id)
      return [
        `/** ${def.description.replace(/\n/g, ' ')} */`,
        `export type ${Name} = ${tsUnion(ids)}`,
        ``,
        `export const ${name.toUpperCase()}: Record<${Name}, ${Name}Meta> = ${JSON.stringify(
          Object.fromEntries(def.values.map((v) => [v.id, v])),
          null,
          2,
        )} as const`,
        ``,
        `export interface ${Name}Meta {`,
        ...[...new Set(def.values.flatMap((v) => Object.keys(v)))].map((k) => {
          const sample = def.values.find((v) => v[k] !== undefined)[k]
          const t =
            typeof sample === 'number'
              ? 'number'
              : typeof sample === 'boolean'
                ? 'boolean'
                : 'string'
          const optional = def.values.some((v) => v[k] === undefined) ? '?' : ''
          return `  ${k}${optional}: ${t}`
        }),
        `}`,
        ``,
        `export const ${name.toUpperCase()}_ORDER: readonly ${Name}[] = [${ids
          .map((i) => `'${i}'`)
          .join(', ')}] as const`,
        ``,
      ].join('\n')
    })
    .join('\n')

  return [
    BANNER('//'),
    ``,
    `export const PLATFORM_VERSION = '${version}' as const`,
    `export const SCHEMA_VERSION = '${spec.schemaVersion}' as const`,
    ``,
    `// --- Bands -----------------------------------------------------------------`,
    ``,
    `export type BandId = ${tsUnion(bands.bands.map((b) => b.id))}`,
    ``,
    `export interface BandRange { minM?: number; maxM?: number; minHz?: number; maxHz?: number; minEv?: number; maxEv?: number }`,
    ``,
    `export interface Band {`,
    `  id: BandId`,
    `  ordinal: number`,
    `  label: string`,
    `  kind: 'electromagnetic' | 'mechanical' | 'gravitational' | 'context'`,
    `  role: 'detection' | 'context'`,
    `  wavelength?: BandRange`,
    `  frequency?: BandRange`,
    `  energy?: BandRange`,
    `  /** Hue in degrees, ordered by wavelength. See lib/spectrum.ts. */`,
    `  hue: number`,
    `  saturation?: number`,
    `  unitDefault: string`,
    `  shortDescription: string`,
    `  whatItSees: string`,
    `  limits: string`,
    `  typicalSensors: string[]`,
    `}`,
    ``,
    `export const BANDS: readonly Band[] = ${JSON.stringify(bands.bands, null, 2)} as const`,
    ``,
    `export const BAND_BY_ID: Record<BandId, Band> = Object.fromEntries(`,
    `  BANDS.map((b) => [b.id, b]),`,
    `) as Record<BandId, Band>`,
    ``,
    `export const DETECTION_BANDS: readonly Band[] = BANDS.filter((b) => b.role === 'detection')`,
    `export const CONTEXT_BANDS: readonly Band[] = BANDS.filter((b) => b.role === 'context')`,
    ``,
    `// --- Enums -----------------------------------------------------------------`,
    ``,
    enumBlocks,
    `// --- Hypotheses and thresholds ---------------------------------------------`,
    ``,
    `export interface Hypothesis { id: string; label: string; prior: number; classification: Classification }`,
    `export const HYPOTHESES: readonly Hypothesis[] = ${JSON.stringify(
      spec.hypotheses.defaults,
      null,
      2,
    )} as const`,
    ``,
    `export const THRESHOLDS = ${JSON.stringify(spec.thresholds, null, 2)} as const`,
    ``,
    `// --- Hardware registry -----------------------------------------------------`,
    ``,
    `export interface Part {`,
    `  id: string`,
    `  category: string`,
    `  band: BandId | null`,
    `  vendor: string`,
    `  model: string`,
    `  status: VariantStatus`,
    `  tiers?: Tier[]`,
    `  priceUsd: number`,
    `  priceAsOf: string`,
    `  sourceUrl: string`,
    `  interface: string`,
    `  driver: string | null`,
    `  restricted?: boolean`,
    `  keySpecs: Record<string, string | number | boolean>`,
    `  notes: string`,
    `  alternatives?: string[]`,
    `  /** Substitutes people use that have not been through conformance. */`,
    `  candidateAlternatives?: string[]`,
    `}`,
    ``,
    `export const PARTS: readonly Part[] = ${JSON.stringify(hardware.parts, null, 2)} as unknown as readonly Part[]`,
    `export const PRICES_AS_OF = '${hardware.pricesAsOf}' as const`,
    `export const PRICE_NOTE = ${JSON.stringify(hardware.priceNote)} as const`,
    ``,
    `export function partsForTier(tier: Tier): Part[] {`,
    `  return PARTS.filter((p) => p.tiers?.includes(tier))`,
    `}`,
    ``,
    `export function tierCost(tier: Tier): number {`,
    `  return partsForTier(tier).reduce((sum, p) => sum + p.priceUsd, 0)`,
    `}`,
    ``,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function pyLiteral(values) {
  return values.map((v) => `"${v}"`).join(', ')
}

function generatePython() {
  const enumClasses = Object.entries(spec.enums)
    .map(([name, def]) => {
      const Name = name[0].toUpperCase() + name.slice(1)
      return [
        `class ${Name}(str, Enum):`,
        `    """${def.description.replace(/\n/g, ' ')}"""`,
        ...def.values.map((v) => `    ${v.id.toUpperCase()} = "${v.id}"`),
        ``,
      ].join('\n')
    })
    .join('\n')

  return [
    BANNER('#'),
    ``,
    `from __future__ import annotations`,
    ``,
    `from enum import Enum`,
    `from typing import Any, Final`,
    ``,
    `PLATFORM_VERSION: Final[str] = "${version}"`,
    `SCHEMA_VERSION: Final[str] = "${spec.schemaVersion}"`,
    ``,
    ``,
    `class Band(str, Enum):`,
    `    """Canonical band taxonomy, ordered by increasing wavelength."""`,
    ...bands.bands.map((b) => `    ${b.id.toUpperCase()} = "${b.id}"`),
    ``,
    ``,
    `BAND_ORDER: Final[tuple[str, ...]] = (${pyLiteral(bands.bands.map((b) => b.id))})`,
    ``,
    `BAND_META: Final[dict[str, dict[str, Any]]] = ${JSON.stringify(
      Object.fromEntries(
        bands.bands.map((b) => [
          b.id,
          {
            label: b.label,
            kind: b.kind,
            role: b.role,
            unitDefault: b.unitDefault,
            ordinal: b.ordinal,
          },
        ]),
      ),
      null,
      4,
    )}`,
    ``,
    ``,
    enumClasses,
    ``,
    `THRESHOLDS: Final[dict[str, Any]] = ${JSON.stringify(spec.thresholds, null, 4)}`,
    ``,
    `HYPOTHESES: Final[list[dict[str, Any]]] = ${JSON.stringify(spec.hypotheses.defaults, null, 4)}`,
    ``,
    `# Driver slug for every registered part, keyed by part id. The node agent`,
    `# uses this to resolve a configured sensor to a driver implementation.`,
    `PART_DRIVERS: Final[dict[str, str | None]] = ${JSON.stringify(
      Object.fromEntries(hardware.parts.map((p) => [p.id, p.driver])),
      null,
      4,
    )}`,
    ``,
  ]
    .join('\n')
    .replace(/: null/g, ': None')
    .replace(/true,/g, 'True,')
    .replace(/false,/g, 'False,')
}

// ---------------------------------------------------------------------------

console.log(checkOnly ? 'Checking generated files...' : 'Generating...')
emit('apps/web/lib/schema/generated.ts', generateTypeScript())
emit('firmware/nband_node/schema_generated.py', generatePython())

if (checkOnly) {
  if (stale.length) {
    console.error(`\nStale generated files:\n${stale.map((s) => `  ${s}`).join('\n')}`)
    console.error(`\nRun 'yarn codegen' and commit the result.`)
    process.exit(1)
  }
  console.log('  all generated files current')
} else {
  console.log('Done.')
}
