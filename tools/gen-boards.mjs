#!/usr/bin/env node
/**
 * Turn the wiring table into a board.
 *
 * `schema/hardware.json` records, for every part, which physical pin of the
 * Raspberry Pi header each of its signals lands on. Until now that table was
 * only ever rendered as prose and a diagram, and prose does not fail to
 * compile. It said the LD2450's UART went to physical pins 16 and 18, which
 * have no UART alternate function, while the same pin 16 was simultaneously
 * assigned to the infrared beacon's gate. Both errors sat in a published
 * wiring guide until an audit read it closely.
 *
 * A netlist does fail. This generates one tscircuit board per tier from the
 * same table, so the pin assignments become copper that either routes or does
 * not, and design-rule violations become build output instead of something a
 * builder discovers with a soldering iron in their hand.
 *
 * The boards are a reference carrier, not a product. None has been fabricated
 * and none should be ordered from these outputs without review. That is stated
 * on the generated board and on the page that shows it, because a rendering
 * this convincing is exactly the kind of thing that gets trusted more than it
 * has earned.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hardware = JSON.parse(readFileSync(join(root, 'schema/hardware.json'), 'utf8'))
const spec = JSON.parse(readFileSync(join(root, 'schema/spec.json'), 'utf8'))

const OUT = join(root, 'hardware/boards')
mkdirSync(OUT, { recursive: true })

// A HAT is 65 x 56 mm with the GPIO header along one long edge. Everything
// else is placed relative to that, since the header position is fixed by the
// mechanical standard rather than by anything this script decides.
const BOARD_W = 65
const BOARD_H = 56
const HEADER_Y = -21

/** Signals that are power or ground, which every module needs and which route short. */
const isRail = (s) => /^(3V3|5V|GND|VCC|VIN)$/i.test(s)

/** A JSX-safe identifier for a signal name: "TXD->RXD" is not one. */
const ident = (s) => s.replace(/[^A-Za-z0-9]/g, '_')

/**
 * Raspberry Pi physical pin number to tscircuit pinheader index.
 *
 * These are not the same numbering and the difference is invisible until the
 * board is fabricated and nothing works. A `doubleRow` pinheader numbers its
 * pins the way an integrated circuit package does, counter-clockwise: pin 1 at
 * one end of the top row, then along the bottom row left to right, then back
 * along the top row right to left. So the top row reads 1, 40, 39, 38 … 22 and
 * the bottom row reads 2, 3, 4 … 21.
 *
 * The Raspberry Pi header is numbered by row instead. Odd pins 1, 3, 5 … 39 run
 * along one row and even pins 2, 4, 6 … 40 along the other.
 *
 * Only pins 1 and 2 mean the same thing in both schemes. Physical pin 7, the
 * GNSS pulse-per-second input and the single most load-bearing connection on
 * the whole node, is index 38 in the connector's own numbering. A generator
 * that emitted `.J1 > .pin7` would have quietly wired the PPS line to physical
 * pin 12, the I2S bit clock.
 *
 * So nothing downstream uses the connector's numbering. Every pin is labelled
 * with its Raspberry Pi number and referenced by that label, and
 * tools/check-boards.mjs re-derives this mapping from the exported geometry
 * rather than trusting this comment.
 */
export function piPinToHeaderIndex(piPin) {
  if (!Number.isInteger(piPin) || piPin < 1 || piPin > 40) {
    throw new Error(`not a Raspberry Pi header pin: ${piPin}`)
  }
  const along = Math.floor((piPin - 1) / 2) // position along the header, 0..19
  // Odd Pi pins share a row with pin 1, which is the connector's top row.
  if (piPin % 2 === 1) return along === 0 ? 1 : 41 - along
  // Even Pi pins run along the connector's bottom row, which starts at 2.
  return along + 2
}

/** The label carried by each connector pin: "P7" is Raspberry Pi physical 7. */
const HEADER_LABELS = Object.fromEntries(
  Array.from({ length: 40 }, (_, i) => [`pin${piPinToHeaderIndex(i + 1)}`, `P${i + 1}`]),
)

