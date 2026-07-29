'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  BANDS,
  CLASSIFICATION,
  CLASSIFICATION_ORDER,
  type Classification,
} from '../lib/schema/generated'
import { VERDICT } from '../lib/spectrum'
import { createArchiveStream } from '../lib/feed/realtime'
import { BandChip } from './Bands'

/**
 * Browsing the archive.
 *
 * The query API answers a question precisely; this is for the case where
 * someone does not yet know which question to ask. Filters map one to one onto
 * the endpoint's parameters, so anything found here is reproducible as a URL,
 * and the URL is shown.
 *
 * Two things it must not do, both of which are easy and both of which would
 * undermine the point of the archive.
 *
 * It must not present a count without its denominator. "Six unresolved" means
 * nothing without "of four thousand examined", so the header carries both, and
 * the number excluded for incomplete catalogue checks alongside them.
 *
 * It must not let an empty result read as a working system with nothing to
 * report. No node has enrolled yet, so this is empty for a reason that has
 * nothing to do with the sky, and saying so is more useful than a spinner or a
 * blank table.
 */

interface ArchiveEvent {
  id: string
  t_start: string
  t_end: string | null
  bands: string[]
  band_count: number
  node_count: number
  corroboration: string
  fix_lat: number | null
  fix_lon: number | null
  fix_altitude_m: number | null
  fix_error_m: number | null
  verdicts: {
    classification: Classification
    anomaly_score: number
    explanation: string
    discriminator_version: string
  }[]
}

interface ArchiveResponse {
  counts: { returned: number; examined: number; excluded_incomplete_catalogues: number }
  note: string
  next_cursor: string | null
  events: ArchiveEvent[]
  error?: string
}

const stream = createArchiveStream({ tables: ['detections', 'events', 'verdicts'], capacity: 50 })

