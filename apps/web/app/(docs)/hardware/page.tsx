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
import { SystemArchitecture } from '../../../components/SystemArchitecture'
import { DocTabs } from '../../../components/DocTabs'
import { TierScope } from '../../../components/TierScope'
import {
  PARTS,
  PRICES_AS_OF,
  PRICE_NOTE,
  TIER,
  TIER_ORDER as GENERATED_TIER_ORDER,
  VARIANTSTATUS,
  partsForTier,
  tierCost,
  tierPower,
  type Part,
  type Tier,
} from '../../../lib/schema/generated'

export const metadata = pageMetadata({
  title: 'Hardware and bill of materials',
  description:
    'Three build tiers with sourced part prices, what each sensor actually buys you, and where the money is best spent.',
  path: '/hardware',
})

// Derived from the registry rather than listed here. The research tier exists
// in the enum so the schema can name an instrument class it cannot specify, and
// it has no parts; a hardcoded list beside `buildable` is a second copy of that
// fact waiting to disagree with the first.
const TIER_ORDER: Tier[] = GENERATED_TIER_ORDER.filter((t) => TIER[t].buildable)

function money(n: number) {
  return n === 0 ? 'recovered' : `$${n.toFixed(2)}`
}

const bandsIn = (tier: Tier) => new Set(partsForTier(tier).map((p) => p.band).filter(Boolean))

