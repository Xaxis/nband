#!/usr/bin/env node
/**
 * Lay out the whole node, not just the carrier board.
 *
 * The board generator answers "how is the carrier wired", and that is a real
 * question, but it is not the one someone asks first. The first question is
 * what the thing actually looks like: how big is it, what stacks on what, does
 * it fit in the case, where does the camera point. None of that was anywhere on
 * the site, because tscircuit renders boards and a node is not a board — it is
 * a Raspberry Pi, a carrier, a handful of breakouts, several USB peripherals on
 * cables, two cameras on ribbon, and a case.
 *
 * So this emits an assembly per tier: one body per part, positioned, sized and
 * labelled, which the browser renders beside the real generated carrier PCB.
 *
 * On honesty, which matters more here than usual. Two of these dimensions are
 * standards — the Pi's 85 x 56 mm and the HAT's 65 x 56 mm — and the Pelican
 * case is a published figure. Everything else is an approximation good enough
 * to show scale and stacking and nothing more. Each body carries whether its
 * dimensions were sourced, and the viewer says so plainly. A render that looks
 * like CAD and is not CAD is exactly the kind of thing this project exists to
 * refuse, so it is labelled as massing rather than dressed up.
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

const hue = Object.fromEntries(bands.bands.map((b) => [b.id, b.hue]))

// The carrier is no longer always 65 x 56: dense tiers overhang so the router
// can clear a fabricator's minimum copper gap. Read the real size rather than
// drawing a HAT-sized rectangle under a board that is not one.
const boardManifest = JSON.parse(
  readFileSync(join(root, 'hardware/boards/manifest.json'), 'utf8'),
)
const boardWidth = (tierId) =>
  boardManifest.boards.find((b) => b.tier === tierId)?.widthMm ?? 65

// The stack, in millimetres, measured from the top face of the Pi's PCB.
const PI_BOARD_T = 1.6
const STANDOFF = 11 // the usual HAT standoff
const HAT_BOARD_T = 1.6

function assemblyFor(tier) {
  const parts = hardware.parts.filter((p) => p.tiers?.includes(tier.id) && p.mechanical)
  if (parts.length === 0) return null

  const by = (mount) => parts.filter((p) => p.mechanical.mount === mount)
  const bodies = []

  const push = (part, x, y, z, extra = {}) => {
    const m = part.mechanical
    bodies.push({
      id: part.id,
      label: `${part.vendor} ${part.model}`.trim(),
      band: part.band ?? null,
      hue: part.band ? hue[part.band] : null,
      mount: m.mount,
      size: [m.widthMm, m.heightMm, m.depthMm], // three.js is x, y(up), z
      pos: [x, y, z],
      sourced: m.dimensionsSourced === true,
      note: m.note,
      interface: part.interface ?? null,
      ...extra,
    })
  }

  // 1. The host, centred at the origin with its board top at y = 0.
  const host = by('host')[0]
  if (host) push(host, 0, host.mechanical.heightMm / 2 - PI_BOARD_T, 0)

  // 2. The carrier, on standoffs above it. Rendered from the real generated
  //    GLB rather than as a box, so the one part of this that is a genuine
  //    engineering artifact looks like one.
  const hatY = (host?.mechanical.heightMm ?? 18) - PI_BOARD_T + STANDOFF
  bodies.push({
    id: `carrier-${tier.id}`,
    label: `${tier.label} carrier board`,
    mount: 'hat',
    glb: `/boards/${tier.id}-board.glb`,
    size: [boardWidth(tier.id), HAT_BOARD_T, 56],
    pos: [0, hatY, 0],
    sourced: true,
    note: `Generated from the hardware registry. ${boardWidth(tier.id)} x 56 mm, mounting on the HAT hole pattern.`,
  })

  // 3. Breakouts on the carrier, laid left to right across its top face.
  const onCarrier = by('carrier')
  let cx = -26
  const cz = -14
  let row = 0
  for (const p of onCarrier) {
    const w = p.mechanical.widthMm
    if (cx + w > 30) {
      cx = -26
      row += 1
    }
    push(p, cx + w / 2, hatY + HAT_BOARD_T / 2 + p.mechanical.heightMm / 2, cz + row * 22)
    cx += w + 4
  }

  // 4. USB peripherals, clustered beside the host rather than strung out in a
  //    line. Tier 3 carries six of them and a single row put the far one half a
  //    metre from the node it plugs into, which is not what the bench looks
  //    like and made the whole model read as scattered debris.
  const usb = by('usb')
  const USB_ROW_W = 190
  let ux = 0
  let uz = 0
  let rowH = 0
  for (const p of usb) {
    const w = p.mechanical.widthMm
    if (ux + w > USB_ROW_W) {
      ux = 0
      uz += rowH + 14
      rowH = 0
    }
    push(p, 72 + ux + w / 2, p.mechanical.heightMm / 2, -30 + uz)
    ux += w + 14
    rowH = Math.max(rowH, p.mechanical.depthMm)
  }

  // 5. Cameras on their ribbons, in front of the node and pointing up, which is
  //    where they actually sit: a mast-mounted node looks at the sky.
  let kx = -60
  for (const p of by('csi')) {
    push(p, kx - p.mechanical.widthMm / 2, p.mechanical.heightMm / 2, 55)
    kx -= p.mechanical.widthMm + 16
  }

  // 6. Everything that lives away from the node: the geophone in the ground,
  //    the solar array on its own mount. Placed loosely and flagged, because
  //    their real position is a site decision rather than a assembly one.
  let ex = -260
  for (const p of by('external')) {
    push(p, ex - p.mechanical.widthMm / 2, p.mechanical.heightMm / 2, 190, { remote: true })
    ex -= p.mechanical.widthMm + 60
  }

  // 7. The case, as an outline the rest sits inside.
  const shell = by('enclosure')[0]
  if (shell) {
    bodies.push({
      id: shell.id,
      label: `${shell.vendor} ${shell.model}`,
      mount: 'enclosure',
      size: [shell.mechanical.widthMm, shell.mechanical.heightMm, shell.mechanical.depthMm],
      pos: [0, shell.mechanical.heightMm / 2 - 30, 0],
      wireframe: true,
      sourced: shell.mechanical.dimensionsSourced === true,
      note: shell.mechanical.note,
    })
  }

  const sourced = bodies.filter((b) => b.sourced).length
  return {
    tier: tier.id,
    label: tier.label,
    bodies,
    counts: {
      total: bodies.length,
      sourced,
      approximate: bodies.length - sourced,
      onCarrier: onCarrier.length,
      usb: by('usb').length,
      csi: by('csi').length,
    },
  }
}

const assemblies = spec.enums.tier.values.map(assemblyFor).filter(Boolean)

writeFileSync(
  join(OUT, 'assembly.json'),
  JSON.stringify(
    {
      generatedFrom: 'schema/hardware.json',
      units: 'mm',
      caveat:
        'A massing model, not CAD. The Raspberry Pi and HAT outlines and the case are ' +
        'published mechanical figures; every other body is an approximation sized to show ' +
        'scale and stacking. Nothing here has been built or measured.',
      assemblies,
    },
    null,
    2,
  ) + '\n',
)

for (const a of assemblies) {
  console.log(
    `  ${a.tier}: ${a.counts.total} bodies — ${a.counts.onCarrier} on the carrier, ` +
      `${a.counts.usb} USB, ${a.counts.csi} CSI (${a.counts.sourced} sourced, ${a.counts.approximate} approximate)`,
  )
}
console.log(`\n${assemblies.length} node assemblies written to apps/web/public/boards/assembly.json`)
