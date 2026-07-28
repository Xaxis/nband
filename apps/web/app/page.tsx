import Link from 'next/link'
import { SpectrumBar, BandChip } from '../components/Bands'
import { HeroScene } from '../components/hero/Hero'
import { Button, Container, Section, Stat } from '../components/ui'
import {
  CLASSIFICATION,
  CLASSIFICATION_ORDER,
  DETECTION_BANDS,
  TIER,
  THRESHOLDS,
  tierCost,
  type Tier,
} from '../lib/schema/generated'
import { VERDICT } from '../lib/spectrum'

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      {/* The scene underlays this whole block; the headline composes on top. */}
      <HeroScene>
        <Container className="relative min-h-[560px] py-16 sm:min-h-[640px] sm:py-24">
          <p className="eyebrow">Open multi-spectral sensing · v0.1.0</p>

          <h1 className="mt-4 max-w-[19ch] text-[38px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--ink)] sm:text-[58px]">
            Most of the sky is invisible to you.
          </h1>

          <p className="mt-5 max-w-[58ch] text-[16.5px] leading-relaxed text-[var(--ink-2)] sm:text-[18px]">
            Your eyes cover one narrow band out of fourteen. NBAND is a sensor node you can
            actually build that watches the rest of them at the same time, stamps every reading
            against a satellite-disciplined clock, and publishes what it records so that anyone can
            check the work.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/build">Build a node</Button>
            <Button href="/telemetry" variant="ghost">
              See live data
            </Button>
            <Button href="/discriminator" variant="ghost">
              How it decides
            </Button>
          </div>

          <p className="mt-10 max-w-[52ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
            Behind this text: one node and eleven detection shells at their real ranges from the
            band schema, log-scaled because the channels span thirty metres to three hundred
            kilometres. A band lights as the object enters its shell. Two lit at once is a
            coincidence, which is the only thing that promotes a buffered window to permanent
            storage.
          </p>
        </Container>
      </HeroScene>

      <section className="border-b border-[var(--line)]">
        <Container className="py-10">
          <p className="eyebrow mb-3">The instrument, by wavelength</p>
          <SpectrumBar />
        </Container>
      </section>

      {/* -------------------------------------------------------------- Stats */}
      <section className="border-b border-[var(--line)] bg-[var(--surface-0)]">
        <Container>
          <div className="grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              value="14"
              label="Bands sampled at once"
              detail="Gamma through radio, plus acoustic and seismic"
              accent="#4ea9ff"
            />
            <Stat
              value="±500 ns"
              label="Clock discipline"
              detail="GNSS pulse-per-second, not network time"
              accent="#199e70"
            />
            <Stat
              value={`$${tierCost('t1').toFixed(0)}`}
              label="Entry build cost"
              detail="Real July 2026 prices, sourced per part"
              accent="#c98500"
            />
            <Stat
              value="0"
              label="Things it claims to identify"
              detail="It reports what it could not explain, nothing more"
              accent="#d55181"
            />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------ Why bands */}
      <Section
        eyebrow="The idea"
        title="One sensor can be fooled. Fourteen disagreeing is information."
        lede={
          <>
            <p>
              A bright dot on a camera is almost nothing on its own. It could be a satellite, an
              aircraft, a bug lit by a porch light, or a dead pixel. The picture alone cannot tell
              you, and no amount of arguing about the picture will settle it.
            </p>
            <p className="mt-3">
              What settles it is asking the other thirteen bands what they saw at the same
              instant. Something genuinely hot shows up in the thermal band. Something with an
              engine makes noise the microphones hear a few seconds later. Something transmitting
              lights up the radio receiver. Something close and metallic bends the magnetometer.
              A dead pixel does none of that, and neither does a satellite.
            </p>
          </>
        }
      >
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            {
              n: '01',
              h: 'Everything is stamped to the same clock',
              p: `Every node disciplines its clock against GNSS satellites with a hardware pulse-per-second signal, holding a few hundred nanoseconds. That is what makes "at the same instant" a measurement instead of a figure of speech, and it is why two nodes ${THRESHOLDS.maxNodeSeparationKmForGeometry} km apart can triangulate a real altitude rather than guess at one.`,
            },
            {
              n: '02',
              h: 'Agreement across bands is the trigger',
              p: `A single channel crossing a threshold is noise until something else agrees with it. When two bands trigger inside ${THRESHOLDS.coincidenceWindowMs} milliseconds of each other, the node promotes the whole buffered window to permanent storage, including the ${THRESHOLDS.ringBufferPreRollS} seconds that happened before the trigger fired.`,
            },
            {
              n: '03',
              h: 'Known things are subtracted first',
              p: 'Before anything is called interesting, the discriminator checks it against aircraft transponders, satellite orbits, lightning networks, the site’s own radio interference fingerprint, weather, and space weather. Most events are explained and closed. That is the system working.',
            },
          ].map((c) => (
            <div key={c.n} className="card p-5">
              <span className="num text-[11px] text-[var(--ink-3)]">{c.n}</span>
              <h3 className="mt-2 text-[15.5px] font-semibold leading-snug text-[var(--ink)]">
                {c.h}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{c.p}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- The bands */}
      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="What it sees"
        title="Each band answers a different question"
        lede="These are not fourteen versions of the same picture. They respond to different physics, they fail in different weather, and they are wrong about different things. That is exactly why they are worth having together."
      >
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DETECTION_BANDS.slice(0, 9).map((b) => (
            <Link
              key={b.id}
              href={`/bands#${b.id}`}
              className="card group p-4 transition-colors hover:border-[var(--line-strong)]"
            >
              <BandChip band={b} size="sm" />
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                {b.shortDescription}
              </p>
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
                {b.whatItSees}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-6">
          <Button href="/bands" variant="ghost">
            All fourteen bands, with their limits →
          </Button>
        </div>
      </Section>

      {/* -------------------------------------------------------- Discriminator */}
      <Section
        eyebrow="The discriminator"
        title="The top of the ladder is “unresolved”, not “alien”"
        lede="Every event gets scored against a fixed set of hypotheses and sorted onto a five-rung ladder. There is deliberately no rung for artificial or non-human. The instrument can establish that something was not explained by any catalogue it checked. It cannot establish what that something was, and the schema refuses to encode a claim the hardware cannot support."
      >
        <div className="mt-9 space-y-2.5">
          {CLASSIFICATION_ORDER.map((id) => {
            const c = CLASSIFICATION[id]
            return (
              <div key={id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex shrink-0 items-center gap-2.5 sm:w-[190px]">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: `light-dark(${VERDICT.light[id]}, ${VERDICT.dark[id]})` }}
                  />
                  <span className="text-[14px] font-semibold text-[var(--ink)]">{c.label}</span>
                </div>
                <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{c.summary}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-5">
          <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">
            An event cannot reach the top rung on one channel, or with a degraded clock, or when a
            catalogue the discriminator wanted to check was unavailable. Every lookup it performed
            is recorded, including the ones that found nothing and the ones it could not run.{' '}
            <span className="text-[var(--ink)]">
              “We checked ADS-B and found no aircraft” and “we could not reach ADS-B” are different
              claims,
            </span>{' '}
            and the archive keeps them different.
          </p>
          <div className="mt-4">
            <Button href="/discriminator" variant="ghost">
              How a verdict is computed →
            </Button>
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------------- Tiers */}
      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Build tiers"
        title="Start at the bottom. The grid treats every tier the same."
        lede="A tier describes which bands a node is expected to carry, never which bands it may carry. A cheap node with a good clock is worth more to the grid than an expensive node without one, because timing is what makes data from two sites combinable."
      >
        <div className="mt-9 grid gap-4 lg:grid-cols-3">
          {(['t1', 't2', 't3'] as Tier[]).map((t) => {
            const meta = TIER[t]
            const cost = tierCost(t)
            return (
              <div key={t} className="card flex flex-col p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[16px] font-semibold text-[var(--ink)]">{meta.label}</h3>
                  <span className="num text-[15px] font-semibold text-[var(--ink)]">
                    ${cost.toFixed(0)}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  {meta.summary}
                </p>
                <Link
                  href={`/hardware#${t}`}
                  className="mt-4 text-[13px] text-[var(--accent)] hover:underline"
                >
                  Bill of materials →
                </Link>
              </div>
            )
          })}
        </div>
        <p className="mt-5 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          Costs are the sum of sourced part prices as of July 2026 and exclude tools, shipping, and
          tax. Silicon pricing is unstable this year: Raspberry Pi boards have risen three times
          since December 2025 as memory supply moved to AI datacentre demand. The entry tier is
          held near its target by specifying a 2 GB board and writing firmware disciplined enough
          to run on it, not by pretending prices did not move.
        </p>
      </Section>

      {/* ------------------------------------------------------------- Honesty */}
      <Section
        eyebrow="Before you build one"
        title="What this will not do for you"
      >
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {[
            {
              h: 'It will not prove anything on its own',
              p: 'A single node produces angular tracks with no range. Without range you have no size and no speed, only a direction and a brightness. The honest output of one node is a well-characterised question. Range comes from radar or from a second node, and the second node is usually the better buy.',
            },
            {
              h: 'Most of what it records is boring',
              p: 'Aircraft, satellites, birds, insects near the lens, and the neighbour’s motion light. Expect the overwhelming majority of events to close as explained. A system that frequently finds mysteries is a system with a calibration problem.',
            },
            {
              h: 'It demands a real site, not a windowsill',
              p: 'Glass blocks ultraviolet and is opaque in the thermal band. A node indoors is a node with four dead channels. It needs sky, power, a horizon survey, and somewhere the magnetometer is not sitting next to a refrigerator.',
            },
            {
              h: 'A null result is the likely outcome, and it counts',
              p: 'Five hundred hours of coverage that turns up nothing unexplained is a real measurement: it puts a bound on how often anything unusual crosses that patch of sky. The archive is built to make that bound computable rather than to make headlines.',
            },
          ].map((c) => (
            <div key={c.h} className="card p-5">
              <h3 className="text-[15px] font-semibold text-[var(--ink)]">{c.h}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{c.p}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------------- CTA */}
      <section className="border-t border-[var(--line)] bg-[var(--surface-0)]">
        <Container className="py-16 sm:py-20">
          <div className="max-w-[56ch]">
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)] sm:text-[32px]">
              The build guide starts with one camera and a clock.
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--ink-2)]">
              Every step ends in something you can verify before you move on: a command that prints
              an expected value, a capture you can look at, a timing offset you can read. If a step
              does not verify, the guide tells you what usually causes that.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button href="/build">Start the build guide</Button>
              <Button href="/hardware" variant="ghost">
                Price it out first
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
