import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TIER } from '../lib/schema/generated'
import { BoardViewer, type BoardEntry } from './boards/BoardViewer'
import type { Assembly } from './boards/NodeScene'
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

function loadAssemblies(): Assembly[] {
  const path = resolve(process.cwd(), 'public/boards/assembly.json')
  if (!existsSync(path)) return []
  return (JSON.parse(readFileSync(path, 'utf8')) as { assemblies: Assembly[] }).assemblies ?? []
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
      <Note kind="warning" title="None of this has been built, fabricated or measured">
        Two different kinds of thing are shown here and they deserve different amounts of trust.
        The schematic and the carrier board are generated from the hardware registry, every
        connection routes, and both are checked on every build &mdash; but placement is machine
        generated rather than laid out by a person, so take the netlist and lay it out yourself
        before sending anything to a fabricator. The whole-node view is weaker still: it is a
        massing model. Only the Raspberry Pi and HAT outlines and the case are published
        mechanical figures; every other body is an approximation sized to show scale and
        stacking, drawn with a visible edge so you can tell which is which.
      </Note>

      <BoardViewer boards={boards} assemblies={loadAssemblies()} />

      <p className="mt-4 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Only modules that touch the GPIO header appear here. USB peripherals and the CSI cameras
        connect elsewhere and are not carried by the board, so tier 3 shows eight modules against a
        bill of materials listing considerably more. Beyond the connectors, each board carries a
        100&nbsp;nF decoupling capacitor per module, a bulk reservoir per supply rail, one pair of
        4.7&nbsp;k I&sup2;C pull-ups (disable the ones on your breakouts &mdash; three in parallel
        load the bus to about 1.6&nbsp;k), a poured ground plane, and the four HAT mounting holes.
        Header pins are labelled by Raspberry Pi physical number rather than by the
        connector&rsquo;s own numbering, which runs counter-clockwise and agrees with the Pi on
        only two of its forty pins.
      </p>
    </div>
  )
}
