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

// A HAT is 65 x 56 mm with the GPIO header along one long edge, and the four
// mounting holes sit at fixed positions the mechanical standard defines.
//
// The board itself may be longer. Tier 3 carries twenty-three components and
// would not clear a fabricator's 0.127 mm minimum on 65 mm: the router got six
// pairs down to 0.100 mm, which nobody will build. Full-length HATs matching
// the Pi's own 85 mm are ordinary, the holes do not move, and area is the only
// lever that worked — a router clearance setting had no effect on the result at
// all. So the width follows the part count and the holes stay where the
// standard puts them.
const BOARD_H_BASE = 56
const HEADER_Y = -21
const HOLE_X = 29
const HOLE_Y = 24.5

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
  // Widen once the parts stop fitting comfortably, and measure rather than
  // guess where that is: at 65 mm tier 3 routed six pairs down to 0.100 mm, at
  // 85 mm three pairs to 0.120 mm, and neither is buildable. 65 mm is the HAT
  // footprint, 85 mm matches the Pi's own length, and beyond that the board
  // simply overhangs, which full-size HATs do routinely.
  const BOARD_W = withCentroid.length > 8 ? 105 : withCentroid.length > 6 ? 85 : 65
  // Depth grows too, since a third connector row needs somewhere to sit.
  const BOARD_H = withCentroid.length > 8 ? 70 : BOARD_H_BASE
  const HALF = (m) => (m.pins.length * 2.54) / 2
  const GAP = 2.0
  const EDGE = BOARD_W / 2 - 1.5

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

  // ---- Nets -----------------------------------------------------------
  //
  // Three kinds of connection, and getting the distinction right is most of
  // what makes this board routable.
  //
  // Rails (3V3, 5V, GND) are one node each. Routing every module's ground
  // separately to its own header pin is what the first draft did, and the
  // router could not place them.
  //
  // Buses are the same argument one level down. I2C is a bus: on tier 3 four
  // modules share SDA on header pin 3, and routing four separate traces into
  // one pad is congestion the sequential router cannot resolve. SPI is a bus
  // too. Any header pin claimed by more than one module is therefore a net,
  // which is both electrically correct and what unblocked the last of the
  // unrouted signals.
  //
  // Everything else is genuinely point to point.
  const railOf = (sig) =>
    sig.toUpperCase() === 'GND' ? 'GND' : `V${sig.replace(/[^0-9]/g, '') || 'CC'}`

  const usersOfPin = new Map()
  for (const m of placed) {
    for (const s of m.pins) {
      if (isRail(s.signal)) continue
      if (!usersOfPin.has(s.pin)) usersOfPin.set(s.pin, [])
      usersOfPin.get(s.pin).push(m)
    }
  }
  // A shared pin becomes a named net. The signal name is unique per pin in the
  // registry, but the pin number is appended when it is not, because two nets
  // with one name silently merge into one circuit.
  const busNet = new Map() // header pin -> net name
  const usedNames = new Set(['GND'])
  for (const [pin, users] of usersOfPin) {
    if (users.length < 2) continue
    const sig = ident(users[0].pins.find((x) => x.pin === pin).signal)
    const name = usedNames.has(sig) ? `${sig}_P${pin}` : sig
    usedNames.add(name)
    busNet.set(pin, name)
  }

  const rails = new Map()
  const nets = new Map() // net name -> trace lines
  const signalTraces = []

  const addNet = (name, line) => {
    if (!nets.has(name)) nets.set(name, [])
    nets.get(name).push(line)
  }

  for (const m of placed) {
    for (const s of m.pins) {
      const sig = ident(s.signal)
      if (isRail(s.signal)) {
        const net = railOf(s.signal)
        if (!rails.has(net)) rails.set(net, [])
        rails.get(net).push({ ref: m.ref, sig, headerPin: s.pin })
      } else if (busNet.has(s.pin)) {
        addNet(busNet.get(s.pin), `    <trace from=".${m.ref} > .${sig}" to="net.${busNet.get(s.pin)}" />`)
      } else if (/^(GATE|EN|PWM)$/i.test(s.signal)) {
        // Routed through its series resistor below, not straight to the header.
      } else {
        signalTraces.push(`    <trace from=".${m.ref} > .${sig}" to=".J1 > .P${s.pin}" />`)
      }
    }
  }
  for (const [pin, name] of busNet) {
    addNet(name, `    <trace from=".J1 > .P${pin}" to="net.${name}" />`)
  }
  for (const [net, members] of rails) {
    for (const m of members) addNet(net, `    <trace from=".${m.ref} > .${m.sig}" to="net.${net}" />`)
    for (const pin of new Set(members.map((m) => m.headerPin))) {
      addNet(net, `    <trace from=".J1 > .P${pin}" to="net.${net}" />`)
    }
  }

  // ---- Passives --------------------------------------------------------
  //
  // A connector fan-out is not a circuit board. Three things every real
  // carrier has, and this one did not until it was pointed out:
  //
  // Decoupling. Each module gets 100 nF across its own supply and ground, as
  // close to its connector as the layout allows. Without it a board is a set
  // of unbypassed rails feeding sensors down 50 mm of trace, and the symptom
  // is not a dead node but an intermittently noisy one, which is the worst
  // possible failure for an instrument whose whole job is deciding whether a
  // reading was real.
  //
  // Bulk. One 10 uF per rail near the header, for the low-frequency half the
  // ceramics do not cover.
  //
  // Pull-ups. I2C is open-drain and does not work at all without them. The
  // breakout boards each carry their own, which is exactly the problem: three
  // modules in parallel put roughly 1.6 k on the bus and the Pi cannot pull
  // that low reliably. The registry cannot express "cut the jumper on each
  // breakout", so this fits one pair on the carrier and says so.
  const passives = []
  const passiveTraces = []
  let cIdx = 1

  for (const m of placed) {
    const supply = m.pins.find((s) => isRail(s.signal) && s.signal.toUpperCase() !== 'GND')
    if (!supply) continue
    const ref = `C${cIdx++}`
    passives.push(
      `    {/* decoupling for ${m.ref} (${m.part.id}) */}\n` +
        `    <capacitor name="${ref}" capacitance="100nF" footprint="0402"\n` +
        `      pcbX={${(m.pcbX + 1).toFixed(2)}} pcbY={${(m.pcbY - 3.6).toFixed(2)}} schX={${m.schX}} schY={${(m.schY - 1.6).toFixed(1)}} />`,
    )
    passiveTraces.push(`    <trace from=".${ref} > .pin1" to="net.${railOf(supply.signal)}" />`)
    passiveTraces.push(`    <trace from=".${ref} > .pin2" to="net.GND" />`)
  }

  let bulkIdx = 0
  for (const rail of rails.keys()) {
    if (rail === 'GND') continue
    const ref = `C${cIdx++}`
    bulkIdx++
    passives.push(
      `    {/* bulk reservoir on ${rail} */}\n` +
        `    <capacitor name="${ref}" capacitance="10uF" footprint="0805"\n` +
        `      pcbX={${(-25 + bulkIdx * 6).toFixed(2)}} pcbY={-11.5} schX={-4} schY={${-6 - cIdx * 1.5}} />`,
    )
    passiveTraces.push(`    <trace from=".${ref} > .pin1" to="net.${rail}" />`)
    passiveTraces.push(`    <trace from=".${ref} > .pin2" to="net.GND" />`)
  }

  // No I2C pull-ups on the carrier, deliberately, and this is a correction.
  //
  // An earlier version fitted a 4.7 k pair here with a comment explaining that
  // the breakouts' own pull-ups in parallel overload the bus. The reasoning was
  // right and the conclusion was backwards: the Raspberry Pi already fits 1.8 k
  // to 3V3 on GPIO2 and GPIO3, on the board, not removable. Adding 4.7 k on top
  // of that and four breakouts at 10 k each gives 856 ohm, and I2C needs at
  // least (3.3 - 0.4) / 3 mA = 967 ohm to pull a valid low. The pair added to
  // fix over-loading was what pushed the bus out of specification.
  //
  // The Pi's 1.8 k alone is correct for this bus. What a builder has to do is
  // disable the pull-ups on each breakout, which is a jumper or a solder blob
  // the registry cannot express, so the build guide says it instead.

  // A gate driven from a GPIO needs two resistors, and the emitter had neither.
  //
  // Without a pull-down the gate floats from the moment the board is powered
  // until the agent starts and claims the pin, which on a cold boot is tens of
  // seconds. A floating MOSFET gate is not off; it sits wherever leakage and
  // coupling put it. For an infrared emitter that means an uncommanded emission
  // of unknown duration at every power-on, which is a safety question on a mast
  // and a data-integrity one in the archive, because self-illumination the node
  // did not schedule is self-illumination it cannot subtract.
  //
  // The series resistor limits the current the GPIO sinks into the gate
  // capacitance on each edge. Neither part is optional and neither was there.
  const gates = placed.flatMap((m) =>
    m.pins
      .filter((s2) => /^(GATE|EN|PWM)$/i.test(s2.signal))
      .map((s2) => ({ ref: m.ref, sig: ident(s2.signal), pin: s2.pin, part: m.part })),
  )
  gates.forEach((g, k) => {
    const rs = `R${k * 2 + 1}`
    const rpd = `R${k * 2 + 2}`
    passives.push(
      `    {/* ${g.part.id}: gate series resistor and pull-down. Without the\n` +
        `        pull-down the gate floats from power-on until the agent claims\n` +
        `        the pin, and a floating gate is not an off gate. */}\n` +
        `    <resistor name="${rs}" resistance="100" footprint="0402"\n` +
        `      pcbX={${(-6 + k * 8).toFixed(2)}} pcbY={-11.5} schX={2} schY={${-7 - k * 2}} />\n` +
        `    <resistor name="${rpd}" resistance="10k" footprint="0402"\n` +
        `      pcbX={${(-2 + k * 8).toFixed(2)}} pcbY={-11.5} schX={4} schY={${-7 - k * 2}} />`,
    )
    passiveTraces.push(`    <trace from=".J1 > .P${g.pin}" to=".${rs} > .pin1" />`)
    passiveTraces.push(`    <trace from=".${rs} > .pin2" to=".${g.ref} > .${g.sig}" />`)
    passiveTraces.push(`    <trace from=".${rpd} > .pin1" to=".${g.ref} > .${g.sig}" />`)
    passiveTraces.push(`    <trace from=".${rpd} > .pin2" to="net.GND" />`)
  })

  // ---- Mechanical ------------------------------------------------------
  // The four HAT mounting holes, at the positions the mechanical standard
  // fixes. Without them the board is a rectangle that cannot be bolted to
  // anything, which on a mast is not a detail.
  const holes = [
    [-HOLE_X, -HOLE_Y],
    [HOLE_X, -HOLE_Y],
    [-HOLE_X, HOLE_Y],
    [HOLE_X, HOLE_Y],
  ]
    .map(
      ([x, y], k) =>
        `    <hole name="H${k + 1}" diameter="2.75mm" pcbX={${x}} pcbY={${y}} />`,
    )
    .join('\n')

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

  const allNets = [...new Set([...nets.keys()])]
  const netDecls =
    allNets.map((n) => `    <net name="${n}" />`).join('\n') +
    // A ground plane rather than ground traces. Every module, every decoupling
    // capacitor and several header pins land on GND, and routing each of those
    // as its own trace is both wrong for a mixed-signal board and the single
    // largest source of routing congestion here.
    //
    // It is on inner1, which is where the reference plane belongs in a four
    // layer stackup: signal, ground, power, signal. It used to be on bottom,
    // which is a signal layer, so the "plane" was cut into islands by seventy
    // trace segments crossing it.
    //
    // Honest limitation, and it is the main reason these boards are a reference
    // rather than a design: the autorouter treats all four layers as signal
    // layers and cannot be told to reserve one. inner1 still carries traces, so
    // the plane is not continuous, and a person re-laying this out should
    // reserve inner1 for ground and inner2 for power before fabricating. The
    // fragmentation is measured and reported by tools/check-boards.mjs rather
    // than left as something a reader has to notice.
    `\n    <copperpour layer="inner1" connectsTo="net.GND" />`
  const traces = [
    netDecls,
    '',
    holes,
    '',
    passives.join('\n'),
    '',
    [...nets.values()].flat().join('\n'),
    passiveTraces.join('\n'),
    signalTraces.join('\n'),
  ]
    .filter((x) => x !== '')
    .join('\n')

  const signalCount = placed.reduce((n, m) => n + m.pins.length, 0)

  return {
    tier: tier.id,
    widthMm: BOARD_W,
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
    /* The default autorouter, capacity-mesh. It used to throw on these
       netlists — and print "Exported!" while doing it — because the CLI runs
       under Bun and Bun 1.1.18 lacks the ES2025 Iterator Helpers its solver
       calls. hardware/iterator-helpers-polyfill.js supplies them via
       bun --preload. Falling back to the sequential router instead had cost
       roughly a quarter of the nets. */
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
