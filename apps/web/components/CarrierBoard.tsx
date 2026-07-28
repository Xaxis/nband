import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TIER } from '../lib/schema/generated'
import { BoardViewer, type BoardEntry } from './boards/BoardViewer'
import { Note } from './ui'

/**
 * The generated carrier board for each tier.
 *
 * `schema/hardware.json` records which physical header pin each signal lands
 * on. That table used to be checked by reading it, and reading it is how a UART
 * ended up routed to two pins with no UART function, one of which was already
 * assigned to the infrared beacon. `make boards` compiles the table into a
 * tscircuit netlist per tier, so a pin conflict is a build failure.
 *
 * This half runs on the server: it reads the manifest the build wrote and hands
 * it to a client component, so the panel's own JavaScript is the only thing
 * that ships, and only the tier being looked at loads a model.
 */

interface Manifest {
  status: string
  caveat: string
  boards: Omit<BoardEntry, 'label'>[]
}

function loadManifest(): Manifest | null {
  const path = resolve(process.cwd(), 'public/boards/manifest.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

export function CarrierBoards() {
  const manifest = loadManifest()
  if (!manifest || manifest.boards.length === 0) return null

  const boards: BoardEntry[] = manifest.boards.map((b) => ({
    ...b,
    label: TIER[b.tier as keyof typeof TIER]?.label ?? b.tier.toUpperCase(),
  }))

  return (
    <div className="mt-7">
      <Note kind="warning" title="No board here has been fabricated">
        The schematic is generated from the hardware registry and is as correct as the registry is;
        it is the wiring reference and it is checked on every build. The layout is not finished.
        Components are placed by a script and the autorouter leaves a portion of the nets unplaced,
        which each view states in the open. Do not send any of this to a fabricator without laying
        it out properly first.
      </Note>

      <BoardViewer boards={boards} />

      <p className="mt-4 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Only modules that touch the GPIO header appear here. USB peripherals and the CSI cameras
        connect elsewhere and are not carried by the board, so tier 3 shows eight modules against a
        bill of materials listing considerably more. The header pins are labelled by Raspberry Pi
        physical number rather than by the connector&rsquo;s own numbering, which runs
        counter-clockwise and agrees with the Pi on only two of its forty pins.
      </p>
    </div>
  )
}
