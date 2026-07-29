#!/usr/bin/env node
// Seeds the grid's reference tables from the canonical schema files.
//
// The hardware registry lives in schema/hardware.json, not in the database.
// The database copy exists so that node_channels can carry a foreign key to a
// real part, which is what makes "this reading came from an MLX90640, not a
// Lepton" a fact the discriminator can rely on rather than a string it hopes is
// spelled correctly. This script pushes the file into the table, and it is
// idempotent: run it after every registry change.
//
// Usage: node tools/seed.mjs [--dry-run]   (reads .env from the repo root)
//
// --dry-run prints what would be written and touches nothing. It exists because
// this script had no such flag and silently ignored one, so an invocation meant
// as a rehearsal wrote to the live table instead. The write is an idempotent
// upsert and nothing was lost, which is luck rather than design: a tool that
// writes to production should be able to be asked what it would do.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Minimal .env reader; avoids a dependency for one file.
const envPath = resolve(root, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const dryRun = process.argv.includes('--dry-run')

// Unknown flags are refused rather than ignored. Ignoring one is how a rehearsal
// became a write.
const UNKNOWN = process.argv.slice(2).filter((a) => a !== '--dry-run')
if (UNKNOWN.length) {
  console.error(`seed: unrecognised argument ${UNKNOWN.join(', ')}. Only --dry-run is accepted.`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!dryRun && (!url || !key)) {
  console.error('seed: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(2)
}

const hardware = JSON.parse(readFileSync(resolve(root, 'schema/hardware.json'), 'utf8'))

const rows = hardware.parts.map((p) => ({
  id: p.id,
  band: p.band,
  category: p.category,
  vendor: p.vendor,
  model: p.model,
  status: p.status,
  interface: p.interface ?? null,
  driver: p.driver ?? null,
  price_usd: p.priceUsd,
  price_as_of: p.priceAsOf,
  source_url: p.sourceUrl,
  key_specs: p.keySpecs ?? {},
  notes: p.notes ?? null,
  // Only reference and verified parts carry a verification timestamp. A
  // submitted part with a null here is why its data gets flagged downstream.
  verified_at:
    p.status === 'reference' || p.status === 'verified' ? new Date().toISOString() : null,
}))

if (dryRun) {
  console.log(`Dry run: ${rows.length} parts would be upserted into nband.sensor_models.`)
  for (const s of ['reference', 'verified', 'submitted', 'unsupported']) {
    const n = rows.filter((r) => r.status === s).length
    if (n) console.log(`  ${String(n).padStart(3)} ${s}`)
  }
  console.log('Nothing was written.')
  process.exit(0)
}

const res = await fetch(`${url}/rest/v1/sensor_models?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Content-Profile': 'nband',
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(rows),
})

if (!res.ok) {
  console.error(`seed: ${res.status} ${await res.text()}`)
  process.exit(1)
}

const written = await res.json()
console.log(`Seeded ${written.length} parts into nband.sensor_models.`)
for (const s of ['reference', 'verified', 'submitted', 'unsupported']) {
  const n = rows.filter((r) => r.status === s).length
  if (n) console.log(`  ${String(n).padStart(3)} ${s}`)
}
