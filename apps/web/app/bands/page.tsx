import type { Metadata } from 'next'
import { BandCard, SpectrumBar } from '../../components/Bands'
import { Container, Section } from '../../components/ui'
import { BANDS, CONTEXT_BANDS, DETECTION_BANDS } from '../../lib/schema/generated'

export const metadata: Metadata = {
  title: 'The fourteen bands',
  description:
    'Every band a NBAND node samples, what it physically responds to, and where it fails. Ordered by wavelength.',
}

export default function BandsPage() {
  return (
    <>
      <section className="gridfield border-b border-[var(--line)]">
        <Container className="py-14 sm:py-18">
          <p className="eyebrow">Reference</p>
          <h1 className="mt-3 max-w-[22ch] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[46px]">
            Fourteen bands, and what each one is bad at.
          </h1>
          <p className="mt-5 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            A band is defined here by physics, not by which part you bought. Two builders using
            different thermal cameras are contributing to the same band; the discriminator knows
            what each sensor can and cannot resolve and scores accordingly. The limits below matter
            more than the capabilities, because almost every false positive in a system like this
            comes from someone forgetting one of them.
          </p>
          <div className="mt-10">
            <SpectrumBar />
          </div>
        </Container>
      </section>

      <Section
        eyebrow={`Detection bands · ${DETECTION_BANDS.length}`}
        title="Channels that can produce a detection"
        lede="Ordered by increasing wavelength, which is also the order they appear in the schema and in the database enum. An event needs at least two of these to agree before it can be called unresolved."
      >
        <div className="mt-8 space-y-4">
          {DETECTION_BANDS.map((b) => (
            <BandCard key={b.id} band={b} />
          ))}
        </div>
      </Section>

      <Section
        className="border-t border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow={`Context bands · ${CONTEXT_BANDS.length}`}
        title="Channels that can never produce a detection"
        lede="These exist so that every detection carries the conditions it was made under. Treating an environmental excursion as a detection is a well-documented failure mode of amateur sensor networks, so the discriminator will not score on these alone, by construction rather than by policy."
      >
        <div className="mt-8 space-y-4">
          {CONTEXT_BANDS.map((b) => (
            <BandCard key={b.id} band={b} />
          ))}
        </div>
      </Section>

      <Section className="border-t border-[var(--line)]">
        <div className="card p-6">
          <h2 className="text-[18px] font-semibold text-[var(--ink)]">
            Why colour is never the only label here
          </h2>
          <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed text-[var(--ink-2)]">
            Every band on this site carries a written label beside its colour. Fourteen categories
            cannot be separated by hue alone: evenly spaced around the colour wheel they sit about
            26 degrees apart, which is comfortably below the separation threshold for the most
            common forms of colour-vision deficiency. That was measured against the palette used
            here rather than assumed, and no reordering fixes it. So band colour is an accent that
            reinforces a label, the telemetry view uses one chart per band instead of{' '}
            {BANDS.length} overlaid traces, and nothing on this site requires you to distinguish
            two hues to read it correctly.
          </p>
        </div>
      </Section>
    </>
  )
}
