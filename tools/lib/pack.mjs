/**
 * Where things sit inside an enclosure. One rule, used by everything that
 * needs to know.
 *
 * The node assembly places parts against the case interior, and an enclosure
 * drawing has to cut its windows exactly where those parts ended up. Written
 * twice, the two agree until one of them is edited, and then the drawing shows
 * a window somewhere the camera is not. So the packing rule lives here and both
 * call it.
 *
 * It is deliberately simple: left to right along the face, wrapping when the
 * row is full. Nothing here is an optimiser. A real build packs by hand around
 * cable runs, and the value of this is that it is reproducible and states its
 * own clearances rather than that it is optimal.
 */

/** Clearance to the wall for fingers, foam and cable bend. */
export const WALL_CLEAR = 8

/** Gap between neighbouring parts on a face. */
export const PART_GAP = 12

/**
 * Lay parts out across a face of the given width and depth.
 *
 * Returns one entry per part with its centre in enclosure coordinates, where
 * the origin is the middle of the face and x grows right, z grows toward the
 * front.
 */
export function packFace(parts, { width, depth, gap = PART_GAP, clear = WALL_CLEAR } = {}) {
  const left = -width / 2 + clear
  const right = width / 2 - clear
  const out = []
  let x = left
  let z = -depth / 2 + clear
  let rowDepth = 0

  for (const p of parts) {
    const w = p.widthMm
    const d = p.depthMm
    if (x + w > right && x > left) {
      x = left
      z += rowDepth + gap
      rowDepth = 0
    }
    out.push({ id: p.id, x: x + w / 2, z: z + d / 2, widthMm: w, depthMm: d, heightMm: p.heightMm })
    x += w + gap
    rowDepth = Math.max(rowDepth, d)
  }
  return out
}

/**
 * Which parts read through the lid, and where each one ends up.
 *
 * The drawing and the printable model both have to cut their windows in the
 * same places, and they were about to answer that question in two files. Same
 * failure the packing rule itself was pulled out to fix, one level up: a
 * drawing and an STL that disagree send someone to a printer with a hole where
 * the camera is not, and the STL is the one that gets printed.
 *
 * The tier is the one needing the most apertures rather than the first listed.
 * The Pelican ships with tiers 2 and 3, and choosing tier 2 left out the
 * short-wave window that only tier 3 needs.
 */
export function lidLayout(shell, parts, { gap = PART_GAP, clear = WALL_CLEAR } = {}) {
  const apertures = shell.apertures ?? []
  const lidBands = new Set(apertures.filter((a) => a.face === 'lid').flatMap((a) => a.bands ?? []))
  const wantsLid = (p, tier) =>
    p.tiers?.includes(tier) &&
    p.mechanical &&
    p.band &&
    lidBands.has(p.band) &&
    p.mechanical.mount !== 'external'

  // An enclosure that ships with no tier is still sized against one, and the
  // registry says which: the printed case is sized from the tier 1 parts.
  const candidateTiers = shell.tiers?.length ? shell.tiers : ['t1']
  const tier = candidateTiers.reduce((best, t) =>
    parts.filter((p) => wantsLid(p, t)).length > parts.filter((p) => wantsLid(p, best)).length
      ? t
      : best,
  )

  const lidParts = parts.filter((p) => wantsLid(p, tier))
  const placed = packFace(
    lidParts.map((p) => ({ id: p.id, ...p.mechanical })),
    { width: shell.mechanical.interiorWidthMm, depth: shell.mechanical.interiorDepthMm, gap, clear },
  )

  return {
    tier,
    parts: lidParts,
    placed,
    windows: lidParts
      .map((p) => ({
        part: p,
        at: placed.find((q) => q.id === p.id),
        aperture: apertures.find((a) => (a.bands ?? []).includes(p.band)),
      }))
      .filter((w) => w.aperture && w.at),
  }
}
