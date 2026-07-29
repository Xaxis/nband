#!/usr/bin/env node
// Fails the build when the parts of nband that must agree have stopped agreeing.
//
// The premise of this repository is that hardware, firmware, database, and
// documentation are versioned together. That is only true if something checks.
// Four things are verified:
//
//   1. Generated bindings are current with respect to the canonical schema.
//   2. The Postgres enums match the enums in the schema files.
//   3. Every document declares a platform version that actually exists.
//   4. Every part referenced by a band, and every driver referenced by a part,
//      resolves to something real.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))
const readText = (p) => readFileSync(resolve(root, p), 'utf8')

const bands = read('schema/bands.json')
const spec = read('schema/spec.json')
const hardware = read('schema/hardware.json')
const version = readText('VERSION').trim()

const problems = []
const checks = []

function check(name, fn) {
  try {
    const detail = fn()
    checks.push({ name, ok: true, detail })
  } catch (err) {
    checks.push({ name, ok: false, detail: err.message })
    problems.push(`${name}: ${err.message}`)
  }
}

// 1. Generated bindings ------------------------------------------------------

check('generated bindings are current', () => {
  try {
    execFileSync('node', [join(root, 'tools/codegen.mjs'), '--check'], { stdio: 'pipe' })
  } catch (err) {
    throw new Error(
      'generated files are stale. Run `yarn codegen` and commit the result.\n' +
        String(err.stdout ?? '') + String(err.stderr ?? ''),
    )
  }
  return 'TypeScript and Python match the schema'
})

// 2. SQL enums match the schema ---------------------------------------------

check('Postgres enums match schema files', () => {
  const sql = readText('schema/sql/0001_init.sql')

  function sqlEnum(name) {
    const m = sql.match(new RegExp(`create type ${name}\\s+as enum \\(([^)]+)\\)`, 'i'))
    if (!m) throw new Error(`SQL is missing the '${name}' enum`)
    return m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1))
  }

  const pairs = [
    ['band', bands.bands.map((b) => b.id)],
    ['tier', spec.enums.tier.values.map((v) => v.id)],
    ['node_status', spec.enums.nodeStatus.values.map((v) => v.id)],
    ['clock_quality', spec.enums.clockQuality.values.map((v) => v.id)],
    ['trigger_reason', spec.enums.triggerReason.values.map((v) => v.id)],
    ['classification', spec.enums.classification.values.map((v) => v.id)],
    ['corroboration', spec.enums.corroboration.values.map((v) => v.id)],
    ['artifact_kind', spec.enums.artifactKind.values.map((v) => v.id)],
    ['catalog_source', spec.enums.catalogSource.values.map((v) => v.id)],
    ['variant_status', spec.enums.variantStatus.values.map((v) => v.id)],
  ]

  for (const [sqlName, expected] of pairs) {
    const actual = sqlEnum(sqlName)
    const missing = expected.filter((v) => !actual.includes(v))
    const extra = actual.filter((v) => !expected.includes(v))
    if (missing.length || extra.length) {
      throw new Error(
        `enum '${sqlName}' drifted.` +
          (missing.length ? ` Missing from SQL: ${missing.join(', ')}.` : '') +
          (extra.length ? ` Present only in SQL: ${extra.join(', ')}.` : '') +
          ' A migration is required.',
      )
    }
  }

  // Band ordinals are persisted, so a reorder is a breaking change.
  const ordinals = bands.bands.map((b) => b.ordinal)
  const expectedOrdinals = bands.bands.map((_, i) => i)
  if (ordinals.join(',') !== expectedOrdinals.join(',')) {
    throw new Error('band ordinals are not contiguous from 0; they are persisted and cannot be reordered')
  }

  return `${pairs.length} enums verified`
})

// 3. Documentation declares a real version -----------------------------------

check('documentation versions are real', () => {
  const dir = resolve(root, 'content')
  if (!existsSync(dir)) return 'no content directory'
  const docs = readdirSync(dir).filter((f) => f.endsWith('.md'))
  if (docs.length === 0) throw new Error('content directory is empty')

  const stale = []
  for (const f of docs) {
    const text = readFileSync(join(dir, f), 'utf8')
    const m = text.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m)
    if (!m) {
      stale.push(`${f} declares no version`)
      continue
    }
    // A document written against a future version is always a mistake. A
    // document written against an older one is surfaced on the page itself.
    if (m[1].trim() > version) {
      stale.push(`${f} claims v${m[1].trim()} but the platform is v${version}`)
    }
  }
  if (stale.length) throw new Error(stale.join('; '))
  return `${docs.length} documents, all at or below v${version}`
})

// 4. Cross-references resolve ------------------------------------------------

