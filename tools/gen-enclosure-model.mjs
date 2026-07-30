#!/usr/bin/env node
/**
 * Solid geometry for the printed enclosure, in a form a slicer will take.
 *
 * The printed case had a registry entry, a price, an aperture list and a
 * dimensioned drawing, and none of that can be printed. A plan view answers
 * where the windows go; it does not answer what to send to a printer, and the
 * registry described the part as a design that nobody has made. This closes
 * that gap by making the design an actual solid, which is also the only way to
 * find out whether it is one.
 *
 * Windows are placed by `lidLayout`, the same call the drawing makes, so the
 * printed part and the drawing cannot disagree about where a camera is looking.
 *
 * Two things making it solid found, both of which the drawing could not have
 * caught because a drawing has no thickness.
 *
 * The registry asked for a 3.4 mm seal groove in a 3 mm wall. On paper that is
 * a dashed line inset from the inside face; in a solid it removes the wall and
 * leaves two unconnected lips. A cord groove has to be wider than the cord and
 * the rim has to be wider than the groove, so the groove is cut into the lid
 * instead, where there is a whole plate to put it in. That forces the lid to
 * 5 mm to carry a 2.4 mm deep groove, and the enclosure is 2 mm taller for it.
 *
 * The lid then has to overhang the body. A groove centred on a 3 mm wall spans
 * 3.4 mm, and a lid flush with the outside of that wall has 0.2 mm of the
 * groove hanging off its own edge. The overhang is 3 mm per side, which also
 * gives a drip edge, which an enclosure that lives outdoors wanted anyway.
 *
 * What this does not model, because the registry does not state it and guessing
 * would put confident holes in a printable file: board mounting bosses, since
 * no part here records a mounting hole pattern, and cable entries, since no
 * gland is named. Both are listed in the manifest as omissions rather than
 * quietly left out, because the failure mode of a printed part is that someone
 * spends nine hours of filament before noticing.
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lidLayout } from './lib/pack.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

// The solid modeller lives in hardware/, outside the yarn workspace, for the
// reason that directory's package.json explains. Say so rather than throwing a
// module-not-found at someone who has never run the board toolchain.
const JSCAD = join(root, 'hardware/node_modules/@jscad/modeling/src/index.js')
if (!existsSync(JSCAD)) {
  console.error('  @jscad/modeling is not installed, so no model can be built.')
  console.error('  Run: make boards-deps')
  process.exit(1)
}
const { booleans, primitives, transforms, geometries, measurements } = require(JSCAD)
const { subtract, union } = booleans
const { cuboid, cylinder } = primitives
const { translate } = transforms

const hardware = JSON.parse(readFileSync(join(root, 'schema/hardware.json'), 'utf8'))
const OUT = join(root, 'apps/web/public/boards')
mkdirSync(OUT, { recursive: true })

/** Enough facets that a 34 mm bore is round to well under a nozzle width. */
const SEG = 96

const vkey = (p) => p.map((v) => Math.round(v * 1000)).join(',')

/**
 * Split every edge that another polygon's corner lands in the middle of.
 *
 * Boolean geometry that cuts a round hole through a flat face leaves corners of
 * the bore sitting partway along an edge of the face. The two surfaces meet
 * with no gap between them, so the solid is sound, but the triangles either
 * side no longer share an edge, and a mesh described that way has 1,402 edges
 * belonging to one triangle each.
 *
 * Most slicers repair that silently and print the part anyway. Shipping it is
 * still wrong: whether the file is watertight becomes a property of whoever
 * opens it, and the check that says the mesh is closed has to be relaxed into
 * one that cannot tell a T-junction from an actual hole. So the joins are made
 * properly here, and the check stays strict.
 */
function weldTJunctions(tris) {
  const EPS = 1e-4
  const verts = new Map()
  for (const t of tris) for (const v of t) verts.set(vkey(v), v)
  const all = [...verts.values()]

  const onSegment = (a, b, p) => {
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const abz = b[2] - a[2]
    const len2 = abx * abx + aby * aby + abz * abz
    if (len2 < EPS) return null
    const t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / len2
    if (t <= EPS || t >= 1 - EPS) return null // a corner, not a T
    const dx = a[0] + abx * t - p[0]
    const dy = a[1] + aby * t - p[1]
    const dz = a[2] + abz * t - p[2]
    return dx * dx + dy * dy + dz * dz < EPS * EPS ? t : null
  }

  const out = []
  for (const t of tris) {
    // The boundary of this triangle, with any vertex that lies on one of its
    // edges inserted in order. Still convex, so it still fans.
    const ring = []
    for (let i = 0; i < 3; i += 1) {
      const a = t[i]
      const b = t[(i + 1) % 3]
      ring.push(a)
      const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k]) - EPS)
      const hi = [0, 1, 2].map((k) => Math.max(a[k], b[k]) + EPS)
      const hits = []
      for (const p of all) {
        if (p[0] < lo[0] || p[0] > hi[0] || p[1] < lo[1] || p[1] > hi[1]) continue
        if (p[2] < lo[2] || p[2] > hi[2]) continue
        const u = onSegment(a, b, p)
        if (u !== null) hits.push([u, p])
      }
      hits.sort((x, y) => x[0] - y[0])
      for (const [, p] of hits) ring.push(p)
    }
    for (let i = 2; i < ring.length; i += 1) out.push([ring[0], ring[i - 1], ring[i]])
  }
  return out
}

