'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BAND_BY_ID, CLASSIFICATION } from '../../lib/schema/generated'
import { SPECTRAL, VERDICT } from '../../lib/spectrum'
import {
  type EventMarker,
  type NodeSummary,
  type Series,
  type Window,
} from '../../lib/feed/types'

const RANGES = [
  { id: '1h', label: '1 h', ms: 3_600_000 },
  { id: '6h', label: '6 h', ms: 21_600_000 },
  { id: '24h', label: '24 h', ms: 86_400_000 },
  { id: '7d', label: '7 d', ms: 604_800_000 },
] as const

type RangeId = (typeof RANGES)[number]['id']

const PAD = { l: 46, r: 8, t: 8, b: 16 }
const H = 92

function niceExtent(values: number[], fixed: [number, number] | null): [number, number] {
  if (fixed) return fixed
  if (values.length === 0) return [0, 1]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (lo === hi) {
    lo -= 0.5
    hi += 0.5
  }
  const pad = (hi - lo) * 0.12
  return [lo - pad, hi + pad]
}

function fmtValue(v: number): string {
  const a = Math.abs(v)
  if (a >= 10_000) return v.toFixed(0)
  if (a >= 100) return v.toFixed(1)
  if (a >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

function fmtClock(t: number): string {
  return new Date(t).toISOString().slice(11, 19) + 'Z'
}

function fmtStamp(t: number): string {
  return new Date(t).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

/**
 * What a chart says, in a sentence.
 *
 * A line chart is an image to a screen reader, and "sky temperature, 320
 * samples" conveys nothing about what the sky did. This states the range, the
 * direction of travel, and whether anything was flagged, which is most of what
 * the picture shows at a glance.
 */
function summarise(series: Series, lo: number, hi: number): string {
  const pts = series.points
  if (pts.length === 0) return `${series.label}: no samples in this window`

  const values = pts.map((p) => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const first = values[0]
  const last = values[values.length - 1]
  const spread = Math.max(hi - lo, 1e-9)
  const drift =
    Math.abs(last - first) < spread * 0.05
      ? 'roughly flat'
      : last > first
        ? 'rising'
        : 'falling'
  const flagged = pts.filter((p) => p.q !== 0).length

  return (
    `${series.label}, ${series.unit}. ${pts.length} samples, ${drift}. ` +
    `Range ${fmtValue(min)} to ${fmtValue(max)}, mean ${fmtValue(mean)}. ` +
    (flagged ? `${flagged} samples flagged as compromised.` : 'No samples flagged.')
  )
}

/** One band, one chart. Bands are never overlaid: fourteen hues cannot be told
 *  apart reliably, so identity comes from the heading and colour only accents. */
function Facet({
  series,
  window: win,
  cursor,
  onCursor,
  events,
}: {
  series: Series
  window: Window
  cursor: number | null
  onCursor: (t: number | null) => void
  events: EventMarker[]
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const band = BAND_BY_ID[series.band]
  const light = SPECTRAL.light[series.band]
  const dark = SPECTRAL.dark[series.band]

  const innerW = Math.max(width - PAD.l - PAD.r, 10)
  const innerH = H - PAD.t - PAD.b

  const [lo, hi] = useMemo(
    () => niceExtent(series.points.map((p) => p.v), series.displayRange),
    [series],
  )

  const x = useCallback(
    (t: number) => PAD.l + ((t - win.from) / Math.max(win.to - win.from, 1)) * innerW,
    [win, innerW],
  )
  const y = useCallback(
    (v: number) => PAD.t + innerH - ((v - lo) / Math.max(hi - lo, 1e-9)) * innerH,
    [lo, hi, innerH],
  )

  const { linePath, areaPath } = useMemo(() => {
    if (series.points.length === 0) return { linePath: '', areaPath: '' }
    const d = series.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join('')
    const first = series.points[0]
    const last = series.points[series.points.length - 1]
    return {
      linePath: d,
      areaPath: `${d}L${x(last.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)}L${x(first.t).toFixed(2)},${(PAD.t + innerH).toFixed(2)}Z`,
    }
  }, [series, x, y, innerH])

  // Nearest sample to the shared cursor, so every facet reports the same instant.
  const hit = useMemo(() => {
    if (cursor == null || series.points.length === 0) return null
    let best = series.points[0]
    let bestD = Infinity
    for (const p of series.points) {
      const d = Math.abs(p.t - cursor)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }, [cursor, series])

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const frac = (px - PAD.l) / innerW
    if (frac < 0 || frac > 1) return onCursor(null)
    onCursor(win.from + frac * (win.to - win.from))
  }

  const badSpans = series.points.filter((p) => p.q !== 0)

  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 pt-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: `light-dark(${light}, ${dark})` }}
          />
          <h3 className="text-[13px] font-medium text-[var(--ink)]">{series.label}</h3>
          <span className="num text-[10.5px] text-[var(--ink-3)]">{band.label}</span>
        </div>
        <div className="num text-[12px] text-[var(--ink-2)]">
          {hit ? `${fmtValue(hit.v)} ${series.unit}` : <span className="text-[var(--ink-3)]">{series.unit}</span>}
        </div>
      </div>

      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        onPointerMove={handleMove}
        onPointerLeave={() => onCursor(null)}
        className="block touch-none"
        role="img"
        aria-label={summarise(series, lo, hi)}
      >
        {/* Event bands sit behind the data. */}
        {events.map((ev) => {
          const x0 = x(ev.tStart)
          const x1 = Math.max(x(ev.tEnd), x0 + 1.5)
          if (x1 < PAD.l || x0 > PAD.l + innerW) return null
          const c = `light-dark(${VERDICT.light[ev.classification]}, ${VERDICT.dark[ev.classification]})`
          return (
            <rect
              key={ev.id}
              x={x0}
              y={PAD.t}
              width={x1 - x0}
              height={innerH}
              fill={c}
              opacity={ev.bands.includes(series.band) ? 0.22 : 0.07}
            />
          )
        })}

        {/* Recessive gridlines: two interior rules, nothing more. */}
        {[0.5].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            x2={PAD.l + innerW}
            y1={PAD.t + innerH * f}
            y2={PAD.t + innerH * f}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill={`light-dark(${light}, ${dark})`} opacity="0.1" />
        <path
          d={linePath}
          fill="none"
          stroke={`light-dark(${light}, ${dark})`}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Compromised samples are marked, never dropped: a silent gap reads as
            "nothing happened" when it means "we could not trust this". */}
        {badSpans.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r="2" fill="#fab219" opacity="0.9" />
        ))}

        {/* Axis labels */}
        <text x={PAD.l - 6} y={PAD.t + 8} textAnchor="end" className="num" fontSize="9.5" fill="var(--ink-3)">
          {fmtValue(hi)}
        </text>
        <text x={PAD.l - 6} y={PAD.t + innerH} textAnchor="end" className="num" fontSize="9.5" fill="var(--ink-3)">
          {fmtValue(lo)}
        </text>

        {cursor != null && hit && (
          <>
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={PAD.t}
              y2={PAD.t + innerH}
              stroke="var(--ink-3)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={x(hit.t)}
              cy={y(hit.v)}
              r="3.5"
              fill={`light-dark(${light}, ${dark})`}
              stroke="var(--surface-2)"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </div>
  )
}

export function TelemetryView({
  nodes,
  initialNode,
}: {
  nodes: NodeSummary[]
  initialNode: string
}) {
  const [nodeSlug, setNodeSlug] = useState(initialNode)
  const [rangeId, setRangeId] = useState<RangeId>('6h')
  // 0 = live edge, 1 = one full window into the past, and so on.
  const [scrub, setScrub] = useState(0)
  const [cursor, setCursor] = useState<number | null>(null)
  const [now, setNow] = useState<number | null>(null)
  const [live, setLive] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [data, setData] = useState<{ series: Series[]; events: EventMarker[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)

  // `now` is resolved on the client only, because deriving it during render
  // would make the server and client disagree about what "now" is and the
  // charts would hydrate against a different window than they rendered with.
  // The rule below flags the mount-time write; that write is the entire point.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now())
    if (!live) return
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [live])

  const range = RANGES.find((r) => r.id === rangeId)!
  const window: Window | null = useMemo(() => {
    if (now == null) return null
    const to = now - scrub * range.ms
    return { from: to - range.ms, to }
  }, [now, scrub, range])

  // Fetching the window is a genuine side effect, and showing the loading
  // state before the request goes out is what stops the previous window's data
  // reading as though it were the new one.
  useEffect(() => {
    if (!window) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    const params = new URLSearchParams({
      node: nodeSlug,
      from: String(Math.round(window.from)),
      to: String(Math.round(window.to)),
    })
    fetch(`/api/telemetry?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error ?? `feed returned ${r.status}`)
        }
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setFeedError(null)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        // A failed request used to render as "No data in this window", which
        // says the sky was quiet when the truth is that we could not look.
        setFeedError(err instanceof Error ? err.message : 'could not reach the feed')
        setData(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nodeSlug, window?.from, window?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const node = nodes.find((n) => n.slug === nodeSlug)
  const series = data?.series ?? []
  const events = data?.events ?? []

  const activeEvent = useMemo(() => {
    if (cursor == null) return null
    return events.find((e) => cursor >= e.tStart && cursor <= e.tEnd) ?? null
  }, [cursor, events])

  return (
    <div>
      {/* Controls, one row above the charts. */}
      <div className="card mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink-2)]">
          <span className="eyebrow">Node</span>
          <select
            value={nodeSlug}
            onChange={(e) => setNodeSlug(e.target.value)}
            className="num rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-[12.5px] text-[var(--ink)]"
          >
            {nodes.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.displayName} · {n.status}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5">
          <span className="eyebrow">Window</span>
          <div className="flex overflow-hidden rounded-md border border-[var(--line)]">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRangeId(r.id)
                  setScrub(0)
                }}
                className={`num px-2.5 py-1.5 text-[12px] transition-colors ${
                  r.id === rangeId
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                    : 'bg-[var(--surface-3)] text-[var(--ink-2)] hover:text-[var(--ink)]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex min-w-[210px] flex-1 items-center gap-2.5">
          <span className="eyebrow shrink-0">Scrub</span>
          <input
            type="range"
            min={0}
            max={28}
            step={0.5}
            value={28 - scrub}
            onChange={(e) => {
              setScrub(28 - Number(e.target.value))
              setLive(false)
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--line-strong)] accent-[var(--accent)]"
            aria-label="Scrub backwards through history"
          />
          <span className="num w-[74px] shrink-0 text-right text-[11.5px] text-[var(--ink-3)]">
            {scrub === 0 ? 'live edge' : `−${(scrub * range.ms) / 3_600_000 < 48 ? `${((scrub * range.ms) / 3_600_000).toFixed(1)} h` : `${((scrub * range.ms) / 86_400_000).toFixed(1)} d`}`}
          </span>
        </label>

        <button
          type="button"
          onClick={() => {
            setScrub(0)
            setLive(true)
          }}
          className="num rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          Jump to live
        </button>

        {/* The label used to name the destination while aria-pressed described
            the current state, so a screen reader announced "Table, pressed"
            while the charts were showing: the inverse of the truth. The control
            is now named for what it toggles, and the pressed state carries
            whether it is active. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="num rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[12px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
          aria-pressed={showTable}
        >
          Table view
        </button>
      </div>

      {/* Node status strip */}
      {node && (
        <div className="card mb-4 grid gap-x-6 gap-y-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { k: 'Status', v: node.status },
            { k: 'Tier', v: node.tier.toUpperCase() },
            {
              k: 'Clock',
              v: node.clock === 'gnss_pps' ? `PPS ±${node.clockOffsetNs ?? ', '} ns` : node.clock,
            },
            { k: 'Bands', v: String(node.bands.length) },
            { k: 'Power', v: node.powerW != null ? `${node.powerW.toFixed(1)} W` : ', ' },
            { k: 'Firmware', v: node.firmwareVersion },
          ].map((s) => (
            <div key={s.k}>
              <div className="eyebrow">{s.k}</div>
              <div className="num mt-0.5 text-[13px] text-[var(--ink)]">{s.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline readout */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className="num text-[11.5px] text-[var(--ink-3)]">
          {window ? `${fmtStamp(window.from)} → ${fmtStamp(window.to)}` : 'resolving clock…'}
        </span>
        <span className="num text-[11.5px] text-[var(--ink-3)]">
          {cursor != null ? fmtClock(cursor) : `${events.length} events in window`}
        </span>
      </div>

      {activeEvent && (
        <div
          className="card mb-3 p-3"
          style={{
            borderLeft: `3px solid light-dark(${VERDICT.light[activeEvent.classification]}, ${VERDICT.dark[activeEvent.classification]})`,
          }}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold text-[var(--ink)]">
              {CLASSIFICATION[activeEvent.classification].label}
            </span>
            <span className="num text-[11.5px] text-[var(--ink-3)]">
              score {activeEvent.anomalyScore} · {activeEvent.corroboration.replace('_', ' ')} ·{' '}
              {activeEvent.bands.join(', ')}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
            {activeEvent.summary}
          </p>
        </div>
      )}

      {/* Small multiples: one facet per channel, shared x-axis and cursor. */}
      {showTable ? (
        <div className="card scroll-x" role="region" aria-label="Telemetry summary table">
          <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2 font-normal">Channel</th>
                <th className="eyebrow px-3 py-2 font-normal">Band</th>
                <th className="eyebrow px-3 py-2 text-right font-normal">Min</th>
                <th className="eyebrow px-3 py-2 text-right font-normal">Mean</th>
                <th className="eyebrow px-3 py-2 text-right font-normal">Max</th>
                <th className="eyebrow px-3 py-2 text-right font-normal">Samples</th>
                <th className="eyebrow px-3 py-2 text-right font-normal">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const vs = s.points.map((p) => p.v)
                const mean = vs.reduce((a, b) => a + b, 0) / Math.max(vs.length, 1)
                return (
                  <tr key={s.channelId} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2 text-[var(--ink)]">{s.label}</td>
                    <td className="px-3 py-2 text-[var(--ink-2)]">{BAND_BY_ID[s.band].label}</td>
                    <td className="num px-3 py-2 text-right text-[var(--ink-2)]">
                      {fmtValue(Math.min(...vs))}
                    </td>
                    <td className="num px-3 py-2 text-right text-[var(--ink-2)]">{fmtValue(mean)}</td>
                    <td className="num px-3 py-2 text-right text-[var(--ink-2)]">
                      {fmtValue(Math.max(...vs))}
                    </td>
                    <td className="num px-3 py-2 text-right text-[var(--ink-3)]">{vs.length}</td>
                    <td className="num px-3 py-2 text-right text-[var(--ink-3)]">
                      {s.points.filter((p) => p.q !== 0).length}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Points a screen reader at the equivalent data. Each chart carries
              its own spoken summary, but a table is what you want if you are
              actually reading numbers rather than skimming shapes. */}
          <p className="sr-only">
            {series.length} charts follow, one per channel. Each has a spoken summary of its
            range and direction. For exact values, use the Table view control above.
          </p>
          {loading && series.length === 0 && (
            <div className="num p-8 text-center text-[12.5px] text-[var(--ink-3)]">
              loading window…
            </div>
          )}
          {!loading && feedError && (
            <div className="p-8 text-center">
              <p className="text-[13.5px] text-[#d03b3b]">Could not load telemetry.</p>
              <p className="num mt-1 text-[11.5px] text-[var(--ink-3)]">
                {feedError}. This is a failure to read the feed, not a quiet sky.
              </p>
            </div>
          )}
          {!loading && !feedError && series.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-[13.5px] text-[var(--ink-2)]">No data in this window.</p>
              <p className="num mt-1 text-[11.5px] text-[var(--ink-3)]">
                {node?.status === 'offline'
                  ? 'This node is offline. Buffered data may still arrive; the schema is offline-first.'
                  : 'Try a wider window or scrub back.'}
              </p>
            </div>
          )}
          {window &&
            series.map((s) => (
              <Facet
                key={s.channelId}
                series={s}
                window={window}
                cursor={cursor}
                onCursor={setCursor}
                events={events}
              />
            ))}
        </div>
      )}

      {/* Legend for the event overlay. Colour is never the only cue: each entry
          is labelled, which is also what the light-mode contrast check requires. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <span className="eyebrow">Event overlay</span>
        {Object.entries(CLASSIFICATION).map(([id, meta]) => (
          <span key={id} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-[2px]"
              style={{
                background: `light-dark(${VERDICT.light[id as keyof typeof VERDICT.light]}, ${VERDICT.dark[id as keyof typeof VERDICT.dark]})`,
              }}
            />
            {meta.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#fab219]" />
          Flagged sample
        </span>
      </div>
    </div>
  )
}
