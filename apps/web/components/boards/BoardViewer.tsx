'use client'

import dynamic from 'next/dynamic'
import { useId, useState, useSyncExternalStore } from 'react'
import { PanZoom } from './PanZoom'
import type { Assembly } from './NodeScene'

/**
 * The generated carrier boards, one tier at a time, in three views.
 *
 * The three views are not equally trustworthy and the component says so rather
 * than presenting them as a set. The schematic is derived from the netlist
 * alone, needs no router, and is exactly as correct as schema/hardware.json is.
 * The layout and the 3D model come from machine placement and a router that
 * does not finish, so each carries its routed-net count in the open.
 *
 * A convincing board render with nothing qualifying it is the same failure as a
 * confident classification with no error bars, which is the thing this whole
 * project is built to refuse.
 */

const NodeScene = dynamic(() => import('./NodeScene'), {
  ssr: false,
  loading: () => (
    <p className="grid h-[460px] place-items-center text-[13px] text-[var(--ink-3)] sm:h-[580px]">
      Assembling node…
    </p>
  ),
})

const BoardScene = dynamic(() => import('./BoardScene'), {
  ssr: false,
  loading: () => (
    <p className="grid h-[420px] place-items-center text-[13px] text-[var(--ink-3)] sm:h-[520px]">
      Loading model…
    </p>
  ),
})

export interface BoardEntry {
  tier: string
  label: string
  modules: number
  signals: number
  artifacts: Record<string, string>
  components: number
  routing: { routed: number; nets: number; unrouted: number; drc: number }
}

type View = 'node' | 'schematic' | 'pcb' | 'model'

const VIEWS: { id: View; label: string; blurb: string }[] = [
  {
    id: 'node',
    label: 'Whole node',
    blurb:
      'Everything in the tier, assembled: the Pi, the carrier on standoffs, the breakouts on top of it, the USB peripherals on cables, the cameras, and the case. A massing model for scale and stacking, not CAD.',
  },
  {
    id: 'schematic',
    label: 'Schematic',
    blurb:
      'Generated from the netlist, so it is exactly as correct as the hardware registry. This is the wiring reference.',
  },
  {
    id: 'pcb',
    label: 'PCB layout',
    blurb:
      'Four layers, ground poured on the bottom. Placement is machine-generated, so treat this as a reference layout rather than a finished board.',
  },
  {
    id: 'model',
    label: '3D model',
    blurb:
      'The same layout, rendered. Board outline, connector bodies, passives and mounting holes are all real geometry.',
  },
]

/**
 * The selection lives in the URL, and the URL is the only copy of it.
 *
 * Deep-linking is worth having for its own sake: "look at the tier 3 layout"
 * should be a link. The first attempt kept the selection in useState and merely
 * seeded it from the hash, which does not survive hydration — the server has no
 * location to read, so it renders the default, and the client's differing
 * initial state is discarded. A link to #boards-t3-model opened on tier 1.
 *
 * useSyncExternalStore is the primitive for exactly this: state that lives
 * outside React and can change without React's knowledge. The server snapshot
 * is the empty hash, which is the default view, so there is nothing to mismatch.
 *
 * history.replaceState is deliberate. Switching a tab is a view preference, not
 * navigation, and pushing thirty history entries would trap the back button on
 * a page someone is only browsing.
 */
const HASH_EVENT = 'nband:boardhash'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener(HASH_EVENT, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener(HASH_EVENT, onChange)
  }
}

function selectHash(hash: string) {
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', hash)
  // replaceState fires nothing, so the store is told directly.
  window.dispatchEvent(new Event(HASH_EVENT))
}

function parseHash(hash: string, boards: BoardEntry[]): { tier: string; view: View } {
  const m = /^#boards-([a-z0-9]+)(?:-(node|schematic|pcb|model))?$/.exec(hash)
  const tier = m && boards.some((b) => b.tier === m[1]) ? m[1] : (boards[0]?.tier ?? '')
  return { tier, view: (m?.[2] as View) ?? 'schematic' }
}

