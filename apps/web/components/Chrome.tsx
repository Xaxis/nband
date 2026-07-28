'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { NAV } from '../lib/nav'
import { Search } from './Search'

// Header shows a short path through the manifest rather than a second list of
// its own. The footer previously kept a hand-written list and ended up linking
// to two pages that had never been built.
const HEADER_LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/bands', label: 'Bands' },
  { href: '/hardware', label: 'Hardware' },
  { href: '/build', label: 'Build' },
  { href: '/discriminator', label: 'Discriminator' },
  { href: '/grid', label: 'Grid' },
]

function Mark({ size = 30 }: { size?: number }) {
  // Five arcs, not seven. At 30 px the earlier seven merged into a coloured
  // smudge: the strokes plus their gaps needed more room than the glyph had.
  // Fewer bands, wider spacing, and a flatter sweep read as a spectrum arc at
  // the size it is actually rendered rather than only when zoomed in.
  const hues = [295, 205, 150, 48, 20]
  const R = 15
  const STEP = 2.9
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      fill="none"
    >
      {hues.map((h, i) => {
        const r = R - i * STEP
        return (
          <path
            key={h}
            d={`M ${16 - r} 24 A ${r} ${r} 0 0 1 ${16 + r} 24`}
            stroke={`oklch(0.72 0.17 ${h})`}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        )
      })}
      <circle cx="16" cy="24" r="1.5" fill="currentColor" />
    </svg>
  )
}

/**
 * Read the active theme from the two places it can live.
 *
 * The theme is external mutable state: a localStorage entry the bootstrap
 * script applies before paint, falling back to the OS preference.
 * useSyncExternalStore is the API for exactly this, and it avoids the
 * mount-effect-then-setState pattern that renders twice on every page.
 */
function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: light)')
  media.addEventListener('change', onChange)
  window.addEventListener('storage', onChange)
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('storage', onChange)
    observer.disconnect()
  }
}

function readTheme(): 'light' | 'dark' {
  const stamped = document.documentElement.getAttribute('data-theme')
  if (stamped === 'light' || stamped === 'dark') return stamped
  const stored = localStorage.getItem('nband-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function ThemeToggle() {
  // The server cannot know the theme, so it renders the dark-mode affordance
  // and the client corrects on hydration without an extra render pass.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'dark' as const)

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    // The MutationObserver in subscribeTheme picks this up and re-renders.
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('nband-theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-3)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      type="button"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {theme === 'light' ? (
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <Mark />
          <span>nband</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {HEADER_LINKS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
                  active
                    ? 'bg-[var(--surface-3)] text-[var(--ink)]'
                    : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Search />
          <Link
            href="/telemetry"
            className="hidden items-center gap-1.5 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[13px] text-[var(--ink-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] sm:flex"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0ca30c] opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#0ca30c]" />
            </span>
            Telemetry
          </Link>
          <ThemeToggle />
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--ink-2)] lg:hidden"
            aria-label="Toggle navigation"
            aria-expanded={open}
            type="button"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={open ? 'M6 6l12 12M18 6L6 18' : 'M3 6h18M3 12h18M3 18h18'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2 lg:hidden" aria-label="Main">
          {[...HEADER_LINKS, { href: '/telemetry', label: 'Telemetry' }].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2 text-[15px] text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export function SiteFooter({ version }: { version: string }) {
  return (
    <footer className="mt-24 border-t border-[var(--line)] bg-[var(--surface-0)]">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div>
          <div className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <Mark size={28} />
            nband
          </div>
          <p className="mt-3 max-w-[38ch] text-[13.5px] leading-relaxed text-[var(--ink-3)]">
            An open multi-spectral sensing platform. Build a node, join the grid, read the archive.
            Hardware, firmware, and documentation are versioned together in one repository.
          </p>
          <p className="num mt-4 text-[11.5px] text-[var(--ink-3)]">
            v{version} · docs track firmware
          </p>
        </div>

        {NAV.filter((sec) => sec.id !== 'start').map((col) => (
          <div key={col.id}>
            <h3 className="eyebrow mb-3">{col.label}</h3>
            <ul className="space-y-2">
              {col.items.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[13.5px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-5 text-[12.5px] text-[var(--ink-3)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Code MIT. Documentation and recorded data CC BY 4.0.</p>
          <p>
            nband records what it sees and says what it cannot explain. It does not claim to know
            what anything is.
          </p>
        </div>
      </div>
    </footer>
  )
}