check('hardware and band cross-references resolve', () => {
  const partIds = new Set(hardware.parts.map((p) => p.id))
  const bandIds = new Set(bands.bands.map((b) => b.id))
  const errors = []

  for (const p of hardware.parts) {
    if (p.band !== null && !bandIds.has(p.band)) {
      errors.push(`part '${p.id}' references unknown band '${p.band}'`)
    }
    for (const alt of p.alternatives ?? []) {
      if (!partIds.has(alt)) {
        errors.push(`part '${p.id}' lists unknown alternative '${alt}'`)
      }
    }
    if (typeof p.priceUsd !== 'number' || !p.priceAsOf || !p.sourceUrl) {
      errors.push(`part '${p.id}' is missing a sourced price (priceUsd, priceAsOf, sourceUrl)`)
    }
  }

  const hypClasses = new Set(spec.enums.classification.values.map((v) => v.id))
  let priorSum = 0
  for (const h of spec.hypotheses.defaults) {
    priorSum += h.prior
    if (!hypClasses.has(h.classification)) {
      errors.push(`hypothesis '${h.id}' maps to unknown classification '${h.classification}'`)
    }
  }
  if (Math.abs(priorSum - 1) > 1e-9) {
    errors.push(`hypothesis priors sum to ${priorSum.toFixed(4)}, not 1.0`)
  }

  if (errors.length) throw new Error(errors.join('; '))
  return `${hardware.parts.length} parts, ${spec.hypotheses.defaults.length} hypotheses`
})

// 5. Tier budgets match what the tier actually costs ------------------------

check('tier budgets match the sourced part prices', () => {
  const errors = []
  for (const tier of spec.enums.tier.values) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id))
    if (parts.length === 0) {
      // A tier with a price and no parts is a number nobody can check. The
      // research tier books $200k against an empty registry, which is fine only
      // as long as it says so rather than sitting in a price list.
      if (tier.buildable !== false) {
        errors.push(
          `${tier.id}: claims a $${tier.budgetUsd} budget but no part belongs to it. ` +
            `Set "buildable": false if it is aspirational.`,
        )
      }
      continue
    }
    const actual = parts.reduce((sum, p) => sum + p.priceUsd, 0)
    // A budget is a claim the bill of materials has to honour. Both tier 1 and
    // tier 2 quietly exceeded their own stated figure while the page presented
    // the two side by side.
    if (actual > tier.budgetUsd) {
      errors.push(
        `${tier.id}: parts total $${actual.toFixed(0)} but budgetUsd says $${tier.budgetUsd}`,
      )
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  return 'every tier costs no more than it claims'
})

// 6. Power sizing matches the parts it is sold with --------------------------

check('off-grid power sizing matches the tier load', () => {
  const errors = []

  for (const tier of ['t1', 't2', 't3']) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier))
    const activeW = parts.reduce((sum, p) => sum + (p.electrical?.activeW ?? 0), 0)
    const dailyWh = activeW * 24

    // The off-grid kit specifically, not merely the first part filed under
    // power. Tier 1 is mains powered and lists a USB-C supply in that category;
    // matching on the category alone made this read a 0 W panel off a wall wart
    // and fail a tier that has no panel to size.
    const power = parts.find((p) => p.keySpecs?.panelW)
    if (!power) continue

    const panelW = Number(power.keySpecs.panelW)
    const batteryWh = Number(power.keySpecs?.batteryWh ?? 0)

    // Four peak-sun-hours with a 35 percent margin; three days at 50 percent
    // usable depth of discharge. A BOM that ships a panel too small for the
    // node it is sold with strands a remote build, and that shipped once.
    const neededPanelW = (dailyWh / 4) * 1.35
    const neededBatteryWh = dailyWh * 3 * 2

    // No tolerance factor. This check carried a silent `* 0.9` that let the
    // tier 3 kit pass at 92 percent of its own stated requirement, which is the
    // precise failure the rule exists to prevent and exactly the kind of fudge
    // that makes a green check worthless.
    if (panelW < neededPanelW) {
      errors.push(
        `${tier}: '${power.id}' specifies a ${panelW} W panel but the parts draw ` +
          `${activeW.toFixed(1)} W (${dailyWh.toFixed(0)} Wh/day), needing about ` +
          `${Math.ceil(neededPanelW)} W`,
      )
    }
    if (batteryWh < neededBatteryWh) {
      errors.push(
        `${tier}: '${power.id}' specifies ${batteryWh} Wh of battery but three days of ` +
          `autonomy at this load needs about ${Math.ceil(neededBatteryWh)} Wh`,
      )
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return 'panel and battery cover the summed draw of every tier that ships them'
})

