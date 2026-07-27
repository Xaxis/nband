import { authenticate, fail, heartbeatSchema, ok, splitNanos } from '../../../../lib/grid/ingest'
import { THRESHOLDS } from '../../../../lib/schema/generated'

export const dynamic = 'force-dynamic'

/** Health beacon. Also the only thing that moves a node between online,
 *  degraded, and offline. */
export async function POST(request: Request) {
  const ctx = await authenticate(request)
  if (!ctx.ok) return ctx.response

  const parsed = heartbeatSchema.safeParse(ctx.body)
  if (!parsed.success) return fail(422, 'invalid heartbeat', parsed.error.issues.slice(0, 8))
  const hb = parsed.data

  const failing = Object.values(hb.channel_health).filter((s) => s !== 'ok').length
  // A node whose clock has dropped below GNSS discipline is degraded even if
  // every sensor is healthy: without PPS it can no longer contribute geometry,
  // which is most of what a node is for.
  const status = failing > 0 || hb.clock !== 'gnss_pps' ? 'degraded' : 'online'

  const { error } = await ctx.db.from('node_heartbeats').insert({
    node_id: ctx.node.id,
    t: splitNanos(hb.t_ns).iso,
    clock: hb.clock,
    clock_offset_ns: hb.clock_offset_ns ?? null,
    uptime_s: hb.uptime_s ?? null,
    cpu_temp_c: hb.cpu_temp_c ?? null,
    disk_free_bytes: hb.disk_free_bytes ?? null,
    power_w: hb.power_w ?? null,
    battery_pct: hb.battery_pct ?? null,
    channel_health: hb.channel_health,
    firmware_version: hb.firmware_version ?? null,
  })
  if (error) return fail(500, 'heartbeat insert failed', error.message)

  await ctx.db
    .from('nodes')
    .update({
      status,
      last_seen_at: new Date().toISOString(),
      firmware_version: hb.firmware_version ?? undefined,
    })
    .eq('id', ctx.node.id)

  return ok({ status, degraded_after_s: THRESHOLDS.degradedAfterS })
}
