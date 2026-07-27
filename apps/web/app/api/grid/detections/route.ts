import { authenticate, detectionBatchSchema, fail, ok, splitNanos } from '../../../../lib/grid/ingest'

export const dynamic = 'force-dynamic'

/** Detection write. Each detection also opens a single-node event so the
 *  discriminator has something to score; cross-node fusion merges events later. */
export async function POST(request: Request) {
  const ctx = await authenticate(request)
  if (!ctx.ok) return ctx.response

  const parsed = detectionBatchSchema.safeParse(ctx.body)
  if (!parsed.success) return fail(422, 'invalid detection batch', parsed.error.issues.slice(0, 8))

  const created: string[] = []

  for (const d of parsed.data.detections) {
    const tStart = splitNanos(d.t_start_ns).iso
    const tEnd = splitNanos(d.t_end_ns).iso

    const { data: det, error: detErr } = await ctx.db
      .from('detections')
      .insert({
        node_id: ctx.node.id,
        t_start: tStart,
        t_end: tEnd,
        bands: d.bands,
        channel_ids: d.channel_ids,
        trigger: d.reason,
        clock: d.clock,
        azimuth_deg: d.azimuth_deg ?? null,
        elevation_deg: d.elevation_deg ?? null,
        // Range stays null unless something actually measured it. An inferred
        // range silently becomes an inferred size and an inferred speed.
        range_m: d.range_m ?? null,
        snr_db: d.peak_z ?? null,
        peak_metrics: { peak_z: d.peak_z ?? null, triggers: d.triggers ?? [] },
      })
      .select('id')
      .single()

    if (detErr) return fail(500, 'detection insert failed', detErr.message)

    const { data: ev, error: evErr } = await ctx.db
      .from('events')
      .insert({
        t_start: tStart,
        t_end: tEnd,
        node_count: 1,
        band_count: d.bands.length,
        bands: d.bands,
        corroboration: d.bands.length > 1 ? 'multi_channel' : 'single_channel',
      })
      .select('id')
      .single()

    if (evErr) return fail(500, 'event insert failed', evErr.message)

    await ctx.db.from('event_detections').insert({ event_id: ev.id, detection_id: det.id })
    created.push(det.id as string)
  }

  await ctx.db.from('nodes').update({ last_seen_at: new Date().toISOString() }).eq('id', ctx.node.id)

  return ok({ accepted: created.length, detection_ids: created })
}
