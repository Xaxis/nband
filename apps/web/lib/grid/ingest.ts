import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BANDS, SCHEMA_VERSION } from '../schema/generated'

/**
 * Shared ingest machinery for the grid write path.
 *
 * Everything a node sends passes through here. Three rules apply to all of it.
 *
 * Writes use the service role and never the anon key, so the browser-visible
 * key stays read-only no matter what a page does. Row-level security enforces
 * that independently.
 *
 * Every request is signed with the node's Ed25519 key and verified against the
 * public key on record. A node that has not enrolled cannot write, and a node
 * whose key does not match what it claims cannot impersonate another.
 *
 * Payloads are validated against the same canonical schema the firmware
 * generates its types from, so a node running a different schema version is
 * rejected with a clear reason rather than silently writing malformed rows.
 */

const BAND_IDS = BANDS.map((b) => b.id) as [string, ...string[]]

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient<any, 'nband', 'nband'>(url, key, {
    db: { schema: 'nband' },
    auth: { persistSession: false },
  })
}

/** Base64url decode without padding, as the firmware emits it. */
function b64uToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(Buffer.from(b64, 'base64'))
}

export async function verifySignature(
  rawBody: string,
  pubkeyB64: string,
  signatureB64: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      b64uToBytes(pubkeyB64) as unknown as BufferSource,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      b64uToBytes(signatureB64) as unknown as BufferSource,
      new TextEncoder().encode(rawBody) as unknown as BufferSource,
    )
  } catch {
    return false
  }
}

export interface AuthedNode {
  id: string
  slug: string
  pubkey: string
}

export type IngestContext =
  | { ok: true; node: AuthedNode; body: unknown; db: NonNullable<ReturnType<typeof serviceClient>> }
  | { ok: false; response: NextResponse }

function fail(status: number, error: string, detail?: unknown) {
  return NextResponse.json({ error, detail }, { status })
}

/**
 * Authenticate a node request: verify schema version, look up the node by
 * slug, and check the signature against the key on record.
 */
export async function authenticate(request: Request): Promise<IngestContext> {
  const db = serviceClient()
  if (!db) {
    return { ok: false, response: fail(503, 'grid database is not configured') }
  }

  const slug = request.headers.get('x-nband-node')
  const pubkey = request.headers.get('x-nband-key')
  const signature = request.headers.get('x-nband-signature')
  const schema = request.headers.get('x-nband-schema')

  if (!slug || !pubkey || !signature) {
    return {
      ok: false,
      response: fail(401, 'missing X-Nband-Node, X-Nband-Key, or X-Nband-Signature'),
    }
  }

  // A node on a different schema version is writing rows whose meaning may
  // differ. Reject loudly with the version we expect rather than accepting.
  if (schema && schema !== SCHEMA_VERSION) {
    return {
      ok: false,
      response: fail(409, 'schema version mismatch', {
        node: schema,
        grid: SCHEMA_VERSION,
        hint: 'Update the node firmware, or pin the grid to the node schema.',
      }),
    }
  }

  const rawBody = await request.text()
  if (!(await verifySignature(rawBody, pubkey, signature))) {
    return { ok: false, response: fail(401, 'signature verification failed') }
  }

  const { data, error } = await db
    .from('nodes')
    .select('id, slug, pubkey')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return { ok: false, response: fail(500, 'node lookup failed', error.message) }
  if (!data) {
    return {
      ok: false,
      response: fail(404, 'node is not enrolled', { hint: 'Run: nband-node --enroll' }),
    }
  }
  if (data.pubkey !== pubkey) {
    return { ok: false, response: fail(403, 'key does not match the key on record for this node') }
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody || '{}')
  } catch {
    return { ok: false, response: fail(400, 'body is not valid JSON') }
  }

  return { ok: true, node: data as AuthedNode, body, db }
}

// --- Payload schemas -------------------------------------------------------

/**
 * Nanosecond epoch timestamps as a big integer.
 *
 * ~1.8e18 ns since 1970 is two orders of magnitude past Number.MAX_SAFE_INTEGER,
 * so a JSON number would arrive already rounded and the nanosecond precision the
 * PPS discipline buys would be lost before validation ever ran. Nodes send these
 * as decimal strings; this parses them as BigInt so the resolution survives.
 * A plain number is still accepted for hand-written requests, but only below the
 * safe-integer ceiling, because above it the value cannot be trusted.
 */
