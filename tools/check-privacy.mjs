#!/usr/bin/env node
/**
 * The position-obscuring guarantee, measured.
 *
 * Four pages promise an operator that publishing a node does not publish their
 * home address. That promise was false for the whole of the project's first
 * public week: the offset was seeded from an FNV hash of the node's public key,
 * which sat in a world-readable column, and used a fixed radius. Anyone could
 * recompute the offset and subtract it. Three independent reviewers inverted it
 * to between one and six metres.
 *
 * Nothing about that was subtle. It survived because the guarantee was written
 * in prose and the code was read by people who already believed it. So this
 * check does not read the code. It runs the function several thousand times and
 * measures the distribution, which is the only form of the claim an attacker
 * cares about.
 *
 * Run by `make check`. If the fuzzing regresses, this fails before the promise
 * reaches anyone's threat model.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { fuzzPosition, metresBetween } from '../apps/web/lib/grid/fuzz.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
// Awaited, because half of these are async: a non-awaiting runner reports a
// pending promise as a pass and never sees the assertion inside it fail.
async function check(name, fn) {
  try {
    const note = await fn()
    console.log(`  ok    ${name}${note ? ` , ${note}` : ''}`)
  } catch (err) {
    failures++
    console.log(`  FAIL  ${name}\n        ${err.message}`)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const SALT = 'test-salt-0123456789abcdef0123456789abcdef'
const LAT = 51.4779
const LON = -0.0015
const R = 1000

// A representative population of nodes rather than one, because several of
// these properties are distributional and invisible in a single sample.
const SLUGS = Array.from({ length: 3000 }, (_, i) => `node-${i}`)
const sample = []
for (const slug of SLUGS) {
  const p = await fuzzPosition(LAT, LON, R, slug, SALT)
  sample.push({ slug, ...p, r: metresBetween(LAT, LON, p.lat, p.lon) })
}

await check('an exact position is published exactly when precision is zero', async () => {
  const p = await fuzzPosition(LAT, LON, 0, 'n', SALT)
  assert(p.lat === LAT && p.lon === LON, 'a zero precision must not move the point')
})

await check('the offset is stable for a given node', async () => {
  const a = await fuzzPosition(LAT, LON, R, 'node-7', SALT)
  const b = await fuzzPosition(LAT, LON, R, 'node-7', SALT)
  assert(a.lat === b.lat && a.lon === b.lon, 'the published point moved between calls')
  // Instability is not a cosmetic bug: an observer who collects a wandering
  // point averages it back to the true centre.
})

await check('different nodes at one address get different offsets', () => {
  const uniq = new Set(sample.map((s) => `${s.lat},${s.lon}`))
  assert(uniq.size === sample.length, `${sample.length - uniq.size} nodes collided`)
})

await check('the salt is what keys the offset', async () => {
  // The whole fix rests on this. If the output barely moves when the secret
  // changes, the secret is not doing the work.
  let moved = 0
  for (let i = 0; i < 200; i++) {
    const a = await fuzzPosition(LAT, LON, R, `node-${i}`, SALT)
    const b = await fuzzPosition(LAT, LON, R, `node-${i}`, `${SALT}-different`)
    if (metresBetween(a.lat, a.lon, b.lat, b.lon) > R / 4) moved++
  }
  assert(moved > 150, `only ${moved}/200 nodes moved meaningfully when the salt changed`)
  return `${moved}/200 moved > R/4`
})

await check('a missing salt refuses rather than degrading', async () => {
  let threw = false
  try {
    await fuzzPosition(LAT, LON, R, 'n', '')
  } catch {
    threw = true
  }
  assert(threw, 'fuzzing without a salt must throw, not fall back to a weak offset')
})

await check('every published point stays inside the declared radius', () => {
  const out = sample.filter((s) => s.r > R + 1)
  assert(out.length === 0, `${out.length} points fell outside the declared precision`)
  return `max ${Math.max(...sample.map((s) => s.r)).toFixed(0)} m of ${R} m`
})

await check('points fill the disc rather than ringing its rim', () => {
  // This is the half of the old bug that survives a good hash. With a fixed
  // radius every node sits on one circle, so a searcher who knows the declared
  // precision gets an annulus a few metres wide instead of a 3.1 km² disc.
  //
  // Uniform over a disc means P(r < xR) = x². Anything clustered at the rim
  // shows up immediately in the quartiles.
  const frac = (x) => sample.filter((s) => s.r < x * R).length / sample.length
  const half = frac(0.5)
  const mid = frac(Math.SQRT1_2)
  assert(Math.abs(half - 0.25) < 0.03, `P(r < R/2) = ${half.toFixed(3)}, expected ≈ 0.25`)
  assert(Math.abs(mid - 0.5) < 0.03, `P(r < R/√2) = ${mid.toFixed(3)}, expected ≈ 0.50`)
  const meanR = sample.reduce((a, s) => a + s.r, 0) / sample.length / R
  assert(Math.abs(meanR - 2 / 3) < 0.03, `mean r/R = ${meanR.toFixed(3)}, expected ≈ 0.667`)
  return `P(r<R/2)=${half.toFixed(3)}, mean r/R=${meanR.toFixed(3)}`
})

await check('no direction is preferred', () => {
  const sectors = new Array(8).fill(0)
  for (const s of sample) {
    // In metres, not degrees. A degree of longitude at this latitude is only
    // cos(lat) as long as a degree of latitude, so measuring the bearing in raw
    // degree space stretches east-west and manufactures a skew that is not there.
    const east = (s.lon - LON) * Math.cos((LAT * Math.PI) / 180)
    const brg = Math.atan2(east, s.lat - LAT)
    sectors[Math.floor((((brg + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 8) % 8]++
  }
  const expect = sample.length / 8
  const worst = Math.max(...sectors.map((c) => Math.abs(c - expect) / expect))
  assert(worst < 0.15, `bearings are skewed: sector counts ${sectors.join(', ')}`)
  return `worst sector deviates ${(worst * 100).toFixed(1)}%`
})

await check('the true position is not recoverable from everything that is public', () => {
  // The attacker's model: they hold the slug, the declared precision, the
  // published coordinate and this entire source file. Everything except the
  // salt. Their best estimate of the true point is the published point, and the
  // measure of the guarantee is how wrong that leaves them.
  const err = sample.map((s) => s.r).sort((a, b) => a - b)
  const median = err[Math.floor(err.length / 2)]
  const p05 = err[Math.floor(err.length * 0.05)]
  assert(median > R * 0.5, `median recovery error only ${median.toFixed(0)} m`)
  // Some nodes land near the centre by chance; that is what a uniform draw
  // means and is not a defect. It must be a small minority.
  assert(p05 > R * 0.1, `5% of nodes are recoverable to within ${p05.toFixed(0)} m`)
  return `median error ${median.toFixed(0)} m, 5th pct ${p05.toFixed(0)} m`
})

await check('the public key is never used to seed an offset again', () => {
  // The specific defect, nailed shut. Grepping is crude, but this one mistake
  // cost the project its central privacy claim and it is worth a tripwire.
  const src = readFileSync(join(ROOT, 'apps/web/app/api/grid/register/route.ts'), 'utf8')
  const call = src.match(/fuzzPosition\([\s\S]{0,300}?\)/)
  assert(call, 'no fuzzPosition call found in the register route')
  assert(!/pubkey/.test(call[0]), 'the register route seeds fuzzPosition from the public key')
})

await check('the public key is not granted to the anonymous role', () => {
  const sql = readFileSync(join(ROOT, 'schema/sql/0008_hide_node_pubkey.sql'), 'utf8')
  const grant = sql.match(/grant select \(([\s\S]*?)\) on nband\.nodes/)
  assert(grant, 'migration 0008 no longer grants an explicit column list')
  assert(!/\bpubkey\b/.test(grant[1]), 'pubkey is back in the anon grant list')
})

console.log(
  failures === 0
    ? '\n  position obscuring holds\n'
    : `\n  ${failures} privacy check${failures === 1 ? '' : 's'} failed\n`,
)
process.exit(failures === 0 ? 0 : 1)
