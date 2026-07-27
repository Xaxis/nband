import type { BandId, Classification, ClockQuality, NodeStatus, Tier } from '../schema/generated'

/**
 * The telemetry feed contract.
 *
 * The site ships with a mock implementation so that the interface can be
 * exercised without hardware. The point of putting the contract here rather
 * than inlining fetches in components is that swapping to a live feed is a
 * one-line change in lib/feed/index.ts and nothing in the UI moves. Every
 * method is async and every method may return an empty result: a real grid
 * has nodes that are offline and windows where nothing was recorded, and the
 * UI has to be honest about that rather than only ever rendering the happy path.
 */

export interface NodeSummary {
  id: string
  slug: string
  displayName: string
  operatorHandle: string | null
  tier: Tier
  status: NodeStatus
  lat: number | null
  lon: number | null
  locationPrecisionM: number
  clock: ClockQuality
  clockOffsetNs: number | null
  firmwareVersion: string
  bands: BandId[]
  lastSeenAt: string | null
  uptimeS: number
  powerW: number | null
}

export interface ChannelSummary {
  channelId: string
  band: BandId
  unit: string
  sampleRateHz: number | null
  label: string
  /** Nominal display range. Null lets the chart autoscale to the window. */
  displayRange: [number, number] | null
}

export interface SeriesPoint {
  /** Milliseconds since Unix epoch. Sub-millisecond fidelity lives in the
   *  archive, not in a chart that is 900 pixels wide. */
  t: number
  v: number
  /** Quality bitfield, mirrors telemetry.q in the database. Non-zero means the
   *  sample is real but compromised, and the chart dims it rather than hiding
   *  it, because silently dropping bad samples is how gaps become invisible. */
  q: number
}

export interface Series {
  channelId: string
  band: BandId
  unit: string
  label: string
  points: SeriesPoint[]
  displayRange: [number, number] | null
}

export interface EventMarker {
  id: string
  tStart: number
  tEnd: number
  bands: BandId[]
  classification: Classification
  anomalyScore: number
  corroboration: 'single_channel' | 'multi_channel' | 'multi_node'
  summary: string
}

export interface Window {
  from: number
  to: number
}

export interface TelemetryFeed {
  readonly kind: 'mock' | 'live'
  listNodes(): Promise<NodeSummary[]>
  getNode(slug: string): Promise<NodeSummary | null>
  listChannels(nodeSlug: string): Promise<ChannelSummary[]>
  getSeries(nodeSlug: string, window: Window, maxPoints?: number): Promise<Series[]>
  listEvents(nodeSlug: string, window: Window): Promise<EventMarker[]>
}

/** Quality bit meanings, mirrored from schema/sql/0001_init.sql. */
export const QUALITY_BITS = {
  CLOCK_DEGRADED: 1 << 0,
  SATURATED: 1 << 1,
  CALIBRATION_STALE: 1 << 2,
  SELF_EMISSION: 1 << 3,
  INTERPOLATED: 1 << 4,
} as const

export function qualityLabels(q: number): string[] {
  const out: string[] = []
  if (q & QUALITY_BITS.CLOCK_DEGRADED) out.push('clock degraded')
  if (q & QUALITY_BITS.SATURATED) out.push('saturated')
  if (q & QUALITY_BITS.CALIBRATION_STALE) out.push('calibration stale')
  if (q & QUALITY_BITS.SELF_EMISSION) out.push('self-emission window')
  if (q & QUALITY_BITS.INTERPOLATED) out.push('interpolated')
  return out
}