check('every declared driver is claimed by a wireable part', () => {
  // The mirror of the check firmware/tests/test_registry.py already runs.
  // That one asserts a part naming a driver has an implementation; nothing
  // asserted the converse, so `ina226_monitor` sat on two solar kits that
  // declared interface "none" and no pins at all. The platform advertised a
  // current monitor that was in no bill of materials, had no price, and could
  // not be wired to anything, while one of those kits' own notes called it
  // "not an accessory".
  const errors = []
  for (const part of hardware.parts) {
    if (!part.driver) continue
    if (part.interface === 'none' || !part.interface) {
      errors.push(
        `part '${part.id}' declares driver '${part.driver}' but has interface ` +
          `'${part.interface ?? 'none'}': a driver needs something to talk over`,
      )
    }
    if ((part.electrical?.pins ?? []).length === 0 && part.interface !== 'usb') {
      errors.push(`part '${part.id}' declares driver '${part.driver}' but has no pins`)
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  const drivers = new Set(hardware.parts.filter((p) => p.driver).map((p) => p.driver))
  return `${drivers.size} drivers, each on a part that can carry one`
})

check('an analogue sensor names the converter that reads it', () => {
  // The SM-24 geophone is a moving coil: two wires, no supply, no clock, no
  // chip select. It was listed with six SPI pins and a driver named after an
  // ADC that was in no bill of materials, so the generated wiring reference
  // showed a geophone connected directly to the Pi's SPI bus. That is not a
  // thing that can work, and it was published as "the wiring reference".
  const ids = new Set(hardware.parts.map((p) => p.id))
  const errors = []
  for (const part of hardware.parts.filter((p) => p.interface === 'analog')) {
    const numeric = (part.electrical?.pins ?? []).filter((x) => /^\d+$/.test(String(x.pin)))
    if (numeric.length > 0) {
      errors.push(
        `part '${part.id}' is analogue but lands ${numeric.length} numbered header pin(s); ` +
          `an analogue signal cannot terminate on a digital bus`,
      )
    }
    // Its tier must contain something that can actually digitise it.
    for (const tier of part.tiers ?? []) {
      const converter = hardware.parts.find(
        (p) => p.tiers?.includes(tier) && /adc|converter/i.test(`${p.id} ${p.category} ${p.model}`),
      )
      if (!converter) {
        errors.push(`${tier} contains analogue part '${part.id}' but no converter to read it`)
      }
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  const analog = hardware.parts.filter((p) => p.interface === 'analog')
  return analog.length === 0 ? 'no analogue parts' : `${analog.length} analogue part(s), each with a converter`
})

check('nothing drives the GPIO header above 3.3 volts', () => {
  // The Pi's GPIO is not 5 V tolerant. Applying 5 V to an input damages the
  // pin, and often the SoC.
  //
  // Two parts in this registry run from a 5 V rail and also land signal pins on
  // the header. Both are fine, because their logic is 3.3 V even though their
  // supply is not, but that was true by luck rather than by check, since the
  // registry had no field distinguishing supply voltage from logic voltage and
  // nothing could tell the safe case from the damaging one. A future part on a
  // 5 V rail with 5 V logic would have been drawn straight onto the header.
  const errors = []
  for (const part of hardware.parts) {
    const e = part.electrical
    if (!e) continue
    const digital = (e.pins ?? []).filter(
      (x) => !/^(5V|3V3|GND|VCC|VIN)$/i.test(x.signal) && /^\d+$/.test(String(x.pin)),
    )
    if (digital.length === 0) continue
    if (typeof e.logicVoltage !== 'number') {
      errors.push(`part '${part.id}' lands ${digital.length} GPIO pin(s) but declares no logicVoltage`)
    } else if (e.logicVoltage > 3.3) {
      errors.push(
        `part '${part.id}' drives the header at ${e.logicVoltage} V; the Pi's GPIO is not ` +
          `5 V tolerant and needs a level shifter, which this registry cannot express`,
      )
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  const n = hardware.parts.filter((p) => p.electrical?.logicVoltage).length
  return `${n} parts declare a logic voltage, none above 3.3 V`
})

check('the assembly is physically consistent', () => {
  // Two things the model claimed that were not true.
  //
  // Four tier 3 breakouts floated past the edge of the carrier they were
  // described as sitting on, one of them 74 mm out on a 56 mm deep board,
  // because the layout marched outward and never wrapped.
  //
  // And the magnetometer was drawn bolted to the carrier while its own registry
  // note says to mount it at least two metres from the node's electronics. A
  // render that contradicts the text beside it is worse than no render.
  const path = resolve(root, 'apps/web/public/boards/assembly.json')
  if (!existsSync(path)) throw new Error('assembly.json is missing; run `make boards`')
  const { assemblies } = JSON.parse(readFileSync(path, 'utf8'))
  const errors = []

  for (const a of assemblies) {
    const carrier = a.bodies.find((b) => b.glb)
    if (!carrier) {
      errors.push(`${a.tier}: no carrier body in the assembly`)
      continue
    }
    const [cw, , cd] = carrier.size
    for (const b of a.bodies.filter((x) => x.mount === 'carrier')) {
      const [w, , d] = b.size
      const [x, , z] = b.pos
      if (Math.abs(x) + w / 2 > cw / 2 + 0.01 || Math.abs(z) + d / 2 > cd / 2 + 0.01) {
        errors.push(
          `${a.tier}: '${b.id}' is drawn on the carrier but extends past its ${cw} x ${cd} mm outline`,
        )
      }
    }
  }

  // A part whose own notes demand distance from the node cannot be mounted on it.
  for (const part of hardware.parts) {
    const wantsDistance = /at least .{0,12}(metre|meter)|remote from the node|away from the node/i.test(
      part.notes ?? '',
    )
    if (wantsDistance && part.mechanical?.mount === 'carrier') {
      errors.push(
        `part '${part.id}' says it must be mounted away from the node but mechanical.mount is 'carrier'`,
      )
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  const onCarrier = assemblies.reduce(
    (n, a) => n + a.bodies.filter((b) => b.mount === 'carrier').length, 0,
  )
  return `${assemblies.length} assemblies, ${onCarrier} carrier-mounted bodies all within their board`
})

check('the node fits inside the case it is sold with', () => {
  // The enclosure was drawn from its exterior dimensions and nothing checked
  // that the contents fit, which is the only question the number is for.
  //
  // Measured by packed floor area rather than by the bounding box of the
  // assembly, because the assembly is a display arrangement: it spreads the USB
  // peripherals out so they can be seen and hovered, which is not how anything
  // is packed. Bounding box gave 97 percent for a tier that has plenty of room
  // once the parts are actually stacked, which would have been a false alarm.
  //
  // The packing factor is the honest part. Rectangles never tile perfectly, and
  // cable bend radius, connector backshells, standoffs, desiccant and the
  // breather vent all take floor. 1.6x the summed footprint is a working figure
  // for hand-packed electronics and is stated rather than hidden.
  const PACKING = 1.6
  const path = resolve(root, 'apps/web/public/boards/assembly.json')
  if (!existsSync(path)) throw new Error('assembly.json is missing; run `make boards`')
  const { assemblies } = JSON.parse(readFileSync(path, 'utf8'))
  const errors = []
  const notes = []

  for (const a of assemblies) {
    const shellBody = a.bodies.find((b) => b.mount === 'enclosure')
    if (!shellBody) continue
    const shell = hardware.parts.find((p) => p.id === shellBody.id)
    const m = shell?.mechanical
    if (!m?.interiorWidthMm) {
      errors.push(`${a.tier}: '${shellBody.id}' has no interior dimensions, so nothing can be fitted to it`)
      continue
    }

    // What actually goes in the box. Mast and ground-mounted parts do not, by
    // definition, and the case is not inside itself. The carrier stacks on the
    // host rather than beside it, so it takes no additional floor.
    const inside = a.bodies.filter(
      (b) => b.mount !== 'enclosure' && !b.remote && b.mount !== 'hat' && b.mount !== 'carrier',
    )
    if (inside.length === 0) continue

    const floor = inside.reduce((sum, b) => sum + b.size[0] * b.size[2], 0) * PACKING
    const available = m.interiorWidthMm * m.interiorDepthMm
    const tallest = Math.max(...inside.map((b) => b.size[1]))

    if (floor > available) {
      errors.push(
        `${a.tier}: contents need about ${Math.round(floor / 100) / 10} of floor area against ` +
          `${Math.round(available / 100) / 10} available (packed at ${PACKING}x). Specify a larger case.`,
      )
    } else if (tallest > m.interiorHeightMm) {
      errors.push(
        `${a.tier}: '${inside.find((b) => b.size[1] === tallest).id}' is ${tallest} mm tall ` +
          `against ${m.interiorHeightMm} mm of interior height`,
      )
    } else {
      notes.push(
        `${a.tier} uses ${Math.round((floor / available) * 100)}% of the interior floor, ` +
          `tallest part ${tallest} mm of ${m.interiorHeightMm}`,
      )
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return notes.length ? notes.join('; ') : 'no tier ships an enclosure'
})

check('pulsed loads are sized by their peak, not their average', () => {
  // The power budget sums activeW, which is right for sizing a panel and a
  // battery and wrong for sizing a rail. A 5 W emitter at a 5 percent duty
  // cycle averages 1.6 W and draws 1 A in pulses, and the Raspberry Pi budgets
  // about 1.5 A across all its 5 V pins for everything on them. Nothing
  // recorded the peak, so nothing could notice.
  const PI_5V_A = 1.5
  const errors = []
  for (const tier of spec.enums.tier.values) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id))
    // Not the host. The Raspberry Pi's rail is 5 V because that is what powers
    // it, not because it draws from its own header pins, and counting it as a
    // load on the rail it provides made the first version of this check report
    // 2.52 A for a board whose actual header draw is 1.
    const on5v = parts.filter(
      (p) => p.electrical?.rail === '5V' && p.mechanical?.mount !== 'host',
    )
    if (on5v.length === 0) continue
    // Peak where declared, average otherwise: a part with no peak is assumed
    // not to pulse, which is what makes declaring one matter.
    const amps = on5v.reduce((a, p) => a + (p.electrical.peakW ?? p.electrical.activeW ?? 0) / 5, 0)
    // Anything pulsed also needs a local reservoir, whatever the total. One amp
    // arriving in pulses through a single header pin sags the rail for
    // everything else on it unless there is charge stored next to the load.
    const pulsedHere = on5v.filter((p) => p.electrical.peakW)
    for (const p of pulsedHere) {
      const peakA = p.electrical.peakW / 5
      if (peakA > 0.5 && !p.electrical.localReservoirUf) {
        errors.push(
          `${tier.id}: '${p.id}' peaks at ${peakA.toFixed(2)} A through the header and declares ` +
            `no local reservoir; the rail will sag on every pulse`,
        )
      }
    }

    if (amps > PI_5V_A) {
      errors.push(
        `${tier.id}: parts on the 5 V rail peak at ${amps.toFixed(2)} A against the header's ` +
          `${PI_5V_A} A budget. A pulsed load needs its own supply or a local reservoir sized ` +
          `for the pulse, not the average.`,
      )
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  const pulsed = hardware.parts.filter((p) => p.electrical?.peakW)
  return `${pulsed.length} pulsed load(s) declared, every 5 V rail within the header budget`
})

check('every part in a tier has mechanical data', () => {
  // The whole-node view sizes each body from schema/hardware.json. A part with
  // no mechanical block is silently absent from the assembly, which reads as
  // "this tier does not include one" rather than "nobody entered its size"
  // exactly the kind of quiet omission the project is built to refuse.
  const errors = []
  for (const tier of spec.enums.tier.values) {
    for (const part of hardware.parts.filter((p) => p.tiers?.includes(tier.id))) {
      const m = part.mechanical
      if (!m) {
        errors.push(`${part.id} (${tier.id}) has no mechanical block`)
        continue
      }
      for (const k of ['widthMm', 'depthMm', 'heightMm']) {
        if (!(typeof m[k] === 'number' && m[k] > 0)) {
          errors.push(`${part.id}: mechanical.${k} is missing or not positive`)
        }
      }
      if (typeof m.dimensionsSourced !== 'boolean') {
        // Whether a figure came from a published spec or was estimated is the
        // difference the viewer draws on screen. It cannot be left implicit.
        errors.push(`${part.id}: mechanical.dimensionsSourced must be true or false`)
      }
      if (!m.mount) errors.push(`${part.id}: mechanical.mount is missing`)
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
  const sourced = hardware.parts.filter((p) => p.mechanical?.dimensionsSourced).length
  return `${hardware.parts.length} parts sized, ${sourced} from published specs`
})

check('USB peripherals fit the host, or ship a powered hub', () => {
  // Tier 3 listed five bus-powered peripherals drawing 2.46 A across four ports
  // on a board that budgets 1.6 A for all of them. The failure mode is not a
  // clean refusal, the host brown-outs peripherals under load, so channels
  // drop out intermittently, which reads as flaky hardware rather than as a
  // power budget nobody added up.
  const HOST_USB_A = 1.6 // Raspberry Pi 5, total across all ports, with a 5 A supply
  const HOST_USB_PORTS = 4
  const errors = []

  for (const tier of spec.enums.tier.values) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id))
    const usb = parts.filter((p) => p.interface === 'usb' && p.category !== 'power')
    if (usb.length === 0) continue

    const hub = parts.find((p) => p.category === 'power' && p.keySpecs?.ports)
    const amps = usb.reduce((s, p) => s + (p.electrical?.activeW ?? 0) / 5, 0)

    if (amps > HOST_USB_A && !hub) {
      errors.push(
        `${tier.id}: ${usb.length} bus-powered peripherals draw ${amps.toFixed(2)} A but the ` +
          `host budgets ${HOST_USB_A} A, and no powered hub is in the parts list`,
      )
    }
    if (usb.length > HOST_USB_PORTS && !hub) {
      errors.push(
        `${tier.id}: ${usb.length} USB devices for ${HOST_USB_PORTS} ports and no hub`,
      )
    }
    if (hub && amps > HOST_USB_A + Number(hub.keySpecs.supplyA ?? 0)) {
      errors.push(
        `${tier.id}: ${amps.toFixed(2)} A exceeds host plus hub supply`,
      )
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return 'every tier can actually power the USB devices it ships'
})

check('power figures in prose match the summed parts list', () => {
  // The solar-kit notes quoted 14.4 W and 22.2 W while the registry summed to
  // 12.8 W and 24.1 W, and the hardware page printed the prose figure directly
  // above a chart computing the real one from the same file. Any number a
  // reader could recompute has to be recomputed.
  const errors = []
  const draw = (t) =>
    hardware.parts
      .filter((p) => p.tiers?.includes(t) && p.electrical?.activeW != null)
      .reduce((s, p) => s + p.electrical.activeW, 0)

  for (const [id, tier] of [
    ['power-solar-150w', 't2'],
    ['power-solar-200w', 't3'],
  ]) {
    const part = hardware.parts.find((p) => p.id === id)
    if (!part) continue
    const w = draw(tier)
    const wh = w * 24
    // Every figure stated in the note must be the one the registry produces.
    for (const [label, want] of [
      ['W', w.toFixed(1)],
      ['Wh', Math.round(wh).toString()],
    ]) {
      if (!part.notes.includes(want)) {
        errors.push(`${id} note does not state ${want} ${label} for ${tier} (registry says so)`)
      }
    }
  }

  // And the comparison between tiers, which was 34 points out.
  const t3note = hardware.parts.find((p) => p.id === 'power-solar-200w')
  if (t3note) {
    const pct = Math.round((draw('t3') / draw('t2') - 1) * 100)
    if (!t3note.notes.includes(`${pct} percent more`)) {
      errors.push(`power-solar-200w note does not say t3 draws ${pct} percent more than t2`)
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return `t1 ${draw('t1').toFixed(1)} W, t2 ${draw('t2').toFixed(1)} W, t3 ${draw('t3').toFixed(1)} W`
})

check('no two parts in a tier claim the same pin', () => {
  // The infrared beacon's gate and the radar's UART were both assigned physical
  // pin 16 while sitting in the same tier, and the radar's pair had no UART
  // alternate function at all. Both survived review because a pin conflict is
  // invisible until someone has soldered. The GNSS pulse-per-second line has
  // already had to move once for the same reason.
  // Most signals are shared by design: I2C and SPI are buses, I2S clocks fan
  // out, power and ground are rails, and USB names a port type rather than a
  // pin. Only these are genuinely exclusive, two devices driving one of them
  // is a wiring fault, not a topology.
  const EXCLUSIVE = /^(CS\d*|NSS|INT\d*|IRQ|GATE|TX|RX|TXD|RXD|PPS|DRDY|EN|RESET)$/i
  const errors = []

  for (const tier of spec.enums.tier.values) {
    const claims = new Map() // physical pin -> [ "part:signal", ... ]
    for (const part of hardware.parts.filter((p) => p.tiers?.includes(tier.id))) {
      for (const pin of part.electrical?.pins ?? []) {
        if (!EXCLUSIVE.test(String(pin.signal).trim())) continue
        // Ports such as "USB-A" are not header pins and cannot collide here.
        if (!/^\d+$/.test(String(pin.pin))) continue
        const key = String(pin.pin)
        if (!claims.has(key)) claims.set(key, [])
        claims.get(key).push(`${part.id}:${pin.signal}`)
      }
    }
    for (const [pin, holders] of claims) {
      if (holders.length > 1) {
        errors.push(`${tier.id} physical pin ${pin} is claimed by ${holders.join(' and ')}`)
      }
    }
  }

  // Signals that must sit on a pin capable of carrying them. The Pi's UARTs are
  // on specific GPIOs; a pin without the alternate function silently does
  // nothing, which reads as a dead sensor.
  const UART_CAPABLE = new Set(['8', '10', '32', '33', '27', '28', '7', '29', '31', '36'])
  for (const part of hardware.parts) {
    if (part.interface !== 'uart') continue
    for (const pin of part.electrical?.pins ?? []) {
      const sig = String(pin.signal).toUpperCase()
      if (/^(TX|RX|TXD|RXD)$/.test(sig) && !UART_CAPABLE.has(String(pin.pin))) {
        errors.push(
          `part '${part.id}' routes ${sig} to physical pin ${pin.pin}, which has no UART function`,
        )
      }
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  return 'every signal pin is claimed once, and every UART sits on a UART-capable pin'
})

check('band counts on the site match the registry', () => {
  // The landing page advertised fourteen simultaneous bands. Fourteen is the
  // size of the taxonomy; the best-equipped tier reaches thirteen and the entry
  // node reaches six, because the gravimetric band has no buildable sensor. The
  // schema reference separately claimed an 11/3 detection-context split against
  // an actual 12/2. Counts that anyone can recompute from the repository should
  // not be typed by hand.
  const errors = []
  const withParts = new Set(hardware.parts.filter((p) => p.band).map((p) => p.band))
  const best = Math.max(
    ...spec.enums.tier.values.map(
      (t) =>
        new Set(hardware.parts.filter((p) => p.band && p.tiers?.includes(t.id)).map((p) => p.band))
          .size,
    ),
  )
  const detection = bands.bands.filter((b) => b.role === 'detection').length
  const context = bands.bands.filter((b) => b.role === 'context').length

  const words = { 2: 'Two', 3: 'Three', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen' }
  const hero = readText('apps/web/app/page.tsx')
  if (!hero.includes(`up to ${words[best]} bands at once`)) {
    errors.push(`the landing page does not claim "up to ${words[best]} bands at once"`)
  }
  if (!new RegExp(`value="${best}"`).test(hero)) {
    errors.push(`the landing page stat does not read ${best}`)
  }

  // Two more places on the same page counted bands by hand and both were wrong.
  // The band-grid heading said "Fourteen ways of being wrong about the same
  // object" over a grid of detection bands, counting the two context bands as
  // ways of being wrong about an object they are not used to identify. And the
  // paragraph above it said the way out is "asking thirteen other bands what
  // they saw at the same instant", which with the camera it refers to asserts
  // fourteen simultaneous channels: one more than the best tier reaches, and
  // including the gravimetric band no node carries. The first check in this
  // function exists because that same fourteen-simultaneous claim was made in
  // the hero, so this is the identical error re-entering through prose the
  // check did not read.
  const cap = (w) => `${w[0].toUpperCase()}${w.slice(1)}`
  if (!hero.includes(`${cap(words[detection])} ways of being wrong`)) {
    errors.push(
      `the landing page band grid is not headed "${cap(words[detection])} ways of being wrong": ` +
        `${detection} bands carry role 'detection'`,
    )
  }
  for (const n of [best, detection, 14]) {
    if (new RegExp(`${words[n]} other bands`).test(hero)) {
      errors.push(
        `the landing page says "${words[n]} other bands" beside a single sensor, which claims ` +
          `${n + 1} simultaneous channels; no tier exceeds ${best}`,
      )
    }
  }

  const schemaDoc = readText('content/schema.md')
  if (!schemaDoc.includes(`${words[detection][0].toUpperCase()}${words[detection].slice(1)} are detection bands`)) {
    errors.push(`content/schema.md does not say there are ${words[detection]} detection bands`)
  }
  if (!schemaDoc.includes(`${words[context] ?? context} are context bands`)) {
    errors.push(`content/schema.md does not say there are ${context} context bands`)
  }
  if (withParts.size !== best) {
    // Not an error in itself, but worth surfacing: it means some band has a part
    // that no tier ships.
    errors.push(
      `${withParts.size} bands have parts but the best tier only reaches ${best}; a part belongs to no tier`,
    )
  }

  if (errors.length) throw new Error(errors.join('; '))
  return `${bands.bands.length} defined, ${best} buildable at once, ${detection} detection / ${context} context`
})

check('the documented wire protocol matches the ingest code', () => {
  // The API reference described a body-only signature and four headers for as
  // long as the code had required six and signed a canonical payload. Anyone
  // writing a client from the documentation would have got a 401 with no way to
  // work out why. Prose about a protocol is part of the protocol.
  const ingest = readText('apps/web/lib/grid/ingest.ts')
  const api = readText('content/api.md')
  const errors = []

  // Every header the code reads must appear in the reference.
  const headers = [...ingest.matchAll(/headers\.get\('(x-nband-[a-z-]+)'\)/g)].map((m) =>
    m[1].toLowerCase(),
  )
  for (const h of new Set(headers)) {
    if (!api.toLowerCase().includes(h)) {
      errors.push(`content/api.md never mentions the ${h} header, which ingest.ts requires`)
    }
  }

  // The canonical payload template must be reproduced exactly.
  const tmpl = ingest.match(/return `(nband\/v1[^`]*)`/)
  if (!tmpl) {
    errors.push('could not find the canonicalPayload template in ingest.ts')
  } else {
    const documented = tmpl[1].replace(/\$\{(\w+)\}/g, '{$1}').replace(/\n/g, '\\n')
    if (!api.includes(documented)) {
      errors.push(`content/api.md does not show the canonical payload as "${documented}"`)
    }
  }

  // The skew window is a number a client must implement.
  const skew = ingest.match(/MAX_CLOCK_SKEW_S\s*=\s*(\d+)/)
  if (skew && !api.includes(skew[1])) {
    errors.push(`content/api.md does not state the ${skew[1]}-second clock skew window`)
  }

  if (errors.length) throw new Error(errors.join('; '))
  return `${new Set(headers).size} headers, canonical payload and skew window all documented`
})

check('each tier summary names the bands that tier actually gains', () => {
  // These strings are rendered as the tier heading on /hardware and as the tier
  // card on the landing page, and they drifted from the registry silently. The
  // tier 1 summary omitted long-wave infrared while the tier 2 summary claimed
  // to add it, so the page told a reader that thermal costs the $1,158 step up
  // to tier 2 when a thermal array is a $75 part inside tier 1. A reader
  // deciding what to buy acted on the wrong number, which is the whole failure
  // this file exists to catch.
  const alias = {
    lwir: ['long-wave infrared', 'thermal'],
    swir: ['short-wave infrared'],
    nir: ['near-infrared', 'near infrared'],
    uv: ['ultraviolet'],
    vis: ['visible'],
    rf: ['radio', 'sdr'],
    mmw: ['millimetre-wave', 'millimetre wave'],
    elf_vlf: ['magnetometry', 'magnetic'],
    acoustic: ['acoustic'],
    seismic: ['seismometer', 'seismic'],
    gamma: ['gamma'],
    env: ['environmental'],
    nav: ['disciplined time', 'navigation'],
    grav: ['gravimetry', 'gravimetric'],
  }

  const bandsOf = (tier) =>
    new Set(
      hardware.parts
        .filter((p) => p.tiers?.includes(tier))
        .map((p) => p.band)
        .filter(Boolean),
    )

  const order = spec.enums.tier.values.map((t) => t.id)
  const errors = []

  for (const [i, tier] of spec.enums.tier.values.entries()) {
    const mine = bandsOf(tier.id)
    if (mine.size === 0) continue // tier r has no parts and says so in its own summary
    const previous = i > 0 ? bandsOf(order[i - 1]) : new Set()
    const gained = [...mine].filter((b) => !previous.has(b))
    const text = tier.summary.toLowerCase()

    for (const [band, names] of Object.entries(alias)) {
      const named = names.some((n) => text.includes(n))
      if (!named) continue
      if (!mine.has(band)) {
        errors.push(`${tier.id}: summary names ${band} but the tier carries no such band`)
      } else if (previous.has(band) && !/\b(upgrad|replac|improv|better|swap)/.test(text)) {
        // Naming a band the previous tier already had is fine when the tier
        // buys a better instrument for it, which is what tier 2 does with the
        // thermal array. It is not fine to list it as new. So the rule is not
        // "do not mention it", it is "say which of the two you mean": a summary
        // naming an inherited band must carry a word that marks it an upgrade.
        errors.push(
          `${tier.id}: summary names ${band}, which ${order[i - 1]} already carries, without ` +
            'saying whether this tier adds it or improves it',
        )
      }
    }

    // The converse: a band gained and not mentioned is a capability the reader
    // is not told they are buying.
    const unmentioned = gained.filter((b) => !(alias[b] ?? []).some((n) => text.includes(n)))
    if (unmentioned.length) {
      errors.push(`${tier.id}: gains ${unmentioned.join(', ')} without naming them in its summary`)
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  const counts = spec.enums.tier.values
    .map((t) => `${t.id} ${bandsOf(t.id).size}`)
    .filter((s) => !s.endsWith(' 0'))
    .join(', ')
  return `band counts by tier: ${counts}`
})

check('the system schematic shows every part in its tier', () => {
  // A figure captioned "the whole node" that is missing three parts is worse
  // than no figure, because a reader who checks it against the bill of
  // materials concludes the extra parts are optional. The board schematic gets
  // away with covering nine of twenty-three only because it says so in its
  // title; this one claims the lot, so it has to have the lot.
  const manifest = resolve(root, 'apps/web/public/boards/system.json')
  if (!existsSync(manifest)) {
    throw new Error('apps/web/public/boards/system.json is missing. Run `make boards`.')
  }
  const system = JSON.parse(readFileSync(manifest, 'utf8'))
  const errors = []

  for (const tier of spec.enums.tier.values) {
    const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id))
    if (parts.length === 0) continue

    const sheet = system.sheets.find((s) => s.tier === tier.id)
    if (!sheet) {
      errors.push(`${tier.id}: no system schematic, though the tier has ${parts.length} parts`)
      continue
    }
    const missing = parts.filter((p) => !sheet.covered.includes(p.id))
    if (missing.length) {
      errors.push(`${tier.id}: absent from the schematic: ${missing.map((p) => p.id).join(', ')}`)
    }

    // The drawn SVG has to agree with the manifest that describes it. They are
    // written by the same run, so a mismatch means the file on disk is stale.
    const svg = resolve(root, `apps/web/public/boards/${tier.id}-system.svg`)
    if (!existsSync(svg)) {
      errors.push(`${tier.id}: ${tier.id}-system.svg is missing`)
      continue
    }
    // The rendered file carries its own part list, so this asks the SVG on disk
    // what it covers rather than trusting the manifest written beside it. A
    // manifest can be current while the picture beside it is six commits old,
    // and that is exactly the failure the figure would otherwise hide.
    const drawn = readFileSync(svg, 'utf8')
    const declared = (drawn.match(/data-parts="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean)
    const undrawn = parts.filter((p) => !declared.includes(p.id))
    const stale = declared.filter((id) => !parts.some((p) => p.id === id))
    if (undrawn.length || stale.length) {
      errors.push(
        `${tier.id}: ${tier.id}-system.svg is out of date. ` +
          (undrawn.length ? `Missing: ${undrawn.map((p) => p.id).join(', ')}. ` : '') +
          (stale.length ? `No longer in the tier: ${stale.join(', ')}. ` : '') +
          'Run `make boards`.',
      )
    }

    // Every power stage the registry declares must reach the sheet too. A
    // chain that quietly drops its regulator still draws as a chain.
    const supply = parts.find((p) => p.powerChain)
    if (supply) {
      const shown = sheet.facts?.power?.stages ?? []
      const lost = supply.powerChain.filter((st) => !shown.includes(st.id))
      if (lost.length) {
        errors.push(`${tier.id}: power stages missing: ${lost.map((s) => s.id).join(', ')}`)
      }
    }
  }

  if (errors.length) throw new Error(errors.join('; '))
  const total = system.sheets.reduce((n, s) => n + s.covered.length, 0)
  return `${system.sheets.length} sheets covering ${total} part placements, none omitted`
})

// ---------------------------------------------------------------------------

console.log(`nband drift check, platform v${version}, schema v${spec.schemaVersion}\n`)
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (c.detail) {
    for (const line of String(c.detail).split('\n')) {
      if (line.trim()) console.log(`        ${line.trim()}`)
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed. Docs that drift from the hardware are worse than no docs.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