export function ArchiveBrowser() {
  const [bands, setBands] = useState<string[]>([])
  const [classes, setClasses] = useState<Classification[]>([])
  const [minScore, setMinScore] = useState(0)
  const [complete, setComplete] = useState(true)
  const [data, setData] = useState<ArchiveResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)

  const live = useSyncExternalStore(stream.subscribe, stream.getSnapshot, stream.getServerSnapshot)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    for (const b of bands) p.append('band', b)
    for (const c of classes) p.append('classification', c)
    if (minScore > 0) p.set('min_score', String(minScore))
    p.set('catalogues', complete ? 'complete' : 'any')
    p.set('limit', '50')
    return p.toString()
  }, [bands, classes, minScore, complete])

  useEffect(() => {
    const ac = new AbortController()
    // The loading flag is set inside the request rather than synchronously in
    // the effect body: a synchronous setState here is a second render before
    // the first has painted, for a value that is about to change again anyway.
    void (async () => {
      setLoading(true)
      setFailed(null)
      try {
        const r = await fetch(`/api/archive/events?${query}`, { signal: ac.signal })
        const j: ArchiveResponse = await r.json()
        if (j.error) setFailed(j.error)
        else setData(j)
      } catch (e) {
        if (!ac.signal.aborted) setFailed(String(e))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [query])

  const toggle = useCallback(<T,>(list: T[], v: T, set: (x: T[]) => void) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : list.concat(v))
  }, [])

  const detectionBands = BANDS.filter((b) => b.role === 'detection')

  return (
    <div>
      <div className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Filter</p>
          <span
            className="num text-[11.5px] text-[var(--ink-3)]"
            title="Live subscription to detections, events and verdicts"
          >
            <span
              aria-hidden="true"
              className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{
                background:
                  live.status === 'live' ? '#3fb950' : live.status === 'error' ? '#d03b3b' : '#8a8f98',
              }}
            />
            {live.status === 'live' ? 'live' : live.status}
            {live.seen > 0 && ` · ${live.seen} since you arrived`}
            {live.dropped > 0 && ` · ${live.dropped} dropped`}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {detectionBands.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={bands.includes(b.id)}
              onClick={() => toggle(bands, b.id, setBands)}
              className={`rounded-[6px] border px-2 py-1 text-[12px] transition-colors ${
                bands.includes(b.id)
                  ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]'
                  : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {CLASSIFICATION_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={classes.includes(c)}
              onClick={() => toggle(classes, c, setClasses)}
              className={`rounded-[6px] border px-2 py-1 text-[12px] transition-colors ${
                classes.includes(c)
                  ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]'
                  : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink)]'
              }`}
              style={
                classes.includes(c)
                  ? { borderLeft: `3px solid light-dark(${VERDICT.light[c]}, ${VERDICT.dark[c]})` }
                  : undefined
              }
            >
              {CLASSIFICATION[c].label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink-2)]">
            Minimum score
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="accent-[var(--accent)]"
            />
            <span className="num w-8 text-[var(--ink)]">{minScore}</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[var(--ink-2)]">
            <input
              type="checkbox"
              checked={complete}
              onChange={(e) => setComplete(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Only events where every catalogue was reachable
          </label>
        </div>

        <p className="num mt-3 break-all text-[11px] text-[var(--ink-3)]">
          GET /api/archive/events?{query}
        </p>
      </div>

      {/* The denominator, at the top, where it cannot be read past. */}
      {data && (
        <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px]">
          <span className="text-[var(--ink)]">
            <span className="num text-[18px] font-semibold">{data.counts.returned}</span> shown
          </span>
          <span className="num text-[var(--ink-2)]">of {data.counts.examined} examined</span>
          {data.counts.excluded_incomplete_catalogues > 0 && (
            <span className="num text-[#fab219]">
              {data.counts.excluded_incomplete_catalogues} excluded: a catalogue could not be reached
            </span>
          )}
        </div>
      )}

      {failed && (
        <p className="mt-5 text-[13.5px] text-[#d03b3b]">The archive did not answer: {failed}</p>
      )}

      {!failed && !loading && data && data.events.length === 0 && (
        <div className="card mt-5 p-5">
          <p className="text-[14px] font-semibold text-[var(--ink)]">Nothing here yet</p>
          <p className="mt-2 max-w-[64ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
            No node has enrolled and reported, so the archive is empty for a reason that has
            nothing to do with the sky. This is not a filter returning nothing and it is not an
            outage. The query above is real and runs against the live database; it will fill when
            the first node does.
          </p>
        </div>
      )}

      {loading && <p className="mt-5 text-[13.5px] text-[var(--ink-3)]">Querying the archive…</p>}

      {data && data.events.length > 0 && (
        <div className="card scroll-x mt-5">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2.5 font-normal">When</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Bands</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Verdict</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Score</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Position</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => {
                const v = e.verdicts[0]
                return (
                  <tr key={e.id} className="border-t border-[var(--line)] align-top">
                    <td className="num whitespace-nowrap px-3 py-3 text-[12.5px] text-[var(--ink-2)]">
                      {e.t_start.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {e.bands.map((b) => (
                          <BandChip key={b} band={b as never} size="sm" />
                        ))}
                      </span>
                      <span className="num mt-1 block text-[11px] text-[var(--ink-3)]">
                        {e.node_count} node{e.node_count === 1 ? '' : 's'} · {e.corroboration}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {v && (
                        <>
                          <span
                            className="text-[13px] text-[var(--ink)]"
                            style={{
                              borderLeft: `3px solid light-dark(${VERDICT.light[v.classification]}, ${VERDICT.dark[v.classification]})`,
                              paddingLeft: 8,
                            }}
                          >
                            {CLASSIFICATION[v.classification].label}
                          </span>
                          <span className="mt-1 block max-w-[52ch] text-[12px] leading-snug text-[var(--ink-2)]">
                            {v.explanation}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-right text-[13px] text-[var(--ink)]">
                      {v ? v.anomaly_score.toFixed(1) : '—'}
                    </td>
                    <td className="num px-3 py-3 text-[12px] text-[var(--ink-2)]">
                      {e.fix_lat != null && e.fix_lon != null ? (
                        <>
                          {e.fix_lat.toFixed(3)}, {e.fix_lon.toFixed(3)}
                          <span className="block text-[11px] text-[var(--ink-3)]">
                            {e.fix_error_m != null ? `±${Math.round(e.fix_error_m)} m` : 'no error bar'}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--ink-3)]">not solved</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="mt-3 text-[12.5px] text-[var(--ink-3)]">
          {data.note}
        </p>
      )}
    </div>
  )
}
