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
