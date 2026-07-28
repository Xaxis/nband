import {
  MAX_CLOCK_SKEW_S,
  canonicalPayload,
  fail,
  fuzzPosition,
  ok,
  registerSchema,
  serviceClient,
  verifySignature,
} from '../../../../lib/grid/ingest'
import { SCHEMA_VERSION } from '../../../../lib/schema/generated'

export const dynamic = 'force-dynamic'

/**
 * Node enrolment.
 *
 * This is the one write path that cannot use the normal node authentication,
 * because the node is not on record yet. Instead it proves two things: it
 * holds the private key matching the public key it is claiming (by signing the
 * request), and it knows the grid's enrolment secret.
 *
 * Re-enrolment by an already-registered node is allowed and is how a node
 * updates its channel list after new hardware is added, but only if it signs
 * with the key already on record. Enrolment is therefore idempotent for the
 * legitimate operator and closed to everyone else.
 */
export async function POST(request: Request) {
  const db = serviceClient()
  if (!db) return fail(503, 'grid database is not configured')

  const rawBody = await request.text()
  const pubkeyHeader = request.headers.get('x-nband-key')
  const signature = request.headers.get('x-nband-signature')
  const timestamp = request.headers.get('x-nband-timestamp')
  const nonce = request.headers.get('x-nband-nonce')

  if (!pubkeyHeader || !signature || !timestamp || !nonce) {
    return fail(401, 'missing X-Nband-Key, X-Nband-Signature, X-Nband-Timestamp, or X-Nband-Nonce')
  }

  const skew = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(skew) || skew > MAX_CLOCK_SKEW_S) {
    return fail(401, 'request timestamp outside the accepted window', { skew_s: Math.round(skew) })
  }

  const path = new URL(request.url).pathname
  if (!(await verifySignature(canonicalPayload(path, timestamp, nonce, rawBody), pubkeyHeader, signature))) {
    return fail(401, 'signature verification failed')
  }

  // Enrolment is the most damaging endpoint to replay: the secret is only
  // demanded for a new slug, so a captured enrolment could be resent without
  // one to reset a live node to 'provisioning' and wipe its channel list.
  const { error: nonceErr } = await db.from('ingest_nonces').insert({ node_key: pubkeyHeader, nonce })
  if (nonceErr) {
    if (nonceErr.code === '23505') return fail(409, 'request already used')
    return fail(500, 'could not record request nonce', nonceErr.message)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody || '{}')
  } catch {
    return fail(400, 'body is not valid JSON')
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return fail(422, 'invalid registration', parsed.error.issues.slice(0, 8))
  }
  const reg = parsed.data

  // The signature proves key possession; this stops it proving possession of
  // somebody else's key by simply naming it in the body.
  if (reg.pubkey !== pubkeyHeader) {
    return fail(400, 'pubkey in body does not match X-Nband-Key')
  }

  const { data: existing } = await db
    .from('nodes')
    .select('id, pubkey')
    .eq('slug', reg.slug)
    .maybeSingle()

  if (existing) {
    if (existing.pubkey !== reg.pubkey) {
      return fail(409, 'that slug is already enrolled with a different key')
    }
  } else {
    const expected = process.env.NBAND_ENROLLMENT_SECRET
    if (!expected) return fail(503, 'enrolment is closed: no grid enrolment secret configured')
    if (reg.enrollment_secret !== expected) {
      return fail(403, 'enrolment secret is incorrect')
    }
  }

  // Keyed on the slug rather than the public key: the key is a column on the
  // anon-readable row, so seeding the offset with it let anyone recompute the
  // offset and recover the operator's true position. The slug is public too —
  // the secrecy lives entirely in NBAND_FUZZ_SALT.
  let shown: { lat: number; lon: number }
  try {
    shown = await fuzzPosition(
      reg.site.lat,
      reg.site.lon,
      reg.site.location_precision_m,
      reg.slug,
    )
  } catch {
    // Better to refuse the enrolment than to store a position we cannot promise
    // to have obscured.
    return fail(503, 'enrolment is closed: the grid is not configured to obscure positions')
  }

  const { data: node, error: nodeErr } = await db
    .from('nodes')
    .upsert(
      {
        slug: reg.slug,
        display_name: reg.display_name,
        pubkey: reg.pubkey,
        tier: reg.tier,
        status: 'provisioning',
        lat: shown.lat,
        lon: shown.lon,
        elevation_m: reg.site.elevation_m,
        location_precision_m: reg.site.location_precision_m,
        horizon_mask: reg.site.horizon_mask,
        firmware_version: reg.firmware_version ?? null,
        schema_version: reg.schema_version ?? SCHEMA_VERSION,
        is_simulated: reg.is_simulated,
      },
      { onConflict: 'slug' },
    )
    .select('id, slug')
    .single()

  if (nodeErr) return fail(500, 'node upsert failed', nodeErr.message)

  // Replace the channel set wholesale: adding a sensor and removing one are
  // both normal, and a stale channel row would advertise a band the node no
  // longer has, which the discriminator would read as "looked and saw nothing".
  await db.from('node_channels').delete().eq('node_id', node.id)

  const { error: chErr } = await db.from('node_channels').insert(
    reg.channels.map((c) => ({
      node_id: node.id,
      channel_id: c.channel_id,
      band: c.band,
      role: c.role,
      sensor_model_id: c.part_id ?? null,
      unit: c.unit,
      sample_rate_hz: c.sample_rate_hz ?? null,
      azimuth_deg: c.azimuth_deg ?? null,
      elevation_deg: c.elevation_deg ?? null,
      fov_deg: c.fov_deg ?? null,
    })),
  )
  if (chErr) return fail(500, 'channel insert failed', chErr.message)

  return ok({
    node_id: node.id,
    slug: node.slug,
    channels: reg.channels.length,
    published_position: shown,
    location_precision_m: reg.site.location_precision_m,
    is_simulated: reg.is_simulated,
    note: reg.is_simulated
      ? 'Enrolled as a SIMULATED node. Its data is excluded from the public feed and can never reach a verdict.'
      : 'Published position is fuzzed to the precision you declared. Your exact coordinates are not stored.',
  })
}
