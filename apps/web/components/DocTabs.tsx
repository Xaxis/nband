'use client'

import { useId, useSyncExternalStore, type ReactNode } from 'react'
import { Container } from './ui'

/**
 * Panelled navigation for a page that had become a single 16,000-pixel scroll.
 *
 * The hardware page carries five different things, an architecture diagram, a
 * bill of materials per tier, the wiring table, the power budget and the
 * generated boards, and someone arriving to check one part number had to
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

  // Resolve the hash to a panel in two steps.
  //
  // First by name, including a prefix match so a nested deep link such as
  // "#boards-t3-model" still opens the boards panel.
  //
  // Then, failing that, by looking up whatever element the hash names and
  // asking which panel contains it. Panelling this page silently broke every
  // link into it: twenty-four search results and the home page point at "#t1",
  // which had been a section anchor and became content inside a closed panel.
  // Rather than rewrite those links and break the next set, any anchor living
  // inside a panel opens that panel.
  const named = tabs.find((t) => hash === `#${t.id}` || hash.startsWith(`#${t.id}-`))
  const containing = useSyncExternalStore(
    subscribe,
    () => {
      if (named || hash.length < 2) return ''
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      return el?.closest('[data-doctab]')?.getAttribute('data-doctab') ?? ''
    },
    () => '',
  )
  const active = named ?? tabs.find((t) => t.id === containing) ?? tabs[0]

  const select = (id: string) => {
    // replaceState, not a navigation: the back button should leave the page,
    // not step back through however many panels were opened along the way.
    window.history.replaceState(null, '', `#${id}`)
    window.dispatchEvent(new Event('nband:boardhash'))
    // Offset by the sticky header, which scrollIntoView does not account for
    // and would otherwise leave the strip tucked underneath it. Honour the
    // reduced-motion setting the rest of the site respects.
    const strip = document.getElementById(listId)
    if (!strip) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: strip.getBoundingClientRect().top + window.scrollY - 56,
      behavior: reduced ? 'auto' : 'smooth',
    })
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

      {/* An h2 per panel, not just a tab label. A tablist is a control, not an
          outline: with four of five panels hidden and out of the accessibility
          tree, a reader navigating by heading found a page with one h1 and
          nothing beneath it. The heading is visually hidden because the tab
          above already reads as the title, but it exists in the document so
          the outline is not a lie. */}
      <Container>
        <h2 className="sr-only">{active.label}</h2>
        {active.hint && (
          <p className="max-w-[68ch] pt-7 text-[14px] leading-relaxed text-[var(--ink-2)]">
            {active.hint}
          </p>
        )}
      </Container>

      {/* Every panel stays mounted and inactive ones carry `hidden`, so
          switching back is instant and any anchor inside a closed panel is
          still findable by getElementById, which is what lets a link like
          "#t1" open the panel containing it.

          It does NOT make the content reachable by the browser's find-on-page,
          and an earlier version of this comment claimed it did. `hidden` takes
          the subtree out of the accessibility tree and out of find. Four fifths
          of this page is therefore invisible to Ctrl-F while a panel is open,
          which is the honest cost of panelling it.

          Site search is the mitigation, and for a while that was a claim rather
          than a fact: build-search-index.mjs walked nav.ts and content/*.md,
          both of which are blind to a TSX page, so /hardware held one entry and
          four of its five panels were unreachable by any means. Searching
          "carrier board" returned nothing at all. The index now reads the tab
          literals directly and emits one entry per panel with its hint as the
          snippet, and it throws rather than emitting zero if that shape ever
          changes. Do not weaken that: an index that silently stops covering
          these panels looks exactly like one that does. */}
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          data-doctab={t.id}
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
