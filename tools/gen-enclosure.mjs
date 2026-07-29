#!/usr/bin/env node
/**
 * A dimensioned drawing of the enclosure, generated from the aperture list.
 *
 * The aperture table says a thermal channel needs a 25 mm germanium window and
 * that the cameras need one 34 mm window each. It does not say where, and
 * "where" is most of the work: a window in the wrong place is a hole, and the
 * sensor behind it is looking at the inside of a lid.
 *
 * So this places each window at the part that looks through it, using the same
 * packing rule the node assembly uses to put that part there. The two cannot
 * disagree, because there is one rule and both call it.
 *
 * What comes out is a plan of the lid, a plan of the body and a section, with
 * every figure that decides whether the thing works: wall thickness, the gasket
 * groove, the clearance between the stack rising from the floor and the parts
 * hanging from the lid.
 *
 * It is a drawing, not a model. Nothing here has been printed, and the numbers
 * are derived from a registry rather than measured off a part.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packFace, PART_GAP, WALL_CLEAR } from './lib/pack.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hardware = JSON.parse(readFileSync(join(root, 'schema/hardware.json'), 'utf8'))
const bands = JSON.parse(readFileSync(join(root, 'schema/bands.json'), 'utf8'))
const OUT = join(root, 'apps/web/public/boards')
mkdirSync(OUT, { recursive: true })

const INK = '#20242b'
const INK2 = '#5a616c'
const INK3 = '#8b929c'
const LINE = '#c3c9d2'
const RULE = '#dfe3e9'
const SURFACE = '#f7f6f3'
const CUT = '#b4453c'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.mono === false ? 'system-ui, sans-serif' : 'ui-monospace, SFMono-Regular, Menlo, monospace'}" ` +
  `font-size="${o.size ?? 9}" fill="${o.fill ?? INK2}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}` +
  `${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`

/** A dimension line with the figure on it, because a drawing without one is a picture. */
function dim(x1, y1, x2, y2, label, { off = 14, side = 1 } = {}) {
  const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1)
  const ox = horizontal ? 0 : off * side
  const oy = horizontal ? off * side : 0
  const [ax, ay, bx, by] = [x1 + ox, y1 + oy, x2 + ox, y2 + oy]
  return (
    `<path d="M ${x1} ${y1} L ${ax} ${ay} M ${x2} ${y2} L ${bx} ${by}" stroke="${RULE}" stroke-width="0.6"/>` +
    `<path d="M ${ax} ${ay} L ${bx} ${by}" stroke="${INK3}" stroke-width="0.6" ` +
    `marker-start="url(#d)" marker-end="url(#d)"/>` +
    t((ax + bx) / 2, (ay + by) / 2 + (horizontal ? -3 : 0), label, {
      size: 8.5,
      anchor: 'middle',
      fill: INK2,
    })
  )
}

