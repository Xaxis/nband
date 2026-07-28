import { BANDS, BAND_BY_ID, type Band, type BandId, type Classification } from './schema/generated'

/**
 * nband's colour system, and the reasoning behind why there are two of them.
 *
 * The platform has fourteen bands. Fourteen is far more than any categorical
 * palette can separate: evenly spaced around the hue circle they sit about 26
 * degrees apart, well under the separation floor for colour-vision deficiency.
 * This was measured, not assumed - `tools/gen-palette.mjs` emits the candidate
 * sets and the dataviz validator rejects every fourteen-hue arrangement on
 * adjacent-pair CVD and normal-vision separation. No ordering fixes it.
 *
 * So there are two sets with two different jobs.
 *
 * SPECTRAL is an ordered accent ramp keyed to wavelength, used for band
 * identity: chips, facet accents, the spectrum bar. Two rules make it safe.
 * First, band colour never carries meaning alone - every chip and every facet
 * ships a visible text label, which is what `BandChip` enforces. Second, bands
 * are never drawn as fourteen simultaneous series; the telemetry view uses
 * small multiples, one facet per band, so adjacent hues are separated by
 * layout and heading rather than by hue.
 *
 * VERDICT is a true categorical palette of five for the classification ladder,
 * where the values genuinely do share one chart and must be told apart. It is
 * taken from the validated reference categorical order (blue, orange, aqua,
 * yellow, magenta) which passes every hard gate in both modes on the adjacent
 * pairlist. Light mode carries a sub-3:1 contrast warning on four slots, which
 * obligates visible labels - again enforced at the component level.
 */

// --- OKLCH helpers ---------------------------------------------------------

function oklchToHex(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return (
    '#' +
    lin
      .map((u) => {
        const g = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(Math.max(u, 0), 1 / 2.4) - 0.055
        return Math.max(0, Math.min(255, Math.round(g * 255)))
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

/** Highest in-gamut chroma for a hue at a lightness. Clipping collapses nearby
 *  hues onto the same colour, which is the failure this avoids. */
function maxChroma(L: number, hDeg: number): number {
  let lo = 0
  let hi = 0.32
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const hex = oklchToHex(L, mid, hDeg)
    const parts = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
    if (parts.some((v) => v <= 0 || v >= 255)) hi = mid
    else lo = mid
  }
  return lo
}

export type Mode = 'light' | 'dark'

const SPECTRAL_L: Record<Mode, [number, number]> = {
  light: [0.58, 0.5],
  dark: [0.72, 0.64],
}

/** Accent colour for a band. Alternating lightness between neighbours is the
 *  secondary encoding that carries the ramp where hue spacing cannot. */
export function bandColor(band: Band | BandId, mode: Mode = 'dark'): string {
  const b = typeof band === 'string' ? BAND_BY_ID[band] : band
  const [a, alt] = SPECTRAL_L[mode]
  const L = b.ordinal % 2 === 0 ? a : alt
  const C = b.saturation === 0 ? 0.008 : maxChroma(L, b.hue) * 0.82
  return oklchToHex(L, C, b.hue)
}

export const SPECTRAL: Record<Mode, Record<BandId, string>> = {
  light: Object.fromEntries(BANDS.map((b) => [b.id, bandColor(b, 'light')])) as Record<
    BandId,
    string
  >,
  dark: Object.fromEntries(BANDS.map((b) => [b.id, bandColor(b, 'dark')])) as Record<
    BandId,
    string
  >,
}

/**
 * Verdict palette. Fixed hexes rather than computed, because these are the
 * validated reference categorical steps and re-deriving them would put them
 * back in the warn band. Order matters: it is the adjacency the validator
 * cleared.
 */
export const VERDICT: Record<Mode, Record<Classification, string>> = {
  light: {
    instrumental: '#2a78d6',
    terrestrial_known: '#eb6834',
    terrestrial_likely: '#1baf7a',
    ambiguous: '#eda100',
    anomalous_unresolved: '#e87ba4',
  },
  dark: {
    instrumental: '#3987e5',
    terrestrial_known: '#d95926',
    terrestrial_likely: '#199e70',
    ambiguous: '#c98500',
    anomalous_unresolved: '#d55181',
  },
}

/** Status colours, reserved and never reused as a series colour. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const

// --- Formatting ------------------------------------------------------------

/** Human-readable wavelength or frequency extent for a band. */
export function bandExtent(b: Band): string {
  if (b.wavelength?.minM != null && b.wavelength.maxM != null) {
    return `${formatMetres(b.wavelength.minM)} – ${formatMetres(b.wavelength.maxM)}`
  }
  if (b.frequency?.minHz != null && b.frequency.maxHz != null) {
    return `${formatHertz(b.frequency.minHz)} – ${formatHertz(b.frequency.maxHz)}`
  }
  return ', '
}

export function formatMetres(m: number): string {
  if (m >= 1) return `${trim(m)} m`
  if (m >= 1e-2) return `${trim(m * 100)} cm`
  if (m >= 1e-3) return `${trim(m * 1e3)} mm`
  if (m >= 1e-6) return `${trim(m * 1e6)} µm`
  if (m >= 1e-9) return `${trim(m * 1e9)} nm`
  return `${trim(m * 1e12)} pm`
}

export function formatHertz(hz: number): string {
  if (hz >= 1e12) return `${trim(hz / 1e12)} THz`
  if (hz >= 1e9) return `${trim(hz / 1e9)} GHz`
  if (hz >= 1e6) return `${trim(hz / 1e6)} MHz`
  if (hz >= 1e3) return `${trim(hz / 1e3)} kHz`
  return `${trim(hz)} Hz`
}

function trim(n: number): string {
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(n % 1 === 0 ? 0 : 1)
  return n.toFixed(n % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '')
}

/** Position of a band on a log-wavelength axis, 0 (shortest) to 1 (longest).
 *
 *  Electromagnetic bands only. This previously admitted any band with a
 *  frequency range and converted it with the speed of light, which put the
 *  acoustic and seismic channels on the electromagnetic axis: 20 kHz of sound
 *  was rendered as a 15 km wavelength instead of the 17 mm it actually is in
 *  air. Mechanical and gravitational channels do not belong on this axis at
 *  any position, so they are excluded by kind rather than by whether the
 *  arithmetic happens to produce a number. */
export function logWavelengthPosition(b: Band): { start: number; end: number } | null {
  if (b.kind !== 'electromagnetic') return null
  const lo = b.wavelength?.minM ?? (b.frequency?.maxHz ? 3e8 / b.frequency.maxHz : null)
  const hi = b.wavelength?.maxM ?? (b.frequency?.minHz ? 3e8 / b.frequency.minHz : null)
  if (lo == null || hi == null || lo <= 0 || hi <= 0) return null
  // Domain spans gamma (1e-14 m) to the long end of ELF (1e7 m, 30 Hz).
  const D_LO = Math.log10(1e-14)
  const D_HI = Math.log10(1e7)
  // Clamp rather than drop: ELF wavelengths genuinely run to thousands of
  // kilometres, past the plotted domain, and a band that exists should be
  // shown reaching the edge rather than silently omitted.
  const norm = (v: number) =>
    Math.min(Math.max((Math.log10(v) - D_LO) / (D_HI - D_LO), 0), 1)
  return { start: norm(lo), end: norm(hi) }
}
