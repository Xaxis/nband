'use client'

import { useState } from 'react'
import {
  BANDS,
  DETECTION_BANDS,
  PHENOMENA,
  type Band,
  type PhenomenonId,
} from '../lib/schema/generated'
import { SPECTRAL, formatMetres } from '../lib/spectrum'

/**
 * Visual reference for what each band can actually do.
 *
 * The colour rules from lib/spectrum.ts apply throughout. The detection matrix
 * is a magnitude encoding, so it uses a single-hue sequential ramp rather than
 * the band palette: band identity is carried by the row label, and the cell
 * colour means "how well", which is a different job needing a different scale.
 * Every cell also prints its own value, so nothing here depends on
 * distinguishing two shades.
 */

const STRENGTH_LABEL = ['blind', 'marginal', 'usable', 'strong'] as const

// Single-hue sequential ramp for the 0-3 magnitude scale. Both modes were run
// through the palette validator: monotone lightness, adjacent steps at least
// 0.06 apart, and critically the zero step clears 2:1 against the card surface.
// An earlier version had a near-invisible zero, which made a recorded "blind"
// read as an empty cell. The zeroes in this table are the informative part, so
// they have to be visibly present rather than absent.
const RAMP_DARK = ['#41505f', '#3a6b8f', '#3a8fc0', '#5cb4e6']
const RAMP_LIGHT = ['#aab8c6', '#7aa6c6', '#3f80b8', '#1e5d9e']

function cellStyle(v: number) {
  return {
    background: `light-dark(${RAMP_LIGHT[v]}, ${RAMP_DARK[v]})`,
    color: `light-dark(${v >= 2 ? '#ffffff' : '#14171d'}, ${v >= 2 ? '#04121c' : '#e8eef5'})`,
  }
}

export function DetectionMatrix() {
  const [hover, setHover] = useState<{ band: string; phen: string } | null>(null)
  const bands = DETECTION_BANDS

  return (
    <figure className="m-0">
      <div className="card scroll-x">
        <table className="w-full min-w-[760px] border-collapse">
          <caption className="sr-only">
            Detection strength of each band for each phenomenon, from 0 (blind) to 3 (strong).
          </caption>
          <thead>
            <tr>
              <th className="eyebrow sticky left-0 z-10 bg-[var(--surface-3)] px-3 py-2.5 text-left font-normal">
                Band
              </th>
              {PHENOMENA.map((p) => (
                <th
                  key={p.id}
                  className="bg-[var(--surface-3)] px-1 py-2.5 text-center align-bottom"
                  scope="col"
                >
                  <span className="num block text-[10.5px] leading-tight text-[var(--ink-2)]">
                    {p.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr key={b.id} className="border-t border-[var(--line)]">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface-2)] px-3 py-1.5 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{
                        background: `light-dark(${SPECTRAL.light[b.id]}, ${SPECTRAL.dark[b.id]})`,
                      }}
                    />
                    <span className="text-[12.5px] font-medium text-[var(--ink)]">{b.label}</span>
                  </span>
                </th>
                {PHENOMENA.map((p) => {
                  const v = b.profile.detects[p.id as PhenomenonId]
                  const on = hover?.band === b.id || hover?.phen === p.id
                  return (
                    <td
                      key={p.id}
                      className="p-[2px]"
                      onMouseEnter={() => setHover({ band: b.id, phen: p.id })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span
                        className="num flex h-7 items-center justify-center rounded-[3px] text-[11px] transition-opacity"
                        style={{ ...cellStyle(v), opacity: hover && !on ? 0.4 : 1 }}
                        title={`${b.label} vs ${p.label}: ${STRENGTH_LABEL[v]}`}
                      >
                        {v}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="eyebrow">Detection strength</span>
        {STRENGTH_LABEL.map((label, v) => (
          <span key={label} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
            <span
              aria-hidden="true"
              className="num flex h-4 w-4 items-center justify-center rounded-[2px] text-[9px]"
              style={cellStyle(v)}
            >
              {v}
            </span>
            {label}
          </span>
        ))}
      </figcaption>

      <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Read the columns, not the rows. Every phenomenon here is visible in several bands, which is
        why a coincidence between two of them is evidence and a single bright pixel is not. The
        zeroes matter as much as the threes: gamma is blind to almost everything in this table, and
        publishing that is more useful than implying otherwise.
      </p>
    </figure>
  )
}

/** Horizontal magnitude bars for one band's operating envelope. */
function Meter({ label, value, max = 3 }: { label: string; value: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="num w-[52px] shrink-0 text-[10.5px] text-[var(--ink-3)]">{label}</span>
      <span className="flex flex-1 gap-[2px]" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-[1px]"
            style={{
              background:
                i < value
                  ? 'light-dark(#2a78d6, #3f9fd4)'
                  : 'light-dark(#e2e6ec, #1c2129)',
            }}
          />
        ))}
      </span>
      <span className="num w-[46px] shrink-0 text-right text-[10.5px] text-[var(--ink-3)]">
        {STRENGTH_LABEL[value]}
      </span>
    </div>
  )
}

/** Compact operating-envelope panel shown on every band card. */
export function BandProfilePanel({ band }: { band: Band }) {
  const p = band.profile
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h4 className="eyebrow mb-2">Works when</h4>
        <div className="space-y-1.5">
          <Meter label="daylight" value={p.day} />
          <Meter label="darkness" value={p.night} />
        </div>
        <h4 className="eyebrow mb-2 mt-4">Sees through</h4>
        <div className="space-y-1.5">
          <Meter label="cloud" value={p.penetrates.cloud} />
          <Meter label="rain" value={p.penetrates.rain} />
          <Meter label="fog" value={p.penetrates.fog} />
          <Meter label="smoke" value={p.penetrates.smoke} />
        </div>
      </div>

      <div>
        <h4 className="eyebrow mb-2">Practical reach</h4>
        <p className="num text-[20px] font-semibold leading-none text-[var(--ink)]">
          {p.typicalRangeM >= 1000
            ? `${(p.typicalRangeM / 1000).toFixed(p.typicalRangeM >= 10000 ? 0 : 1)} km`
            : `${p.typicalRangeM} m`}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]">
          order of magnitude for an aircraft-sized target in good conditions
        </p>

        <h4 className="eyebrow mb-2 mt-4">Cheapest way in</h4>
        <p className="num text-[20px] font-semibold leading-none text-[var(--ink)]">
          {p.entryCostUsd >= 1000
            ? `$${(p.entryCostUsd / 1000).toFixed(p.entryCostUsd >= 10000 ? 0 : 1)}k`
            : `$${p.entryCostUsd.toFixed(0)}`}
        </p>
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]">
          lowest registered part that opens this band
        </p>
      </div>
    </div>
  )
}

