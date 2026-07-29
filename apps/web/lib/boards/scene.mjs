/**
 * What is drawn, and what colour it is. One copy, two renderers.
 *
 * The node is drawn twice: by NodeScene with three.js in the browser, and by
 * tools/render-node.mjs with an orthographic projection at build time. They
 * read the same assembly.json, which made them look like the same picture, and
 * they were not: the filtering rules and the colour table were written out
 * twice and had already drifted once. That matters more than ordinary
 * duplication, because the projected view is how the geometry gets checked
 * without a browser, and a check that inspects something other than what ships
 * is worth nothing.
 *
 * So the rules live here and both renderers call them. Neither decides for
 * itself what is visible.
 *
 * Plain JavaScript rather than TypeScript because a build tool imports it
 * directly, the same arrangement lib/grid/fuzz.mjs uses for the same reason.
 */

/**
 * What the viewer opens on, and what the build-time projection draws.
 *
 * These have to be the same or the static view a reader without WebGL is shown
 * is a different picture from the one everyone else opens on, which is worse
 * than having no fallback: it looks like the node and is not the view.
 *
 * The case is on because a node drawn without the box it lives in is parts on a
 * bench, and the wall-mounted sensors in particular have nothing to be mounted
 * to. The mast and ground-mounted parts are off because the solar array is 1.6
 * metres wide beside an 85 mm Raspberry Pi, and including it by default scales
 * the whole view to the panel.
 */
export const DEFAULT_TOGGLES = { showCase: true, showRemote: false }

/** A body with no colour of its own is coloured by where it mounts. */
export const MOUNT_COLOUR = {
  host: '#1f6f43',
  hat: '#2f7d55',
  carrier: '#4e6b8a',
  usb: '#6b5f8a',
  csi: '#8a6b4e',
  'enclosure-wall': '#7a8a6b',
  external: '#5a5a62',
  enclosure: '#8a8a94',
  standoff: '#9aa0a8',
  feature: '#5a5a62',
  detail: '#5a5a62',
  'host-slot': '#6b7078',
}

const FALLBACK = '#5a5a62'

/**
 * Bodies to draw, given the viewer's two toggles.
 *
 * `shell` is a part that has been broken into its own detail geometry, so the
 * block that stood in for it is skipped rather than drawn inside its own parts.
 */
export function visibleBodies(assembly, { showCase = DEFAULT_TOGGLES.showCase, showRemote = DEFAULT_TOGGLES.showRemote } = {}) {
  return assembly.bodies.filter(
    (b) =>
      !b.shell &&
      (b.mount !== 'enclosure' || showCase) &&
      (!b.remote || showRemote),
  )
}

/** A cable is drawn only when both of its ends are. */
export function visibleCables(assembly, { showRemote = DEFAULT_TOGGLES.showRemote } = {}) {
  return (assembly.cables ?? []).filter((c) => !c.remote || showRemote)
}

/**
 * Band hue where the part has a band, its own colour where the registry gives
 * one, mount colour otherwise. Returned as CSS so both renderers can parse it.
 */
export function colourOf(body) {
  if (body.colour) return body.colour
  if (body.hue != null) return `hsl(${body.hue}, 45%, 52%)`
  return MOUNT_COLOUR[body.mount] ?? FALLBACK
}
