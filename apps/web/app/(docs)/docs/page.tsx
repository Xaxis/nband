import { pageMetadata } from '../../../lib/metadata'
import Link from 'next/link'
import { PageHeader, Section } from '../../../components/ui'
import { NAV } from '../../../lib/nav'
import { BANDS, PARTS, PLATFORM_VERSION, tierCost, tierPower } from '../../../lib/schema/generated'

export const metadata = pageMetadata({
  title: 'Documentation',
  description:
    'How the pieces fit together, and the shortest path through them depending on whether you are deciding, building, or reading the archive.',
  path: '/docs',
})

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
      <PageHeader
        eyebrow={<>Documentation · v{PLATFORM_VERSION}</>}
        title="Building an instrument that can be argued with."
        lede={
          <>
            The reason unexplained sightings stay unexplained is almost never that the object was
            exotic. It is that nobody measured it properly. Everything documented here exists to
            change that: hardware, firmware, database, analysis, and these pages in one repository
            on one version, with a drift check that fails the build when any of them disagree.
            Documentation that has quietly stopped matching the hardware is worse than none, because
            it is trusted.
          </>
        }
      >
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            // "Bands sampled: 14" was hardcoded between two computed stats,
            // and nothing samples fourteen: the gravimetric band has no
            // registered part in any tier and no node carries one. Defined
            // and sampled are different numbers, so the label says which.
            { k: 'Bands defined', v: String(BANDS.length) },
            {
              k: 'Bands with a part',
              v: String(new Set(PARTS.map((p) => p.band).filter(Boolean)).size),
            },
            { k: 'Entry build', v: `$${tierCost('t1').toFixed(0)}` },
            { k: 'Tier 2 draw', v: `${t2.activeW.toFixed(1)} W` },
          ].map((s) => (
            <div key={s.k} className="card p-4">
              <div className="eyebrow">{s.k}</div>
              <div className="num mt-1 text-[22px] font-semibold text-[var(--ink)]">{s.v}</div>
            </div>
          ))}
        </div>
      </PageHeader>

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

      {/* Every section, including "Start here". The footer drops that one
          because it repeats the links beside it; an index should not. The
          filter here was `s.id !== 'start' || true`, which is unconditionally
          true and read as if it excluded something. */}
      {NAV.map((section) => (
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