/**
 * Binary STL.
 *
 * Written here rather than pulled in, because it is a header, a count and a
 * fixed 50-byte record per triangle, and the serializer package would be a
 * second dependency in a directory that exists to keep dependencies out of the
 * web workspace. Polygons come out of the CSG convex and planar, so a fan from
 * the first vertex triangulates them without a tessellator.
 */
function toStl(solid, header) {
  let tris = []
  for (const poly of geometries.geom3.toPolygons(solid)) {
    const v = poly.vertices
    for (let i = 2; i < v.length; i += 1) tris.push([v[0], v[i - 1], v[i]])
  }
  tris = weldTJunctions(tris)

  const buf = Buffer.alloc(84 + tris.length * 50)
  buf.write(header.slice(0, 79).padEnd(80, ' '), 0, 80, 'ascii')
  buf.writeUInt32LE(tris.length, 80)

  let o = 84
  for (const [a, b, c] of tris) {
    // Facet normal from the winding. Slicers overwhelmingly recompute this from
    // the vertex order, but a zero normal is the kind of thing a stricter one
    // rejects, so it is computed rather than left at zero.
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    const len = Math.hypot(n[0], n[1], n[2]) || 1
    buf.writeFloatLE(n[0] / len, o)
    buf.writeFloatLE(n[1] / len, o + 4)
    buf.writeFloatLE(n[2] / len, o + 8)
    o += 12
    for (const p of [a, b, c]) {
      buf.writeFloatLE(p[0], o)
      buf.writeFloatLE(p[1], o + 4)
      buf.writeFloatLE(p[2], o + 8)
      o += 12
    }
    buf.writeUInt16LE(0, o)
    o += 2
  }
  return { buffer: buf, triangles: tris.length }
}

/** A hole, as a cylinder long enough that it always breaks both surfaces. */
const bore = (d, length, [x, y, z], axis = 'z') => {
  const c = cylinder({ radius: d / 2, height: length, segments: SEG })
  const oriented = axis === 'y' ? transforms.rotateX(Math.PI / 2, c) : c
  return translate([x, y, z], oriented)
}

function build(shell) {
  const m = shell.mechanical
  const ks = shell.keySpecs ?? {}
  const iw = m.interiorWidthMm
  const id_ = m.interiorDepthMm
  const ih = m.interiorHeightMm
  const wall = ks.wallMm
  const groove = ks.sealGrooveMm
  const cord = ks.sealCordMm
  const lidT = ks.lidMm
  const overhang = ks.lidOverhangMm
  const grooveDepth = Number((cord * 0.8).toFixed(2)) // a cord seals on compression

  const bodyW = iw + wall * 2
  const bodyD = id_ + wall * 2
  const bodyH = wall + ih // floor plus the wall standing on it
  const lidW = bodyW + overhang * 2
  const lidD = bodyD + overhang * 2

  const apertures = shell.apertures ?? []
  const layout = lidLayout(shell, hardware.parts)

  // --- body ----------------------------------------------------------------
  // Origin at the centre of the floor's underside, z up. Printed floor-down,
  // which leaves no internal ledge to bridge and puts the rim, the surface the
  // seal bears on, at the top where it is not squashed against a bed.
  let body = subtract(
    translate([0, 0, bodyH / 2], cuboid({ size: [bodyW, bodyD, bodyH] })),
    translate([0, 0, wall + ih / 2 + 1], cuboid({ size: [iw, id_, ih + 2] })),
  )

  // Side fittings. The boss goes inward so the declared exterior stays the
  // exterior: an outward boss is 4 mm of depth that no drawing accounts for and
  // that the bed check would never see coming.
  const sideHoles = []
  for (const a of apertures.filter((x) => x.face.startsWith('side') && x.sizeMm)) {
    // Low on the near wall, which is the face the drawing puts side fittings on
    // and the one the registry wants pointing down or into the lee.
    const z = wall + a.sizeMm
    const bossD = a.sizeMm + 8
    body = union(
      body,
      subtract(
        translate([0, -(id_ / 2) + 2, z], transforms.rotateX(Math.PI / 2, cylinder({ radius: bossD / 2, height: 4, segments: SEG }))),
        bore(a.sizeMm, bodyD * 2, [0, 0, z], 'y'),
      ),
    )
    body = subtract(body, bore(a.sizeMm, bodyD * 2, [0, 0, z], 'y'))
    sideHoles.push({ id: a.id, sizeMm: a.sizeMm, atZ: z })
  }

  // --- lid -----------------------------------------------------------------
  // Origin at the centre of its inner face, z up into the plate. Printed
  // groove-face-down: the groove's ceiling is a 3.4 mm bridge, which is
  // nothing, and every window rebate then opens upward with no overhang at all.
  let lid = translate([0, 0, lidT / 2], cuboid({ size: [lidW, lidD, lidT] }))

  // The cord groove, centred on the wall it seals against.
  const cx = iw / 2 + wall / 2
  const cy = id_ / 2 + wall / 2
  lid = subtract(
    lid,
    subtract(
      translate([0, 0, grooveDepth / 2], cuboid({ size: [(cx + groove / 2) * 2, (cy + groove / 2) * 2, grooveDepth] })),
      translate([0, 0, grooveDepth / 2], cuboid({ size: [(cx - groove / 2) * 2, (cy - groove / 2) * 2, grooveDepth + 2] })),
    ),
  )

  // Windows, on the parts that look through them.
  const windows = []
  for (const w of layout.windows) {
    const d = w.aperture.sizeMm
    if (!d) continue
    const x = w.at.x
    const y = w.at.z // packFace calls the in-plane second axis z
    lid = subtract(lid, bore(d, lidT * 4, [x, y, lidT / 2]))
    // A rebate on the outer face so the disc sits flush and the gasket has a
    // land. The registry asks for 1.5 mm of shoulder around the aperture; the
    // disc to buy is therefore wider than the hole, which is worth stating
    // because the registry names apertures and optics are sold by diameter.
    const rebateD = d + ks.windowRebateMm * 2
    lid = subtract(
      lid,
      translate([x, y, lidT - ks.windowRebateDepthMm / 2], cylinder({ radius: rebateD / 2, height: ks.windowRebateDepthMm, segments: SEG })),
    )
    windows.push({
      id: w.aperture.id,
      part: w.part.id,
      band: w.part.band,
      apertureMm: d,
      discMm: rebateD,
      material: w.aperture.material,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    })
  }

  return { body, lid, layout, windows, sideHoles, bodyW, bodyD, bodyH, lidW, lidD, lidT, grooveDepth }
}

