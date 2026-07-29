import Link from 'next/link'
import type { ReactNode } from 'react'

export function Container({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`mx-auto max-w-[1180px] px-4 sm:px-6 ${className}`}>{children}</div>
}

/**
 * The band at the top of a page: eyebrow, h1, lede.
 *
 * Every page hand-rolled this and no two agreed. Across eight pages the h1 ran
 * 30 to 34 pixels on mobile and 38 to 46 on desktop, the padding was py-10,
 * py-12 or py-14, the tracking was one of two values, and the lede was capped
 * at 64, 66 or 68 characters. None of that was a design decision; it was eight
 * copies of one pattern drifting. A reader moving between /grid and /telemetry
 * met a different type scale for no reason they could act on.
 *
 * The only genuine variation is the background, so that is the only prop: the
 * pages that lead with an argument carry the grid field, and the live data
 * pages do not.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  field = false,
  children,
}: {
  eyebrow: ReactNode
  title: ReactNode
  lede?: ReactNode
  /** Draw the faint grid field behind it. Reference pages yes, tool pages no. */
  field?: boolean
  children?: ReactNode
}) {
  return (
    <section className={`border-b border-[var(--line)] ${field ? 'gridfield' : ''}`}>
      <Container className="py-12 sm:py-16">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-[24ch] text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] sm:text-[44px]">
          {title}
        </h1>
        {lede && (
          <p className="mt-5 max-w-[68ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            {lede}
          </p>
        )}
        {children}
      </Container>
    </section>
  )
}

export function Section({
  eyebrow,
  title,
  lede,
  children,
  className = '',
  id,
}: {
  eyebrow?: string
  title?: string
  lede?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
}) {
  return (
    // A section with an id is an anchor target, and every anchor target on this
    // site sits under a 56px sticky header, with a second sticky tab strip
    // beneath it inside a panelled page. Native anchor scroll accounts for
    // neither, so following /hardware#t3 put the tier heading behind the chrome
    // and the reader landed mid-table. The .prose headings already carry this;
    // sections did not, which is why the anchors the search index uses were the
    // ones that looked broken.
    <section id={id} className={`py-14 sm:py-20 ${id ? 'scroll-mt-28' : ''} ${className}`}>
      <Container>
        {(eyebrow || title || lede) && (
          <header className="max-w-[62ch]">
            {eyebrow && <p className="eyebrow mb-2.5">{eyebrow}</p>}
            {title && (
              <h2 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)] sm:text-[32px]">
                {title}
              </h2>
            )}
            {lede && (
              <div className="mt-3 text-[15.5px] leading-relaxed text-[var(--ink-2)]">{lede}</div>
            )}
          </header>
        )}
        {children}
      </Container>
    </section>
  )
}

export function Button({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
  className?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[14px] font-medium transition-colors'
  const styles =
    variant === 'primary'
      ? 'bg-[var(--accent)] text-[var(--accent-ink)] hover:opacity-90'
      : 'border border-[var(--line-strong)] text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)]'
  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  )
}

/** A single measured value. Hero numbers wear mono + tabular so they do not
 *  reflow when they change. */
export function Stat({
  value,
  label,
  detail,
  accent,
}: {
  value: string
  label: string
  detail?: string
  accent?: string
}) {
  return (
    <div className="border-l-2 pl-3.5" style={{ borderColor: accent ?? 'var(--line-strong)' }}>
      <div className="num text-[22px] font-semibold leading-tight text-[var(--ink)] sm:text-[26px]">
        {value}
      </div>
      <div className="mt-0.5 text-[13px] text-[var(--ink-2)]">{label}</div>
      {detail && <div className="mt-0.5 text-[12px] text-[var(--ink-3)]">{detail}</div>}
    </div>
  )
}

export function Note({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'warning' | 'critical'
  title?: string
  children: ReactNode
}) {
  const color =
    kind === 'critical' ? '#d03b3b' : kind === 'warning' ? '#fab219' : 'var(--line-strong)'
  const icon = kind === 'info' ? 'i' : '!'
  return (
    <div
      className="my-5 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-2)] p-4"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {title && (
        <p className="mb-1 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--ink)]">
          <span
            aria-hidden="true"
            className="num grid h-4 w-4 place-items-center rounded-full text-[10px]"
            style={{ background: color, color: '#08090c' }}
          >
            {icon}
          </span>
          {title}
        </p>
      )}
      <div className="text-[13.5px] leading-relaxed text-[var(--ink-2)] [&_a]:text-[var(--accent)] [&_a]:underline [&_p]:mt-2 [&_p:first-child]:mt-0">
        {children}
      </div>
    </div>
  )
}
