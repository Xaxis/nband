import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BandId } from '../schema/generated'
import type {
  ChannelSummary,
  EventMarker,
  NodeSummary,
  Series,
  TelemetryFeed,
  Window,
} from './types'

/**
 * Live feed against the grid database.
 *
 * This is the implementation the mock is shaped to imitate. It reads through
 * the anon key, which is read-only by row-level-security policy: every write
 * path in BIFROST goes through the ingest API using the service role, so a
 * compromised browser key cannot forge telemetry.
 *
 * It is wired but unexercised until nodes are actually reporting. Selecting it
 * is a matter of setting NEXT_PUBLIC_FEED_SOURCE=live; nothing in the UI
 * changes, because the UI only ever sees the TelemetryFeed interface.
 */
export class SupabaseFeed implements TelemetryFeed {
  readonly kind = 'live' as const
  // Grid tables live in the `bifrost` schema rather than `public`, so the
  // client is parameterised on that schema name.
  private db: SupabaseClient<any, 'bifrost', 'bifrost'>

  constructor(url: string, anonKey: string) {
    this.db = createClient<any, 'bifrost', 'bifrost'>(url, anonKey, {
      db: { schema: 'bifrost' },
      auth: { persistSession: false },
    })
  }

  async listNodes(): Promise<NodeSummary[]> {
    const { data, error } = await this.db
      .from('nodes')
      .select(
        'id, slug, display_name, operator_handle, tier, status, lat, lon, location_precision_m, firmware_version, last_seen_at, node_channels(band)',
      )
      .eq('is_public', true)
      .order('last_seen_at', { ascending: false, nullsFirst: false })

    if (error) throw new Error(`listNodes: ${error.message}`)

    const rows = data ?? []
    const heartbeats = await this.latestHeartbeats(rows.map((r) => r.id as string))

    return rows.map((r) => {
      const hb = heartbeats.get(r.id as string)
      const bands = Array.from(
        new Set(((r.node_channels ?? []) as { band: BandId }[]).map((c) => c.band)),
      )
      return {
        id: r.id as string,
        slug: r.slug as string,
        displayName: r.display_name as string,
        operatorHandle: (r.operator_handle as string) ?? null,
        tier: r.tier as NodeSummary['tier'],
        status: r.status as NodeSummary['status'],
        lat: (r.lat as number) ?? null,
        lon: (r.lon as number) ?? null,
        locationPrecisionM: (r.location_precision_m as number) ?? 1000,
        clock: hb?.clock ?? 'freerun',
        clockOffsetNs: hb?.clockOffsetNs ?? null,
        firmwareVersion: (r.firmware_version as string) ?? 'unknown',
        bands,
        lastSeenAt: (r.last_seen_at as string) ?? null,
        uptimeS: hb?.uptimeS ?? 0,
        powerW: hb?.powerW ?? null,
      }
    })
  }

  private async latestHeartbeats(nodeIds: string[]) {
    const map = new Map<
      string,
      { clock: NodeSummary['clock']; clockOffsetNs: number | null; uptimeS: number; powerW: number | null }
    >()
    if (nodeIds.length === 0) return map

    const { data } = await this.db
      .from('node_heartbeats')
      .select('node_id, t, clock, clock_offset_ns, uptime_s, power_w')
      .in('node_id', nodeIds)
      .order('t', { ascending: false })
      .limit(nodeIds.length * 4)

    for (const row of data ?? []) {
      const id = row.node_id as string
      if (map.has(id)) continue // ordered desc, so the first is the latest
      map.set(id, {
        clock: row.clock as NodeSummary['clock'],
        clockOffsetNs: (row.clock_offset_ns as number) ?? null,
        uptimeS: (row.uptime_s as number) ?? 0,
        powerW: (row.power_w as number) ?? null,
      })
    }
    return map
  }

  async getNode(slug: string): Promise<NodeSummary | null> {
    const nodes = await this.listNodes()
    return nodes.find((n) => n.slug === slug) ?? null
  }

  async listChannels(nodeSlug: string): Promise<ChannelSummary[]> {
    const node = await this.getNode(nodeSlug)
    if (!node) return []

    const { data, error } = await this.db
      .from('node_channels')
      .select('channel_id, band, unit, sample_rate_hz, sensor_model_id')
      .eq('node_id', node.id)
      .eq('enabled', true)

    if (error) throw new Error(`listChannels: ${error.message}`)

    return (data ?? []).map((c) => ({
      channelId: c.channel_id as string,
      band: c.band as BandId,
      unit: c.unit as string,
      sampleRateHz: (c.sample_rate_hz as number) ?? null,
      label: c.channel_id as string,
      displayRange: null,
    }))
  }

  async getSeries(nodeSlug: string, window: Window, maxPoints = 320): Promise<Series[]> {
    const node = await this.getNode(nodeSlug)
    if (!node) return []
    const channels = await this.listChannels(nodeSlug)

    const { data, error } = await this.db
      .from('telemetry')
      .select('channel_id, t, v, q')
      .eq('node_id', node.id)
      .gte('t', new Date(window.from).toISOString())
      .lte('t', new Date(window.to).toISOString())
      .order('t', { ascending: true })
      .limit(maxPoints * Math.max(channels.length, 1))

    if (error) throw new Error(`getSeries: ${error.message}`)

    const byChannel = new Map<string, Series>()
    for (const c of channels) {
      byChannel.set(c.channelId, {
        channelId: c.channelId,
        band: c.band,
        unit: c.unit,
        label: c.label,
        displayRange: c.displayRange,
        points: [],
      })
    }
    for (const row of data ?? []) {
      const s = byChannel.get(row.channel_id as string)
      if (!s) continue
      s.points.push({
        t: new Date(row.t as string).getTime(),
        v: (row.v as number) ?? 0,
        q: (row.q as number) ?? 0,
      })
    }
    return Array.from(byChannel.values()).filter((s) => s.points.length > 0)
  }

  async listEvents(nodeSlug: string, window: Window): Promise<EventMarker[]> {
    const node = await this.getNode(nodeSlug)
    if (!node) return []

    const { data, error } = await this.db
      .from('detections')
      .select(
        'id, t_start, t_end, bands, event_detections(event_id, events(id, corroboration, verdicts(classification, anomaly_score, explanation, is_current)))',
      )
      .eq('node_id', node.id)
      .gte('t_start', new Date(window.from).toISOString())
      .lte('t_start', new Date(window.to).toISOString())
      .order('t_start', { ascending: true })
      .limit(200)

    if (error) throw new Error(`listEvents: ${error.message}`)

    const out: EventMarker[] = []
    for (const d of data ?? []) {
      const link = (d.event_detections ?? [])[0] as
        | { events?: { corroboration?: string; verdicts?: Array<Record<string, unknown>> } }
        | undefined
      const verdict = (link?.events?.verdicts ?? []).find((v) => v.is_current) as
        | { classification: EventMarker['classification']; anomaly_score: number; explanation: string }
        | undefined

      out.push({
        id: d.id as string,
        tStart: new Date(d.t_start as string).getTime(),
        tEnd: new Date(d.t_end as string).getTime(),
        bands: (d.bands ?? []) as BandId[],
        classification: verdict?.classification ?? 'ambiguous',
        anomalyScore: verdict?.anomaly_score ?? 0,
        corroboration:
          (link?.events?.corroboration as EventMarker['corroboration']) ?? 'single_channel',
        summary: verdict?.explanation ?? 'Awaiting discriminator pass.',
      })
    }
    return out
  }
}
