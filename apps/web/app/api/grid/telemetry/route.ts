import { NextResponse } from 'next/server'
import { authenticate, fail, ok, splitNanos, telemetryBatchSchema } from '../../../../lib/grid/ingest'

export const dynamic = 'force-dynamic'

/** Bulk telemetry write. Nodes batch these and retry on failure, so the
 *  handler must be safe to call twice with the same payload. */
export async function POST(request: Request) {
  const ctx = await authenticate(request)
  if (!ctx.ok) return ctx.response

  const parsed = telemetryBatchSchema.safeParse(ctx.body)
  if (!parsed.success) return fail(422, 'invalid telemetry batch', parsed.error.issues.slice(0, 8))

  const { samples } = parsed.data

  // A node coming back from a long outage delivers data spanning months.
  // Provision every partition the batch touches before inserting, or those
  // rows silently land in the default partition and slow every later query.
  const months = new Set(samples.map((s) => splitNanos(s.t_ns).iso.slice(0, 7)))

  // A batch legitimately spans a few months when a node backfills after an
  // outage. Spanning dozens means either a corrupt clock or a deliberate
  // attempt to make the schema owner run CREATE TABLE thousands of times and
  // permanently bloat the partition catalogue.
  const MAX_MONTHS_PER_BATCH = 6
  if (months.size > MAX_MONTHS_PER_BATCH) {
    return fail(422, 'batch spans too many months', {
      months: months.size,
      max: MAX_MONTHS_PER_BATCH,
      hint: 'Split the backfill, or check the node clock: this usually means bad timestamps.',
    })
  }

  // Reject timestamps outside a plausible window before they become partitions.
  const nowMs = Date.now()
  const MIN_MS = Date.UTC(2024, 0, 1)
  const MAX_MS = nowMs + 86_400_000
  for (const s of samples) {
    const ms = Number(s.t_ns / 1_000_000n)
    if (ms < MIN_MS || ms > MAX_MS) {
      return fail(422, 'sample timestamp outside the plausible window', {
        t: new Date(ms).toISOString(),
        hint: 'A node with a free-running clock can emit 1970 or far-future stamps.',
      })
    }
  }

  for (const m of months) {
    const { error } = await ctx.db.rpc('ensure_telemetry_partition', {
      for_time: `${m}-01T00:00:00Z`,
    })
    // Never swallow this. When it silently failed, every row landed in the
    // default partition and nothing looked wrong until someone read pg_tables.
    // A partition that cannot be created is a real fault, not a nicety.
    if (error) {
      return fail(500, 'could not provision telemetry partition', {
        month: m,
        detail: error.message,
      })
    }
  }

  const rows = samples.map((s) => {
    const { iso, offset } = splitNanos(s.t_ns)
    return {
      node_id: ctx.node.id,
      channel_id: s.channel_id,
      t: iso,
      // Preserve the sub-microsecond remainder that timestamptz cannot hold.
      t_ns_offset: offset,
      v: s.v ?? null,
      q: s.q,
    }
  })

  const { error } = await ctx.db.from('telemetry').insert(rows)
  if (error) return fail(500, 'telemetry insert failed', error.message)

  await ctx.db.from('nodes').update({ last_seen_at: new Date().toISOString() }).eq('id', ctx.node.id)

  return ok({ accepted: rows.length, partitions: [...months] })
}
