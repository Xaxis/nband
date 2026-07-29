import { pageMetadata } from '../../../lib/metadata'
import { ArchiveBrowser } from '../../../components/ArchiveBrowser'
import { Container, Section } from '../../../components/ui'

export const metadata = pageMetadata({
  title: 'The archive',
  description:
    'Every event the grid has recorded, with the verdict that was reached and the reasoning behind it. Filterable, cursor-paginated, and downloadable in full.',
  path: '/archive',
})

export default function ArchivePage() {
  return (
    <>
      <section className="gridfield border-b border-[var(--line)]">
        <Container className="py-12 sm:py-16">
          <p className="eyebrow">Live data</p>
          <h1 className="mt-3 max-w-[24ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[44px]">
            Everything recorded, and what was concluded from it.
          </h1>
          <p className="mt-5 max-w-[64ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            Every event carries the verdict reached, the reasoning behind it, and the version of the
            discriminator that produced it. Nothing is deleted when the platform changes its mind:
            a re-run adds a verdict beside the old one and demotes it, so the history of how an
            opinion moved is part of the record.
          </p>
        </Container>
      </section>

      <Section
        eyebrow="Query"
        title="Filter, then take the URL"
        lede="Every filter here is a parameter on the public API and the request is shown as you build it. Anything you find is reproducible by anyone, without an account and without asking."
      >
        <div className="mt-8">
          <ArchiveBrowser />
        </div>
      </Section>

      <Section className="border-t border-[var(--line)] bg-[var(--surface-0)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">
              A catalogue that was down is not a catalogue that found nothing
            </h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
              Events whose catalogue checks could not all be performed are excluded by default. If
              the aircraft transponder feed was unreachable, every aircraft that night looks
              unexplained, and an archive that quietly counted those would manufacture mysteries
              out of its own outages. The filter is there if you want them, and the count of what
              it removed is always shown.
            </p>
          </div>
          <div className="card p-5">
            <h2 className="text-[16px] font-semibold text-[var(--ink)]">Take the whole thing</h2>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
              The full archive downloads as newline-delimited JSON, one table at a time, with a
              manifest carrying the row count and a SHA-256 of the content. An analysis can name
              the exact bytes it was computed from, and a later reader can check they have the same
              ones.
            </p>
            <p className="num mt-3 text-[12px] text-[var(--ink-3)]">
              <a className="link" href="/api/archive/export?table=events">
                /api/archive/export?table=events
              </a>
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
