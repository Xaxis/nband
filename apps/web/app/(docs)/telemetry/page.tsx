import { pageMetadata } from '../../../lib/metadata'
import { TelemetryView } from '../../../components/telemetry/TelemetryView'
import { Container, Note } from '../../../components/ui'
import { getFeed } from '../../../lib/feed'

export const metadata = pageMetadata({
  title: 'Live telemetry',
  description:
    'Band-by-band telemetry from the nband grid, with historical scrub and discriminator verdicts overlaid.',
  path: '/telemetry',
})

export const dynamic = 'force-dynamic'

export default async function TelemetryPage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>
}) {
  const feed = getFeed()
  const nodes = await feed.listNodes()
  // Every row of the grid table linked here with no way to say which node, so
  // clicking "Blackwood Ridge" opened whichever node this line happened to
  // pick. A named node wins; the first online one is the fallback, and an
  // unknown slug falls back rather than rendering an empty view.
  const { node: wanted } = await searchParams
  const first =
    nodes.find((n) => n.slug === wanted) ?? nodes.find((n) => n.status === 'online') ?? nodes[0]

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
              No nband node is reporting yet, so these charts are driven by a deterministic
              simulator that models each band&apos;s real behaviour: Poisson counting noise on the
              scintillator, a solar curve on the ultraviolet and visible channels, the periodic
              flat-field shutter on the thermal camera, and an impulsive rather than smooth radio
              floor. The generator is deterministic in its inputs, so the same window always
              renders the same data; the window itself advances with the clock, which is what
              makes the charts move. Pin the scrub to a fixed offset and a reload reproduces the
              view exactly. Switching to a live grid is one environment variable and no code
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
