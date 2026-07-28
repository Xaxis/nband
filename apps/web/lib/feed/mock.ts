import {
  QUALITY_BITS,
  type ChannelSummary,
  type EventMarker,
  type NodeSummary,
  type Series,
  type SeriesPoint,
  type TelemetryFeed,
  type Window,
} from './types'

/**
 * Deterministic synthetic feed.
 *
 * Everything is derived from a hash of (nodeSlug, channelId, timestamp bucket),
 * so the same window always renders the same data. That matters for two
 * reasons: server and client agree without a hydration dance, and a screenshot
 * of a bug is reproducible.
 *
 * The signals are shaped to behave the way the real instruments do rather than
 * being decorative noise. Ultraviolet and visible follow a solar curve and go
 * quiet at night. The thermal channel drifts with ambient temperature and shows
 * the periodic flat-field shutter as a marked-invalid notch. Gamma is Poisson
 * counting noise, not a smooth wave. The radio floor is flat with occasional
 * impulsive events. Getting this right is what makes the chart layer worth
 * testing before real hardware exists.
 */

function hash(...parts: (string | number)[]): number {
  let h = 2166136261
  const s = parts.join('')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** Box-Muller from two hashed uniforms. */
function gauss(seed: string, t: number): number {
  const u1 = Math.max(hash(seed, t, 'a'), 1e-9)
  const u2 = hash(seed, t, 'b')
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/** Fraction of the day, 0 at midnight UTC. */
function dayPhase(t: number): number {
  return ((t % 86_400_000) + 86_400_000) % 86_400_000 / 86_400_000
}

/** Crude solar elevation proxy, -1 (night) to 1 (noon). */
function solar(t: number, lon: number): number {
  const local = dayPhase(t + (lon / 360) * 86_400_000)
  return Math.sin((local - 0.25) * 2 * Math.PI)
}

const NODES: NodeSummary[] = [
  {
    id: '8f1e2a10-0000-4000-8000-000000000001',
    slug: 'kp-01-sonoran',
    displayName: 'KP-01 Sonoran',
    operatorHandle: 'xaxis',
    tier: 't3',
    status: 'online',
    lat: 31.94,
    lon: -109.31,
    locationPrecisionM: 1000,
    clock: 'gnss_pps',
    clockOffsetNs: 214,
    firmwareVersion: '0.1.0',
    bands: ['gamma', 'uv', 'vis', 'nir', 'lwir', 'mmw', 'rf', 'elf_vlf', 'acoustic', 'env', 'nav'],
    lastSeenAt: null,
    uptimeS: 1_284_913,
    powerW: 11.4,
  },
  {
    id: '8f1e2a10-0000-4000-8000-000000000002',
    slug: 'hv-02-hessdalen',
    displayName: 'HV-02 Hessdalen',
    operatorHandle: 'nordlys',
    tier: 't2',
    status: 'online',
    lat: 62.85,
    lon: 11.2,
    locationPrecisionM: 1000,
    clock: 'gnss_pps',
    clockOffsetNs: 388,
    firmwareVersion: '0.1.0',
    bands: ['uv', 'vis', 'nir', 'lwir', 'mmw', 'elf_vlf', 'acoustic', 'env', 'nav'],
    lastSeenAt: null,
    uptimeS: 402_118,
    powerW: 9.8,
  },
  {
    id: '8f1e2a10-0000-4000-8000-000000000003',
    slug: 'slv-03-colorado',
    displayName: 'SLV-03 San Luis Valley',
    operatorHandle: 'highdesert',
    tier: 't2',
    status: 'degraded',
    lat: 37.68,
    lon: -105.78,
    locationPrecisionM: 2000,
    clock: 'gnss_nopps',
    clockOffsetNs: null,
    firmwareVersion: '0.1.0',
    bands: ['vis', 'nir', 'lwir', 'rf', 'env', 'nav'],
    lastSeenAt: null,
    uptimeS: 88_402,
    powerW: 8.1,
  },
  {
    id: '8f1e2a10-0000-4000-8000-000000000004',
    slug: 'bc-04-baja',
    displayName: 'BC-04 Baja Norte',
    operatorHandle: 'costa',
    tier: 't1',
    status: 'offline',
    lat: 30.42,
    lon: -115.94,
    locationPrecisionM: 1000,
    clock: 'ntp',
    clockOffsetNs: null,
    firmwareVersion: '0.1.0',
    bands: ['vis', 'nir', 'rf', 'env', 'nav'],
    lastSeenAt: null,
    uptimeS: 0,
    powerW: null,
  },
]

interface ChannelDef extends ChannelSummary {
  generate: (t: number, node: NodeSummary) => SeriesPoint
}

function defineChannels(node: NodeSummary): ChannelDef[] {
  const lon = node.lon ?? 0
  const seed = node.slug

  const all: ChannelDef[] = [
    {
      channelId: 'gamma.scint',
      band: 'gamma',
      unit: 'cps',
      label: 'Scintillator count rate',
      sampleRateHz: 1,
      displayRange: [0, 120],
      // Poisson counting around a background of ~38 cps, with the occasional
      // cosmic-ray shower. Deliberately not smoothed: counting noise is the
      // dominant feature of this channel and hiding it misrepresents the band.
      generate: (t) => {
        const lambda = 38
        const shower = hash(seed, 'g', Math.floor(t / 60_000)) > 0.988 ? 45 : 0
        const v = Math.max(0, lambda + gauss(seed + 'gamma', t) * Math.sqrt(lambda) + shower)
        return { t, v: Math.round(v), q: 0 }
      },
    },
    {
      channelId: 'uv.a',
      band: 'uv',
      unit: 'µW/cm²',
      label: 'UV-A irradiance',
      sampleRateHz: 1,
      displayRange: null,
      generate: (t) => {
        const s = solar(t, lon)
        const v = Math.max(0, s) ** 1.8 * 3400 + Math.max(0, gauss(seed + 'uv', t) * 2)
        return { t, v: Number(v.toFixed(2)), q: 0 }
      },
    },
    {
      channelId: 'vis.wide',
      band: 'vis',
      unit: 'mag/arcsec²',
      label: 'Sky brightness (all-sky)',
      sampleRateHz: 0.2,
      displayRange: [8, 22.5],
      // Inverted scale: larger is darker. Night floor near 21.6 at a dark site.
      generate: (t) => {
        const s = solar(t, lon)
        const v = s > 0 ? 9 + (1 - s) * 4 : 21.6 - Math.abs(s) * 0.5 + gauss(seed + 'v', t) * 0.06
        return { t, v: Number(v.toFixed(2)), q: 0 }
      },
    },
    {
      channelId: 'nir.850',
      band: 'nir',
      unit: 'ADU',
      label: 'NIR 850 nm background',
      sampleRateHz: 0.2,
      displayRange: null,
      generate: (t) => {
        const s = solar(t, lon)
        const v = 120 + Math.max(0, s) * 2600 + gauss(seed + 'n', t) * 14
        return { t, v: Math.round(v), q: 0 }
      },
    },
    {
      channelId: 'lwir.main',
      band: 'lwir',
      unit: 'K',
      label: 'Sky temperature',
      sampleRateHz: 8.7,
      displayRange: null,
      // Radiometric sky temperature, plus the flat-field shutter that fires
      // every ~3 minutes and blanks the stream. Marked invalid, not deleted.
      generate: (t) => {
        const s = solar(t, lon)
        const base = 243 + s * 11 + gauss(seed + 'l', t) * 0.4
        const inShutter = (Math.floor(t / 1000) % 180) < 1
        return {
          t,
          v: Number(base.toFixed(2)),
          q: inShutter ? QUALITY_BITS.CALIBRATION_STALE : 0,
        }
      },
    },
    {
      channelId: 'rf.sdr0',
      band: 'rf',
      unit: 'dBm',
      label: 'Wideband RF floor (400–500 MHz)',
      sampleRateHz: 1,
      displayRange: [-115, -55],
      // Flat noise floor with impulsive events. Impulsive is the interesting
      // shape here; a smooth wandering line would be a lie about this band.
      generate: (t) => {
        const impulse = hash(seed, 'r', Math.floor(t / 30_000)) > 0.975 ? 32 : 0
        const v = -104 + gauss(seed + 'rf', t) * 1.6 + impulse
        return { t, v: Number(v.toFixed(1)), q: 0 }
      },
    },
    {
      channelId: 'mag.z',
      band: 'elf_vlf',
      unit: 'nT',
      label: 'Magnetometer, vertical residual',
      sampleRateHz: 10,
      displayRange: [-90, 90],
      generate: (t) => {
        const diurnal = Math.sin(dayPhase(t) * 2 * Math.PI) * 22
        const v = diurnal + gauss(seed + 'm', t) * 6
        return { t, v: Number(v.toFixed(1)), q: 0 }
      },
    },
    {
      channelId: 'acoustic.spl',
      band: 'acoustic',
      unit: 'dB SPL',
      label: 'Broadband sound pressure',
      sampleRateHz: 10,
      displayRange: [20, 80],
      generate: (t) => {
        const wind = 28 + Math.sin(t / 900_000) * 5
        const overflight = hash(seed, 'a', Math.floor(t / 45_000)) > 0.972 ? 22 : 0
        return { t, v: Number((wind + gauss(seed + 'ac', t) * 2 + overflight).toFixed(1)), q: 0 }
      },
    },
    {
      channelId: 'mmw.range',
      band: 'mmw',
      unit: 'targets',
      label: 'Radar tracked targets',
      sampleRateHz: 10,
      displayRange: [0, 4],
      generate: (t) => {
        const p = hash(seed, 'mm', Math.floor(t / 20_000))
        return { t, v: p > 0.97 ? 2 : p > 0.9 ? 1 : 0, q: 0 }
      },
    },
    {
      channelId: 'env.temp',
      band: 'env',
      unit: '°C',
      label: 'Ambient temperature',
      sampleRateHz: 0.1,
      displayRange: null,
      generate: (t) => {
        const s = solar(t, lon)
        return { t, v: Number((14 + s * 12 + gauss(seed + 'e', t) * 0.3).toFixed(2)), q: 0 }
      },
    },
    {
      channelId: 'env.pressure',
      band: 'env',
      unit: 'hPa',
      label: 'Barometric pressure',
      sampleRateHz: 0.1,
      displayRange: null,
      generate: (t) => ({
        t,
        v: Number((1013 + Math.sin(t / 7_200_000) * 4 + gauss(seed + 'p', t) * 0.15).toFixed(2)),
        q: 0,
      }),
    },
    {
      channelId: 'nav.clock',
      band: 'nav',
      unit: 'ns',
      label: 'Clock offset from GNSS',
      sampleRateHz: 1,
      displayRange: [-1200, 1200],
      generate: (t) => {
        const degraded = node.clock !== 'gnss_pps'
        const v = degraded
          ? gauss(seed + 'c', t) * 900_000
          : gauss(seed + 'c', t) * 180 + Math.sin(t / 600_000) * 60
        return { t, v: Math.round(v), q: degraded ? QUALITY_BITS.CLOCK_DEGRADED : 0 }
      },
    },
  ]

  return all.filter((c) => node.bands.includes(c.band))
}

const EVENT_TEMPLATES: Array<Omit<EventMarker, 'id' | 'tStart' | 'tEnd'>> = [
  {
    bands: ['vis', 'nir', 'acoustic'],
    classification: 'terrestrial_known',
    anomalyScore: 4,
    corroboration: 'multi_channel',
    summary: 'Matched to ADS-B hex a4f81c, altitude 10,300 m, 8.2 s acoustic lag consistent.',
  },
  {
    bands: ['vis', 'nir'],
    classification: 'terrestrial_known',
    anomalyScore: 6,
    corroboration: 'multi_channel',
    summary: 'Starlink 4682 pass, illuminated, matched to propagated TLE within 0.4°.',
  },
  {
    bands: ['vis'],
    classification: 'terrestrial_likely',
    anomalyScore: 18,
    corroboration: 'single_channel',
    summary: 'Fast unresolved optical streak, 0.7 s, consistent with a sporadic meteor.',
  },
  {
    bands: ['uv', 'rf', 'elf_vlf'],
    classification: 'terrestrial_known',
    anomalyScore: 11,
    corroboration: 'multi_channel',
    summary: 'Sferic at 41 km, matched to lightning network fix, three-band coincidence.',
  },
  {
    bands: ['vis', 'lwir'],
    classification: 'ambiguous',
    anomalyScore: 44,
    corroboration: 'multi_channel',
    summary: 'Two-band track, no ADS-B and no TLE match, but too short to constrain kinematics.',
  },
  {
    bands: ['lwir'],
    classification: 'instrumental',
    anomalyScore: 2,
    corroboration: 'single_channel',
    summary: 'Flat-field shutter transient, self-identified from the shutter schedule.',
  },
  {
    bands: ['vis', 'lwir', 'mmw'],
    classification: 'anomalous_unresolved',
    anomalyScore: 78,
    corroboration: 'multi_node',
    summary:
      'Three-band track with a radar range fix. Cleared ADS-B, TLE, and airspace. Radar-inferred cross-section inconsistent with the thermal budget.',
  },
]

function eventsIn(nodeSlug: string, window: Window): EventMarker[] {
  const out: EventMarker[] = []
  const step = 600_000 // one candidate slot every 10 minutes
  const first = Math.floor(window.from / step) * step
  for (let t = first; t <= window.to; t += step) {
    const r = hash(nodeSlug, 'ev', t)
    if (r < 0.55) continue
    const tpl = EVENT_TEMPLATES[Math.floor(hash(nodeSlug, 'tpl', t) * EVENT_TEMPLATES.length)]
    // The unresolved template is rare by construction. A system that finds
    // mysteries often is a system with a calibration problem.
    if (tpl.classification === 'anomalous_unresolved' && r < 0.995) continue
    const tStart = t + Math.floor(hash(nodeSlug, 'off', t) * step * 0.8)
    if (tStart < window.from || tStart > window.to) continue
    out.push({
      id: `ev-${nodeSlug}-${tStart}`,
      tStart,
      tEnd: tStart + 1200 + Math.floor(hash(nodeSlug, 'dur', t) * 9000),
      ...tpl,
    })
  }
  return out
}

export class MockFeed implements TelemetryFeed {
  readonly kind = 'mock' as const

  async listNodes(): Promise<NodeSummary[]> {
    return NODES
  }

  async getNode(slug: string): Promise<NodeSummary | null> {
    return NODES.find((n) => n.slug === slug) ?? null
  }

  async listChannels(nodeSlug: string): Promise<ChannelSummary[]> {
    const node = await this.getNode(nodeSlug)
    if (!node) return []
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured to omit
    return defineChannels(node).map(({ generate: _generate, ...rest }) => rest)
  }

  async getSeries(nodeSlug: string, window: Window, maxPoints = 320): Promise<Series[]> {
    const node = await this.getNode(nodeSlug)
    if (!node || node.status === 'offline') return []

    const defs = defineChannels(node)
    const span = Math.max(window.to - window.from, 1000)
    const step = Math.max(Math.floor(span / maxPoints), 1000)

    return defs.map((def) => {
      const points: SeriesPoint[] = []
      for (let t = window.from; t <= window.to; t += step) points.push(def.generate(t, node))
      return {
        channelId: def.channelId,
        band: def.band,
        unit: def.unit,
        label: def.label,
        displayRange: def.displayRange,
        points,
      }
    })
  }

  async listEvents(nodeSlug: string, window: Window): Promise<EventMarker[]> {
    const node = await this.getNode(nodeSlug)
    if (!node || node.status === 'offline') return []
    return eventsIn(nodeSlug, window)
  }
}
