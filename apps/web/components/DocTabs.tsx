'use client'

import { useId, useSyncExternalStore, type ReactNode } from 'react'
import { Container } from './ui'

/**
 * Panelled navigation for a page that had become a single 16,000-pixel scroll.
 *
 * The hardware page carries five different things — an architecture diagram, a
 * bill of materials per tier, the wiring table, the power budget and the
 * generated boards — and someone arriving to check one part number had to
 * scroll past all of the others. They are not a narrative; nothing here is read
 * in order. So they are panels, and the URL says which one is open.
 *
 * Selection lives in the hash for the same reasons it does in the board viewer:
 * a link to a specific panel is worth having, and reading through
 * useSyncExternalStore avoids the hydration trap where the server renders the
 * default, the client computes something else, and the client's value is
 * discarded.
 *
 * Matching is by prefix so that a nested deep link still resolves. The board
 * viewer owns hashes like "#boards-t3-model"; that has to select the boards
 * panel without this component knowing anything about what comes after.
 */

export interface DocTab {
  id: string
  label: string
  /** Shown under the tab strip when the panel is open. */
  hint?: string
  content: ReactNode
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('nband:boardhash', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('nband:boardhash', onChange)
  }
}

export function DocTabs({ tabs, label }: { tabs: DocTab[]; label: string }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const listId = useId()

  const matched = tabs.find((t) => hash === `#${t.id}` || hash.startsWith(`#${t.id}-`))
  const active = matched ?? tabs[0]

  const select = (id: string) => {
    // replaceState, not a navigation: the back button should leave the page,
    // not step back through however many panels were opened along the way.
    window.history.replaceState(null, '', `#${id}`)
    window.dispatchEvent(new Event('nband:boardhash'))
    // Bring the strip into view when the panel above it was tall, but never
    // scroll on first paint.
    document.getElementById(listId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <>
      <div
        id={listId}
        // top-14 matches the 56px sticky header in Chrome.tsx; z below its z-40.
        className="sticky top-14 z-20 border-y border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-0)_92%,transparent)] backdrop-blur-md"
      >
        <Container>
          <div role="tablist" aria-label={label} className="scroll-x flex gap-1 py-2">
            {tabs.map((t) => {
              const on = t.id === active.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={on}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => select(t.id)}
                  className={`whitespace-nowrap rounded-[7px] px-3.5 py-2 text-[13.5px] transition-colors ${
                    on
                      ? 'bg-[var(--surface-2)] font-semibold text-[var(--ink)]'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </Container>
      </div>

      {active.hint && (
        <Container>
          <p className="max-w-[68ch] pt-7 text-[14px] leading-relaxed text-[var(--ink-2)]">
            {active.hint}
          </p>
        </Container>
      )}

      {/* Every panel stays mounted and the inactive ones are hidden, so that
          in-page anchors and browser find-on-page still reach content in a
          panel that is not open, and so switching back is instant. */}
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active.id}
        >
          {t.content}
        </div>
      ))}
    </>
  )
}
