import type { Metadata } from 'next'
import Link from 'next/link'
import { Container, Section } from '../../../components/ui'
import { NAV } from '../../../lib/nav'
import { PLATFORM_VERSION, tierCost, tierPower } from '../../../lib/schema/generated'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'How the pieces of nband fit together, and the shortest path through them depending on what you are trying to do.',
}

const PATHS = [
  {
    who: 'Deciding whether to build one',
    steps: [
      { href: '/bands', label: 'What the fourteen bands actually see' },
      { href: '/hardware', label: 'What it costs and what draws power' },
      { href: '/discriminator', label: 'How a verdict is reached, live' },
    ],
  },
  {
    who: 'Building one now',
    steps: [
      { href: '/hardware', label: 'Order the parts for your tier' },
      { href: '/build', label: 'Ten verifiable steps' },
      { href: '/software', label: 'Configure and calibrate' },
      { href: '/safety', label: 'Read before powering up outdoors' },
    ],
  },
  {
    who: 'Reading the data',
    steps: [
      { href: '/telemetry', label: 'Live band-by-band charts' },
      { href: '/reference/schema', label: 'What each table means' },
      { href: '/reference/api', label: 'Query it yourself' },
    ],
  },
]

export default function DocsIndex() {
  const t2 = tierPower('t2')

  return (
    <>
      <section className="border-b border-[var(--line)]">
        <Container className="py-12">
          <p className="eyebrow">Documentation · v{PLATFORM_VERSION}</p>
          <h1 className="mt-2.5 max-w-[24ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[40px]">
            Everything here is versioned with the firmware.
          </h1>
          <p className="mt-4 max-w-[66ch] text-[15.5px] leading-relaxed text-[var(--ink-2)]">
            Hardware, firmware, database, analysis, and these pages live in one repository on one
            version. Each document declares the firmware version it was written against, and a
            drift check fails the build when they disagree. Documentation that drifts from the
            hardware is worse than none, because it is trusted.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { k: 'Bands sampled', v: '14' },
              { k: 'Entry build', v: `$${tierCost('t1').toFixed(0)}` },
              { k: 'Tier 2 draw', v: `${t2.activeW.toFixed(1)} W` },
            ].map((s) => (
              <div key={s.k} className="card p-4">
                <div className="eyebrow">{s.k}</div>
                <div className="num mt-1 text-[22px] font-semibold text-[var(--ink)]">{s.v}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Section
        eyebrow="Shortest path"
        title="Depending on what you are trying to do"
        lede="Three routes through the same material. Every page also links to the next in reading order, so following any of these straight through works."
      >
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {PATHS.map((p) => (
            <div key={p.who} className="card p-5">
              <h3 className="text-[14.5px] font-semibold text-[var(--ink)]">{p.who}</h3>
              <ol className="mt-3 space-y-2">
                {p.steps.map((s, i) => (
                  <li key={s.href} className="flex gap-2.5">
                    <span className="num mt-px text-[11px] text-[var(--ink-3)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <Link
                      href={s.href}
                      className="text-[13px] leading-snug text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Section>

      {NAV.filter((s) => s.id !== 'start' || true).map((section) => (
        <Section
          key={section.id}
          className="border-t border-[var(--line)]"
          eyebrow={section.label}
          title={section.summary}
        >
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items
              .filter((i) => i.href !== '/docs')
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="card group flex flex-col p-4 transition-colors hover:border-[var(--line-strong)]"
                >
                  <span className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink)]">
                    {item.label}
                    {item.live && (
                      <span
                        aria-label="live data"
                        className="h-1.5 w-1.5 rounded-full bg-[#0ca30c]"
                      />
                    )}
                  </span>
                  <span className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                    {item.summary}
                  </span>
                  {item.audience && (
                    <span className="num mt-2.5 text-[10.5px] text-[var(--ink-3)]">
                      for: {item.audience}
                    </span>
                  )}
                </Link>
              ))}
          </div>
        </Section>
      ))}
    </>
  )
}
