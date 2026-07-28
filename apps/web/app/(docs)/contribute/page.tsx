import Link from 'next/link'
import { ContactForm } from '../../../components/ContactForm'
import { DocPage, docMetadata } from '../../../components/DocPage'
import { Section } from '../../../components/ui'

export const metadata = docMetadata('contribute', '/contribute')

export default function Page() {
  return (
    <>
      <DocPage slug="contribute" />

      <Section
        className="border-t border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Get in touch"
        title="Most things belong somewhere more useful than an inbox"
        lede="A bug is an issue. A substitute part is a registry entry. A question about a build step is worth answering in public, where the next person building the same thing will find it."
      >
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-3">
            {[
              {
                h: 'Something is wrong with the hardware or firmware',
                p: 'Open an issue. Include your node config, the output of --self-test, and which tier you built.',
                href: 'https://github.com/Xaxis/nband/issues',
                cta: 'GitHub issues',
              },
              {
                h: 'You built it with a different part',
                p: 'Add it to schema/hardware.json and open a pull request. That is the registry; there is no separate database to keep in sync.',
                href: '/hardware/variants',
                cta: 'Variant registry',
                internal: true,
              },
              {
                h: 'A document is wrong or out of date',
                p: 'Content lives in /content beside the firmware it describes. Fix it in the same commit as the behaviour it documents.',
                href: 'https://github.com/Xaxis/nband',
                cta: 'Repository',
              },
            ].map((c) => (
              <div key={c.h} className="card p-4">
                <h3 className="text-[14px] font-semibold text-[var(--ink)]">{c.h}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{c.p}</p>
                {c.internal ? (
                  <Link
                    href={c.href}
                    className="mt-2 inline-block text-[12.5px] text-[var(--accent)] hover:underline"
                  >
                    {c.cta} →
                  </Link>
                ) : (
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[12.5px] text-[var(--accent)] hover:underline"
                  >
                    {c.cta} →
                  </a>
                )}
              </div>
            ))}
          </div>

          <div>
            <p className="eyebrow mb-3">Everything else</p>
            <ContactForm />
          </div>
        </div>
      </Section>
    </>
  )
}
