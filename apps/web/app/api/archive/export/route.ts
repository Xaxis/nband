import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SCHEMA_VERSION } from '../../../../lib/schema/generated'

/**
 * Bulk export, as newline-delimited JSON.
 *
 * An archive nobody can download is not an archive. The query endpoint answers
 * a question; this hands over the rows so somebody can ask their own, offline,
 * with tools this project will never have.
 *
 * NDJSON rather than Parquet or CSV, and the reasons are specific rather than
 * taste. Parquet would be better for size and for anything columnar, but it
 * needs a writer in the request path and this has to stream: the archive grows
 * without bound and the export must never depend on holding it in memory. CSV
 * cannot represent the shape of this data at all — `bands` is an array,
 * `peak_metrics` and `track` are JSON, and flattening them loses the structure
 * that makes them worth keeping. NDJSON streams, survives being cut in half,
 * and every language reads it.
 *
 * Two properties matter more than the format.
 *
 * **It is citable.** Every export carries a manifest line naming the schema
 * version, the row count, the filters, and a digest of the content. A published
 * analysis can say exactly which bytes it was computed from, and a later reader
 * can tell whether the verdicts in it have since been superseded.
 *
 * **It is honest about what it excludes.** The same anonymous key and the same
 * row-level security as everywhere else, so simulated nodes are absent — and
 * the manifest says so rather than leaving a reader to wonder why their node
 * count is lower than the grid page.
 */

const TABLES = {
  events: 'id, t_start, t_end, bands, band_count, node_count, corroboration, fix_lat, fix_lon, fix_altitude_m, fix_error_m, speed_mps, created_at',
  verdicts: 'id, event_id, classification, anomaly_score, corroboration, explanation, hypotheses, discriminator_version, schema_version, is_current, created_at',
  detections: 'id, node_id, t_start, t_end, bands, channel_ids, azimuth_deg, elevation_deg, range_m, angular_rate_dps, snr_db, created_at',
  catalog_checks: 'id, event_id, source, available, matched, detail, checked_at',
} as const

const querySchema = z.object({
  table: z.enum(Object.keys(TABLES) as [keyof typeof TABLES, ...(keyof typeof TABLES)[]]),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // A ceiling, not a page size: this streams, and the cap exists so a single
  // request cannot be used to hold a connection open indefinitely.
  max: z.coerce.number().int().min(1).max(100_000).default(50_000),
})

const PAGE = 1000

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid query',
        detail: parsed.error.flatten().fieldErrors,
        tables: Object.keys(TABLES),
      },
      { status: 400 },
    )
  }
  const q = parsed.data

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) {
    return NextResponse.json({ error: 'archive is not configured' }, { status: 503 })
  }
  // Typed loosely on purpose. Selecting from a union of four table names makes
  // the generated Supabase types expand into a union TypeScript refuses to
  // represent; the query is the same shape for every table and the column lists
  // are pinned in TABLES above, which is where the real safety is.
  const client = createClient<any, 'nband', 'nband'>(base, key, {
    db: { schema: 'nband' },
    auth: { persistSession: false },
  }) as unknown as {
    from: (t: string) => {
      select: (cols: string) => any
    }
  }

  const timeColumn = q.table === 'catalog_checks' ? 'checked_at' : q.table === 'verdicts' ? 'created_at' : 't_start'
  const encoder = new TextEncoder()
  const digest = createHash('sha256')
  let rows = 0

  const stream = new ReadableStream({
    async pull(controller) {
      // Written as a single pull rather than incrementally so the manifest can
      // carry a digest of the whole body. The page loop keeps memory flat; only
      // the hash accumulates, and that is 32 bytes.
      try {
        let cursor: string | null = null
        for (;;) {
          let sel = client
            .from(q.table)
            .select(TABLES[q.table])
            .order(timeColumn, { ascending: true })
            .limit(Math.min(PAGE, q.max - rows))
          if (q.from) sel = sel.gte(timeColumn, q.from)
          if (q.to) sel = sel.lte(timeColumn, q.to)
          if (cursor) sel = sel.gt(timeColumn, cursor)

          const { data, error } = await sel
          if (error) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ error: 'export failed', detail: error.message }) + '\n'),
            )
            break
          }
          const page = (data ?? []) as unknown as Record<string, unknown>[]
          if (page.length === 0) break

          for (const row of page) {
            const line = JSON.stringify(row) + '\n'
            digest.update(line)
            controller.enqueue(encoder.encode(line))
            rows += 1
          }
          cursor = String(page[page.length - 1][timeColumn])
          if (rows >= q.max || page.length < PAGE) break
        }

        // The manifest is the last line, because the digest is only knowable
        // once the rows have been written. A reader that wants it first can
        // read the file backwards; a reader that wants to stream does not have
        // to wait for it.
        const manifest = {
          nband_manifest: true,
          schema_version: SCHEMA_VERSION,
          table: q.table,
          rows,
          truncated: rows >= q.max,
          filters: { from: q.from ?? null, to: q.to ?? null, max: q.max },
          sha256: digest.digest('hex'),
          excludes:
            'Simulated nodes, by row-level security rather than by this query remembering to. ' +
            'Superseded verdicts are present and marked is_current=false; they are never rewritten.',
          generated_at: new Date().toISOString(),
        }
        controller.enqueue(encoder.encode(JSON.stringify(manifest) + '\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="nband-${q.table}.ndjson"`,
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    },
  })
}
