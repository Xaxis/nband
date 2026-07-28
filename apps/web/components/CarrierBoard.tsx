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
        Only modules that touch the GPIO header appear on the board, and fewer of them are
        board-mounted than a connector count suggests. A BME688 bolted above the Raspberry Pi
        measures the Pi&rsquo;s temperature rather than the site&rsquo;s, the UV and thermal
        sensors need to see sky through their own windows, and the magnetometer&rsquo;s own
        datasheet note asks for two metres of separation from the node&rsquo;s electronics. Those
        sit at the enclosure wall or on the mast and reach the carrier by cable, which is what the
        whole-node view shows.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Only modules that touch the GPIO header appear here. USB peripherals and the CSI cameras
        connect elsewhere and are not carried by the board, so tier 3 shows eight modules against a
        bill of materials listing considerably more. Beyond the connectors, each board carries a
        100&nbsp;nF decoupling capacitor per module, a bulk reservoir per supply rail, a ground
        plane poured on an inner layer, a series resistor and pull-down on any gate driven from a
        GPIO, and the four HAT mounting holes. The pull-down matters more than it looks: without
        it the infrared emitter&rsquo;s gate floats from power-on until the agent claims the pin,
        and a floating gate is not an off gate. Header pins are labelled
        by Raspberry Pi physical number rather than by the connector&rsquo;s own numbering, which
        runs counter-clockwise and agrees with the Pi on only two of its forty pins.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        There are deliberately no I&sup2;C pull-ups on the carrier, and the reason is a correction.
        An earlier revision fitted a 4.7&nbsp;k pair to stop the breakouts&rsquo; own pull-ups
        overloading the bus. The Raspberry Pi already fits 1.8&nbsp;k to 3V3 on GPIO2 and GPIO3, on
        the board and not removable, so that pair took a tier&nbsp;3 bus with four breakouts from
        1,047&nbsp;&Omega; down to 856&nbsp;&Omega; &mdash; below the 967&nbsp;&Omega; I&sup2;C
        needs to pull a valid low. The resistors added to fix the loading were what caused it.
        Disable the pull-ups on each breakout instead; the Pi&rsquo;s 1.8&nbsp;k is correct on its
        own.
      </p>
    </div>
  )
}
