'use client'

import { useId, useSyncExternalStore } from 'react'
import { PanZoom } from './PanZoom'

/**
 * The whole node on one sheet, one tier at a time.
 *
 * The carrier schematic beside this covers the parts that touch the 40-pin
 * header, which on tier 3 is nine of twenty-two. Everything else arrives over
 * USB, over CSI ribbon, or through a power chain the bill of materials records
 * as a single row, and none of it appeared in a diagram anywhere. This is the
 * other two thirds.
 *
 * The tier lives in the URL for the same reason it does on the board viewer:
 * "look at the tier 3 power chain" should be a link, and state seeded from the
 * hash into useState does not survive hydration.
 */

export interface SystemSheetEntry {
  tier: string
  label: string
  parts: number
  href: string
  facts: {
    power: { stages: string[]; draw: number; peak: number; headroom: number | null }
    signal: Record<string, string[]>
    hub: string | null
  }
}

const HASH_EVENT = 'nband:systemhash'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener(HASH_EVENT, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener(HASH_EVENT, onChange)
  }
}

function select(hash: string) {
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new Event(HASH_EVENT))
}

export function SystemSheet({ sheets }: { sheets: SystemSheetEntry[] }) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )
  const panelId = useId()
  const m = /^#architecture-([a-z0-9]+)$/.exec(hash)
  const active = sheets.find((s) => s.tier === m?.[1]) ?? sheets[1] ?? sheets[0]
  if (!active) return null

  const buses = Object.entries(active.facts.signal).filter(([id]) => id !== 'none')
  const onBus = buses.reduce((n, [, ids]) => n + ids.length, 0)

  return (
    <div className="card overflow-hidden">
      <div
        role="tablist"
        aria-label="Node tier"
        className="flex flex-wrap gap-1 border-b border-[var(--line)] bg-[var(--surface-3)] p-2"
      >
        {sheets.map((s) => (
          <button
            key={s.tier}
            role="tab"
            type="button"
            aria-selected={s.tier === active.tier}
            aria-controls={panelId}
            onClick={() => select(`#architecture-${s.tier}`)}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
              s.tier === active.tier
                ? 'bg-[var(--surface-1)] font-semibold text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {s.label}
            <span className="num ml-2 text-[11.5px] text-[var(--ink-3)]">{s.parts} parts</span>
          </button>
        ))}
        <span className="num ml-auto self-center pr-1 text-[11.5px] text-[var(--ink-3)]">
          {active.facts.power.stages.length} power stages · {buses.length} buses ·{' '}
          {active.facts.power.draw} W
          {active.facts.power.headroom !== null && ` · ${active.facts.power.headroom}% headroom`}
        </span>
      </div>

      <div id={panelId} role="tabpanel">
        <PanZoom
          key={active.tier}
          src={active.href}
          alt={`System schematic for the ${active.label} node: a ${active.facts.power.stages.length}-stage power chain ending in a ${active.facts.power.draw} watt load, ${onBus} parts across ${buses.length} buses into the host${
            active.facts.hub ? ' with USB peripherals routed through a powered hub' : ''
          }, and the data path from spool to archive`}
          surface="light"
          initial="fit"
          maxHeight={1040}
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-[var(--line)] px-4 py-3 text-[12.5px] text-[var(--ink-2)]">
        <span>
          Every part in the tier appears here. A part that does not is a build failure, not a
          tidier diagram.
        </span>
        <a className="link num ml-auto text-[12px]" href={active.href} download>
          Download SVG
        </a>
      </div>
    </div>
  )
}
