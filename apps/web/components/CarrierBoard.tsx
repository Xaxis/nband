import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TIER } from '../lib/schema/generated'
import { Note } from './ui'

/**
 * The generated carrier board for a tier.
 *
 * `schema/hardware.json` records which physical header pin each signal lands
 * on. That table used to exist only as prose and a diagram, and prose does not
 * fail to compile: it claimed the radar's UART went to pins with no UART
 * function while assigning one of those same pins to the beacon as well, and
 * both errors survived into a published wiring guide.
 *
 * `make boards` turns the table into a tscircuit netlist per tier, so the pin
 * assignments are checked by a router rather than by a reader. What is rendered
 * here is the schematic, which is derived from the netlist alone and is exactly
 * as correct as the registry is.
 *
 * The PCB and 3D views are deliberately not shown as though they were finished.
 * Component placement is generated on a grid and the autorouter leaves between
 * a fifth and a third of the nets unrouted, which is what layout by a person is
 * for. Publishing a convincing board render without saying that is precisely
 * the kind of overclaim this project is built to avoid.
 */

interface BoardManifest {
  status: string
  caveat: string
  boards: {
    tier: string
    modules: number
    signals: number
    artifacts: Record<string, string>
    routing: { routed: number; nets: number; unresolved: number }
  }[]
}

function loadManifest(): BoardManifest | null {
  const path = resolve(process.cwd(), 'public/boards/manifest.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as BoardManifest
}

export function CarrierBoards() {
  const manifest = loadManifest()
  if (!manifest || manifest.boards.length === 0) return null

  return (
    <div className="mt-7">
      <Note kind="warning" title="These boards have never been fabricated">
        The schematic is generated from the hardware registry and is as correct as the registry
        is. The board layout is not finished: components are placed on a grid by a script and the
        autorouter leaves a portion of the nets unrouted, which is stated per tier below. Treat
        the schematic as the wiring reference and the layout as a starting point, and do not send
        either to a fabricator without laying it out properly first.
      </Note>

      <div className="mt-6 grid gap-6">
        {manifest.boards.map((b) => {
          const tier = TIER[b.tier as keyof typeof TIER]
          const pct = b.routing.nets
            ? Math.round((b.routing.routed / b.routing.nets) * 100)
            : 0
          return (
            <figure key={b.tier} className="card overflow-hidden">
              <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-3">
                <span className="text-[14px] font-semibold text-[var(--ink)]">
                  {tier?.label ?? b.tier.toUpperCase()} carrier
                </span>
                <span className="num text-[12px] text-[var(--ink-2)]">
                  {b.modules} modules · {b.signals} signals · {pct}% auto-routed
                </span>
              </figcaption>

              {/* The schematic, not the PCB. White background because the
                  generated sheet is drawn for paper and its own colours do not
                  invert cleanly into the dark theme. */}
              <div className="scroll-x bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.artifacts['schematic-svg']}
                  alt={`Generated schematic for the ${tier?.label ?? b.tier} carrier board: the Raspberry Pi 40-pin header on the left, ${b.modules} sensor module connectors, and ${b.signals} signal connections between them.`}
                  className="mx-auto block h-auto min-w-[860px] max-w-none"
                />
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-[12.5px] text-[var(--ink-2)]">
                <a className="link" href={b.artifacts['schematic-svg']}>
                  Schematic SVG
                </a>
                <a className="link" href={b.artifacts['pcb-svg']}>
                  PCB layout (unfinished)
                </a>
                <a className="link" href={b.artifacts.glb}>
                  3D model, GLB (unfinished)
                </a>
                {b.routing.unresolved > 0 && (
                  <span className="num">
                    {b.routing.nets - b.routing.routed} net
                    {b.routing.nets - b.routing.routed === 1 ? '' : 's'} still unrouted
                  </span>
                )}
              </div>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
