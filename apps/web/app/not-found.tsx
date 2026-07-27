import Link from 'next/link'
import { Container } from '../components/ui'

export default function NotFound() {
  return (
    <Container className="py-24 sm:py-32">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 max-w-[20ch] text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[42px]">
        Nothing recorded at this address.
      </h1>
      <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-[var(--ink-2)]">
        Which, unlike most of what this instrument reports, is unambiguous.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        {[
          { href: '/', label: 'Home' },
          { href: '/bands', label: 'The fourteen bands' },
          { href: '/hardware', label: 'Bill of materials' },
          { href: '/build', label: 'Build guide' },
          { href: '/telemetry', label: 'Live telemetry' },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-[14px] text-[var(--accent)] hover:underline"
          >
            {l.label} →
          </Link>
        ))}
      </div>
    </Container>
  )
}
