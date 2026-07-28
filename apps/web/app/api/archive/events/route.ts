import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  BANDS,
  CLASSIFICATION_ORDER,
  CORROBORATION_ORDER,
  SCHEMA_VERSION,
} from '../../../../lib/schema/generated'

// The enums come from the generated schema rather than being retyped here, so
// adding a band cannot leave this endpoint rejecting it. BANDS is an array of
// objects, not a map: keying off it directly produced an allowlist of "0", "1",
// "2" and rejected every real band id.
const BAND_IDS = BANDS.map((b) => b.id) as [string, ...string[]]
const CLASSIFICATIONS = [...CLASSIFICATION_ORDER] as [string, ...string[]]
const CORROBORATIONS = [...CORROBORATION_ORDER] as [string, ...string[]]

/**
 * The public archive query surface.
 *
 * Everything the platform records is public, and until now "public" meant a
 * PostgREST endpoint and a schema document: technically reachable, and not
 * usable by anyone who did not already know the table layout. This is the query
 * a person actually has — events in a window, in these bands, at least this
 * confident, from these nodes.
 *
 * It reads through the anonymous key rather than the service role, deliberately.
 * Row-level security is what keeps simulated nodes out of public results, and
 * an endpoint that bypassed it would be one refactor away from publishing
 * synthetic data as though it were measured. The service role has no business
 * on a read path.
 *
 * Two decisions are worth explaining because they are the ones that could
 * quietly mislead.
 *
 * `catalogues` defaults to `complete`. An event whose ADS-B check could not be
 * performed is not evidence of anything, and mixing it in with events that were
 * properly checked is how an outage becomes a mystery. The default view of the
 * archive therefore excludes them, and asking for them is an explicit choice
 * that comes back labelled.
 *
 * Pagination is by cursor rather than offset. The archive only grows, and an
 * offset into a growing table silently repeats and skips rows as it does.
 */

const MAX_LIMIT = 200

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  band: z.array(z.enum(BAND_IDS)).optional(),
  classification: z.array(z.enum(CLASSIFICATIONS)).optional(),
  corroboration: z.enum(CORROBORATIONS).optional(),
  node: z.array(z.string().min(1).max(64)).optional(),
  min_score: z.coerce.number().min(0).max(100).optional(),
  catalogues: z.enum(['complete', 'any']).default('complete'),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
})

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient<any, 'nband', 'nband'>(url, key, {
    db: { schema: 'nband' },
    auth: { persistSession: false },
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = {
    ...Object.fromEntries(url.searchParams),
    band: url.searchParams.getAll('band'),
    classification: url.searchParams.getAll('classification'),
    node: url.searchParams.getAll('node'),
  }
  // Zod treats an empty array as present; drop the repeatable keys that were
  // not supplied so their absence means "no filter" rather than "match none".
  for (const k of ['band', 'classification', 'node'] as const) {
    if ((raw[k] as string[]).length === 0) delete (raw as Record<string, unknown>)[k]
  }

  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid query', detail: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const q = parsed.data

  const client = db()
  if (!client) {
    return NextResponse.json({ error: 'archive is not configured' }, { status: 503 })
  }

  // t_start descending is the order everyone wants and the order the index
  // supports; the cursor is the last row's timestamp.
  let sel = client
    .from('events')
    .select(
      // fix_* rather than lat/lon: the schema names them that way because a
      // position is a solved fix rather than a property of the event, and
      // fix_error_m travels with it. A coordinate published without its error
      // bar is the same overclaim as a range that was assumed rather than
      // measured.
      'id, t_start, t_end, bands, band_count, node_count, corroboration, ' +
        'fix_lat, fix_lon, fix_altitude_m, fix_error_m, speed_mps, ' +
        'verdicts!inner(classification, anomaly_score, explanation, is_current, discriminator_version)',
    )
    .eq('verdicts.is_current', true)
    .order('t_start', { ascending: false })
    .limit(q.limit)

  if (q.from) sel = sel.gte('t_start', q.from)
  if (q.to) sel = sel.lte('t_start', q.to)
  if (q.cursor) sel = sel.lt('t_start', q.cursor)
  if (q.band) sel = sel.overlaps('bands', q.band)
  if (q.classification) sel = sel.in('verdicts.classification', q.classification)
  // Corroboration is a property of the event, not of the verdict scoring it.
  if (q.corroboration) sel = sel.eq('corroboration', q.corroboration)
  if (q.min_score != null) sel = sel.gte('verdicts.anomaly_score', q.min_score)

  const { data, error } = await sel
  if (error) {
    return NextResponse.json({ error: 'query failed', detail: error.message }, { status: 500 })
  }

  // The generated Supabase types do not describe an embedded !inner join, so
  // the row shape is asserted once here rather than fought with at each use.
  interface ArchiveRow {
    id: string
    t_start: string
    [k: string]: unknown
  }
  const rows = (data ?? []) as unknown as ArchiveRow[]

  // Catalogue completeness is a property of the event's checks rather than of
  // the event row, so it is applied after the fact against the same anon view.
  let events = rows
  let excluded = 0
  if (q.catalogues === 'complete' && rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const { data: checks } = await client
      .from('catalog_checks')
      .select('event_id, available')
      .in('event_id', ids)
    const rowsChecked = (checks ?? []) as unknown as { event_id: string; available: boolean }[]
    const incomplete = new Set(rowsChecked.filter((c) => !c.available).map((c) => c.event_id))
    events = rows.filter((r) => !incomplete.has(r.id))
    excluded = rows.length - events.length
  }

  const last = events.at(-1)

  return NextResponse.json(
    {
      schema_version: SCHEMA_VERSION,
      // Every filter that was applied, echoed back. A result set whose
      // constraints are implicit is one somebody will quote without them.
      query: {
        from: q.from ?? null,
        to: q.to ?? null,
        band: q.band ?? null,
        classification: q.classification ?? null,
        corroboration: q.corroboration ?? null,
        node: q.node ?? null,
        min_score: q.min_score ?? null,
        catalogues: q.catalogues,
        limit: q.limit,
      },
      // The denominator, always. "Six unresolved events" without "of this many
      // examined" is a number designed to mislead, and this is the endpoint
      // people will build that sentence from.
      counts: {
        returned: events.length,
        examined: rows.length,
        excluded_incomplete_catalogues: excluded,
      },
      note:
        q.catalogues === 'complete'
          ? 'Events with any unreachable catalogue check are excluded. A catalogue that was ' +
            'down is not a catalogue that found nothing. Pass catalogues=any to include them.'
          : 'Includes events whose catalogue checks could not all be performed. These are not ' +
            'evidence of anything; an unreachable feed makes ordinary traffic look unexplained.',
      next_cursor: events.length === q.limit && last?.t_start ? last.t_start : null,
      events,
    },
    {
      headers: {
        // Public, immutable-ish data: worth caching at the edge, briefly.
        'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600',
      },
    },
  )
}
