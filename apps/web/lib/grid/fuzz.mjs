/**
 * Position obscuring, kept in plain JavaScript so it can be exercised directly.
 *
 * This lives in its own .mjs for the same reason the discriminator core does:
 * tools/check-privacy.mjs imports it under bare node and measures the property
 * it claims, rather than reading the code and believing it. A guarantee stated
 * in a document and never executed is how the previous version of this function
 * stayed broken while four separate pages promised it worked.
 *
 * The salt is a parameter rather than an environment read so the check can vary
 * it. Enforcing that it exists is policy and belongs at the call boundary in
 * ingest.ts; producing the offset is arithmetic and belongs here.
 */

const M_PER_DEG_LAT = 111_320

/**
 * Offset a coordinate by a deterministic, unguessable amount within a disc of
 * the given radius.
 *
 * Deterministic and unguessable are both required and are not the same thing.
 * Deterministic, because a point that moves between requests is averaged back
 * to its true centre by anyone who watches. Unguessable, because a point whose
 * offset can be recomputed by the public is not obscured at all. It is the
 * true position written in a cipher whose key is printed beside it.
 *
 * @param {number} lat        true latitude, degrees
 * @param {number} lon        true longitude, degrees
 * @param {number} precisionM radius of the disc, metres; <= 0 publishes exactly
 * @param {string} nodeId     stable per-node identifier; may be public
 * @param {string} salt       server-only secret; must never be published
 */
export async function fuzzPosition(lat, lon, precisionM, nodeId, salt) {
  // A precision of zero is an operator explicitly publishing an exact position.
  if (!(precisionM > 0)) return { lat, lon }
  if (!salt) throw new Error('fuzzPosition requires a salt')

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`nband/fuzz/v1\n${nodeId}`)),
  )

  // Two independent 32-bit streams from the same MAC: bearing, then radius.
  const word = (o) => ((mac[o] << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) >>> 0
  const bearing = (word(0) / 2 ** 32) * 2 * Math.PI

  // sqrt, not a bare uniform. Area grows as r², so drawing the radius uniformly
  // would crowd points toward the rim. At the extreme a fixed radius, which is
  // what this used to do, puts every node on a circle of known size, and a
  // searcher who knows the declared precision gets a thin annulus instead of a
  // disc. For a 1 km precision that is the difference between about 0.14 km² and
  // the full 3.14 km².
  const radiusM = precisionM * Math.sqrt(word(4) / 2 ** 32)

  const dLat = (radiusM * Math.cos(bearing)) / M_PER_DEG_LAT
  const dLon = (radiusM * Math.sin(bearing)) / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))

  // Six decimals is about 0.1 m, so rounding is never the dominant term in an
  // offset measured in hundreds of metres, and the published points do not sit
  // on a coarse lattice.
  return {
    lat: Number((lat + dLat).toFixed(6)),
    lon: Number((lon + dLon).toFixed(6)),
  }
}

/** Metres between two coordinates, near enough at these distances. */
export function metresBetween(aLat, aLon, bLat, bLon) {
  const dLat = (bLat - aLat) * M_PER_DEG_LAT
  const dLon = (bLon - aLon) * M_PER_DEG_LAT * Math.cos((aLat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}
