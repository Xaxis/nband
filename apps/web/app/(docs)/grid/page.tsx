import { pageMetadata } from '../../../lib/metadata'
import Link from 'next/link'
import { BandChip } from '../../../components/Bands'
import { Container, Note, Section } from '../../../components/ui'
import { getFeed } from '../../../lib/feed'
import { NODESTATUS, THRESHOLDS, TIER } from '../../../lib/schema/generated'
import { STATUS } from '../../../lib/spectrum'

export const metadata = pageMetadata({
  title: 'The grid',
  description:
    'Every node reporting to NBAND, what it carries, and whether its clock is good enough to contribute geometry.',
  path: '/grid',
})

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  online: STATUS.good,
  degraded: STATUS.warning,
  offline: STATUS.critical,
  provisioning: '#6f7788',
  retired: '#6f7788',
}

/** Equirectangular projection. Adequate for a sparse world map and free of the
 *  dependency weight a real projection library would add for no benefit here. */
function project(lat: number, lon: number) {
  return { x: ((lon + 180) / 360) * 100, y: ((90 - lat) / 180) * 100 }
}

export default async function GridPage() {
  const feed = getFeed()
  const nodes = await feed.listNodes()

  const online = nodes.filter((n) => n.status === 'online')
  const pps = nodes.filter((n) => n.clock === 'gnss_pps')
  const bands = new Set(nodes.flatMap((n) => n.bands))
  const located = nodes.filter((n) => n.lat != null && n.lon != null)

  return (
    <>
      <section className="border-b border-[var(--line)]">
        <Container className="py-12">
          <p className="eyebrow">The grid</p>
          <h1 className="mt-2.5 max-w-[24ch] text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[42px]">
            Every node, and whether its clock can be trusted.
          </h1>
          <p className="mt-4 max-w-[66ch] text-[15.5px] leading-relaxed text-[var(--ink-2)]">
            Two nodes within {THRESHOLDS.maxNodeSeparationKmForGeometry} km, both holding
            pulse-per-second lock, can triangulate a real altitude and speed rather than an angular
            track. That pairing is worth more than any single sensor upgrade, which is why this page
            leads with clock quality rather than with hardware.
          </p>
        </Container>
      </section>

      <Container className="py-8">
        {feed.kind === 'mock' && (
          <Note kind="info" title="No nodes are reporting yet">
            <p>
              These are simulated nodes at locations with published histories of anomalous reports.
              They exercise the map, the status logic, and the clock-quality display. Real nodes
              replace them as they enrol.
            </p>
          </Note>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: 'Nodes enrolled', v: String(nodes.length) },
            { k: 'Online now', v: `${online.length} / ${nodes.length}` },
            { k: 'PPS-disciplined', v: `${pps.length} / ${nodes.length}` },
            { k: 'Bands covered', v: `${bands.size} / 14` },
          ].map((s) => (
            <div key={s.k} className="card p-4">
              <div className="eyebrow">{s.k}</div>
              <div className="num mt-1 text-[22px] font-semibold text-[var(--ink)]">{s.v}</div>
            </div>
          ))}
        </div>

        {/* Map */}
        <div className="card mt-4 overflow-hidden">
          <div className="relative aspect-[2/1] w-full bg-[var(--surface-0)]">
            <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" role="img"
                 aria-label={`World map showing ${located.length} node positions`}>
              {/* Graticule. Recessive by design: it is a reference frame, not data. */}
              {[...Array(11)].map((_, i) => (
                <line key={`v${i}`} x1={i * 10} x2={i * 10} y1={0} y2={50}
                      stroke="var(--line)" strokeWidth="0.15" />
              ))}
              {[...Array(6)].map((_, i) => (
                <line key={`h${i}`} x1={0} x2={100} y1={i * 10} y2={50 - (50 - i * 10)}
                      stroke="var(--line)" strokeWidth="0.15" />
              ))}
              {[...Array(6)].map((_, i) => (
                <line key={`h2${i}`} x1={0} x2={100} y1={i * 10} y2={i * 10}
                      stroke="var(--line)" strokeWidth="0.15" />
              ))}
              <line x1={0} x2={100} y1={25} y2={25} stroke="var(--line-strong)" strokeWidth="0.25" />

              {located.map((n) => {
                const p = project(n.lat!, n.lon!)
                const c = STATUS_COLOR[n.status] ?? '#6f7788'
                return (
                  <g
                    key={n.slug}
                    role="img"
                    aria-label={`${n.displayName}, ${n.status}, clock ${n.clock}`}
                  >
                    <circle cx={p.x} cy={p.y / 2} r="1.6" fill={c} opacity="0.22" />
                    <circle cx={p.x} cy={p.y / 2} r="0.7" fill={c} />
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] px-4 py-2.5">
            <span className="eyebrow">Status</span>
            {Object.entries(NODESTATUS).map(([id, meta]) => (
              <span key={id} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
                <span aria-hidden="true" className="h-2 w-2 rounded-full"
                      style={{ background: STATUS_COLOR[id] ?? '#6f7788' }} />
                {meta.label}
              </span>
            ))}
            <span className="num ml-auto text-[11px] text-[var(--ink-3)]">
              positions fuzzed to operator-declared precision
            </span>
          </div>
        </div>

        {/* Node table */}
        <div className="card scroll-x mt-4">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2.5 font-normal">Node</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Status</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Tier</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Clock</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Bands</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n) => (
                <tr key={n.slug} className="border-t border-[var(--line)] align-top">
                  <td className="px-3 py-3">
                    <Link href={`/telemetry`} className="text-[13.5px] font-medium text-[var(--ink)] hover:underline">
                      {n.displayName}
                    </Link>
                    <div className="num mt-0.5 text-[11px] text-[var(--ink-3)]">
                      {n.operatorHandle ? `@${n.operatorHandle}` : 'unattributed'}
                      {n.lat != null && ` · ${n.lat.toFixed(2)}, ${n.lon!.toFixed(2)} ±${n.locationPrecisionM} m`}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ink-2)]">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full"
                            style={{ background: STATUS_COLOR[n.status] ?? '#6f7788' }} />
                      {NODESTATUS[n.status].label}
                    </span>
                  </td>
                  <td className="num px-3 py-3 text-[12.5px] text-[var(--ink-2)]">
                    {TIER[n.tier].label.split(' ')[0]}
                  </td>
                  <td className="px-3 py-3">
                    <span className="num text-[12.5px]"
                          style={{ color: n.clock === 'gnss_pps' ? STATUS.good : STATUS.warning }}>
                      {n.clock === 'gnss_pps' ? `PPS ±${n.clockOffsetNs ?? '?'} ns` : n.clock}
                    </span>
                    {n.clock !== 'gnss_pps' && (
                      <div className="text-[11px] text-[var(--ink-3)]">no geometry contribution</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {n.bands.slice(0, 6).map((b) => (
                        <BandChip key={b} band={b} size="sm" />
                      ))}
                      {n.bands.length > 6 && (
                        <span className="num self-center text-[11px] text-[var(--ink-3)]">
                          +{n.bands.length - 6}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num px-3 py-3 text-right text-[12.5px] text-[var(--ink-2)]">
                    {n.uptimeS > 0 ? `${(n.uptimeS / 86400).toFixed(1)} d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      <Section
        className="border-t border-[var(--line)]"
        eyebrow="Join"
        title="A second node near an existing one is the highest-value thing you can build"
        lede="Coverage of a new region is good. A baseline against a node that already exists is better, because it converts both nodes from bearing-only instruments into a system that measures position. If you are within sixty kilometres of a node on this map, that is where to put yours."
      >
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/build" className="text-[13.5px] text-[var(--accent)] hover:underline">
            Build guide →
          </Link>
          <Link href="/hardware" className="text-[13.5px] text-[var(--accent)] hover:underline">
            Bill of materials →
          </Link>
        </div>
      </Section>
    </>
  )
}
