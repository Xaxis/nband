import { pageMetadata } from '../../../lib/metadata'
import { BandChip } from '../../../components/Bands'
import {
  NodeBlockDiagram,
  PinoutDiagram,
  PowerBudget,
  WiringTable,
} from '../../../components/HardwareVisuals'
import { Button, Container, Note, Section } from '../../../components/ui'
import { CarrierBoards } from '../../../components/CarrierBoard'
import {
  PARTS,
  PRICES_AS_OF,
  PRICE_NOTE,
  TIER,
  VARIANTSTATUS,
  partsForTier,
  tierCost,
  type Part,
  type Tier,
} from '../../../lib/schema/generated'

export const metadata = pageMetadata({
  title: 'Hardware and bill of materials',
  description:
    'Three build tiers with sourced part prices, what each sensor actually buys you, and where the money is best spent.',
  path: '/hardware',
})

const TIER_ORDER: Tier[] = ['t1', 't2', 't3']

function money(n: number) {
  return n === 0 ? 'recovered' : `$${n.toFixed(2)}`
}

function PartRow({ part }: { part: Part }) {
  return (
    <tr className="border-t border-[var(--line)] align-top">
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium text-[var(--ink)]">{part.model}</span>
          {part.restricted && (
            <span className="num rounded border border-[#fab219] px-1 py-px text-[10px] text-[#fab219]">
              restricted
            </span>
          )}
          {part.status !== 'reference' && (
            <span className="num rounded border border-[var(--line-strong)] px-1 py-px text-[10px] text-[var(--ink-3)]">
              {VARIANTSTATUS[part.status].label.toLowerCase()}
            </span>
          )}
        </div>
        <div className="num mt-0.5 text-[11.5px] text-[var(--ink-3)]">{part.vendor}</div>
        <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          {part.notes}
        </p>
      </td>
      <td className="px-3 py-3">
        {part.band ? <BandChip band={part.band} size="sm" href={`/bands#${part.band}`} /> : (
          <span className="num text-[11.5px] text-[var(--ink-3)]">—</span>
        )}
      </td>
      <td className="num px-3 py-3 text-[12px] text-[var(--ink-3)]">{part.interface}</td>
      <td className="num whitespace-nowrap px-3 py-3 text-right text-[13px] text-[var(--ink)]">
        {money(part.priceUsd)}
        <a
          href={part.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block text-[11px] text-[var(--accent)] hover:underline"
        >
          source
        </a>
      </td>
    </tr>
  )
}

export default function HardwarePage() {
  const uncategorised = PARTS.filter((p) => !p.tiers || p.tiers.length === 0)

  return (
    <>
      <section className="gridfield border-b border-[var(--line)]">
        <Container className="py-14 sm:py-18">
          <p className="eyebrow">Hardware</p>
          <h1 className="mt-3 max-w-[24ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[46px]">
            What to buy, what it buys you, and what to skip.
          </h1>
          <p className="mt-5 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            Every price below was read off a named vendor page on {PRICES_AS_OF} and links back to
            it. Nothing is estimated. The tiers are a suggestion about sequence rather than a
            product line: the grid accepts any combination of these parts, and any substitute you
            register. The cheapest useful node costs less than a phone.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {TIER_ORDER.map((t) => (
              <a
                key={t}
                href={`#${t}`}
                className="card flex items-baseline justify-between p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <span className="text-[14px] font-medium text-[var(--ink)]">{TIER[t].label}</span>
                <span className="num text-[15px] font-semibold text-[var(--ink)]">
                  ${tierCost(t).toFixed(0)}
                </span>
              </a>
            ))}
          </div>
        </Container>
      </section>

      <Section>
        <Note kind="warning" title="Component prices are moving fast in 2026">
          <p>{PRICE_NOTE}</p>
        </Note>
      </Section>

      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Architecture"
        title="What plugs into what"
        lede="The tier 2 reference node. Every diagram on this page is generated from the same registry that produces the bill of materials, so swapping a part moves the wiring with it instead of quietly invalidating a hand-drawn picture."
      >
        <div className="mt-8">
          <NodeBlockDiagram tier="t2" />
        </div>
      </Section>

      <Section
        eyebrow="Wiring"
        title="Where every wire goes"
        lede="Physical pin numbers, because that is what you count on the board. Pin 7 carries the pulse-per-second signal and is the one connection that must be exactly right."
      >
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-start">
          <PinoutDiagram tier="t2" />
          <div>
            <h3 className="eyebrow mb-3">Per sensor</h3>
            <WiringTable tier="t2" />
          </div>
        </div>
      </Section>

      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Power"
        title="What it draws, and what that means off-grid"
        lede="Summed from the parts actually in the tier rather than rounded to a comfortable number. This is the figure that strands remote builds."
      >
        <div className="mt-8">
          <PowerBudget tier="t2" />
        </div>
      </Section>

      {TIER_ORDER.map((t) => {
        const parts = partsForTier(t)
        const meta = TIER[t]
        const total = tierCost(t)
        return (
          <Section
            key={t}
            id={t}
            className={t === 't2' ? 'border-y border-[var(--line)] bg-[var(--surface-0)]' : ''}
            eyebrow={`${meta.label} · ${parts.length} parts`}
            title={`$${total.toFixed(0)} — ${meta.summary.split('.')[0]}`}
            lede={meta.summary}
          >
            <div className="card scroll-x mt-7">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-3)] text-left">
                    <th className="eyebrow px-3 py-2.5 font-normal">Part</th>
                    <th className="eyebrow px-3 py-2.5 font-normal">Band</th>
                    <th className="eyebrow px-3 py-2.5 font-normal">Bus</th>
                    <th className="eyebrow px-3 py-2.5 text-right font-normal">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p) => (
                    <PartRow key={p.id} part={p} />
                  ))}
                  <tr className="border-t-2 border-[var(--line-strong)] bg-[var(--surface-3)]">
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-[var(--ink)]" colSpan={3}>
                      Total, excluding tools, shipping, and tax
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[14px] font-semibold text-[var(--ink)]">
                      ${total.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        )
      })}

      {uncategorised.length > 0 && (
        <Section
          className="border-t border-[var(--line)]"
          eyebrow="Registered alternatives"
          title="Parts in the registry that are not in a reference build"
          lede="Substitutes and community submissions the discriminator knows how to calibrate. Registering a part is how you make your build legible to the grid."
        >
          <div className="card scroll-x mt-7">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="bg-[var(--surface-3)] text-left">
                  <th className="eyebrow px-3 py-2.5 font-normal">Part</th>
                  <th className="eyebrow px-3 py-2.5 font-normal">Band</th>
                  <th className="eyebrow px-3 py-2.5 font-normal">Bus</th>
                  <th className="eyebrow px-3 py-2.5 text-right font-normal">Price</th>
                </tr>
              </thead>
              <tbody>
                {uncategorised.map((p) => (
                  <PartRow key={p.id} part={p} />
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section
        className="border-t border-[var(--line)]"
        eyebrow="Generated from the registry"
        title="The wiring table, as a circuit"
        lede="Every part above records which physical header pin each of its signals lands on. That table used to be checked by reading it, and reading it is how a UART ended up routed to two pins that have no UART function, one of which was already assigned to something else. It is now compiled into a netlist per tier, so a pin conflict is a build failure rather than a discovery made with a soldering iron in hand."
      >
        <CarrierBoards />
      </Section>

      <Section className="border-t border-[var(--line)] bg-[var(--surface-0)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Spend the marginal dollar on a second node, not a better camera
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
              One node measures direction. It cannot measure distance, and without distance it
              cannot measure size or speed either. Two nodes with disciplined clocks measure
              position, and position is what turns a bright dot into a trajectory with an altitude
              and a velocity attached. Doubling the optical resolution of a single node does not
              get you any of that. This is the single most common way builders spend money badly.
            </p>
          </div>
          <div className="card p-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              Buy the timing hardware before the second sensor
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
              A fifty dollar GNSS receiver with a pulse-per-second output wired to a GPIO pin is
              the difference between a node that can join an array and a node that can only ever
              file solo reports. Without it, timestamps are good to milliseconds, which is three
              to four orders of magnitude too coarse for time-of-arrival work. It is the least
              exciting part in the build and the one that determines whether the rest of it means
              anything.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/build">Build guide</Button>
          <Button href="/hardware/variants" variant="ghost">
            Register a substitute part
          </Button>
          <Button href="/safety" variant="ghost">
            Safety and regulatory notes
          </Button>
        </div>
      </Section>
    </>
  )
}
