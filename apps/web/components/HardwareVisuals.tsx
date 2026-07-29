import {
  BAND_BY_ID,
  partsForTier,
  tierPower,
  type Part,
  type Tier,
} from '../lib/schema/generated'
import { SPECTRAL } from '../lib/spectrum'

/**
 * Hardware diagrams, generated from schema/hardware.json.
 *
 * A wiring diagram drawn by hand in an image editor is out of date the moment
 * somebody swaps a part, and nobody notices until a builder has already wired
 * to it. These are rendered from the same registry that produces the bill of
 * materials, so changing a part moves the diagram with it or fails the drift
 * check trying.
 */

const BUS_GROUPS: { id: string; label: string; match: (p: Part) => boolean }[] = [
  { id: 'csi', label: 'MIPI CSI', match: (p) => p.interface === 'csi' },
  { id: 'usb', label: 'USB', match: (p) => p.interface.startsWith('usb') },
  { id: 'i2c', label: 'I²C', match: (p) => p.interface === 'i2c' },
  { id: 'spi', label: 'SPI', match: (p) => p.interface === 'spi' || p.interface === 'adc' },
  { id: 'uart', label: 'UART / GPIO', match: (p) => p.interface.includes('uart') || p.interface.includes('gpio') },
  { id: 'i2s', label: 'I²S', match: (p) => p.interface === 'i2s' },
]

