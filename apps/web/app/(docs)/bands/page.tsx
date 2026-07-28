import { pageMetadata } from '../../../lib/metadata'
import Link from 'next/link'
import { SpectrumBar } from '../../../components/Bands'
import {
  AtmosphericWindow,
  BandProfilePanel,
  DetectionMatrix,
} from '../../../components/BandVisuals'
import { Container, Section } from '../../../components/ui'
import {
  CONTEXT_BANDS,
  DETECTION_BANDS,
  PARTS,
  PHENOMENA,
  type Band,
  type PhenomenonId,
} from '../../../lib/schema/generated'
import { SPECTRAL, bandExtent } from '../../../lib/spectrum'

export const metadata = pageMetadata({
  title: 'The fourteen bands',
  description:
    'What each band physically detects, how far it reaches, what weather kills it, and what it costs. With the full matrix of which bands can see which phenomena.',
  path: '/bands',
})

function StrengthPills({ band }: { band: Band }) {
  const strong = PHENOMENA.filter((p) => band.profile.detects[p.id as PhenomenonId] >= 2)
  const blind = PHENOMENA.filter((p) => band.profile.detects[p.id as PhenomenonId] === 0)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="eyebrow">Detects</span>
        {strong.length === 0 ? (
          <span className="text-[12.5px] text-[var(--ink-3)]">nothing in the reference set</span>
        ) : (
          strong.map((p) => (
            <span
              key={p.id}
              className="rounded border border-[var(--line)] px-1.5 py-px text-[11.5px] text-[var(--ink-2)]"
            >
              {p.label}
            </span>
          ))
        )}
      </div>
      {blind.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="eyebrow">Blind to</span>
          {blind.map((p) => (
            <span key={p.id} className="text-[11.5px] text-[var(--ink-3)]">
              {p.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The registry already knows which parts serve which band, so the two pages
 *  can point at each other instead of leaving the reader to guess. */
function PartsForBand({ band }: { band: Band }) {
  const parts = PARTS.filter((p) => p.band === band.id)
  if (parts.length === 0) return null
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <h3 className="eyebrow mb-2">Parts that open this band</h3>
      <div className="flex flex-wrap gap-1.5">
        {parts.map((p) => (
          <Link
            key={p.id}
            href="/hardware"
            className="group flex items-baseline gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 transition-colors hover:border-[var(--line-strong)]"
          >
            <span className="text-[11.5px] text-[var(--ink)]">{p.model}</span>
            <span className="num text-[10.5px] text-[var(--ink-3)]">
              {p.priceUsd === 0 ? 'recovered' : `$${p.priceUsd.toFixed(0)}`}
              {p.tiers?.length ? ` · ${p.tiers.map((t) => t.toUpperCase()).join(', ')}` : ''}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function BandSection({ band }: { band: Band }) {
  const light = SPECTRAL.light[band.id]
  const dark = SPECTRAL.dark[band.id]
  return (
    <article
      id={band.id}
      className="card scroll-mt-24 overflow-hidden"
      style={{ borderLeft: `3px solid light-dark(${light}, ${dark})` }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[19px] font-semibold tracking-tight text-[var(--ink)]">
            {band.label}
          </h2>
          <span className="num text-[12px] text-[var(--ink-3)]">{bandExtent(band)}</span>
        </div>
        <p className="mt-1 text-[14px] text-[var(--ink-2)]">{band.shortDescription}</p>

        <div className="mt-5 border-t border-[var(--line)] pt-5">
          <BandProfilePanel band={band} />
        </div>

        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <StrengthPills band={band} />
        </div>

        <PartsForBand band={band} />

        <div className="mt-5 grid gap-5 border-t border-[var(--line)] pt-5 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-1.5">What it picks up</h3>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{band.whatItSees}</p>
          </div>
          <div>
            <h3 className="eyebrow mb-1.5">Where it fails</h3>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{band.limits}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function BandsPage() {
  const cheapest = [...DETECTION_BANDS].sort(
    (a, b) => a.profile.entryCostUsd - b.profile.entryCostUsd,
  )

  return (
    <>
      <section className="gridfield border-b border-[var(--line)]">
        <Container className="py-12 sm:py-16">
          <p className="eyebrow">Reference</p>
          <h1 className="mt-3 max-w-[22ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[46px]">
            Fourteen bands, and what each one is bad at.
          </h1>
          <p className="mt-5 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            An object that shows up in one band is a story. An object that shows up in four
            different physical channels at the same instant is a measurement. This page is what
            each of those channels can and cannot do, because the limits matter far more than the
            capabilities: almost every false alarm in a system like this comes from someone
            forgetting one.
          </p>
          <div className="mt-10">
            <SpectrumBar />
          </div>
        </Container>
      </section>

      <Section
        eyebrow="The whole argument in one table"
        title="What each band can see, and what it cannot"
        lede="Detection strength for every band against every phenomenon the discriminator models. This is the reason the platform samples more than one band: read down a column and you will find the same object visible in several, which is what makes a coincidence between two of them evidence."
      >
        <div className="mt-8">
          <DetectionMatrix />
        </div>
      </Section>

      <Section
        className="border-y border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Why these bands"
        title="The atmosphere picked the list, not us"
        lede="Sea-level opacity plotted against wavelength, with the sampled bands overlaid. The transparent regions are the optical, infrared, and radio windows. Everywhere else, nothing reaches the ground and no sensor is worth building."
      >
        <div className="mt-8">
          <AtmosphericWindow />
        </div>
      </Section>

      <Section
        eyebrow="Cost of entry"
        title="Ranked by what it costs to open the band at all"
        lede="Cheapest registered part that produces usable data in each band. Three bands cost less than a takeaway meal, and one costs more than a car."
      >
        <div className="card scroll-x mt-8">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2.5 font-normal">Band</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Entry cost</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Reach</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Phenomena seen</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Killed by</th>
              </tr>
            </thead>
            <tbody>
              {cheapest.map((b) => {
                const seen = PHENOMENA.filter(
                  (p) => b.profile.detects[p.id as PhenomenonId] >= 2,
                ).length
                const killers = (
                  [
                    ['cloud', b.profile.penetrates.cloud],
                    ['rain', b.profile.penetrates.rain],
                    ['fog', b.profile.penetrates.fog],
                    ['daylight', b.profile.day],
                  ] as const
                )
                  .filter(([, v]) => v === 0)
                  .map(([k]) => k)
                return (
                  <tr key={b.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2.5">
                      <a href={`#${b.id}`} className="flex items-center gap-2 hover:underline">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-[2px]"
                          style={{
                            background: `light-dark(${SPECTRAL.light[b.id]}, ${SPECTRAL.dark[b.id]})`,
                          }}
                        />
                        <span className="text-[13px] text-[var(--ink)]">{b.label}</span>
                      </a>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[13px] text-[var(--ink)]">
                      {b.profile.entryCostUsd >= 1000
                        ? `$${(b.profile.entryCostUsd / 1000).toFixed(b.profile.entryCostUsd >= 10000 ? 0 : 1)}k`
                        : `$${b.profile.entryCostUsd.toFixed(0)}`}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] text-[var(--ink-2)]">
                      {b.profile.typicalRangeM >= 1000
                        ? `${(b.profile.typicalRangeM / 1000).toFixed(0)} km`
                        : `${b.profile.typicalRangeM} m`}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] text-[var(--ink-2)]">
                      {seen} / {PHENOMENA.length}
                    </td>
                    <td className="num px-3 py-2.5 text-[12px] text-[var(--ink-3)]">
                      {killers.length ? killers.join(', ') : 'nothing here'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        className="border-t border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow={`Detection bands · ${DETECTION_BANDS.length}`}
        title="Channels that can produce a detection"
        lede="Ordered by increasing wavelength, which is also the order they appear in the schema and in the database enum. An event needs at least two of these to agree before it can be called unresolved."
      >
        <div className="mt-8 space-y-4">
          {DETECTION_BANDS.map((b) => (
            <BandSection key={b.id} band={b} />
          ))}
        </div>
      </Section>

      <Section
        className="border-t border-[var(--line)]"
        eyebrow={`Context bands · ${CONTEXT_BANDS.length}`}
        title="Channels that can never produce a detection"
        lede="These exist so that every detection carries the conditions it was made under. Treating an environmental excursion as a detection is a well-documented failure mode of amateur sensor networks, so the discriminator will not score on these alone, by construction rather than by policy."
      >
        <div className="mt-8 space-y-4">
          {CONTEXT_BANDS.map((b) => (
            <BandSection key={b.id} band={b} />
          ))}
        </div>
      </Section>
    </>
  )
}