/**
 * Atmospheric transmission, and why the band list looks the way it does.
 *
 * The bands nband samples are not an arbitrary selection. They are the windows
 * the atmosphere actually leaves open. Plotting opacity against wavelength and
 * overlaying the bands makes the whole taxonomy legible in one picture.
 */
export function AtmosphericWindow() {
  // Approximate sea-level opacity, 0 transparent to 1 opaque, sampled by
  // log10(wavelength in metres). Coarse by design: the shape is the argument.
  const points: Array<[number, number]> = [
    [-14, 1], [-12, 1], [-10, 1], [-9, 1], [-8.3, 1],
    [-7.5, 1], [-7.1, 0.95], [-6.9, 0.55],
    [-6.6, 0.05], [-6.3, 0.02], [-6.15, 0.1],
    [-6.0, 0.35], [-5.85, 0.15], [-5.7, 0.55],
    [-5.5, 0.85], [-5.2, 0.95], [-5.0, 0.35],
    [-4.9, 0.2], [-4.75, 0.9], [-4.3, 1], [-3.6, 1],
    [-3.2, 0.9], [-2.8, 0.35], [-2.2, 0.08],
    [-1.5, 0.02], [0, 0.02], [0.7, 0.05],
    [1.2, 0.4], [1.6, 0.9], [2.2, 1], [3, 1],
  ]

  const W = 1000
  const H = 150
  const D_LO = -14
  const D_HI = 3
  const x = (e: number) => ((e - D_LO) / (D_HI - D_LO)) * W
  const y = (o: number) => 8 + (1 - o) * (H - 30)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const area = `${path}L${W},${H - 22}L0,${H - 22}Z`

  const overlay = BANDS.filter((b) => b.wavelength?.minM && b.wavelength?.maxM).map((b) => ({
    b,
    x0: x(Math.log10(b.wavelength!.minM!)),
    x1: x(Math.log10(b.wavelength!.maxM!)),
  }))

  return (
    <figure className="m-0">
      <div className="card scroll-x p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full min-w-[520px]"
          role="img"
          aria-label="Atmospheric opacity against wavelength, with the bands nband samples overlaid. The optical, infrared, and radio windows are the transparent regions."
        >
          {overlay.map(({ b, x0, x1 }) => (
            <rect
              key={b.id}
              x={x0}
              y={4}
              width={Math.max(x1 - x0, 2)}
              height={H - 26}
              fill={`light-dark(${SPECTRAL.light[b.id]}, ${SPECTRAL.dark[b.id]})`}
              opacity="0.14"
            />
          ))}

          <path d={area} fill="var(--ink-3)" opacity="0.16" />
          <path d={path} fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeLinejoin="round" />

          <line x1="0" x2={W} y1={H - 22} y2={H - 22} stroke="var(--line-strong)" strokeWidth="1" />
          {[-14, -11, -8, -6, -3, 0, 3].map((e) => (
            <text
              key={e}
              x={Math.min(Math.max(x(e), 22), W - 22)}
              y={H - 8}
              textAnchor="middle"
              fontSize="13"
              fill="var(--ink-3)"
              className="num"
            >
              {formatMetres(Math.pow(10, e))}
            </text>
          ))}
          <text x="6" y="18" fontSize="13" fill="var(--ink-3)" className="num">
            opaque
          </text>
          <text x="6" y={H - 30} fontSize="13" fill="var(--ink-3)" className="num">
            transparent
          </text>
        </svg>
      </div>
      <figcaption className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        The band list is not a design choice. It is the set of windows the atmosphere leaves open.
        Where the curve drops, radiation reaches the ground and a sensor is worth building; where it
        rises, nothing arrives and no amount of money buys a detection. This is also why the
        gravimetric, acoustic, and seismic channels exist at all: they carry information through
        exactly the regions where the electromagnetic spectrum is closed.
      </figcaption>
    </figure>
  )
}
