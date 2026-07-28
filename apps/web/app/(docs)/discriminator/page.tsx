import { pageMetadata } from '../../../lib/metadata'
import { DiscriminatorPlayground } from '../../../components/DiscriminatorPlayground'
import { Container, Note, Section } from '../../../components/ui'
import {
  CATALOGSOURCE,
  CLASSIFICATION,
  CLASSIFICATION_ORDER,
  CORROBORATION,
  CORROBORATION_ORDER,
  HYPOTHESES,
  THRESHOLDS,
} from '../../../lib/schema/generated'
import { VERDICT } from '../../../lib/spectrum'

export const metadata = pageMetadata({
  title: 'The discriminator',
  description:
    'How nband decides what an event was, what it refuses to decide, and why the top of the ladder is “unresolved”.',
  path: '/discriminator',
})

export default function DiscriminatorPage() {
  return (
    <>
      <section className="gridfield border-b border-[var(--line)]">
        <Container className="py-14 sm:py-18">
          <p className="eyebrow">Analysis</p>
          <h1 className="mt-3 max-w-[22ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[46px]">
            Deciding what something was, and refusing to when you cannot.
          </h1>
          <p className="mt-5 max-w-[66ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            The discriminator takes an event, subtracts everything known, scores what is left
            against a fixed set of hypotheses, and writes a verdict that explains itself in prose.
            Most of its design is about the second half of that sentence: the ways it is prevented
            from claiming more than the instruments measured.
          </p>
        </Container>
      </section>

      <Section
        eyebrow="Try it"
        title="Turn a gate off and watch the verdict fall"
        lede="This runs the real scoring logic, not a demonstration of it. The module below is the same one a conformance check holds against the Python engine that scores the archive, so a verdict here is the verdict the database would record."
      >
        <div className="mt-8">
          <DiscriminatorPlayground />
        </div>
      </Section>

      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Step one"
        title="Subtract everything that is already catalogued"
        lede="Before an event can be called anything, it is checked against every source that could plausibly explain it. Most events close here, and that is the system working rather than the system being boring."
      >
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(CATALOGSOURCE).map(([id, c]) => (
            <div key={id} className="card p-4">
              <h3 className="num text-[12.5px] font-semibold text-[var(--ink)]">{c.label}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{c.summary}</p>
            </div>
          ))}
        </div>

        <Note kind="warning" title="A catalogue that was down is not a catalogue that found nothing">
          <p>
            This is the single most important rule in the engine. If the aircraft transponder feed
            was unreachable, every aircraft that night looks unexplained. So every lookup is
            recorded with three states rather than two: matched, checked and clean, or unavailable.
            An event with any unavailable catalogue is structurally barred from the top of the
            ladder, no matter how good it looks otherwise. The test suite asserts this, and those
            assertions are the ones that protect the archive from manufacturing mysteries.
          </p>
        </Note>
      </Section>

      <Section
        eyebrow="Step two"
        title="Score what is left against a fixed hypothesis set"
        lede="Nine hypotheses, with per-site priors learned from that site’s own history. The cold-start values below are what a node uses before it has accumulated its own statistics. The model is deliberately coarse: more parameters than the archive can constrain would produce confident numbers that mean nothing."
      >
        <div className="card scroll-x mt-8">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2.5 font-normal">Hypothesis</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Rung if it wins</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Cold-start prior</th>
              </tr>
            </thead>
            <tbody>
              {HYPOTHESES.map((h) => (
                <tr key={h.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2.5 text-[13.5px] text-[var(--ink)]">{h.label}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2 text-[12.5px] text-[var(--ink-2)]">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-[2px]"
                        style={{
                          background: `light-dark(${VERDICT.light[h.classification]}, ${VERDICT.dark[h.classification]})`,
                        }}
                      />
                      {CLASSIFICATION[h.classification].label}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-[13px] text-[var(--ink-2)]">
                    {h.prior.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card mt-4 p-5">
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">
            Why “unmodelled” winning is not how an event becomes unresolved
          </h3>
          <p className="mt-2.5 max-w-[76ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
            With a cold-start prior of 0.01, the catch-all hypothesis can essentially never have the
            highest posterior however well it fits, which would make the top rung decorative. So the
            engine asks a different and more answerable question: does anything{' '}
            <em>ordinary</em> actually explain this? An event is a candidate for “unresolved” when
            the best conventional hypothesis fails to reach a posterior of 0.40, not when the
            catch-all wins a popularity contest it was designed to lose.
          </p>
        </div>
      </Section>

      <Section
        eyebrow="Step three"
        title="Place it on the ladder, and check the gates"
        lede="Five rungs. The top one is reachable only through four gates, each of which exists because of a specific way this kind of system usually fools itself."
      >
        <div className="mt-8 space-y-2.5">
          {CLASSIFICATION_ORDER.map((id) => {
            const c = CLASSIFICATION[id]
            return (
              <div
                key={id}
                className="card p-4"
                style={{
                  borderLeft: `3px solid light-dark(${VERDICT.light[id]}, ${VERDICT.dark[id]})`,
                }}
              >
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <h3 className="text-[14.5px] font-semibold text-[var(--ink)]">{c.label}</h3>
                  <span className="num text-[11px] text-[var(--ink-3)]">rung {c.ordinal}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                  {c.summary}
                </p>
              </div>
            )
          })}
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            {
              h: 'At least two bands must agree',
              p: `A single channel cannot reach the top rung at any score. Instrument artefacts are single-band by nature, and the entire argument for building a multi-spectral node collapses if one sensor can carry a verdict alone.`,
            },
            {
              h: 'The clock must be disciplined',
              p: `Cross-band coincidence is a claim about simultaneity, and simultaneity at ${THRESHOLDS.coincidenceWindowMs} milliseconds is meaningless on a clock good to tens of milliseconds. A node without pulse-per-second lock has its score capped and the top rung closed.`,
            },
            {
              h: 'Every catalogue must have been reachable',
              p: 'If any check could not run, the event is ambiguous rather than unresolved. The verdict records exactly which ones were missing so the event can be rescored later when they are available.',
            },
            {
              h: `The score must clear ${THRESHOLDS.anomalyScoreUnresolvedFloor}`,
              p: 'Derived from how badly the best conventional explanation fits, then adjusted for corroboration and collapsed almost to zero if any catalogue positively explained the event.',
            },
          ].map((g) => (
            <div key={g.h} className="card p-5">
              <h3 className="text-[14.5px] font-semibold text-[var(--ink)]">{g.h}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{g.p}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Corroboration"
        title="How much independent support an event has"
        lede="Orthogonal to the ladder. An event can be strongly corroborated and still be a perfectly ordinary aircraft."
      >
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {CORROBORATION_ORDER.map((id) => (
            <div key={id} className="card p-5">
              <h3 className="text-[14.5px] font-semibold text-[var(--ink)]">
                {CORROBORATION[id].label}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
                {CORROBORATION[id].summary}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Step four" title="Write down why">
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          Every verdict carries a prose explanation naming the catalogues consulted, the ones that
          were unreachable, the winning hypothesis and its posterior, the runner-up, and the
          specific reasons each was weighted the way it was. A number without a reason is not a
          result anyone can argue with, and being arguable is the entire point.
        </p>

        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-2">
            <span className="eyebrow">Example verdict, generated by the engine</span>
          </div>
          <pre className="scroll-x p-4 text-[12px] leading-relaxed text-[var(--ink-2)]">
{`Event spanned 2.0 s across 3 band(s) (lwir, mmw, vis), corroboration
multi node, clock gnss_pps. Checked 5 of 5 catalogues. ADSB was
reachable and found no match. TLE was reachable and found no match.
LIGHTNING was reachable and found no match. RFI was reachable and
found no match. WEATHER was reachable and found no match. Best
hypothesis: Aircraft at posterior 0.34. Best conventional explanation:
Aircraft at 0.34. No conventional hypothesis reached the 0.40 fit
floor. Because ADS-B was reachable and reported no aircraft on this
bearing. Next best: Unmodelled at 0.27. Classified unresolved. This
states that no catalogue consulted explains the event, not that its
cause is known to be unusual.`}
          </pre>
        </div>

        <Note title="Verdicts are versioned, not overwritten">
          <p>
            Re-running an improved discriminator over the archive writes a new verdict alongside the
            old one, stamped with the discriminator and schema version that produced it. The history
            of how the platform’s opinion changed is itself part of the record, and an event that
            was called unresolved in 2026 and explained in 2028 keeps both entries.
          </p>
        </Note>
      </Section>
    </>
  )
}
