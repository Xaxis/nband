#!/usr/bin/env node
// Derives BIFROST's two colour sets from schema/bands.json and prints them for
// the dataviz validator.
//
// BIFROST has an unusual constraint: fourteen bands is far more than any
// categorical palette can separate under colour-vision deficiency (360/14 is
// roughly 26 degrees of hue apart, well below the separation floor). So there
// are deliberately two sets with two different jobs:
//
//   spectral  - an ORDINAL ramp, ordered by wavelength. Used for band identity:
//               chips, facet accents, the spectrum bar. Bands are never drawn as
//               fourteen simultaneous categorical series; the telemetry view uses
//               small multiples, one facet per band, so the ramp only ever has to
//               read as an ordered sweep rather than as fourteen distinct hues.
//   verdict   - a true CATEGORICAL palette of five, for the classification ladder,
//               where the values DO share one chart and must be told apart.
//
// Usage: node tools/gen-palette.mjs [--mode light|dark] [--set spectral|verdict]

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bands = JSON.parse(readFileSync(resolve(root, 'schema/bands.json'), 'utf8'))
const spec = JSON.parse(readFileSync(resolve(root, 'schema/spec.json'), 'utf8'))

// --- OKLCH -> sRGB hex -----------------------------------------------------

function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  const gamma = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055)
  const clamp = (u) => Math.max(0, Math.min(255, Math.round(gamma(u) * 255)))

  return '#' + [clamp(r), clamp(g), clamp(bl)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Search for the highest chroma that still round-trips inside sRGB, so each hue
// lands as saturated as it can be without clipping (clipping silently collapses
// two nearby hues into the same colour, which is exactly what we are avoiding).
function maxChroma(L, hDeg, ceiling = 0.32) {
  let lo = 0
  let hi = ceiling
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const hex = oklchToHex(L, mid, hDeg)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const clipped = [r, g, b].some((v) => v <= 0 || v >= 255)
    if (clipped) hi = mid
    else lo = mid
  }
  return lo
}

// --- Sets ------------------------------------------------------------------

const MODE = {
  // Lightness bands chosen for the surface each mode uses. Dark mode is stepped
  // for the dark surface rather than being an automatic inversion of light.
  light: { L: 0.58, Lalt: 0.5, surface: '#f7f7f6' },
  dark: { L: 0.72, Lalt: 0.64, surface: '#0c0e12' },
}

function spectralSet(mode) {
  const { L, Lalt } = MODE[mode]
  return bands.bands.map((b, i) => {
    // Alternate lightness between neighbours. This is the secondary encoding
    // that carries the ramp where hue spacing alone cannot: adjacent bands
    // differ in lightness as well as hue, so they stay separable under CVD.
    const lightness = i % 2 === 0 ? L : Lalt
    const sat = b.saturation === 0 ? 0.008 : maxChroma(lightness, b.hue) * 0.82
    return { id: b.id, label: b.label, hex: oklchToHex(lightness, sat, b.hue) }
  })
}

function verdictSet(mode) {
  const { L, Lalt } = MODE[mode]
  return spec.enums.classification.values.map((v, i) => {
    const lightness = i % 2 === 0 ? L : Lalt
    return {
      id: v.id,
      label: v.label,
      hex: oklchToHex(lightness, maxChroma(lightness, v.hue) * 0.85, v.hue),
    }
  })
}

const args = process.argv.slice(2)
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'dark'
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'spectral'
const rows = set === 'verdict' ? verdictSet(mode) : spectralSet(mode)

if (args.includes('--csv')) {
  console.log(rows.map((r) => r.hex).join(','))
} else if (args.includes('--json')) {
  console.log(JSON.stringify({ mode, set, surface: MODE[mode].surface, rows }, null, 2))
} else {
  console.log(`${set} / ${mode}  surface ${MODE[mode].surface}`)
  for (const r of rows) console.log(`  ${r.hex}  ${r.id.padEnd(10)} ${r.label}`)
  console.log(`\n${rows.map((r) => r.hex).join(',')}`)
}
