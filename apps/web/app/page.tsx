import Link from 'next/link'
import { SpectrumBar, BandChip } from '../components/Bands'
import { HeroScene } from '../components/hero/Hero'
import { Button, Container, Section, Stat } from '../components/ui'
import {
  CLASSIFICATION,
  CLASSIFICATION_ORDER,
  DETECTION_BANDS,
  PARTS,
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
          <p className="eyebrow">Open instrument for anomalous aerial phenomena · v0.1.0</p>

          <h1 className="mt-4 max-w-[17ch] text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] text-[var(--ink)] sm:text-[60px]">
            Unexplained should not mean unmeasured.
          </h1>

          <p className="mt-5 max-w-[60ch] text-[16.5px] leading-relaxed text-[var(--ink-2)] sm:text-[18px]">
            Thousands of people report something in the sky every year. Almost none of it produces
            a record worth arguing about: one shaky camera, no clock, no second angle, no way to
            rule out a satellite. The mystery is real. The evidence is terrible.
          </p>

          <p className="mt-4 max-w-[60ch] text-[16.5px] leading-relaxed text-[var(--ink-2)] sm:text-[18px]">
            <span className="text-[var(--ink)]">nband is a fix for the evidence.</span> A sensor
            node watching up to thirteen bands at once, timestamped to GPS within a few hundred
            nanoseconds, publishing everything it records to an open archive. The entry build
            costs about what a used laptop does and watches six of those bands; thirteen is the
            full build. Most of what any of them catches will be aircraft. That is the point: you
            cannot say a thing is unexplained until you have properly ruled out the explanations.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/build">Build a node</Button>
            <Button href="/discriminator" variant="ghost">
              See how it rules things out
            </Button>
            <Button href="/bands" variant="ghost">
              What it can actually see
            </Button>
          </div>

          <p className="mt-10 max-w-[52ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
            Behind this text: one node, its detection shells at their real ranges, and something
            crossing them. A band lights as the object enters its range. Two lit at the same
            instant is a coincidence, and a coincidence is the difference between a story and a
            measurement.
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
              value="13"
              label="Bands one node can watch at once"
              // The span belongs to the thirteen, not the six. Read in the
              // written order it said the entry build sees gamma through radio,
              // and the entry six are visible, near and long-wave infrared,
              // radio, environmental and navigation.
              detail="Gamma through radio, plus sound and ground motion. Six of them on the entry build."
            />
            <Stat
              value="±500 ns"
              label="Timing accuracy"
              detail="Two nodes this precise triangulate a real altitude"
            />
            <Stat
              value={`$${tierCost('t1').toFixed(0)}`}
              label="To build the entry node"
              detail="Every price sourced and dated, nothing estimated"
            />
            <Stat
              value="0"
              label="Things it will claim to identify"
              detail="It reports what it could not explain. Never what it was."
            />
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------ Why bands */}
      <Section
        eyebrow="Why every sighting falls apart"
        title="A camera alone can never settle anything"
        lede={
          <>
            <p>
              Every famous piece of UAP footage has the same flaw. A bright shape on one sensor,
              filmed at unknown range, with no independent measurement of anything. Nothing in the
              recording distinguishes enormous and distant from small and close, or says whether
              the thing was hot, whether it was transmitting, or whether it made a sound. The
              argument never ends, and it never ends because the recording never contained the
              answer in the first place.
            </p>
            <p className="mt-3">
              The way out is asking every other band what it saw at the same instant.
              Something with an engine is hot in the thermal band and audible seconds later. A
              satellite is exactly where the orbital catalogue says it will be. A transmitting
              drone shows up on the radio. An insect near the lens shows up nowhere else at all.
              You do not need to guess when four independent physical channels disagree with each
              other.
            </p>
          </>
        }
      >
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {[
            {
              n: '01',
              h: 'Everything shares one clock, to the nanosecond',
              p: `Every node disciplines its clock against GNSS satellites with a hardware pulse-per-second signal, holding a few hundred nanoseconds. That is what makes "at the same instant" a measurement instead of a figure of speech, and it is why two nodes ${THRESHOLDS.maxNodeSeparationKmForGeometry} km apart can triangulate a real altitude rather than guess at one.`,
            },
            {
              n: '02',
              h: 'Nothing is kept until two bands agree',
              p: `A single channel crossing a threshold is noise until something else agrees with it. When two bands trigger inside ${THRESHOLDS.coincidenceWindowMs} milliseconds of each other, the node promotes the whole buffered window to permanent storage, including the ${THRESHOLDS.ringBufferPreRollS} seconds that happened before the trigger fired.`,
            },
            {
              n: '03',
              h: 'Everything ordinary is subtracted first',
              p: 'Before anything is called interesting it is checked against aircraft transponders, satellite orbits, lightning networks, the site’s own radio interference, weather, and space weather. The overwhelming majority of events close as explained. A system that frequently finds mysteries has a calibration problem, not a discovery.',
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
        title="Eleven ways of being wrong about the same object"
        lede="These are not eleven versions of one picture. Each responds to different physics, fails in different weather, and is fooled by different things. A twelfth detection band, gravimetric, is defined in the schema and has no sensor anyone can buy, so no node carries it and it is not shown here. Two further bands, environmental and navigation, give context rather than detections. An object that survives all of these at once is genuinely difficult to explain, and that is the only kind of claim worth making."
      >
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* The detection bands a node can actually carry, which is not the
              same as the detection bands the schema defines. Showing all twelve
              put a gravimetric card on the front page, and the card renders
              shortDescription and whatItSees but never limits, which is the
              field saying atom-interferometer gravimeters cost six figures and
              that no nband node has one. Slicing to the first nine was worse
              again: ordinal order is wavelength order, so it kept exactly the
              nine electromagnetic bands and cut acoustic and seismic, under a
              lede claiming each responds to different physics. */}
          {DETECTION_BANDS.filter((b) => PARTS.some((p) => p.band === b.id)).map((b) => (
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
        eyebrow="The honest part"
        title="The top of the ladder is “unresolved”, and it stops there"
        lede="Every event is scored against a fixed set of hypotheses and sorted onto five rungs. There is deliberately no rung for artificial, non-human, or craft. This instrument can establish that nothing it knows about explains what it saw. It cannot establish what did, and the database has no column capable of storing that claim. If you want a project that will tell you it found a spaceship, this is the wrong one."
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
        title="Four things you should hear now rather than later"
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
              h: 'You will probably find nothing, and that counts',
              p: 'Five hundred hours of coverage turning up nothing unexplained is a real result. It puts a number on how often anything unusual crosses that patch of sky, which is something nobody can currently state. The archive is built to make that number computable rather than to make headlines.',
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
              It starts with one camera and a clock.
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--ink-2)]">
              Ten steps, each ending in something you can check before spending money on the next:
              a command that prints an expected value, an image you can look at, a timing offset
              you can read. If a step does not verify, the guide names what usually causes it. You
              can stop after step five and still be contributing real data to the grid.
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
