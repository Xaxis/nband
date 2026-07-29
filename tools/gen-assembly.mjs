#!/usr/bin/env node
/**
 * Lay out the whole node, not just the carrier board.
 *
 * The board generator answers "how is the carrier wired", and that is a real
 * question, but it is not the one someone asks first. The first question is
 * what the thing actually looks like: how big is it, what stacks on what, does
 * it fit in the case, where does the camera point. None of that was anywhere on
 * the site, because tscircuit renders boards and a node is not a board, it is
 * a Raspberry Pi, a carrier, a handful of breakouts, several USB peripherals on
 * cables, two cameras on ribbon, and a case.
 *
 * So this emits an assembly per tier: one body per part, positioned, sized and
 * labelled, which the browser renders beside the real generated carrier PCB.
 *
 * On honesty, which matters more here than usual. Two of these dimensions are
 * standards, the Pi's 85 x 56 mm and the HAT's 65 x 56 mm, and the Pelican
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

  /**
   * Break a part into its own geometry where the registry describes it.
   *
   * A featureless block is a claim that a part is a featureless block, and
   * almost none of them are. A breakout is a small green board with a package
   * and a header on it; an HQ camera is a square body with a 36 mm lens barrel
   * standing off it, which is most of its volume and all of its silhouette; a
   * dongle has a USB plug at one end and an SMA connector at the other. Drawn
   * as boxes they are indistinguishable, and a model where every part looks the
   * same conveys nothing about which part is which.
   *
   * Coordinates are fractional across the parent so one description works
   * whatever the part's actual size is.
   */
  const detailBodies = (part, base) => {
    const spec = part.mechanical.detail
    if (!spec) return []
    const [pw, ph, pd] = base.size
    const [px, py, pz] = base.pos
    return spec.map((f) => {
      const w = f.fill ? pw : (f.wFrac ? pw * f.wFrac : f.w)
      const d = f.fill ? pd : (f.d ?? f.w)
      const h = f.h
      const cx = f.fill ? 0.5 : (f.cx ?? 0.5)
      const cz = f.fill ? 0.5 : (f.cy ?? 0.5)
      return {
        id: `${part.id}-${f.id}`,
        label: f.label,
        parent: part.id,
        mount: 'detail',
        size: [w, h, d],
        pos: [
          px - pw / 2 + cx * pw,
          py - ph / 2 + (f.base ?? 0) + h / 2,
          pz - pd / 2 + cz * pd,
        ],
        colour: f.colour,
        cylinder: f.round === true,
        sourced: false,
        note: part.mechanical.note,
        // A feature is only ever where its part is, so it hides when its part
        // hides. Without this the solar array's frame, cells and junction box
        // stayed on screen after the array itself was toggled off, and since
        // the array is 1.6 metres wide beside an 85 mm Raspberry Pi, the whole
        // view stayed scaled to a panel the reader had asked to remove. The
        // parent block is skipped when it has detail, so nothing was left to
        // carry the flag.
        remote: base.remote === true,
      }
    })
  }

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
      interface: part.interface ?? null, ...rest,
    })
    // A part described in detail is drawn as its parts; the block that carried
    // it becomes invisible so it does not sit inside its own geometry.
    const self = bodies[bodies.length - 1]
    if (m.detail) {
      self.shell = true
      bodies.push(...detailBodies(part, self))
    }
  }

  // 0. The volume everything else is placed inside.
  //
  //    The layout used to hang parts off the origin at hand-picked offsets: USB
  //    peripherals at x = 72 and marching right, wall sensors at a fixed z of
  //    -70, cameras at x = -60 and marching left. Those numbers were chosen so
  //    the parts could be seen, and the result was a node whose peripherals sat
  //    two hundred millimetres away from the host they plug into, floating
  //    beside a case they are supposed to be inside. It answered "what parts
  //    are there" and not "what does this look like packed", and the second
  //    question is the only one a massing model is for.
  //
  //    So the case interior is the frame of reference. The host stack sits on
  //    the floor at the left, the peripherals pack onto the floor beside it,
  //    and the parts that measure the outside sit against the wall they look
  //    through. A tier with no case gets a notional footprint the same shape,
  //    because tier 1 is an indoor build on a bench and still has to be drawn.
  const shell = by('enclosure')[0]
  const CASE = shell?.mechanical?.interiorWidthMm
    ? {
        w: shell.mechanical.interiorWidthMm,
        d: shell.mechanical.interiorDepthMm,
        h: shell.mechanical.interiorHeightMm,
        real: true,
      }
    : { w: 300, d: 200, h: 120, real: false }
  const FLOOR = 0 // everything sits on y = 0 and stacks upward
  const WALL_CLEAR = 8 // fingers, foam, and cable bend at the wall

  // The host stack sits toward the back left, leaving the rest of the floor for
  // the peripherals. Its own x is needed by several sections below, so it is
  // computed once here rather than repeated as a literal.
  const hostPart = by('host')[0]
  const PI_W = hostPart?.mechanical?.widthMm ?? 85
  const PI_D = hostPart?.mechanical?.depthMm ?? 56
  // The stack is as wide as its widest board, not as wide as the Pi. Dense
  // tiers overhang the HAT footprint so the router can clear a fabricator's
  // minimum copper gap, and insetting by half the Pi put the tier 3 carrier's
  // left edge 20 mm outside the case wall. Nothing in the picture looked wrong,
  // because a board passing through a wireframe wall reads as a board.
  const STACK_W = Math.max(PI_W, boardWidth(tier.id))
  const HOST_X = -CASE.w / 2 + WALL_CLEAR + STACK_W / 2
  const HOST_Z = -CASE.d / 2 + WALL_CLEAR + PI_D / 2 + 46

  // 1. The host, on the floor toward the back left. Drawn as the bare board with its
  //    connectors, chips and header on top, rather than as one solid block the
  //    height of the Ethernet jack, which is what it was, and which is why the
  //    model read as a pile of anonymous boxes. A Raspberry Pi is recognisable
  //    almost entirely by its connector layout.
  const host = by('host')[0]
  const featureBodies = []
  if (host) {
    const m = host.mechanical
    push(host, HOST_X, FLOOR + PI_BOARD_T / 2, HOST_Z, { boardOnly: true, heightOverride: PI_BOARD_T })
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
          HOST_X + f.x + f.w / 2 - m.widthMm / 2,
          FLOOR + PI_BOARD_T + f.h / 2,
          HOST_Z + f.y + f.d / 2 - m.depthMm / 2,
        ],
        colour: f.colour,
        sourced: false,
        note: m.featureNote,
      })
    }
  }

  // 1b. Parts that live in a slot on the host rather than beside it. The boot
  //     card is one, and it is drawn because a bill of materials that omits it
  //     omits the only copy of anything the grid has not yet acknowledged. It
  //     is placed at the feature it names, pushed just clear of the board edge
  //     so it reads as inserted rather than buried.
  for (const p of by('host-slot')) {
    const m = p.mechanical
    const f = (host?.mechanical.features ?? []).find((x) => x.id === m.plugsInto)
    if (!host || !f) {
      // Falling through would drop the part from the assembly, which the
      // coverage assertion below turns into a build failure rather than a
      // quietly incomplete picture.
      continue
    }
    push(
      p,
      HOST_X + f.x + f.w / 2 - host.mechanical.widthMm / 2,
      FLOOR - m.heightMm / 2, // the slot is on the underside of the board
      HOST_Z + f.y + f.d / 2 - host.mechanical.depthMm / 2 - m.depthMm * 0.3,
    )
  }

  // 2. Any HAT that is a bought board rather than the generated carrier. The
  //    GNSS receiver is one, and it was silently absent from every assembly:
  //    its mount is 'hat', the hat slot was assumed to mean the carrier, and
  //    nothing checked that each part in the tier appeared somewhere. The part
  //    the entire clock discipline rests on was missing from the picture.
  let stackY = (host?.mechanical.heightMm ?? 18) - PI_BOARD_T + STANDOFF
  for (const p of by('hat')) {
    push(p, HOST_X, FLOOR + stackY + p.mechanical.heightMm / 2, HOST_Z)
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
    pos: [HOST_X, FLOOR + hatY, HOST_Z],
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
  let cx = HOST_X - cw / 2 + PAD
  let cz = HOST_Z - cd / 2 + PAD
  let rowDepth = 0
  for (const p of onCarrier) {
    const w = p.mechanical.widthMm
    const dpt = p.mechanical.depthMm
    if (cx + w > HOST_X + cw / 2 - PAD) {
      cx = HOST_X - cw / 2 + PAD
      cz += rowDepth + PAD
      rowDepth = 0
    }
    push(p, cx + w / 2, FLOOR + hatY + HAT_BOARD_T / 2 + p.mechanical.heightMm / 2, cz + dpt / 2)
    cx += w + PAD
    rowDepth = Math.max(rowDepth, dpt)
  }

  // 5. USB peripherals, packed onto the case floor to the right of the host
  //    stack, wrapping within the interior rather than marching off it. Six
  //    peripherals in one row put the far one half a metre from the host it
  //    plugs into, outside the case it ships in.
  const usbLeft = HOST_X + STACK_W / 2 + 20
  const usbRight = CASE.w / 2 - WALL_CLEAR
  let ux = usbLeft
  let uz = -CASE.d / 2 + WALL_CLEAR + 30
  let rowH = 0
  for (const p of by('usb')) {
    const w = p.mechanical.widthMm
    if (ux + w > usbRight && ux > usbLeft) {
      ux = usbLeft
      uz += rowH + 12
      rowH = 0
    }
    push(p, ux + w / 2, FLOOR + p.mechanical.heightMm / 2, uz + p.mechanical.depthMm / 2)
    ux += w + 12
    rowH = Math.max(rowH, p.mechanical.depthMm)
  }

  // 6. Cameras against the front wall, looking out through it. They were drawn
  //    floating in front of the node pointing up, which is a claim that the
  //    node has no case; a camera inside a sealed box has to be at a window.
  // Flush against the wall, not held off it. A camera that looks out through a
  // window is bolted to the panel the window is in.
  const frontZ = CASE.d / 2
  let kx = HOST_X - STACK_W / 2
  for (const p of by('csi')) {
    push(p, kx + p.mechanical.widthMm / 2, FLOOR + p.mechanical.heightMm / 2, frontZ - p.mechanical.depthMm / 2)
    kx += p.mechanical.widthMm + 14
  }

  // 7. Sensors that mount at the enclosure wall rather than on the board,
  //    because what they measure is outside it: ambient air, sky, sound.
  //    Drawing these on the carrier was not a layout bug so much as a claim
  //    about the build that was not true, since a BME688 bolted above the Pi
  //    reads the Pi's temperature and not the site's.
  //
  //    Against the inside of the back wall and standing at mid height, which is
  //    where a wall-gasketed breakout goes. They were previously placed at a
  //    fixed z with a fixed y and no relation to any wall, so on tier 3 they
  //    hung in mid-air 150 mm behind a node they are bolted to.
  // Against the wall itself. Held off it by the clearance used for floor parts,
  // these read as floating in the elevation, which is exactly what they are not.
  const backZ = -CASE.d / 2
  let wx = -CASE.w / 2 + WALL_CLEAR
  for (const p of by('enclosure-wall')) {
    push(
      p,
      wx + p.mechanical.widthMm / 2,
      FLOOR + CASE.h * 0.42,
      backZ + p.mechanical.depthMm / 2,
    )
    wx += p.mechanical.widthMm + 12
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
        // Offset from the board they hold up, not from the origin. These were
        // absolute, which is the same thing only while the stack sits at 0,0;
        // once the node moved into its case the standoffs stayed behind and
        // floated beside it, which is a worse picture than having none.
        pos: [board.pos[0] + sx, below, board.pos[2] + sz],
        cylinder: true,
        sourced: true,
        note: 'M2.5 x 11 mm, the usual HAT spacing.',
      })
    }
  }

  // 11. Cables. A node is defined by what plugs into what, and nothing in the
  //     model said so: every peripheral floated unconnected beside a board it
  //     had no visible relationship to.
  //     The port name a part declares is not always the name of a feature. The
  //     registry says `usb3a` and `usb2a`, meaning the first of a pair, while
  //     the Pi's mechanical drawing has one body covering both ports and calls
  //     it `usb3`. Requiring an exact match silently dropped the cable for
  //     every USB peripheral in the tier, which is six of them on tier 3: they
  //     sat in a group on the floor with nothing joining them to the host, and
  //     the render read as parts laid out for photography rather than a node.
  const featureAt = (fid) =>
    featureBodies.find((f) => f.id === `${host?.id}-${fid}`) ??
    featureBodies.find((f) => f.id === `${host?.id}-${fid.replace(/[a-z]$/, '')}`)

  // Where a hub ships, the peripherals reach the host through it. Drawing six
  // cables converging on one Raspberry Pi port claims a fan-out the host does
  // not have, and the hub is in the tier precisely because it does not.
  const hubBody = bodies.find((b) => {
    const p = parts.find((q) => q.id === b.id)
    return p?.keySpecs?.ports != null
  })

  const cables = []
  for (const b of bodies) {
    const part = parts.find((p) => p.id === b.id)
    const plug = part?.mechanical?.plugsInto
    if (!plug) continue
    // A card in a slot is inserted, not cabled.
    if (part.mechanical.mount === 'host-slot') continue
    const viaHub =
      hubBody && b.id !== hubBody.id && part.mechanical.mount === 'usb' ? hubBody : null
    const target = viaHub ?? featureAt(plug)
    if (!target) continue
    // From the face of each body that points at the other, not from the two
    // centres. A cable drawn centre to centre passes through both parts it
    // connects, which is the one thing a cable never does.
    const surface = (body, toward) => {
      const [bx, by, bz] = body.pos
      const [w, h, d] = body.size
      const dx = toward[0] - bx
      const dz = toward[2] - bz
      return Math.abs(dx) > Math.abs(dz)
        ? [bx + Math.sign(dx) * (w / 2), by, bz]
        : [bx, by, bz + Math.sign(dz) * (d / 2)]
    }
    cables.push({
      id: `cable-${b.id}`,
      label: `${b.label} to ${target.label}`,
      from: surface(b, target.pos),
      to: surface(target, b.pos),
      kind: part.interface === 'csi' || plug.startsWith('csi') ? 'ribbon' : 'cable',
      remote: b.remote === true,
    })
  }
  // Anything at the wall or on the mast reaches the carrier by cable too.
  const carrierBody = bodies.find((b) => b.glb)
  for (const b of bodies) {
    if (!['enclosure-wall', 'external'].includes(b.mount) || !carrierBody) continue
    const dx = carrierBody.pos[0] - b.pos[0]
    const dz = carrierBody.pos[2] - b.pos[2]
    cables.push({
      id: `cable-${b.id}`,
      label: `${b.label} to the carrier`,
      from:
        Math.abs(dx) > Math.abs(dz)
          ? [b.pos[0] + Math.sign(dx) * (b.size[0] / 2), b.pos[1], b.pos[2]]
          : [b.pos[0], b.pos[1], b.pos[2] + Math.sign(dz) * (b.size[2] / 2)],
      // A cable is only drawn when both of its ends are. Four cables ran off
      // the bottom of the frame toward a magnetometer, a geophone and a beacon
      // that the default view hides, which reads as wiring to nothing.
      remote: b.remote === true,
      to: [
        carrierBody.pos[0] + Math.sign(-dx) * (carrierBody.size[0] / 2) * 0.8,
        carrierBody.pos[1],
        carrierBody.pos[2] + Math.sign(-dz) * (carrierBody.size[2] / 2) * 0.8,
      ],
      kind: 'cable',
    })
  }

  bodies.push(...featureBodies)

  // 12. The case, as an outline the rest sits inside. Its floor is the floor
  //     everything was placed on, so the outline is centred on the interior
  //     rather than on the origin: drawn centred, the lid cut through the parts
  //     it is supposed to contain.
  if (shell) {
    const m = shell.mechanical
    const wallT = (m.widthMm - (m.interiorWidthMm ?? m.widthMm)) / 2
    bodies.push({
      id: shell.id,
      label: `${shell.vendor} ${shell.model}`,
      mount: 'enclosure',
      size: [m.widthMm, m.heightMm, m.depthMm],
      pos: [0, FLOOR - wallT + m.heightMm / 2, 0],
      wireframe: true,
      sourced: m.dimensionsSourced === true,
      note: m.note,
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
    `  ${a.tier}: ${a.counts.total} bodies, ${a.counts.onCarrier} on the carrier, ` +
      `${a.counts.usb} USB, ${a.counts.csi} CSI (${a.counts.sourced} sourced, ${a.counts.approximate} approximate)`,
  )
}
console.log(`\n${assemblies.length} node assemblies written to apps/web/public/boards/assembly.json`)