export const nanosSchema = z
  .union([z.string().regex(/^\d{1,19}$/, 'expected nanoseconds as a decimal string'), z.number()])
  .transform((v, ctx) => {
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) {
        ctx.addIssue({
          code: 'custom',
          message:
            'nanosecond timestamp exceeds the safe integer range and has already lost precision. Send it as a string.',
        })
        return z.NEVER
      }
      return BigInt(v)
    }
    return BigInt(v)
  })

/** Split a nanosecond instant into the columns the archive stores. */
export function splitNanos(ns: bigint): { iso: string; offset: number } {
  const ms = ns / 1_000_000n
  return { iso: new Date(Number(ms)).toISOString(), offset: Number(ns % 1000n) }
}

export const sampleSchema = z.object({
  channel_id: z.string().min(1).max(64),
  band: z.enum(BAND_IDS),
  t_ns: nanosSchema,
  v: z.number().finite().nullable().optional(),
  q: z.number().int().min(0).max(0xffff).default(0),
})

export const telemetryBatchSchema = z.object({
  samples: z.array(sampleSchema).min(1).max(5000),
})

export const detectionSchema = z.object({
  t_start_ns: nanosSchema,
  t_end_ns: nanosSchema,
  reason: z.enum([
    'threshold',
    'motion',
    'spectral',
    'coincidence',
    'cross_node',
    'scheduled',
    'manual',
  ]),
  clock: z.enum(['gnss_pps', 'gnss_nopps', 'ntp', 'freerun']),
  bands: z.array(z.enum(BAND_IDS)).min(1),
  channel_ids: z.array(z.string()).min(1),
  peak_z: z.number().finite().optional(),
  azimuth_deg: z.number().min(0).max(360).nullable().optional(),
  elevation_deg: z.number().min(-90).max(90).nullable().optional(),
  range_m: z.number().positive().nullable().optional(),
  triggers: z.array(z.record(z.string(), z.unknown())).optional(),
  window: z.record(z.string(), z.unknown()).optional(),
})

export const detectionBatchSchema = z.object({
  detections: z.array(detectionSchema).min(1).max(50),
})

export const heartbeatSchema = z.object({
  t_ns: nanosSchema,
  clock: z.enum(['gnss_pps', 'gnss_nopps', 'ntp', 'freerun']),
  clock_offset_ns: z.number().int().nullable().optional(),
  uptime_s: z.number().int().nonnegative().optional(),
  cpu_temp_c: z.number().finite().nullable().optional(),
  disk_free_bytes: z.number().int().nonnegative().nullable().optional(),
  power_w: z.number().finite().nullable().optional(),
  battery_pct: z.number().min(0).max(100).nullable().optional(),
  channel_health: z.record(z.string(), z.string()).default({}),
  firmware_version: z.string().max(32).optional(),
})

export const registerSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase alphanumeric with hyphens'),
  display_name: z.string().min(1).max(120),
  tier: z.enum(['t1', 't2', 't3', 'tr']),
  pubkey: z.string().min(20).max(120),
  enrollment_secret: z.string().nullable().optional(),
  firmware_version: z.string().max(32).optional(),
  schema_version: z.string().max(32).optional(),
  site: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    elevation_m: z.number().finite().default(0),
    location_precision_m: z.number().int().min(0).max(50_000).default(1000),
    horizon_mask: z.record(z.string(), z.number()).default({}),
  }),
  channels: z
    .array(
      z.object({
        channel_id: z.string().min(1).max(64),
        band: z.enum(BAND_IDS),
        unit: z.string().max(32),
        sample_rate_hz: z.number().positive().nullable().optional(),
        part_id: z.string().max(64).nullable().optional(),
        azimuth_deg: z.number().nullable().optional(),
        elevation_deg: z.number().nullable().optional(),
        fov_deg: z.number().nullable().optional(),
        role: z.enum(['detection', 'context']).default('detection'),
      }),
    )
    .min(1)
    .max(64),
})

/**
 * Fuzz a published position to the node's declared precision.
 *
 * Operators run these at home, and an exact coordinate is a home address. The
 * offset is deterministic per node so the published point does not wander
 * between requests, which would otherwise leak the true position by averaging.
 */
export function fuzzPosition(
  lat: number,
  lon: number,
  precisionM: number,
  seed: string,
): { lat: number; lon: number } {
  if (precisionM <= 0) return { lat, lon }
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = ((h >>> 0) / 4294967296) * 2 * Math.PI
  const r = precisionM / 111_320
  return {
    lat: Number((lat + r * Math.cos(a)).toFixed(4)),
    lon: Number((lon + (r * Math.sin(a)) / Math.cos((lat * Math.PI) / 180)).toFixed(4)),
  }
}

export function ok(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, schema_version: SCHEMA_VERSION, ...payload })
}

export { fail }
