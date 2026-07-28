'use client'

import { useMemo, useState } from 'react'
import { evaluate, type CatalogId, type CatalogState } from '../lib/discriminator/engine'
import {
  CATALOGSOURCE,
  CLASSIFICATION,
  CORROBORATION,
  DETECTION_BANDS,
  THRESHOLDS,
} from '../lib/schema/generated'
import { SPECTRAL, VERDICT } from '../lib/spectrum'

/**
 * Interactive discriminator.
 *
 * Runs the real scoring logic, not a mock of it: this imports the same module
 * the parity check holds against the Python engine, so a verdict shown here is
 * the verdict the archive would record. The gates are much easier to believe
 * once you can turn one off and watch the classification fall.
 */

const CATALOGS: CatalogId[] = ['adsb', 'tle', 'lightning', 'rfi', 'weather']
// 'eclipsed' is offered only for the satellite catalogue, where it means a
// bearing match that cannot explain an optical detection.
const CATALOG_STATES: CatalogState[] = ['clean', 'match', 'unavailable']
const STATE_LABEL: Record<CatalogState, string> = {
  clean: 'checked, no match',
  match: 'matched',
  unavailable: 'unreachable',
  eclipsed: 'matched, in eclipse',
}

/** States a given catalogue can actually be in. */
function statesFor(c: CatalogId): CatalogState[] {
  return c === 'tle' ? [...CATALOG_STATES, 'eclipsed'] : CATALOG_STATES
}

const CLOCKS = ['gnss_pps', 'gnss_nopps', 'ntp', 'freerun'] as const

const PRESETS = [
  {
    id: 'textbook',
    label: 'Clean multi-node track',
    note: 'The only shape that can reach the top rung.',
    bands: ['vis', 'lwir', 'mmw'],
    clock: 'gnss_pps' as const,
    nodeCount: 2,
    rangeM: 900,
    durationS: 2,
    peakZ: 6,
    catalogs: Object.fromEntries(CATALOGS.map((c) => [c, 'clean'])) as Record<CatalogId, CatalogState>,
  },
  {
    id: 'airliner',
    label: 'Ordinary airliner',
    note: 'What most events actually look like.',
    bands: ['vis', 'nir', 'acoustic'],
    clock: 'gnss_pps' as const,
    nodeCount: 1,
    rangeM: null,
    durationS: 6,
    peakZ: 5,
    catalogs: { adsb: 'match', tle: 'clean', lightning: 'clean', rfi: 'clean', weather: 'clean' } as Record<CatalogId, CatalogState>,
  },
  {
    id: 'glitch',
    label: 'Sensor glitch',
    note: 'A 40-sigma spike on one channel is a fault, not a discovery.',
    bands: ['lwir'],
    clock: 'gnss_pps' as const,
    nodeCount: 1,
    rangeM: null,
    durationS: 0.5,
    peakZ: 40,
    catalogs: Object.fromEntries(CATALOGS.map((c) => [c, 'clean'])) as Record<CatalogId, CatalogState>,
  },
  {
    id: 'blind',
    label: 'Catalogues down',
    note: 'Nothing could be checked, so nothing can be claimed.',
    bands: ['vis', 'lwir', 'mmw'],
    clock: 'gnss_pps' as const,
    nodeCount: 2,
    rangeM: 900,
    durationS: 2,
    peakZ: 6,
    catalogs: Object.fromEntries(CATALOGS.map((c) => [c, 'unavailable'])) as Record<CatalogId, CatalogState>,
  },
]