export function BoardViewer({
  boards,
  assemblies = [],
}: {
  boards: BoardEntry[]
  assemblies?: Assembly[]
}) {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => '',
  )
  const { tier, view } = parseHash(hash, boards)
  const setTier = (t: string) => selectHash(`#boards-${t}-${view}`)
  const setView = (v: View) => selectHash(`#boards-${tier}-${v}`)
  const panelId = useId()
  // Local rather than in the URL: these are display toggles, not a view worth
  // linking to, and putting four booleans in the hash makes the link unreadable.
  const [showCase, setShowCase] = useState(false)
  const [showRemote, setShowRemote] = useState(false)

  const board = boards.find((b) => b.tier === tier) ?? boards[0]
  const assembly = assemblies.find((a) => a.tier === board?.tier)
  if (!board) return null

  // Routed-trace count is not a completeness measure: several connections on
  // one net become a single routed path, so a finished board reports fewer
  // traces than nets. What matters is whether anything failed to route.
  const complete = board.routing.unrouted === 0
  const active = VIEWS.find((v) => v.id === view)!

  return (
    <div className="card mt-7 overflow-hidden">
      {/* Tier selector */}
      <div
        role="tablist"
        aria-label="Board tier"
        className="flex flex-wrap gap-1 border-b border-[var(--line)] bg-[var(--surface-3)] p-2"
      >
        {boards.map((b) => (
          <button
            key={b.tier}
            role="tab"
            type="button"
            aria-selected={b.tier === tier}
            aria-controls={panelId}
            onClick={() => setTier(b.tier)}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
              b.tier === tier
                ? 'bg-[var(--surface-1)] font-semibold text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {b.label}
            <span className="num ml-2 text-[11.5px] text-[var(--ink-3)]">
              {b.modules} modules
            </span>
          </button>
        ))}
      </div>

      {/* View selector */}
      <div
        role="tablist"
        aria-label="View"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-2 py-2"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            type="button"
            aria-selected={v.id === view}
            aria-controls={panelId}
            onClick={() => setView(v.id)}
            className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
              v.id === view
                ? 'bg-[var(--surface-2)] font-semibold text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
            }`}
          >
            {v.label}
          </button>
        ))}
        <span className="num ml-auto pr-1 text-[11.5px] text-[var(--ink-3)]">
          {board.components} components · {board.signals} signals ·{' '}
          {complete ? 'fully routed' : `${board.routing.unrouted} unrouted`}
        </span>
      </div>

      <div id={panelId} role="tabpanel">
        {view === 'node' &&
          (assembly ? (
            <>
              <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] px-4 py-2.5 text-[12.5px] text-[var(--ink-2)]">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCase}
                    onChange={(e) => setShowCase(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Show the case
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showRemote}
                    onChange={(e) => setShowRemote(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Show mast and ground-mounted parts
                </label>
                <span className="num ml-auto text-[11.5px] text-[var(--ink-3)]">
                  {assembly.counts.sourced} sourced · {assembly.counts.approximate} approximate
                </span>
              </div>
              <NodeScene
                key={`${board.tier}-node`}
                assembly={assembly}
                showCase={showCase}
                showRemote={showRemote}
              />
            </>
          ) : (
            <p className="grid h-[460px] place-items-center text-[13px] text-[var(--ink-3)]">
              No assembly generated for this tier.
            </p>
          ))}
        {view === 'schematic' && (
          <PanZoom
            key={`${board.tier}-sch`}
            src={board.artifacts['schematic-svg']}
            alt={`Schematic for the ${board.label} carrier: the Raspberry Pi 40-pin header, ${board.modules} module connectors, and ${board.signals} connections between them`}
            surface="light"
          />
        )}
        {view === 'pcb' && (
          <PanZoom
            key={`${board.tier}-pcb`}
            src={board.artifacts['pcb-svg']}
            alt={`PCB layout for the ${board.label} carrier: ${board.components} components on four layers, ${complete ? 'fully routed' : `${board.routing.unrouted} connections unrouted`}`}
            surface="dark"
          />
        )}
        {view === 'model' && (
          <BoardScene key={`${board.tier}-3d`} src={board.artifacts.glb} label={`${board.label} carrier`} />
        )}
      </div>

      <div className="border-t border-[var(--line)] px-4 py-3">
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--ink)]">{active.label}.</span> {active.blurb}
          {(view === 'pcb' || view === 'model') && (
            <>
              {' '}
              <span className="num">
                {complete
                  ? `Every connection is routed.`
                  : `${board.routing.unrouted} connection(s) could not be routed.`}
                {board.routing.drc > 0 &&
                  ` ${board.routing.drc} design-rule violation${board.routing.drc === 1 ? ' remains' : 's remain'}.`}
              </span>
            </>
          )}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          <a className="link" href={board.artifacts['schematic-svg']} download>
            Download schematic (SVG)
          </a>
          <a className="link" href={board.artifacts['pcb-svg']} download>
            PCB layout (SVG)
          </a>
          <a className="link" href={board.artifacts.glb} download>
            3D model (GLB)
          </a>
        </p>
      </div>
    </div>
  )
}
