'use client'

import { useId, useSyncExternalStore } from 'react'
import { TIER, TIER_ORDER, partsForTier, tierPower, type Tier } from '../lib/schema/generated'

// Derived, not listed. The research tier is in the enum so the schema can name
// an instrument class, and it has no parts and no bill of materials; a hardcoded
// ['t1','t2','t3'] beside it is a second copy of that fact waiting to disagree.
const BUILDABLE = TIER_ORDER.filter((t) => TIER[t].buildable)

/**
 * A tier selector for the panels that show one tier's worth of something.
 *
 * The wiring panel and the power panel were both hardcoded to tier 2 and
 * neither said so. That reads as coverage rather than scope, and the two
 * failures it produced are not cosmetic. The pinout showed pins 32 and 33
 * assigned to a presence radar that a tier 3 node does not have, and omitted
 * the infrared beacon's gate line entirely, which is the one signal the carrier
 * panel calls out as safety-relevant. The power panel computed a 104 W panel
 * for a node that draws 200 W of it, and the drift check exists precisely
 * because an undersized panel strands a remote build.
 *
 * So the tier is a control rather than a constant, it lives in the URL so a
 * link can carry it, and the header states the load and part count for whatever
 * is selected. The board viewer already worked this way; these panels did not.
 */

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('nband:tierscope', onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('nband:tierscope', onChange)
  }
}

/**
 * Panels arrive already rendered, one per tier, rather than as a function of
 * the tier. A render prop is the natural shape and it cannot cross the
 * server-client boundary: the page is a server component, so passing it a
 * function fails the production build outright. Rendered elements do cross,
 * which means all three tiers render on the server and this component only
 * decides which one is shown. The tables are small enough that shipping three
 * costs less than shipping the registry to the browser to build one.
 */
export function TierScope({
  scope,
  panels,
}: {
  /** Hash prefix, so two scoped panels on one page do not fight over the tier. */
  scope: string
  panels: Partial<Record<Tier, React.ReactNode>>
}) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const panelId = useId()
  const m = new RegExp(`^#${scope}-([a-z0-9]+)$`).exec(hash)
  const tier = (BUILDABLE.includes(m?.[1] as Tier) ? m![1] : 't2') as Tier

  const select = (t: Tier) => {
    const next = `#${scope}-${t}`
    if (window.location.hash === next) return
    window.history.replaceState(null, '', next)
    window.dispatchEvent(new Event('nband:tierscope'))
  }

  const status = `${partsForTier(tier).length} parts · ${tierPower(tier).activeW.toFixed(1)} W continuous`

  return (
    <div>
      <div
        role="tablist"
        aria-label="Tier"
        className="mb-5 flex flex-wrap items-center gap-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-3)] p-2"
      >
        {BUILDABLE.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={t === tier}
            aria-controls={panelId}
            onClick={() => select(t)}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
              t === tier
                ? 'bg-[var(--surface-1)] font-semibold text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {TIER[t].label}
          </button>
        ))}
        <span className="num ml-auto pr-1 text-[11.5px] text-[var(--ink-3)]">{status}</span>
      </div>
      {/* All three stay mounted so switching is instant and an anchor inside a
          tier that is not showing still resolves, which is what lets a link
          like #t3 open the right one. */}
      {BUILDABLE.map((t) => (
        <div key={t} id={t === tier ? panelId : undefined} role="tabpanel" hidden={t !== tier}>
          {panels[t]}
        </div>
      ))}
    </div>
  )
}
