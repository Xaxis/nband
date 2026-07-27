import type { Metadata } from 'next'
import { TelemetryView } from '../../components/telemetry/TelemetryView'
import { Container, Note } from '../../components/ui'
import { getFeed } from '../../lib/feed'

export const metadata: Metadata = {
  title: 'Live telemetry',
  description:
    'Band-by-band telemetry from the NBAND grid, with historical scrub and discriminator verdicts overlaid.',
}

export const dynamic = 'force-dynamic'

export default async function TelemetryPage() {
  const feed = getFeed()
  const nodes = await feed.listNodes()
  const first = nodes.find((n) => n.status === 'online') ?? nodes[0]

  return (
    <>
      <section className="border-b border-[var(--line)]">
        <Container className="py-10">
          <p className="eyebrow">Live telemetry</p>
          <h1 className="mt-2.5 text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[38px]">
            One chart per band, one clock underneath all of them.
          </h1>
          <p className="mt-4 max-w-[68ch] text-[15.5px] leading-relaxed text-[var(--ink-2)]">
            Hovering any chart moves the cursor on every chart, because the only
            reason to record fourteen bands is to ask what all of them were doing at the same
            instant. Shaded columns are events; the darker shading marks the bands that actually
            witnessed it. Amber dots are samples the node recorded but flagged as compromised, and
            they are drawn rather than dropped.
          </p>
        </Container>
      </section>

      <Container className="py-8">
        {feed.kind === 'mock' && (
          <Note kind="info" title="This is a synthetic feed">
            <p>
              No NBAND node is reporting yet, so these charts are driven by a deterministic
              simulator that models each band&apos;s real behaviour: Poisson counting noise on the
              scintillator, a solar curve on the ultraviolet and visible channels, the periodic
              flat-field shutter on the thermal camera, and an impulsive rather than smooth radio
              floor. Reload and you will get identical data, which is what makes a bug in this view
              reproducible. Switching to a live grid is one environment variable and no code
              changes above the feed interface.
            </p>
          </Note>
        )}

        {nodes.length === 0 ? (
          <div className="card p-10 text-center">
            <p className="text-[14px] text-[var(--ink-2)]">No nodes are registered on the grid.</p>
          </div>
        ) : (
          <TelemetryView nodes={nodes} initialNode={first.slug} />
        )}
      </Container>
    </>
  )
}