/** Node architecture: what hangs off which bus, coloured by band. */
export function NodeBlockDiagram({ tier }: { tier: Tier }) {
  const parts = partsForTier(tier).filter((p) => p.interface !== 'host' && p.interface !== 'none')
  const groups = BUS_GROUPS.map((g) => ({ ...g, parts: parts.filter(g.match) })).filter(
    (g) => g.parts.length > 0,
  )

  return (
    <figure className="m-0">
      <div className="card p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[190px_1fr] lg:items-center">
          {/* Compute */}
          <div className="rounded-[var(--radius-card)] border-2 border-[var(--accent)] bg-[var(--surface-3)] p-4 text-center">
            <div className="eyebrow">Compute</div>
            <div className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
              {partsForTier(tier).find((p) => p.category === 'compute')?.model ?? 'Raspberry Pi 5'}
            </div>
            <div className="num mt-2 text-[11px] text-[var(--ink-3)]">
              GNSS-disciplined clock
              <br />
              bounded ring buffers
              <br />
              coincidence trigger
            </div>
          </div>

          {/* Buses */}
          <div className="space-y-2.5">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="num flex w-[92px] shrink-0 items-center gap-2 text-[11px] text-[var(--ink-3)]">
                  <span aria-hidden="true" className="hidden h-px w-4 bg-[var(--line-strong)] sm:block" />
                  {g.label}
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {g.parts.map((p) => {
                    const band = p.band ? BAND_BY_ID[p.band] : null
                    return (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1"
                        style={
                          band
                            ? {
                                borderLeftWidth: 3,
                                borderLeftColor: `light-dark(${SPECTRAL.light[band.id]}, ${SPECTRAL.dark[band.id]})`,
                              }
                            : undefined
                        }
                      >
                        <span className="text-[11.5px] text-[var(--ink)]">{p.model}</span>
                        {band && (
                          <span className="num text-[10px] text-[var(--ink-3)]">{band.label}</span>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-4">
          {[
            ['spool', 'append-only local buffer'],
            ['signer', 'Ed25519, key never leaves'],
            ['uplink', 'batched, resumes after outage'],
          ].map(([k, v]) => (
            <span key={k} className="num text-[11px] text-[var(--ink-3)]">
              <span className="text-[var(--ink-2)]">{k}</span> · {v}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Every sensor is behind one driver interface, which is what lets the grid accept a cheap
        thermal array and an expensive radiometric camera as the same band while still knowing the
        difference between them.
      </figcaption>
    </figure>
  )
}

/**
 * Raspberry Pi 40-pin header with assignments from the registry.
 *
 * Rendered rather than drawn, so a part change updates the pinout. Physical
 * numbering is used throughout because that is what you count on the board;
 * BCM numbering is a software convention and mixing the two is the classic way
 * to wire a node wrong.
 */
export function PinoutDiagram({ tier }: { tier: Tier }) {
  const parts = partsForTier(tier)

  // pin -> [signal, part]
  const assigned = new Map<string, { signal: string; part: Part }[]>()
  for (const p of parts) {
    for (const { signal, pin } of p.electrical?.pins ?? []) {
      if (!/^\d+$/.test(pin)) continue
      const list = assigned.get(pin) ?? []
      list.push({ signal, part: p })
      assigned.set(pin, list)
    }
  }

  const POWER: Record<string, string> = {
    '1': '3V3', '2': '5V', '4': '5V', '17': '3V3',
    '6': 'GND', '9': 'GND', '14': 'GND', '20': 'GND', '25': 'GND',
    '30': 'GND', '34': 'GND', '39': 'GND',
  }

  function Pin({ n }: { n: number }) {
    const key = String(n)
    const uses = assigned.get(key) ?? []
    const power = POWER[key]
    const isGnd = power === 'GND'
    const shared = uses.length > 1

    return (
      <div className="flex items-center gap-1.5">
        <span
          className="num flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] text-[10px]"
          style={{
            background: uses.length
              ? 'light-dark(#1e5d9e, #3a8fc0)'
              : isGnd
                ? 'light-dark(#c9cfd8, #2a3038)'
                : power
                  ? 'light-dark(#e8d5a8, #4a3f22)'
                  : 'light-dark(#eef0f3, #1a1e26)',
            color: uses.length ? '#ffffff' : 'var(--ink-3)',
          }}
        >
          {n}
        </span>
        <span className="num truncate text-[10.5px] leading-tight">
          {uses.length ? (
            <span className="text-[var(--ink)]">
              {uses[0].signal}
              {shared && <span className="text-[var(--ink-3)]"> +{uses.length - 1}</span>}
            </span>
          ) : (
            // 'free' is the word the legend already uses for an unassigned pin,
            // not a placeholder glyph. An em-dash sweep replaced the dash here
            // with a bare comma, which rendered a stray "," beside fourteen of
            // the forty pins, directly under a legend swatch reading "free".
            <span className="text-[var(--ink-3)]">{power ?? 'free'}</span>
          )}
        </span>
      </div>
    )
  }

  const odd = Array.from({ length: 20 }, (_, i) => i * 2 + 1)
  const even = Array.from({ length: 20 }, (_, i) => i * 2 + 2)

  return (
    <figure className="m-0">
      <div className="card scroll-x p-4 sm:p-5">
        <div className="grid min-w-[420px] grid-cols-2 gap-x-6 gap-y-1">
          <div className="space-y-1">
            <div className="eyebrow mb-1.5">Odd pins (board edge)</div>
            {odd.map((n) => (
              <Pin key={n} n={n} />
            ))}
          </div>
          <div className="space-y-1">
            <div className="eyebrow mb-1.5">Even pins (inboard)</div>
            {even.map((n) => (
              <Pin key={n} n={n} />
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="eyebrow">Legend</span>
        {[
          ['assigned', 'light-dark(#1e5d9e, #3a8fc0)'],
          ['power', 'light-dark(#e8d5a8, #4a3f22)'],
          ['ground', 'light-dark(#c9cfd8, #2a3038)'],
          ['free', 'light-dark(#eef0f3, #1a1e26)'],
        ].map(([label, bg]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-2)]">
            <span aria-hidden="true" className="h-3 w-4 rounded-[2px]" style={{ background: bg }} />
            {label}
          </span>
        ))}
      </figcaption>

      <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Physical pin numbers, because that is what you count on the board. Every 3V3 and GND pin is
        shared by several sensors, which is normal and expected. Pin 7 carrying the
        pulse-per-second signal is the one that must be exactly right; everything else is
        recoverable, and that one silently downgrades the node to millisecond timing.
        It sits on GPIO4 rather than GPIO18 because GPIO18 is the I2S bit clock and the
        microphone claims it on any node carrying both.
      </p>
    </figure>
  )
}

/**
 * Power budget and off-grid sizing.
 *
 * Node power draw is itself telemetry, and it is also the thing most likely to
 * strand a remote build. Sized against the parts actually in the tier rather
 * than a round number.
 */
export function PowerBudget({ tier }: { tier: Tier }) {
  const parts = partsForTier(tier)
    .filter((p) => (p.electrical?.activeW ?? 0) > 0)
    .sort((a, b) => (b.electrical!.activeW ?? 0) - (a.electrical!.activeW ?? 0))

  const { idleW, activeW } = tierPower(tier)
  const dailyWh = activeW * 24
  // Three days of autonomy through overcast, at 50 % usable depth of discharge.
  const batteryWh = dailyWh * 3 * 2
  // Four peak-sun-hours is a conservative winter figure for a mid-latitude site.
  const panelW = Math.ceil((dailyWh / 4) * 1.35)
  const max = parts[0]?.electrical?.activeW ?? 1

  return (
    <figure className="m-0">
      <div className="card p-4 sm:p-5">
        <div className="space-y-2">
          {parts.map((p) => {
            const w = p.electrical!.activeW
            const band = p.band ? BAND_BY_ID[p.band] : null
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-[150px] shrink-0 truncate text-[12px] text-[var(--ink-2)] sm:w-[210px]">
                  {p.model}
                </span>
                <span className="flex h-4 flex-1 items-center">
                  <span
                    className="h-2 rounded-[2px]"
                    style={{
                      width: `${Math.max((w / max) * 100, 1.5)}%`,
                      background: band
                        ? `light-dark(${SPECTRAL.light[band.id]}, ${SPECTRAL.dark[band.id]})`
                        : 'var(--accent)',
                    }}
                  />
                </span>
                <span className="num w-[52px] shrink-0 text-right text-[11.5px] text-[var(--ink)]">
                  {w.toFixed(2)} W
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-4">
          {[
            { k: 'Continuous', v: `${activeW.toFixed(1)} W`, d: `${idleW.toFixed(1)} W at idle` },
            { k: 'Per day', v: `${dailyWh.toFixed(0)} Wh`, d: 'sampling around the clock' },
            { k: 'Battery', v: `${(batteryWh / 12).toFixed(0)} Ah`, d: '3 days autonomy at 12 V' },
            { k: 'Panel', v: `${panelW} W`, d: '4 peak-sun-hours, winter' },
          ].map((s) => (
            <div key={s.k}>
              <div className="eyebrow">{s.k}</div>
              <div className="num mt-0.5 text-[18px] font-semibold text-[var(--ink)]">{s.v}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--ink-3)]">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-3)]">
        Sized for continuous operation, not for a duty cycle, because a node that sleeps misses
        exactly the events it was built for. The panel figure carries a 35 percent margin for panel
        soiling and cable loss; the battery assumes lithium iron phosphate at 50 percent usable
        depth of discharge, which is why the amp-hour number looks generous.
      </figcaption>
    </figure>
  )
}

/** Per-sensor wiring table, for the person with the soldering iron down. */
export function WiringTable({ tier }: { tier: Tier }) {
  const parts = partsForTier(tier).filter((p) => (p.electrical?.pins.length ?? 0) > 0)

  return (
    <div className="card scroll-x">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="bg-[var(--surface-3)] text-left">
            <th className="eyebrow px-3 py-2.5 font-normal">Sensor</th>
            <th className="eyebrow px-3 py-2.5 font-normal">Rail</th>
            <th className="eyebrow px-3 py-2.5 font-normal">Connections (physical pins)</th>
            <th className="eyebrow px-3 py-2.5 text-right font-normal">Draw</th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id} className="border-t border-[var(--line)] align-top">
              <td className="px-3 py-2.5">
                <div className="text-[12.5px] font-medium text-[var(--ink)]">{p.model}</div>
                {p.band && (
                  <div className="num mt-0.5 text-[10.5px] text-[var(--ink-3)]">
                    {BAND_BY_ID[p.band].label}
                  </div>
                )}
              </td>
              <td className="num px-3 py-2.5 text-[11.5px] text-[var(--ink-2)]">
                {p.electrical!.rail}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {p.electrical!.pins.map((pin) => (
                    <span
                      key={pin.signal + pin.pin}
                      className="num rounded border border-[var(--line)] px-1.5 py-px text-[10.5px] text-[var(--ink-2)]"
                    >
                      {pin.signal}
                      <span className="text-[var(--ink-3)]"> → {pin.pin}</span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="num whitespace-nowrap px-3 py-2.5 text-right text-[11.5px] text-[var(--ink-2)]">
                {p.electrical!.activeW.toFixed(2)} W
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