/** "Tier 1 opens 6 bands for $504. Tier 2 adds 4 more for $1,158." */
function tierLadder(): string {
  return TIER_ORDER.map((t, i) => {
    const count = bandsIn(t).size
    const cost = tierCost(t)
    if (i === 0) return `${TIER[t].label} opens ${count} bands for $${cost.toFixed(0)}.`
    const previous = TIER_ORDER[i - 1]
    const gained = [...bandsIn(t)].filter((b) => !bandsIn(previous).has(b)).length
    const step = cost - tierCost(previous)
    return `${TIER[t].label} adds ${gained} more for $${step.toFixed(0)}.`
  }).join(' ')
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
        {part.band ? (
          <BandChip band={part.band} size="sm" href={`/bands#${part.band}`} />
        ) : (
          <span className="num text-[11.5px] text-[var(--ink-3)]">no band</span>
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

function TierParts({ tier }: { tier: Tier }) {
  const parts = partsForTier(tier)
  const meta = TIER[tier]
  const total = tierCost(tier)
  const bandCount = new Set(parts.map((p) => p.band).filter(Boolean)).size
  // A plain tier id, not "tier-t1". Twenty-four search results and the home
  // page have always linked to /hardware#t1; panelling the page turned those
  // into anchors inside a closed panel, and renaming them would have broken the
  // links outright. DocTabs opens whichever panel contains the anchor, so these
  // stay exactly as they were.
  return (
    <Section
      id={tier}
      className={`!pt-10 ${tier === 't2' ? 'border-y border-[var(--line)] bg-[var(--surface-0)]' : ''}`}
      // The title used to be the price plus the summary's first sentence, with
      // the whole summary repeated as the lede directly beneath it. Two lines
      // that start identically read as a rendering fault. The heading now
      // carries what distinguishes the tier numerically and the lede says what
      // it buys.
      eyebrow={`${parts.length} parts · ${bandCount} bands · ${tierPower(tier).activeW.toFixed(1)} W`}
      title={`${meta.label}, $${total.toFixed(0)}`}
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
            {/* "Below" was true when this was one long scroll. Panelling the
                page made it false for anyone arriving on a link to #power or
                #boards, where there are no prices below anything. */}
            Every price in the bill of materials was read off a named vendor page on{' '}
            {PRICES_AS_OF} and links back to it. Nothing is estimated. The tiers are a suggestion
            about sequence rather than a
            product line: the grid accepts any combination of these parts, and any substitute you
            register. The cheapest useful node costs less than a phone.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {TIER_ORDER.map((t) => (
              <a
                key={t}
                // The tier's own anchor, not the panel's. All three cards
                // pointed at #tiers, which no element carries and which is the
                // panel already open on arrival, so every card was a click that
                // moved nothing. DocTabs resolves an anchor to the panel
                // containing it, so #t3 opens the right panel and scrolls.
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

      <DocTabs
        label="Hardware sections"
        tabs={[
          {
            id: 'tiers',
            label: 'Build tiers',
            // Counted from the registry, not typed. The first draft of this
            // hint carried "six bands, adds four more, adds three" as literals,
            // which is the same class of hand-written count that put thermal in
            // the wrong tier for months.
            hint: `${TIER_ORDER.length} reference builds, priced from the same registry that generates every diagram on this page. ${tierLadder()} The tiers are a suggestion about sequence: the grid accepts any combination of these parts.`,
            content: (
              <>
                <Container className="pb-4 pt-7">
                  <Note kind="warning" title="Component prices are moving fast in 2026">
                    <p>{PRICE_NOTE}</p>
                  </Note>
                </Container>
                {TIER_ORDER.map((t) => (
                  <TierParts key={t} tier={t} />
                ))}
              </>
            ),
          },
          {
            id: 'architecture',
            label: 'Architecture',
            hint: 'The system schematic and the bus block diagram. Three chains: power from the panel to the load, signal from every sensor to the host, and data from the spool to the archive. Generated from the same registry as the bill of materials, so swapping a part moves the wiring with it.',
            content: (
              <Container className="py-9">
                <SystemArchitecture />
                <h3 className="eyebrow mb-3 mt-9">The buses, at a glance</h3>
                <NodeBlockDiagram tier="t2" />
                <p className="mt-5 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  The sheet above and the summary here answer different questions. The summary
                  groups the tier&nbsp;2 sensors by the bus each one speaks, which is what you want
                  when deciding whether a substitute part will fit. The sheet is the whole node:
                  the power chain with the node&rsquo;s measured load at the end of it, the parts
                  that reach the host through a converter or a hub rather than directly, and what
                  happens to a reading after it leaves the board.
                </p>
                <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  Two details on the sheet are easy to read past and are the whole reason it
                  exists. The geophone is drawn under the converter that reads it rather than in a
                  lane of its own, because the Raspberry Pi has no analogue input and a diagram
                  that runs a coil straight into the header describes a node nobody can build. The
                  infrared beacon&rsquo;s arrow points away from the host: it is the one part the
                  node drives rather than reads, and an emission the node forgot it commanded is an
                  emission it cannot subtract from its own record.
                </p>
              </Container>
            ),
          },
          {
            id: 'wiring',
            // "Wiring" and "Carrier boards" were the same subject cut across
            // rather than along, and the authority sat in the wrong one: the
            // board schematic's blurb called itself the wiring reference from
            // inside the panel that is not called Wiring. Naming this one for
            // what it holds, and cross-linking both ways, separates them by
            // scope instead: pin numbers here, the circuit there.
            label: 'Pinout and wiring',
            hint: 'The 40-pin header pinout and the per-sensor wiring table for the tier you select. Physical pin numbers, because that is what you count on the board. Pin 7 carries the pulse-per-second signal and is the one connection that must be exactly right. The same connections drawn as a circuit are under Carrier boards.',
            content: (
              <Container className="py-9">
                <TierScope
                  scope="wiring"
                  panels={Object.fromEntries(
                    TIER_ORDER.map((t) => [
                      t,
                      <div
                        key={t}
                        className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr] lg:items-start"
                      >
                        <PinoutDiagram tier={t} />
                        <div>
                          <h3 className="eyebrow mb-3">Per sensor</h3>
                          <WiringTable tier={t} />
                        </div>
                      </div>,
                    ]),
                  )}
                />
                <p className="mt-6 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  The tiers do not share a pinout, so wiring a tier&nbsp;3 node from the
                  tier&nbsp;2 diagram lands two signals on pins that node has nothing connected to
                  and leaves out the beacon&rsquo;s gate line entirely. Pick the tier you are
                  building.
                </p>
              </Container>
            ),
          },
          {
            id: 'boards',
            label: 'Carrier boards',
            hint: 'Each part in the bill of materials records which physical header pin every one of its signals lands on. That table is compiled to a netlist and routed, so a pin claimed twice, or asked to carry a signal it has no function for, fails the build rather than reaching a soldering iron. Header pin numbers per sensor are under Pinout and wiring.',
            content: (
              <Container className="py-9">
                <CarrierBoards />
              </Container>
            ),
          },
          {
            id: 'power',
            label: 'Power',
            hint: 'The power budget, summed from the parts in the tier you select and never estimated. Solar panel and battery are sized against this figure, and it is the one that decides whether an off-grid node survives a week of overcast.',
            content: (
              <Container className="py-9">
                <TierScope
                  scope="power"
                  panels={Object.fromEntries(
                    TIER_ORDER.map((t) => [t, <PowerBudget key={t} tier={t} />]),
                  )}
                />
                <p className="mt-6 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  A tier&nbsp;3 node draws roughly twice a tier&nbsp;2 node, which is why the bill
                  of materials sells two different solar kits rather than one. Sizing a
                  tier&nbsp;3 build against the tier&nbsp;2 figure buys about half the panel it
                  needs, and the failure arrives during the first overcast week, a long way from
                  the bench.
                </p>
              </Container>
            ),
          }, ...(uncategorised.length > 0
            ? [
                {
                  id: 'alternatives',
                  label: 'Alternatives',
                  hint: 'Substitutes and community submissions the discriminator knows how to calibrate. Registering a part is how you make your build legible to the grid.',
                  content: (
                    <Container className="py-9">
                      <div className="card scroll-x">
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
                    </Container>
                  ),
                },
              ]
            : []),
        ]}
      />

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