const shells = hardware.parts.filter(
  // A printed enclosure is one that declares a bed it has to fit on. A bought
  // case has no such constraint and no model to generate.
  (p) => p.category === 'enclosure' && p.keySpecs?.bedMm && p.mechanical?.interiorWidthMm,
)

const manifest = []
for (const shell of shells) {
  const r = build(shell)
  const stamp = `nband ${shell.id} v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? ''}`

  const parts = [
    { suffix: 'body', solid: r.body, note: 'print floor-down' },
    { suffix: 'lid', solid: r.lid, note: 'print groove-face-down' },
  ]
  const written = []
  for (const p of parts) {
    const { buffer, triangles } = toStl(p.solid, `${stamp} ${p.suffix}, generated, never printed`)
    const name = `${shell.id}-${p.suffix}.stl`
    writeFileSync(join(OUT, name), buffer)
    const bb = measurements.measureBoundingBox(p.solid)
    written.push({
      file: name,
      part: p.suffix,
      triangles,
      note: p.note,
      sizeMm: bb[1].map((v, i) => Number((v - bb[0][i]).toFixed(2))),
      volumeMm3: Math.round(measurements.measureVolume(p.solid)),
    })
    console.log(
      `  ${name}: ${triangles} triangles, ` +
        `${written[written.length - 1].sizeMm.join(' x ')} mm, ${p.note}`,
    )
  }

  const bed = String(shell.keySpecs.bedMm).match(/(\d+)\s*x\s*(\d+)/)
  manifest.push({
    id: shell.id,
    model: shell.model,
    drawnFor: r.layout.tier,
    parts: written,
    windows: r.windows,
    sideHoles: r.sideHoles,
    seal: { cordMm: shell.keySpecs.sealCordMm, grooveMm: shell.keySpecs.sealGrooveMm, grooveDepthMm: r.grooveDepth, cutInto: 'lid' },
    bedMm: bed ? [Number(bed[1]), Number(bed[2])] : null,
    // Stated, not implied. Someone opening these files should learn what is
    // missing from the files rather than from a printer.
    notModelled: [
      'Board mounting bosses. No part in the registry records a mounting hole pattern, and inventing one puts confident holes in a file people print.',
      'Cable entries. The registry names no gland, and a hole sized for the wrong one is worse than no hole.',
      'The windows themselves, the seal cord and the vent, none of which are printed.',
    ],
    status: shell.status,
    neverPrinted: true,
  })

  const filament = written.reduce((s, p) => s + p.volumeMm3, 0) * 1.24e-3
  console.log(
    `  ${shell.id}: ${r.windows.length} window(s) for ${r.layout.tier}, ` +
      `${r.sideHoles.length} side fitting(s), about ${Math.round(filament)} g of ASA`,
  )
}

writeFileSync(join(OUT, 'enclosure-models.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`\n${shells.length} printable enclosure(s) written to apps/web/public/boards/`)