function drawFor(shell) {
  const m = shell.mechanical
  const iw = m.interiorWidthMm
  const id_ = m.interiorDepthMm
  const ih = m.interiorHeightMm
  const wall = (m.widthMm - iw) / 2
  const apertures = shell.apertures ?? []

  // Which parts look through the lid, taken from the same registry the node
  // assembly reads, so the windows land on the parts rather than near them.
  const lidBands = new Set(apertures.filter((a) => a.face === 'lid').flatMap((a) => a.bands ?? []))
  // The tier that needs the most holes, not the first one listed. The Pelican
  // ships with tiers 2 and 3, and drawing it for tier 2 left out the short-wave
  // window that only tier 3 needs: a builder cutting to that drawing would have
  // to open the lid again for the most expensive sensor in the build.
  const wantsLid = (p, tier) =>
    p.tiers?.includes(tier) &&
    p.mechanical &&
    p.band &&
    lidBands.has(p.band) &&
    p.mechanical.mount !== 'external'
  const candidateTiers = shell.tiers?.length ? shell.tiers : ['t1']
  const tierOf = candidateTiers.reduce((best, tier) =>
    hardware.parts.filter((p) => wantsLid(p, tier)).length >
    hardware.parts.filter((p) => wantsLid(p, best)).length
      ? tier
      : best,
  )
  const lidParts = hardware.parts.filter((p) => wantsLid(p, tierOf))
  const placed = packFace(
    lidParts.map((p) => ({ id: p.id, ...p.mechanical })),
    { width: iw, depth: id_, gap: PART_GAP, clear: WALL_CLEAR },
  )
  const apertureFor = (band) => apertures.find((a) => (a.bands ?? []).includes(band))

  const S = 1.5 // px per mm
  const PAD = 54
  const planW = iw * S
  const planD = id_ * S
  const gapX = 96
  const W = PAD * 2 + planW * 2 + gapX
  const sectionH = ih * S + 60
  const H = PAD + 26 + planD + 46 + sectionH + PAD + 18

  const g = []
  const mm = (v) => (v * S).toFixed(1)

  // --- title -------------------------------------------------------------
  g.push(t(PAD, PAD - 26, `${shell.vendor} ${shell.model}`, { size: 14, weight: 600, fill: INK, mono: false }))
  g.push(
    t(
      PAD,
      PAD - 11,
      `Interior ${iw} x ${id_} x ${ih} mm, ${wall} mm wall. Drawn for ${tierOf}, the tier that ` +
        `needs the most apertures. Derived from the registry, never built.`,
      {
      size: 9.5,
      fill: INK2,
      mono: false,
    }),
  )
  g.push(t(W - PAD, PAD - 26, 'GENERATED DRAWING', { size: 9, fill: CUT, anchor: 'end' }))

  // --- lid plan ----------------------------------------------------------
  const lx = PAD
  const ly = PAD + 26
  g.push(t(lx, ly - 8, 'LID, seen from inside', { size: 9.5, fill: INK3 }))
  g.push(
    `<rect x="${lx - wall * S}" y="${ly - wall * S}" width="${planW + wall * 2 * S}" height="${planD + wall * 2 * S}" ` +
      `rx="4" fill="none" stroke="${LINE}" stroke-width="1"/>`,
  )
  g.push(`<rect x="${lx}" y="${ly}" width="${planW}" height="${planD}" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>`)
  // gasket groove, inset half the wall
  const gi = (wall / 2) * S
  g.push(
    `<rect x="${lx - gi}" y="${ly - gi}" width="${planW + gi * 2}" height="${planD + gi * 2}" ` +
      `fill="none" stroke="${INK3}" stroke-width="1.6" stroke-dasharray="5 3"/>`,
  )
  g.push(t(lx, ly + planD + gi + 12, 'gasket groove, 3 mm cord', { size: 8, fill: INK3 }))

  const captioned = new Set()
  for (const p of lidParts) {
    const at = placed.find((q) => q.id === p.id)
    const a = apertureFor(p.band)
    if (!a) continue
    const cx = lx + (at.x + iw / 2) * S
    const cy = ly + (at.z + id_ / 2) * S
    // The part outline, faint, and the hole in it, cut.
    g.push(
      `<rect x="${cx - (at.widthMm / 2) * S}" y="${cy - (at.depthMm / 2) * S}" ` +
        `width="${mm(at.widthMm)}" height="${mm(at.depthMm)}" fill="none" stroke="${RULE}" stroke-width="0.8"/>`,
    )
    const r = ((a.sizeMm ?? 20) / 2) * S
    g.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CUT}" stroke-width="1.6"/>`)
    g.push(
      `<path d="M ${cx - r} ${cy} L ${cx + r} ${cy} M ${cx} ${cy - r} L ${cx} ${cy + r}" ` +
        `stroke="${CUT}" stroke-width="0.5" stroke-dasharray="3 2"/>`,
    )
    // Two windows of the same kind sit close enough that their captions ran
    // into each other, so the material is named once per kind and the size sits
    // on every hole.
    g.push(t(cx, cy + r + 11, `${a.sizeMm} mm`, { size: 8.5, anchor: 'middle', fill: CUT }))
    if (!captioned.has(a.id)) {
      captioned.add(a.id)
      const capX = Math.max(lx + 52, cx)
      g.push(t(capX, cy + r + 21, a.material.split(',')[0], { size: 8, anchor: 'middle', fill: INK3 }))
    }
  }
  g.push(dim(lx, ly + planD, lx + planW, ly + planD, `${iw}`, { off: 22 }))
  g.push(dim(lx + planW, ly, lx + planW, ly + planD, `${id_}`, { off: 26 }))

  // --- body plan ---------------------------------------------------------
  const bx = PAD + planW + gapX
  g.push(t(bx, ly - 8, 'BODY, seen from above', { size: 9.5, fill: INK3 }))
  g.push(
    `<rect x="${bx - wall * S}" y="${ly - wall * S}" width="${planW + wall * 2 * S}" height="${planD + wall * 2 * S}" ` +
      `rx="4" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>`,
  )
  g.push(`<rect x="${bx}" y="${ly}" width="${planW}" height="${planD}" fill="${SURFACE}" stroke="${LINE}" stroke-width="1"/>`)
  g.push(t(bx + planW + wall * S, ly - wall * S - 8, `${wall} mm wall`, { size: 8, anchor: 'end', fill: INK3 }))

  // The parts that stand on the floor, for scale and for the clearance figure.
  const floorParts = hardware.parts.filter(
    (p) =>
      p.tiers?.includes(tierOf) &&
      p.mechanical &&
      !lidBands.has(p.band ?? '') &&
      ['host', 'usb'].includes(p.mechanical.mount),
  )
  const floorPlaced = packFace(
    floorParts.map((p) => ({ id: p.id, ...p.mechanical })),
    { width: iw, depth: id_, gap: PART_GAP, clear: WALL_CLEAR },
  )
  for (const at of floorPlaced) {
    g.push(
      `<rect x="${bx + (at.x + iw / 2 - at.widthMm / 2) * S}" y="${ly + (at.z + id_ / 2 - at.depthMm / 2) * S}" ` +
        `width="${mm(at.widthMm)}" height="${mm(at.depthMm)}" fill="#ffffff" stroke="${LINE}" stroke-width="0.8"/>`,
    )
  }

  // Side-wall fittings, drawn on the near edge because that is where they go.
  const side = apertures.filter((a) => a.face.startsWith('side'))
  let sx = bx + 24
  for (const a of side) {
    const yy = ly + planD + wall * S
    g.push(`<circle cx="${sx}" cy="${yy}" r="${((a.sizeMm ?? 12) / 2) * S}" fill="none" stroke="${CUT}" stroke-width="1.6"/>`)
    g.push(t(sx, yy + 18, `${a.id.replace(/^(vent|port)-/, '')} ${a.sizeMm} mm`, { size: 8, anchor: 'middle', fill: CUT }))
    sx += 76
  }
  g.push(dim(bx, ly + planD + 30, bx + planW, ly + planD + 30, `${m.widthMm} outside`, { off: 14 }))

  // --- section -----------------------------------------------------------
  const sy = ly + planD + 96
  g.push(t(PAD, sy - 10, 'SECTION, showing the clearance that sets the height', { size: 9.5, fill: INK3 }))
  const secY = sy + 12
  const secH = ih * S
  g.push(
    `<rect x="${PAD}" y="${secY}" width="${planW}" height="${secH}" fill="#ffffff" stroke="${LINE}" stroke-width="1"/>`,
  )
  // walls and floor, in section hatch weight
  g.push(
    `<path d="M ${PAD - wall * S} ${secY - wall * S} h ${planW + wall * 2 * S} v ${secH + wall * 2 * S} h ${-(planW + wall * 2 * S)} z ` +
      `M ${PAD} ${secY} h ${planW} v ${secH} h ${-planW} z" fill="${INK3}" fill-rule="evenodd" opacity="0.35"/>`,
  )

  const stackTop = 32 // Pi 1.6 + standoff 11 + HAT 1.6 + standoff 11 + carrier 1.6 + a breakout
  const tallestLid = Math.max(0, ...lidParts.map((p) => p.mechanical.heightMm))
  g.push(
    `<rect x="${PAD + 20}" y="${secY + secH - stackTop * S}" width="${mm(90)}" height="${mm(stackTop)}" ` +
      `fill="#1f5f3a" opacity="0.55" stroke="${INK}" stroke-width="0.6"/>`,
  )
  g.push(t(PAD + 24, secY + secH - stackTop * S - 5, 'board stack', { size: 8, fill: INK2 }))
  g.push(
    `<rect x="${PAD + 150}" y="${secY}" width="${mm(40)}" height="${mm(tallestLid)}" ` +
      `fill="#2a2d33" opacity="0.55" stroke="${INK}" stroke-width="0.6"/>`,
  )
  g.push(t(PAD + 154, secY + tallestLid * S + 11, 'tallest lid part', { size: 8, fill: INK2 }))
  g.push(dim(PAD + planW, secY, PAD + planW, secY + secH, `${ih}`, { off: 26 }))
  // Clear of both blocks rather than between them, which is where the label
  // landed on top of the caption underneath it.
  const clearX = PAD + planW - 46
  g.push(
    dim(clearX, secY + tallestLid * S, clearX, secY + secH - stackTop * S, `${ih - tallestLid - stackTop} clear`, {
      off: 0,
    }),
  )

  const notes = [
    `Wall ${wall} mm. Groove for a ${m.sealGrooveMm ?? 3} mm cord, inset ${wall / 2} mm from the inside face.`,
    `Windows are placed on the parts that look through them, by the same packing rule the node model uses.`,
    `Clearance between the stack and the lowest lid part is ${ih - tallestLid - stackTop} mm at this interior height.`,
    `Nothing here has been printed. Treat every figure as derived rather than measured.`,
  ]
  notes.forEach((n, i) => g.push(t(PAD, secY + secH + 34 + i * 13, n, { size: 8.5, fill: INK2 })))

  return {
    id: shell.id,
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 40}" width="${W}" height="${H + 40}" ` +
      `role="img" aria-label="Dimensioned drawing of the ${esc(shell.model)}: lid plan with ${lidParts.length} windows, ` +
      `body plan, and a section showing the interior height">` +
      `<title>${esc(shell.model)}</title>` +
      `<defs><marker id="d" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto">` +
      `<path d="M 1 1 L 7 4 L 1 7 z" fill="${INK3}"/></marker></defs>` +
      `<rect width="${W}" height="${H + 40}" fill="${SURFACE}"/>` +
      g.join('') +
      `</svg>`,
    windows: lidParts.length,
    clearance: ih - tallestLid - stackTop,
  }
}

const shells = hardware.parts.filter(
  (p) => p.category === 'enclosure' && (p.apertures ?? []).length > 0 && p.mechanical?.interiorWidthMm,
)
for (const shell of shells) {
  const r = drawFor(shell)
  writeFileSync(join(OUT, `${shell.id}.svg`), r.svg)
  console.log(`  ${shell.id}.svg: ${r.windows} lid window(s), ${r.clearance} mm clear inside`)
}
console.log(`\n${shells.length} enclosure drawing(s) written to apps/web/public/boards/`)
