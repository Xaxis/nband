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
    const { heightOverride, ...rest } = extra
    bodies.push({
      id: part.id,
      label: `${part.vendor} ${part.model}`.trim(),
      band: part.band ?? null,
      hue: part.band ? hue[part.band] : null,
      mount: m.mount,
      size: [m.widthMm, heightOverride ?? m.heightMm, m.depthMm], // three.js is x, y(up), z
      pos: [x, y, z],
      sourced: m.dimensionsSourced === true,
      note: m.note,
      interface: part.interface ?? null,
      ...rest,
    })
  }

  // 1. The host, centred at the origin. Drawn as the bare board with its
  //    connectors, chips and header on top, rather than as one solid block the
  //    height of the Ethernet jack — which is what it was, and which is why the
  //    model read as a pile of anonymous boxes. A Raspberry Pi is recognisable
  //    almost entirely by its connector layout.
  const host = by('host')[0]
  const featureBodies = []
  if (host) {
    const m = host.mechanical
    push(host, 0, PI_BOARD_T / 2, 0, { boardOnly: true, heightOverride: PI_BOARD_T })
    for (const f of m.features ?? []) {
      // Registry coordinates put the board origin at its bottom-left corner;
      // the scene is centred on the board.
      featureBodies.push({
        id: `${host.id}-${f.id}`,
        label: f.label,
        parent: host.id,
        mount: 'feature',
        size: [f.w, f.h, f.d],
        pos: [
          f.x + f.w / 2 - m.widthMm / 2,
          PI_BOARD_T + f.h / 2,
          f.y + f.d / 2 - m.depthMm / 2,
        ],
        colour: f.colour,
        sourced: false,
        note: m.featureNote,
      })
    }
  }

  // 2. Any HAT that is a bought board rather than the generated carrier. The
  //    GNSS receiver is one, and it was silently absent from every assembly:
  //    its mount is 'hat', the hat slot was assumed to mean the carrier, and
  //    nothing checked that each part in the tier appeared somewhere. The part
  //    the entire clock discipline rests on was missing from the picture.
  let stackY = (host?.mechanical.heightMm ?? 18) - PI_BOARD_T + STANDOFF
  for (const p of by('hat')) {
    push(p, 0, stackY + p.mechanical.heightMm / 2, 0)
    stackY += p.mechanical.heightMm + STANDOFF
  }

  // 3. The carrier, on standoffs above whatever is already stacked. Rendered
  //    from the real generated GLB rather than as a box, so the one part of
  //    this that is a genuine engineering artifact looks like one.
  const hatY = stackY
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

  // 4. Breakouts on the carrier's top face, wrapped inside its actual outline.
  //
  // The first version marched the z coordinate outward without ever wrapping,
  // so on tier 3 four of eight breakouts floated past the edge of the board
  // they were described as sitting on, one of them 74 mm out on a 56 mm deep
  // carrier. The board is also no longer always 65 mm wide, so the bounds come
  // from the manifest rather than from a literal.
  const onCarrier = by('carrier')
  const cw = boardWidth(tier.id)
  const cd = 56
  const PAD = 3
  let cx = -cw / 2 + PAD
  let cz = -cd / 2 + PAD
  let rowDepth = 0
  for (const p of onCarrier) {
    const w = p.mechanical.widthMm
    const dpt = p.mechanical.depthMm
    if (cx + w > cw / 2 - PAD) {
      cx = -cw / 2 + PAD
      cz += rowDepth + PAD
      rowDepth = 0
    }
    push(p, cx + w / 2, hatY + HAT_BOARD_T / 2 + p.mechanical.heightMm / 2, cz + dpt / 2)
    cx += w + PAD
    rowDepth = Math.max(rowDepth, dpt)
  }

  // 5. USB peripherals, clustered beside the host rather than strung out in a
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

  // 6. Cameras on their ribbons, in front of the node and pointing up, which is
  //    where they actually sit: a mast-mounted node looks at the sky.
  let kx = -60
  for (const p of by('csi')) {
    push(p, kx - p.mechanical.widthMm / 2, p.mechanical.heightMm / 2, 55)
    kx -= p.mechanical.widthMm + 16
  }

  // 7. Sensors that mount at the enclosure wall rather than on the board,
  //     because what they measure is outside it: ambient air, sky, sound.
  //     Drawing these on the carrier was not a layout bug so much as a claim
  //     about the build that was not true — a BME688 bolted above the Pi reads
  //     the Pi's temperature, not the site's.
  //     Placed against the case's own inner face rather than floating above the
  //     node, which is where they actually go and which stops them reading as
  //     parts that came loose. The case is much larger than the node, so they
  //     sit some distance from it — that separation is real and is most of why
  //     the enclosure is the size it is.
  const shellPart = by('enclosure')[0]
  const wallZ = shellPart ? -shellPart.mechanical.depthMm / 2 + 12 : -70
  const wallY = shellPart ? 30 : 40
  let wx = -60
  for (const p of by('enclosure-wall')) {
    push(p, wx + p.mechanical.widthMm / 2, wallY, wallZ)
    wx += p.mechanical.widthMm + 10
  }

  // 8. Everything that lives away from the node: the geophone in the ground,
  //    the solar array on its own mount. Placed loosely and flagged, because
  //    their real position is a site decision rather than a assembly one.
  let ex = -260
  for (const p of by('external')) {
    push(p, ex - p.mechanical.widthMm / 2, p.mechanical.heightMm / 2, 190, { remote: true })
    ex -= p.mechanical.widthMm + 60
  }

  // 10. Standoffs. Boards floating above one another with nothing between them
  //     is most of why the stack read as unrelated slabs rather than as a
  //     stack. These are the parts actually holding it together.
  const stackBoards = bodies.filter((b) => b.mount === 'hat' || b.glb)
  for (const board of stackBoards) {
    const [bw, , bd] = board.size
    const below = board.pos[1] - STANDOFF / 2 - 0.8
    for (const [sx, sz] of [
      [-Math.min(bw / 2 - 3.5, 29), -24.5],
      [Math.min(bw / 2 - 3.5, 29), -24.5],
      [-Math.min(bw / 2 - 3.5, 29), 24.5],
      [Math.min(bw / 2 - 3.5, 29), 24.5],
    ]) {
      bodies.push({
        id: `standoff-${board.id}-${sx}-${sz}`,
        label: 'M2.5 standoff',
        mount: 'standoff',
        size: [5, STANDOFF, 5],
        pos: [sx, below, sz],
        cylinder: true,
        sourced: true,
        note: 'M2.5 x 11 mm, the usual HAT spacing.',
      })
    }
  }

  // 11. Cables. A node is defined by what plugs into what, and nothing in the
  //     model said so: every peripheral floated unconnected beside a board it
  //     had no visible relationship to.
  const featureAt = (fid) => featureBodies.find((f) => f.id === `${host?.id}-${fid}`)
  const cables = []
  for (const b of bodies) {
    const part = parts.find((p) => p.id === b.id)
    const plug = part?.mechanical?.plugsInto
    if (!plug) continue
    const target = featureAt(plug)
    if (!target) continue
    cables.push({
      id: `cable-${b.id}`,
      label: `${b.label} to ${target.label}`,
      from: [b.pos[0], b.pos[1], b.pos[2]],
      to: [target.pos[0], target.pos[1], target.pos[2]],
      kind: part.interface === 'csi' || plug.startsWith('csi') ? 'ribbon' : 'cable',
    })
  }
  // Anything at the wall or on the mast reaches the carrier by cable too.
  const carrierBody = bodies.find((b) => b.glb)
  for (const b of bodies) {
    if (!['enclosure-wall', 'external'].includes(b.mount) || !carrierBody) continue
    cables.push({
      id: `cable-${b.id}`,
      label: `${b.label} to the carrier`,
      from: [b.pos[0], b.pos[1], b.pos[2]],
      to: [carrierBody.pos[0], carrierBody.pos[1], carrierBody.pos[2]],
      kind: 'cable',
    })
  }

  bodies.push(...featureBodies)

  // 12. The case, as an outline the rest sits inside.
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

  // Nothing in a tier may be silently absent. The GNSS receiver disappeared
  // from all three assemblies for weeks because its mount landed in a slot the
  // layout did not handle, and no check noticed. An omission that looks like
  // "this tier does not include one" is worse than a crash.
  const shown = new Set(bodies.filter((b) => !b.parent).map((b) => b.id))
  const missing = parts.filter((p) => !shown.has(p.id))
  if (missing.length > 0) {
    throw new Error(
      `${tier.id}: ${missing.length} part(s) in the tier are absent from the assembly: ` +
        `${missing.map((p) => `${p.id} (mount=${p.mechanical.mount})`).join(', ')}`,
    )
  }

  const sourced = bodies.filter((b) => b.sourced).length
  return {
    tier: tier.id,
    label: tier.label,
    bodies,
    cables,
    counts: {
      total: bodies.length,
      sourced,
      approximate: bodies.length - sourced,
      onCarrier: onCarrier.length,
      onWall: by('enclosure-wall').length,
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
