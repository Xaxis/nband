import Link from 'next/link'
import { PageHeader } from '../components/ui'

export default function NotFound() {
  return (
    <PageHeader
      eyebrow="404"
      title="Nothing recorded at this address."
      lede="Which, unlike most of what this instrument reports, is unambiguous."
    >
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
    </PageHeader>
  )
}
