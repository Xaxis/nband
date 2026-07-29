#!/usr/bin/env node
/**
 * The whole node as one sheet.
 *
 * The carrier schematic answers how the header is wired, and it covers only the
 * parts that touch the header: nine of tier 3's twenty-three. The rest reach
 * the Pi over USB, over CSI ribbon, or through a power chain that the bill of
 * materials records as a single row.
 *
 * Someone deciding whether they can build this needs the other two thirds. They
 * need to see that the millimetre-wave radar, the gamma spectrometer and the
 * short-wave imager land on one host through a powered hub, because that hub is
 * the difference between a node that works and one that brown-outs a channel
 * every time the load steps. They need to see that a panel feeds a controller
 * that feeds a battery that feeds a regulator, because on a bad week the
 * question is which of those runs out first.
 *
 * So the sheet draws three chains.
 *
 * Power runs left to right through its stages, with the current monitor drawn
 * across the two stages it actually measures between, and the summed node draw
 * at the end so the margin is visible rather than asserted.
 *
 * Signal runs left to right into the host, one lane per bus, every part
 * carrying the header pins it claims. That is the netlist the pin-conflict
 * check reads, rendered rather than described.
 *
 * Data leaves the host: spool, signed upload, grid, discriminator, archive.
 * That chain is the reason the other two exist.
 *
 * Generated rather than drawn. A diagram maintained by hand disagrees with the
 * hardware within a month, and nobody notices until a builder follows it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hardware = JSON.parse(readFileSync(join(root, 'schema/hardware.json'), 'utf8'))
const spec = JSON.parse(readFileSync(join(root, 'schema/spec.json'), 'utf8'))
const bands = JSON.parse(readFileSync(join(root, 'schema/bands.json'), 'utf8'))

const OUT = join(root, 'apps/web/public/boards')
mkdirSync(OUT, { recursive: true })

const hueOf = Object.fromEntries(bands.bands.map((b) => [b.id, b.hue]))

// One ink set, one surface. The sheet is drawn once and shown under both
// themes, so it commits to a light surface rather than trying to be two
// drawings badly.
const INK = '#20242b'
const INK2 = '#5a616c'
const INK3 = '#8b929c'
const LINE = '#c3c9d2'
const RULE = '#dfe3e9'
const SURFACE = '#f7f6f3'
const WARN = '#b4453c'

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const W = 1240
const PAD = 30

const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 5}" fill="${o.fill ?? '#ffffff'}" ` +
  `stroke="${o.stroke ?? LINE}" stroke-width="${o.width ?? 1}"` +
  `${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`

const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'system-ui, -apple-system, sans-serif'}" ` +
  `font-size="${o.size ?? 11}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? INK}"` +
  `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`

const line = (x1, y1, x2, y2, o = {}) =>
  `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${o.stroke ?? LINE}" stroke-width="${o.width ?? 1.3}" fill="none"` +
  `${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ' marker-end="url(#a)"' : ''}/>`

function wrap(s, n) {
  const out = []
  let cur = ''
  for (const w of String(s ?? '').split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n) {
      out.push(cur.trim())
      cur = w
    } else cur = `${cur} ${w}`
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// Lanes in the order a builder meets them: the buses that need wiring first,
// then the ones that are a plug.
const LANES = [
  { id: 'i2c', label: 'I2C', hint: 'shared bus, 3.3 V' },
  { id: 'spi', label: 'SPI', hint: 'shared clock, own CS' },
  { id: 'uart', label: 'UART', hint: 'point to point' },
  { id: 'i2s', label: 'I2S', hint: 'clocked audio' },
  { id: 'gpio', label: 'GPIO', hint: 'discrete lines' },
  { id: 'analog', label: 'Analogue', hint: 'via a converter' },
  { id: 'csi', label: 'CSI', hint: 'ribbon to the host' },
  { id: 'usb', label: 'USB', hint: 'via the hub when one ships' },
  { id: 'none', label: 'Not on a bus', hint: 'drawn above, or structural' },
]

// The gutter needs room for a two-line hint even where the lane holds one
// part. Sizing lanes purely by row count ran the USB hint into the label of
// the lane below it.
const LANE_MIN_H = 46

const laneOf = (p) => {
  const i = String(p.interface ?? 'none')
  if (i === 'host') return null
  if (i.startsWith('usb')) return 'usb'
  if (i.startsWith('uart')) return 'uart'
  if (i.startsWith('gpio')) return 'gpio'
  return LANES.some((l) => l.id === i) ? i : 'none'
}

// The full model, clipped only where it would collide with the pin column.
// Cutting at the first bracket looked tidier and turned the gamma spectrometer
// into "CsI", which is the scintillator crystal rather than the part.
const shortModel = (p) => (p.model.length > 46 ? `${p.model.slice(0, 45)}…` : p.model)

function sheetFor(tier) {
  const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id))
  if (parts.length === 0) return null

  const host = parts.find((p) => p.category === 'compute')
  const supply = parts.find((p) => p.powerChain)
  const hub = parts.find((p) => p.keySpecs?.ports)
  const monitor = parts.find((p) => p.measuresBetween)
  const draw = parts.reduce((s, p) => s + (p.electrical?.activeW ?? 0), 0)
  const peak = parts.reduce((s, p) => s + (p.electrical?.peakW ?? p.electrical?.activeW ?? 0), 0)

  const s = []
  let y = PAD
  const facts = {}

  // ---- title -------------------------------------------------------------
  s.push(text(PAD, y + 14, `nband ${tier.label}`, { size: 17, weight: 600 }))
  s.push(
    text(PAD, y + 33, `System schematic. ${parts.length} parts, generated from schema/hardware.json.`, {
      size: 11,
      fill: INK2,
    }),
  )
  s.push(text(W - PAD, y + 13, 'GENERATED REFERENCE', { size: 9.5, fill: WARN, anchor: 'end', mono: true }))
  s.push(
    text(W - PAD, y + 28, 'No node has been built. Nothing here has been measured.', {
      size: 9,
      fill: INK3,
      anchor: 'end',
      mono: true,
    }),
  )
  y += 50
  s.push(line(PAD, y, W - PAD, y, { stroke: RULE, width: 1 }))
  y += 22

  // ---- power -------------------------------------------------------------
  s.push(text(PAD, y, 'POWER', { size: 10, fill: INK3, mono: true, weight: 600 }))
  s.push(
    text(PAD + 62, y, supply ? `${supply.vendor} ${supply.model}` : 'no supply listed in this tier', {
      size: 10,
      fill: INK3,
    }),
  )
  y += 14

  const chain = supply?.powerChain ?? []
  const cells = chain.length + 1
  const cellGap = 30
  const cellW = (W - PAD * 2 - cellGap * (cells - 1)) / cells
  const cellH = 70
  const cellX = (i) => PAD + i * (cellW + cellGap)

  chain.forEach((st, i) => {
    const x = cellX(i)
    s.push(rect(x, y, cellW, cellH))
    s.push(text(x + 10, y + 20, st.label, { size: 12, weight: 600 }))
    wrap(st.detail, Math.floor(cellW / 5.2))
      .slice(0, 2)
      .forEach((l, k) => s.push(text(x + 10, y + 35 + k * 12, l, { size: 9.5, fill: INK2 })))
    const out = st.outV == null ? '' : `${st.outV} V${st.ac ? ' AC' : ''}${st.outW ? ` · ${st.outW} W` : ''}`
    s.push(text(x + cellW - 10, y + cellH - 9, out, { size: 10, anchor: 'end', mono: true }))
    s.push(line(x + cellW, y + cellH / 2, x + cellW + cellGap - 3, y + cellH / 2, { arrow: true }))
  })

  // The load, and its margin. A supply figure with no load beside it is a
  // number nobody can act on.
  const lx = cellX(chain.length)
  const railW = chain.at(-1)?.outW ?? 0
  const headroom = railW > 0 ? Math.round(((railW - peak) / railW) * 100) : null
  s.push(rect(lx, y, cellW, cellH, { stroke: INK, width: 1.6 }))
  s.push(text(lx + 10, y + 20, 'Node load', { size: 12, weight: 600 }))
  s.push(text(lx + 10, y + 35, `${draw.toFixed(1)} W continuous`, { size: 9.5, fill: INK2 }))
  s.push(
    text(lx + 10, y + 47, peak > draw ? `${peak.toFixed(1)} W with pulses` : 'no pulsed loads declared', {
      size: 9.5,
      fill: INK2,
    }),
  )
  if (headroom !== null) {
    s.push(
      text(lx + cellW - 10, y + cellH - 9, `${headroom}% headroom`, {
        size: 10,
        anchor: 'end',
        mono: true,
        fill: headroom < 20 ? WARN : INK,
      }),
    )
  }
  y += cellH

  // The current monitor is drawn across the two stages it names rather than
  // floating in the I2C lane, because where it sits is the whole of what it
  // measures.
  if (monitor?.measuresBetween) {
    const a = chain.findIndex((c) => c.id === monitor.measuresBetween[0])
    const b = chain.findIndex((c) => c.id === monitor.measuresBetween[1])
    if (a >= 0 && b >= 0) {
      const x1 = cellX(Math.min(a, b)) + cellW / 2
      const x2 = cellX(Math.max(a, b)) + cellW / 2
      const my = y + 24
      s.push(line(x1, y, x1, my, { dash: '3 3', width: 1 }))
      s.push(line(x2, y, x2, my, { dash: '3 3', width: 1 }))
      s.push(line(x1, my, x2, my, { dash: '3 3', width: 1 }))
      const label = `${shortModel(monitor)} sits here, and reports the reading over I2C`
      const half = 6 + label.length * 2.6
      s.push(rect((x1 + x2) / 2 - half, my - 10, half * 2, 20, { fill: SURFACE, stroke: RULE, rx: 4 }))
      s.push(text((x1 + x2) / 2, my + 4, label, { size: 9.5, fill: INK2, anchor: 'middle' }))
      y += 34
    }
  }
  y += 26

  facts.power = { stages: chain.map((c) => c.id), draw: +draw.toFixed(1), peak: +peak.toFixed(1), headroom }

  // ---- signal ------------------------------------------------------------
  s.push(line(PAD, y - 8, W - PAD, y - 8, { stroke: RULE, width: 1 }))
  s.push(text(PAD, y + 8, 'SIGNAL', { size: 10, fill: INK3, mono: true, weight: 600 }))
  s.push(
    text(PAD + 62, y + 8, 'Every part in the tier, on the bus it uses, with the pins it claims.', {
      size: 10,
      fill: INK3,
    }),
  )
  y += 24

  const sigTop = y
  const GUT = 76 // bus label gutter
  const boxX = PAD + GUT
  const boxW = 520
  const trunkX = boxX + boxW + 30
  const hostW = 262
  const hostX = W - PAD - hostW
  const ROW = 26

  // A part that names another part it connects to does not reach the host on
  // its own. The geophone is the case that matters: it is a coil, its output is
  // millivolts, and it reaches the Pi only through a 24-bit converter. Drawing
  // it in an "analogue" lane running to the host claims the Pi has an analogue
  // input, which it does not have at all.
  const attached = new Map() // parent id -> [child, ...]
  for (const p of parts) {
    if (!p.connectsTo) continue
    if (!parts.some((q) => q.id === p.connectsTo)) continue
    if (!attached.has(p.connectsTo)) attached.set(p.connectsTo, [])
    attached.get(p.connectsTo).push(p)
  }
  const isChild = new Set([...attached.values()].flat().map((p) => p.id))

  // The hub is drawn as the hop it is, so listing it among the things that
  // reach the host through it made the USB lane route through itself.
  const lanes = LANES.map((l) => ({
    ...l,
    parts: parts.filter((p) => p !== host && p !== hub && !isChild.has(p.id) && laneOf(p) === l.id),
  })).filter((l) => l.parts.length > 0)

  const rowsIn = (l) => l.parts.reduce((n, p) => n + 1 + (attached.get(p.id)?.length ?? 0), 0)

  // Vertical extent first, so the host box can span what feeds it.
  let ly = sigTop
  const laneGeom = []
  for (const l of lanes) {
    const h = Math.max(rowsIn(l) * ROW, LANE_MIN_H)
    laneGeom.push({ lane: l, top: ly, h })
    ly += h + 12
  }
  const sigH = ly - sigTop - 12

  const hostH = Math.max(168, sigH)
  const hostY = sigTop
  s.push(rect(hostX, hostY, hostW, hostH, { stroke: INK, width: 1.6 }))
  s.push(text(hostX + 14, hostY + 24, host?.model ?? 'Raspberry Pi 5', { size: 13, weight: 600 }))
  ;[
    'One worker thread per channel',
    'Bounded ring buffers: frames are',
    'dropped and counted, never queued',
    'GNSS-disciplined clock, PPS on pin 7',
    'Coincidence trigger across bands',
    'Append-only spool on the card',
    'Backfills the grid after an outage',
  ].forEach((t, i) => s.push(text(hostX + 14, hostY + 46 + i * 15, t, { size: 9.5, fill: INK2 })))

  for (const g of laneGeom) {
    const { lane, top, h } = g
    s.push(text(PAD, top + 15, lane.label, { size: 10, mono: true, weight: 600 }))
    wrap(lane.hint, 13).forEach((t, i) => s.push(text(PAD, top + 27 + i * 10, t, { size: 8, fill: INK3 })))

    const drawPart = (p, ry, indent) => {
      const x = boxX + indent
      const w = boxW - indent
      const stroke = p.band != null && hueOf[p.band] != null ? `hsl(${hueOf[p.band]}, 45%, 52%)` : LINE
      s.push(rect(x, ry + 2, w, ROW - 5, { stroke }))
      s.push(text(x + 10, ry + 17, shortModel(p), { size: 10.5 }))
      const pins = (p.electrical?.pins ?? []).map((q) => `${q.signal} ${q.pin}`).join('  ')
      s.push(text(boxX + boxW - 10, ry + 17, pins, { size: 9, fill: INK3, anchor: 'end', mono: true }))
    }

    let r = 0
    const trunkRows = []
    for (const p of lane.parts) {
      const ry = top + r * ROW
      drawPart(p, ry, 0)
      trunkRows.push(ry + ROW / 2 - 1)
      if (lane.id !== 'none') {
        s.push(line(boxX + boxW, ry + ROW / 2 - 1, trunkX, ry + ROW / 2 - 1, { width: 1, stroke: RULE }))
      }
      r += 1
      for (const c of attached.get(p.id) ?? []) {
        const cy = top + r * ROW
        drawPart(c, cy, 30)
        // Up into the part that reads it, not across to the host.
        s.push(
          `<path d="M ${boxX + 30} ${cy + ROW / 2 - 1} H ${boxX + 14} V ${ry + ROW / 2 + 2} " ` +
            `stroke="${LINE}" stroke-width="1.3" fill="none" marker-end="url(#a)"/>`,
        )
        r += 1
      }
    }

    const t0 = trunkRows[0]
    const t1 = trunkRows[trunkRows.length - 1]
    if (t1 > t0 && lane.id !== 'none') s.push(line(trunkX, t0, trunkX, t1, { width: 1.4 }))
    g.mid = (t0 + t1) / 2

    // Each lane enters the host at its own height. Routing all nine into one
    // point on the left edge produced a bundle of diagonals that crossed every
    // other lane on the way, and the one thing a reader wants from this figure
    // is to follow a single part to the host without losing the line.
    //
    // Direction is read from the parts, not assumed. The infrared beacon is an
    // emitter: the host drives it, and an arrow pointing the other way says the
    // node is receiving a signal it is in fact transmitting. Nothing structural
    // gets an arrow at all, because a case and a memory card are not on a bus.
    const emits = lane.parts.every((p) => p.category === 'emitter')
    if (lane.id === 'none') {
      s.push(text(trunkX + 10, g.mid + 4, 'no bus', { size: 9, fill: INK3, mono: true }))
    } else if (!(lane.id === 'usb' && hub)) {
      if (emits) s.push(line(hostX - 3, g.mid, trunkX, g.mid, { arrow: true }))
      else s.push(line(trunkX, g.mid, hostX - 3, g.mid, { arrow: true }))
    }
  }

  // The hub is a hop on the USB path. Drawn as one, because a tier that needs
  // it and does not have it fails intermittently rather than cleanly.
  const usbLane = hub ? laneGeom.find((g) => g.lane.id === 'usb') : null
  if (hub && usbLane) {
    // Named, not just described. A reader who works out that they need a hub
    // and is not told which one has been handed a shopping problem rather than
    // a part, so the box carries the model exactly as the registry spells it.
    const hw = 212
    const hx = trunkX + 22
    const model = wrap(hub.model, 44).slice(0, 2)
    const hh = 40 + model.length * 11
    const hy = usbLane.mid - hh / 2
    s.push(rect(hx, hy, hw, hh, { stroke: INK, width: 1.4 }))
    s.push(text(hx + 10, hy + 17, 'Powered hub', { size: 11, weight: 600 }))
    model.forEach((l, i) => s.push(text(hx + 10, hy + 30 + i * 11, l, { size: 8.5, fill: INK2 })))
    s.push(
      text(hx + 10, hy + 32 + model.length * 11, `${hub.keySpecs.supplyA} A, not off the host`, {
        size: 8.5,
        fill: INK2,
      }),
    )
    s.push(line(trunkX, usbLane.mid, hx - 3, usbLane.mid, { arrow: true }))
    s.push(line(hx + hw, usbLane.mid, hostX - 3, usbLane.mid, { arrow: true }))
  }

  y = Math.max(sigTop + sigH, hostY + hostH) + 16
  if (hub) {
    s.push(
      text(
        PAD,
        y,
        'USB peripherals reach the host through the hub rather than the Pi ports, because this tier draws more across USB than the host budgets for them.',
        { size: 9.5, fill: INK2 },
      ),
    )
    y += 12
  }
  y += 20

  facts.signal = Object.fromEntries(lanes.map((l) => [l.id, l.parts.map((p) => p.id)]))
  facts.host = host?.id ?? null
  facts.hub = hub?.id ?? null

  // ---- data --------------------------------------------------------------
  s.push(line(PAD, y - 8, W - PAD, y - 8, { stroke: RULE, width: 1 }))
  s.push(text(PAD, y + 8, 'DATA', { size: 10, fill: INK3, mono: true, weight: 600 }))
  s.push(text(PAD + 62, y + 8, 'What leaves the node, and what happens to it.', { size: 10, fill: INK3 }))
  y += 22

  const flow = [
    ['Spool', 'append-only on the card, survives power loss'],
    ['Signed upload', 'Ed25519 over path, timestamp, nonce, body'],
    ['Grid', 'partitioned Postgres, row-level security'],
    ['Discriminator', 'catalogue subtraction, hypothesis scoring'],
    ['Archive', 'queryable, streamed, exportable with a digest'],
  ]
  const fgap = 16
  const fw = (W - PAD * 2 - fgap * (flow.length - 1)) / flow.length
  flow.forEach(([label, detail], i) => {
    const x = PAD + i * (fw + fgap)
    s.push(rect(x, y, fw, 52, { dash: '3 3' }))
    s.push(text(x + 10, y + 20, label, { size: 11.5, weight: 600 }))
    wrap(detail, Math.floor(fw / 5))
      .slice(0, 2)
      .forEach((l, k) => s.push(text(x + 10, y + 34 + k * 11, l, { size: 9, fill: INK2 })))
    if (i < flow.length - 1) s.push(line(x + fw, y + 26, x + fw + fgap - 3, y + 26, { arrow: true }))
  })
  y += 52 + 22

  s.push(
    text(
      PAD,
      y,
      'The ladder at the end of that chain stops at "anomalous, unresolved". No field in this schema can encode "artificial", and that is deliberate.',
      { size: 9.5, fill: INK2 },
    ),
  )
  y += 14

  const H = y + PAD - 8
  return {
    tier: tier.id,
    label: tier.label,
    parts: parts.length,
    covered: parts.map((p) => p.id),
    facts,
    svg:
      // The part list travels inside the file. A schematic and a registry that
      // disagree is the failure this whole generator exists to prevent, and the
      // only way to catch it is to be able to ask the rendered file what it
      // claims to cover rather than trusting the manifest written beside it.
      `<svg xmlns="http://www.w3.org/2000/svg" data-parts="${parts.map((p) => p.id).join(' ')}" ` +
      `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" ` +
      `aria-label="System schematic for the ${esc(tier.label)} node: a power chain of ${chain.length} stages, ` +
      `${lanes.length} signal buses carrying ${parts.length - 1} parts into the host, and the data path off the node">` +
      `<title>nband ${esc(tier.label)} system schematic</title>` +
      `<desc>Generated from schema/hardware.json. No node has been built and nothing here has been measured.</desc>` +
      `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" ` +
      `orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${LINE}"/></marker></defs>` +
      `<rect width="${W}" height="${H}" fill="${SURFACE}"/>` +
      s.join('') +
      `</svg>`,
  }
}

const sheets = spec.enums.tier.values.map(sheetFor).filter(Boolean)
for (const sh of sheets) {
  writeFileSync(join(OUT, `${sh.tier}-system.svg`), sh.svg)
  const f = sh.facts
  console.log(
    `  ${sh.tier}: ${sh.parts} parts, ${f.power.stages.length} power stages, ` +
      `${Object.keys(f.signal).length} buses, ${f.power.draw} W` +
      (f.power.headroom !== null ? `, ${f.power.headroom}% headroom` : ''),
  )
}
writeFileSync(
  join(OUT, 'system.json'),
  JSON.stringify(
    {
      generatedFrom: 'schema/hardware.json',
      sheets: sheets.map(({ svg: _s, ...m }) => ({ ...m, href: `/boards/${m.tier}-system.svg` })),
    },
    null,
    2,
  ) + '\n',
)
console.log(`\n${sheets.length} system schematics written to apps/web/public/boards/`)