export function DiscriminatorPlayground() {
  const [preset, setPreset] = useState(PRESETS[0].id)
  const [bands, setBands] = useState<string[]>(PRESETS[0].bands)
  const [clock, setClock] = useState<(typeof CLOCKS)[number]>('gnss_pps')
  const [nodeCount, setNodeCount] = useState(2)
  const [hasRange, setHasRange] = useState(true)
  const [durationS, setDurationS] = useState(2)
  const [peakZ, setPeakZ] = useState(6)
  const [catalogs, setCatalogs] = useState<Record<CatalogId, CatalogState>>(PRESETS[0].catalogs)

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id)!
    setPreset(id)
    setBands(p.bands)
    setClock(p.clock)
    setNodeCount(p.nodeCount)
    setHasRange(p.rangeM !== null)
    setDurationS(p.durationS)
    setPeakZ(p.peakZ)
    setCatalogs(p.catalogs)
  }

  const verdict = useMemo(
    () =>
      evaluate({
        bands,
        clock,
        nodeCount,
        rangeM: hasRange ? 900 : null,
        durationS,
        peakZ,
        angularRateDps: null,
        catalogs,
      }),
    [bands, clock, nodeCount, hasRange, durationS, peakZ, catalogs],
  )

  const cls = CLASSIFICATION[verdict.classification]
  const colour = `light-dark(${VERDICT.light[verdict.classification]}, ${VERDICT.dark[verdict.classification]})`

  // Why the top rung is closed, stated plainly rather than left to inference.
  const blockers: string[] = []
  if (new Set(bands).size < THRESHOLDS.minBandsForUnresolved) {
    blockers.push(`fewer than ${THRESHOLDS.minBandsForUnresolved} bands`)
  }
  if (verdict.corroboration === 'single_channel') blockers.push('single channel only')
  if (verdict.unavailableCatalogs.length) {
    blockers.push(`${verdict.unavailableCatalogs.join(', ')} unreachable`)
  }
  if (clock !== 'gnss_pps') blockers.push('clock not PPS-disciplined')
  if (
    verdict.anomalyScore < THRESHOLDS.anomalyScoreUnresolvedFloor &&
    verdict.classification !== 'anomalous_unresolved'
  ) {
    blockers.push(`score below ${THRESHOLDS.anomalyScoreUnresolvedFloor}`)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---- Controls ---- */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
                preset === p.id
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">
          {PRESETS.find((p) => p.id === preset)?.note}
        </p>

        <div className="mt-5">
          <p className="eyebrow mb-2">Bands that witnessed it</p>
          <div className="flex flex-wrap gap-1.5">
            {DETECTION_BANDS.map((b) => {
              const on = bands.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setPreset('')
                    setBands((prev) =>
                      prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                    )
                  }}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-colors ${
                    on
                      ? 'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--ink)]'
                      : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-[2px]"
                    style={{
                      background: on
                        ? `light-dark(${SPECTRAL.light[b.id]}, ${SPECTRAL.dark[b.id]})`
                        : 'var(--line-strong)',
                    }}
                  />
                  {b.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5">
          <p className="eyebrow mb-2">Catalogues</p>
          <div className="space-y-1.5">
            {CATALOGS.map((c) => (
              <div key={c} className="flex items-center gap-2">
                <span className="num w-[74px] shrink-0 text-[11.5px] text-[var(--ink-2)]">
                  {CATALOGSOURCE[c].label}
                </span>
                <div className="flex overflow-hidden rounded-md border border-[var(--line)]">
                  {statesFor(c).map((s) => {
                    // The site's own RFI baseline is derived locally, so it can
                    // never be unreachable. Offering the option would be a lie.
                    const disabled = c === 'rfi' && s === 'unavailable'
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setPreset('')
                          setCatalogs((prev) => ({ ...prev, [c]: s }))
                        }}
                        className={`num px-2 py-1 text-[10.5px] transition-colors ${
                          catalogs[c] === s
                            ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                            : disabled
                              ? 'cursor-not-allowed bg-[var(--surface-3)] text-[var(--ink-3)] opacity-40'
                              : 'bg-[var(--surface-3)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                        }`}
                        title={disabled ? 'Learned locally; cannot be unreachable' : STATE_LABEL[s]}
                      >
                        {STATE_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Clock</p>
            <div className="flex flex-wrap gap-1">
              {CLOCKS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setPreset('')
                    setClock(c)
                  }}
                  className={`num rounded px-1.5 py-1 text-[10.5px] transition-colors ${
                    clock === c
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'border border-[var(--line)] text-[var(--ink-2)]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--ink-2)]">
              <span>Nodes</span>
              <input
                type="range"
                min={1}
                max={3}
                value={nodeCount}
                onChange={(e) => {
                  setPreset('')
                  setNodeCount(Number(e.target.value))
                }}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="num w-4 text-right">{nodeCount}</span>
            </label>
            <label className="flex items-center justify-between gap-2 text-[11.5px] text-[var(--ink-2)]">
              <span className="whitespace-nowrap">Peak σ</span>
              <input
                type="range"
                min={2}
                max={45}
                value={peakZ}
                onChange={(e) => {
                  setPreset('')
                  setPeakZ(Number(e.target.value))
                }}
                className="h-1 flex-1 accent-[var(--accent)]"
              />
              <span className="num w-6 text-right">{peakZ}</span>
            </label>
            <label className="flex items-center gap-2 text-[11.5px] text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={hasRange}
                onChange={(e) => {
                  setPreset('')
                  setHasRange(e.target.checked)
                }}
                className="accent-[var(--accent)]"
              />
              Radar measured a range
            </label>
          </div>
        </div>
      </div>

      {/* ---- Verdict ---- */}
      <div className="card overflow-hidden" style={{ borderLeft: `3px solid ${colour}` }}>
        <div className="border-b border-[var(--line)] p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-[19px] font-semibold tracking-tight text-[var(--ink)]">
              {cls.label}
            </h3>
            <span className="num text-[13px] text-[var(--ink-2)]">
              score {verdict.anomalyScore.toFixed(1)} · {CORROBORATION[verdict.corroboration].label}
            </span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{cls.summary}</p>

          {verdict.classification !== 'anomalous_unresolved' && blockers.length > 0 && (
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
              <span className="text-[#fab219]">Top rung closed by:</span> {blockers.join('; ')}.
            </p>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <p className="eyebrow mb-2.5">Hypothesis posteriors</p>
          <div className="space-y-1.5">
            {verdict.hypotheses.slice(0, 6).map((h) => (
              <div key={h.id} className="flex items-center gap-2.5">
                <span className="w-[112px] shrink-0 truncate text-[11.5px] text-[var(--ink-2)]">
                  {h.label}
                </span>
                <span className="flex h-3 flex-1 items-center">
                  <span
                    className="h-1.5 rounded-[1px]"
                    style={{
                      width: `${Math.max(h.posterior * 100, 0.6)}%`,
                      background:
                        h.id === 'unmodelled'
                          ? colour
                          : 'light-dark(#1e5d9e, #3a8fc0)',
                    }}
                  />
                </span>
                <span className="num w-[38px] shrink-0 text-right text-[11px] text-[var(--ink-3)]">
                  {h.posterior.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <p className="eyebrow mb-2 mt-5">Written verdict</p>
          <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{verdict.explanation}</p>
        </div>
      </div>
    </div>
  )
}
