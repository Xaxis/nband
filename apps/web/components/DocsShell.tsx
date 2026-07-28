'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { NAV, findNav } from '../lib/nav'

/**
 * Shared chrome for every documentation and reference page.
 *
 * Applied by the (docs) route group, so pages keep their flat URLs and gain a
 * persistent sidebar, breadcrumbs, and reading order without each one
 * re-implementing navigation. Before this, each page was an island and the only
 * way between two related ideas was the footer.
 */
export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const here = findNav(pathname)
  const [open, setOpen] = useState(false)

  return (
    <div className="mx-auto max-w-[1400px] lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="border-b border-[var(--line)] lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-4 py-3 text-[13px] text-[var(--ink-2)] lg:hidden"
        >
          <span>
            {here ? (
              <>
                <span className="text-[var(--ink-3)]">{here.section.label}</span>
                <span className="mx-1.5 text-[var(--ink-3)]">/</span>
                <span className="text-[var(--ink)]">{here.item.label}</span>
              </>
            ) : (
              'Documentation'
            )}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <nav
          className={`${open ? 'block' : 'hidden'} px-4 pb-5 lg:block lg:px-5 lg:py-6`}
          aria-label="Documentation"
        >
          {NAV.map((section) => (
            <div key={section.id} className="mb-5">
              <p className="eyebrow mb-2">{section.label}</p>
              <ul className="space-y-px border-l border-[var(--line)]">
                {section.items.map((item) => {
                  const active = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`-ml-px flex items-center gap-1.5 border-l-2 py-1 pl-3 text-[13px] leading-snug transition-colors ${
                          active
                            ? 'border-[var(--accent)] font-medium text-[var(--ink)]'
                            : 'border-transparent text-[var(--ink-3)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {item.label}
                        {item.live && (
                          <span
                            aria-label="live data"
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0ca30c]"
                          />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0">
        {children}

        {/* Reading order. A page that ends in nothing is a dead end. */}
        {here && (here.prev || here.next) && (
          <nav
            className="mx-auto grid max-w-[1180px] gap-3 border-t border-[var(--line)] px-4 py-8 sm:grid-cols-2 sm:px-6"
            aria-label="Previous and next"
          >
            {here.prev ? (
              <Link
                href={here.prev.href}
                className="card group p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <span className="eyebrow">Previous</span>
                <span className="mt-1 block text-[14px] font-medium text-[var(--ink)]">
                  {here.prev.label}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-3)]">
                  {here.prev.summary}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {here.next && (
              <Link
                href={here.next.href}
                className="card group p-4 text-right transition-colors hover:border-[var(--line-strong)]"
              >
                <span className="eyebrow">Next</span>
                <span className="mt-1 block text-[14px] font-medium text-[var(--ink)]">
                  {here.next.label}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-3)]">
                  {here.next.summary}
                </span>
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  )
}