function boardFor(tier) {
  const modules = hardware.parts
    .filter((p) => p.tiers?.includes(tier.id))
    .map((p) => ({
      part: p,
      // Only signals landing on a numbered header pin belong on this board.
      // USB peripherals and CSI cameras connect elsewhere and are not carried.
      pins: (p.electrical?.pins ?? []).filter((x) => /^\d+$/.test(String(x.pin))),
    }))
    .filter((m) => m.pins.length > 0)

  if (modules.length === 0) return null

  // Place each module above the header pins it actually uses.
  //
  // The first version of this laid modules out on a fixed two-column grid,
  // which put the I2C sensors at one end of the board and their bus pins at the
  // other. A third of tier 3's nets could not be routed at all. Sorting by the
  // mean position of a module's own signal pins is the crudest possible
  // placement heuristic and it recovers most of that, because a connector sat
  // above its destination has almost nothing to route around.
  //
  // Rails are excluded from the centroid: every module touches 3V3 and GND, so
  // including them pulls every centroid toward the same middle and throws away
  // the signal the heuristic runs on.
  const headerX = (piPin) => (Math.floor((piPin - 1) / 2) - 9.5) * 2.54

  const withCentroid = modules.map((m) => {
    const signals = m.pins.filter((s) => !isRail(s.signal))
    const xs = (signals.length ? signals : m.pins).map((s) => headerX(Number(s.pin)))
    return { ...m, centroid: xs.reduce((a, b) => a + b, 0) / xs.length }
  })

  withCentroid.sort((a, b) => a.centroid - b.centroid)

  // Deal into rows round-robin so that modules wanting nearby header pins end
  // up on different rows rather than fighting for the same x.
  const ROWS = Math.max(2, Math.min(3, Math.ceil(withCentroid.length / 2)))
  const rows = Array.from({ length: ROWS }, () => [])
  withCentroid.forEach((m, i) => rows[i % ROWS].push(m))

  // Then push apart within each row until nothing overlaps. Centroid placement
  // alone put two I2C connectors on exactly the same coordinates — the router
  // laid down no copper at all and the only symptom was 31 "plated hole
  // overlaps" buried in the circuit JSON. A connector is pinCount * 2.54 wide
  // and needs its own space.
  const HALF = (m) => (m.pins.length * 2.54) / 2
  const GAP = 2.0
  const EDGE = 31 // board half-width less a margin

  const placed = []
  rows.forEach((row, r) => {
    // Left to right, each module no further left than its predecessor allows.
    let cursor = -EDGE
    for (const m of row) {
      const x = Math.max(cursor + HALF(m), Math.min(EDGE - HALF(m), m.centroid))
      m.x = x
      cursor = x + HALF(m) + GAP
    }
    // If that pushed the last one off the right edge, walk the whole row back.
    const overflow = cursor - GAP - EDGE
    if (overflow > 0) for (const m of row) m.x -= overflow
    row.forEach((m) => {
      placed.push({
        ...m,
        pcbX: Number(m.x.toFixed(2)),
        pcbY: Number((22 - r * 9.5).toFixed(2)),
        schX: (placed.length % ROWS) * 7,
        schY: 4 - r * 4,
      })
    })
  })

  // Reference designators follow final left-to-right, top-to-bottom order so a
  // reader can find J4 on the board without hunting.
  placed.sort((a, b) => b.pcbY - a.pcbY || a.pcbX - b.pcbX)
  placed.forEach((m, i) => {
    m.ref = `J${i + 2}`
  })

  const decls = placed
    .map((m) => {
      const labels = Object.fromEntries(m.pins.map((s, k) => [`pin${k + 1}`, ident(s.signal)]))
      return (
        `    {/* ${m.part.id} — ${m.part.vendor} ${m.part.model} (${m.part.interface}) */}\n` +
        `    <pinheader\n` +
        `      name="${m.ref}"\n` +
        `      pinCount={${m.pins.length}}\n` +
        `      gender="female"\n` +
        `      pitch="2.54mm"\n` +
        `      pinLabels={${JSON.stringify(labels)}}\n` +
        `      pcbX={${m.pcbX}} pcbY={${m.pcbY}} schX={${m.schX}} schY={${m.schY}}\n` +
        `    />`
      )
    })
    .join('\n')

  // Power and ground go to nets, not to point-to-point traces.
  //
  // Routing every module's GND individually to its own header pin is what a
  // first draft of this generator did, and the router could not place them:
  // tier 3 came back with 9 of 37 nets unrouted, almost all of them ground.
  // That was a real design error rather than a router limitation. Ground is one
  // node of the circuit, so it is one net, and the same is true of each supply
  // rail. Declaring them properly collapses most of the routing pressure and is
  // also what any real carrier board would do.
  const rails = new Map() // net name -> [ "ref.SIGNAL", ... ]
  const signalTraces = []

  for (const m of placed) {
    for (const s of m.pins) {
      const sig = ident(s.signal)
      if (isRail(s.signal)) {
        const net = s.signal.toUpperCase() === 'GND' ? 'GND' : `V${s.signal.replace(/[^0-9]/g, '')}`
        if (!rails.has(net)) rails.set(net, [])
        rails.get(net).push({ ref: m.ref, sig, headerPin: s.pin })
      } else {
        // Several modules legitimately land on the same header pin: I2C is a
        // bus and so is SPI, so pins 3 and 5 carry every I2C device here. That
        // is a shared net, not a conflict, and the pin-exclusivity check in
        // check-drift.mjs already distinguishes the two cases.
        signalTraces.push(`    <trace from=".${m.ref} > .${sig}" to=".J1 > .P${s.pin}" />`)
      }
    }
  }

  const netDecls = [...rails.keys()].map((n) => `    <net name="${n}" />`).join('\n')
  const railTraces = [...rails.entries()]
    .flatMap(([net, members]) => [
      ...members.map((m) => `    <trace from=".${m.ref} > .${m.sig}" to="net.${net}" />`),
      // Tie the net to every header pin the registry assigns to that rail.
      ...[...new Set(members.map((m) => m.headerPin))].map(
        (pin) => `    <trace from=".J1 > .P${pin}" to="net.${net}" />`,
      ),
    ])
    .join('\n')

  const traces = [netDecls, '', railTraces, '', signalTraces.join('\n')]
    .filter((x) => x !== '')
    .join('\n')

  const signalCount = placed.reduce((n, m) => n + m.pins.length, 0)

  return {
    tier: tier.id,
    modules: placed.length,
    signals: signalCount,
    source: `// GENERATED by tools/gen-boards.mjs from schema/hardware.json — do not edit.
//
// ${tier.label} carrier: ${placed.length} header-connected modules, ${signalCount} signals.
//
// This is a reference carrier that has never been fabricated. It exists so the
// pin assignments in the hardware registry are checked by a router rather than
// by a reader. Do not send these outputs to a fab without reviewing them.
//
// Modules on this board:
${placed.map((m) => `//   ${m.ref}  ${m.part.id.padEnd(16)} ${m.part.interface}`).join('\n')}
//
// Not on this board: USB peripherals and CSI cameras, which do not touch the
// GPIO header. See schema/hardware.json for the full tier bill of materials.

export default () => (
  <board
    width="${BOARD_W}mm"
    height="${BOARD_H}mm"
    /* Four layers. Two could not route tier 3's 37 nets, and a carrier with
       this many buses crossing wants an inner ground plane anyway. */
    layers={4}
    /* The default capacity-mesh autorouter throws on this netlist in the
       currently pinned CLI, and does so while the export still reports
       success. Pinned to the sequential router, and tools/check-boards.mjs
       fails the build if the trace count ever comes back short. */
    autorouter="sequential-trace"
  >
    {/* Raspberry Pi 5 40-pin GPIO header. Pin numbering is physical, matching
        the "pin" field in schema/hardware.json. */}
    {/* Pins are labelled P1..P40 by Raspberry Pi physical number. The
        connector's own numbering is counter-clockwise and does not match; see
        piPinToHeaderIndex in tools/gen-boards.mjs. Everything below references
        the P-labels, never the connector index. */}
    <pinheader
      name="J1"
      pinCount={40}
      gender="male"
      pitch="2.54mm"
      doubleRow
      pinLabels={${JSON.stringify(HEADER_LABELS)}}
      pcbX={0} pcbY={${HEADER_Y}} schX={-9} schY={0}
    />

${decls}

${traces}
  </board>
)
`,
  }
}

const built = []
for (const tier of spec.enums.tier.values) {
  const b = boardFor(tier)
  if (!b) continue
  writeFileSync(join(OUT, `${b.tier}.tsx`), b.source)
  built.push(b)
  console.log(`  hardware/boards/${b.tier}.tsx — ${b.modules} modules, ${b.signals} signals`)
}

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      generatedFrom: 'schema/hardware.json',
      // A digest of the emitted source, so a re-render can be demanded when the
      // netlist changes in ways the module and signal counts do not show. The
      // pin labels moved from connector index to Raspberry Pi physical number
      // without either count changing, and the published schematic stayed stale
      // through a check that only compared counts.
      boards: built.map(({ source, ...m }) => ({
        ...m,
        digest: createHash('sha256').update(source).digest('hex').slice(0, 16),
      })),
    },
    null,
    2,
  ) + '\n',
)
console.log(`\n${built.length} boards generated from the hardware registry.`)
