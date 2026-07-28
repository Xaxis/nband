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

  // Two columns above the header, tallest spacing the layout can afford. This
  // is deliberately generous rather than dense: the board has one job, which is
  // to make the pin assignment physical, and a crowded layout only adds
  // design-rule violations that say nothing about the wiring being correct.
  const COLS = 2
  const placed = modules.map((m, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    return {
      ...m,
      ref: `J${i + 2}`,
      pcbX: col === 0 ? -19 : 15,
      pcbY: 20 - row * 10,
      schX: col * 7,
      schY: 4 - row * 4,
    }
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
        signalTraces.push(`    <trace from=".${m.ref} > .${sig}" to=".J1 > .pin${s.pin}" />`)
      }
    }
  }

  const netDecls = [...rails.keys()].map((n) => `    <net name="${n}" />`).join('\n')
  const railTraces = [...rails.entries()]
    .flatMap(([net, members]) => [
      ...members.map((m) => `    <trace from=".${m.ref} > .${m.sig}" to="net.${net}" />`),
      // Tie the net to every header pin the registry assigns to that rail.
      ...[...new Set(members.map((m) => m.headerPin))].map(
        (pin) => `    <trace from=".J1 > .pin${pin}" to="net.${net}" />`,
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
    <pinheader
      name="J1"
      pinCount={40}
      gender="male"
      pitch="2.54mm"
      doubleRow
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
    { generatedFrom: 'schema/hardware.json', boards: built.map(({ source: _s, ...m }) => m) },
    null,
    2,
  ) + '\n',
)
console.log(`\n${built.length} boards generated from the hardware registry.`)
