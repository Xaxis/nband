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
        Two kinds of thing are shown here and they deserve different amounts of trust. The
        schematic and the carrier are generated from the hardware registry and checked on every
        build: every connection routes and nothing sits closer than a fabricator&rsquo;s minimum
        copper gap. Placement is machine-generated rather than laid out by a person, so take the
        netlist and lay it out yourself before ordering anything. The whole-node view is weaker
        again, and it is weakest exactly where it looks strongest. Six parts carry published
        mechanical figures: the three Raspberry Pi boards, the GNSS HAT outline, the case, and the
        card. Everything else is sized to show scale and stacking, and the features on those
        bodies, the lens barrels, antenna patches, shield cans and connectors, are drawn where a
        part of that kind has them rather than measured from a drawing. They are there because a
        node built from anonymous blocks tells you nothing about which part is which or which way
        a sensor has to face. Read them as identification, not as dimensions. The counter under
        each view gives the split, and every approximate body is drawn with a visible edge.
      </Note>

      <BoardViewer boards={boards} assemblies={loadAssemblies()} />

      <p className="mt-4 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Beyond the module connectors, each board carries a 100&nbsp;nF decoupling capacitor per
        module, a bulk reservoir per supply rail, a ground plane poured on an inner layer, a series
        resistor and pull-down on any gate driven from a GPIO, a TVS clamp on every line that
        leaves the enclosure, a resettable fuse and reverse-polarity diode on each rail, an
        identification EEPROM on the ID_SD and ID_SC pins the HAT specification reserves for it,
        and the four mounting holes. That is more copper than a fan-out needs, and the boards
        overhang the 65&nbsp;mm HAT footprint because of it; the mounting holes stay on the
        standard pattern.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Two of those are worth understanding rather than accepting. The gate pull-down holds the
        infrared emitter off between power-on and the agent claiming the pin; a floating MOSFET
        gate is not an off gate, and an uncommanded emission is one the node cannot subtract from
        its own record. The clamps exist because two signals leave the box on multi-metre cables, the
        magnetometer two metres out on a mast and the geophone further and in the ground, and a
        cable that long is an antenna.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        There are no I&sup2;C pull-ups on the carrier. The Raspberry Pi fits 1.8&nbsp;k&Omega; to
        3V3 on GPIO2 and GPIO3, on the board and not removable, and that value is correct on its
        own. Adding more takes a tier&nbsp;3 bus with four breakouts from 1,047&nbsp;&Omega; to
        856&nbsp;&Omega;, below the 967&nbsp;&Omega; I&sup2;C needs to pull a valid low. Disable
        the pull-ups on your breakouts instead.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Fewer parts are board-mounted than a bill of materials suggests. A BME688 above the
        Raspberry Pi measures the Pi&rsquo;s temperature rather than the site&rsquo;s; the UV and
        thermal sensors need sky through their own gasketed windows; the magnetometer asks for two
        metres of separation from the node&rsquo;s electronics. Those sit at the enclosure wall or
        on the mast and reach the carrier by cable, which is what the whole-node view shows. USB
        peripherals and the CSI cameras never touch the header at all.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        The whole-node view is laid out against the case interior rather than around the origin,
        so what it answers is how the parts pack rather than only which parts there are. Tier 3
        uses about a third of the floor and stands 75&nbsp;mm into a 155&nbsp;mm case, which is
        the margin that decides whether a substitute part fits. Nothing drawn inside the case may
        reach outside it and the build fails if it does, because the tier&nbsp;3 carrier overhangs
        the HAT footprint far enough that it used to pass 20&nbsp;mm through the wall, and a board
        crossing a wireframe outline looks exactly like a board.
      </p>

      <p className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-[var(--ink-2)]">
        Header pins are labelled by Raspberry Pi physical number. The connector&rsquo;s own
        numbering runs counter-clockwise and agrees with the Pi on two of its forty pins, so
        anything that reads &ldquo;P7&rdquo; means physical&nbsp;7 and the pulse-per-second line.
      </p>
    </div>
  )
}
