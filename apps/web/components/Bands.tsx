import Link from 'next/link'
import { BANDS, BAND_BY_ID, type Band, type BandId } from '../lib/schema/generated'
import { SPECTRAL, bandExtent, logWavelengthPosition } from '../lib/spectrum'

/**
 * Band identity, everywhere.
 *
 * Every one of these carries a visible text label. That is not a stylistic
 * choice: fourteen hues cannot clear the colour-vision-deficiency separation
 * floor at any spacing, so colour is an accent that reinforces the label and
 * never a channel that replaces it. See lib/spectrum.ts.
 */
export function BandChip({
  band,
  size = 'md',
  href,
}: {
  band: BandId | Band
  size?: 'sm' | 'md'
  href?: string
}) {
  const b = typeof band === 'string' ? BAND_BY_ID[band] : band
  const light = SPECTRAL.light[b.id]
  const dark = SPECTRAL.dark[b.id]

  const inner = (
    <>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ background: `light-dark(${light}, ${dark})` }}
      />
      <span className="truncate">{b.label}</span>
    </>
  )

  const cls = `inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-2)] ${
    size === 'sm' ? 'px-1.5 py-0.5 text-[11.5px]' : 'px-2 py-1 text-[12.5px]'
  } text-[var(--ink-2)]`

  if (href) {
    return (
      <Link href={href} className={`${cls} transition-colors hover:text-[var(--ink)]`}>
        {inner}
      </Link>
    )
  }
  return <span className={cls}>{inner}</span>
}

/**
 * The spectrum bar.
 *
 * Bands are laid out by log wavelength, so the geometry is physics rather than
 * an equal split: the visible band really is the sliver it looks like, and the
 * radio band really does span nine orders of magnitude. Bands with no
 * electromagnetic extent (acoustic, seismic, gravimetric, and the context
 * channels) are listed separately below rather than being forced onto an axis
 * they do not belong on.
 */
export function SpectrumBar({ interactive = true }: { interactive?: boolean }) {
  const em = BANDS.map((b) => ({ b, pos: logWavelengthPosition(b) })).filter(
    (x): x is { b: Band; pos: { start: number; end: number } } => x.pos !== null,
  )
  const other = BANDS.filter((b) => logWavelengthPosition(b) === null)

  // Decade ticks across the plotted domain, 1e-14 m to 1e3 m.
  const ticks = [-14, -11, -8, -6, -3, 0, 3].map((e) => ({
    e,
    x: ((e - -14) / (3 - -14)) * 100,
  }))

  return (
    <div className="w-full">
      <div className="scroll-x">
        <div className="min-w-[560px]">
          <div className="relative h-[74px] w-full">
            {em.map(({ b, pos }) => {
              const left = pos.start * 100
              const width = Math.max((pos.end - pos.start) * 100, 0.9)
              const light = SPECTRAL.light[b.id]
              const dark = SPECTRAL.dark[b.id]
              return (
                <Link
                  key={b.id}
                  href={`/bands#${b.id}`}
                  className="group absolute bottom-0 top-0 rounded-[3px] border transition-[filter,transform] focus-visible:z-10"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: `light-dark(color-mix(in oklab, ${light} 26%, transparent), color-mix(in oklab, ${dark} 26%, transparent))`,
                    borderColor: `light-dark(${light}, ${dark})`,
                  }}
                  aria-label={`${b.label}, ${bandExtent(b)}`}
                  tabIndex={interactive ? 0 : -1}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[3px]"
                    style={{ background: `light-dark(${light}, ${dark})` }}
                  />
                  <span className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{
                      background: `light-dark(color-mix(in oklab, ${light} 22%, transparent), color-mix(in oklab, ${dark} 22%, transparent))`,
                    }}
                  />
                </Link>
              )
            })}
          </div>

          {/* Decade axis. */}
          <div className="relative mt-1.5 h-4 border-t border-[var(--line)]">
            {ticks.map((t) => (
              <span
                key={t.e}
                className="num absolute top-1 -translate-x-1/2 text-[10px] text-[var(--ink-3)]"
                style={{ left: `${t.x}%` }}
              >
                10<sup>{t.e}</sup> m
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Labels are the primary identity channel; the bar above reinforces. */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {em.map(({ b }) => (
          <BandChip key={b.id} band={b} size="sm" href={`/bands#${b.id}`} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="eyebrow mr-1">Off the EM axis</span>
        {other.map((b) => (
          <BandChip key={b.id} band={b} size="sm" href={`/bands#${b.id}`} />
        ))}
      </div>
    </div>
  )
}

/** Full band detail, used on /bands. */
export function BandCard({ band }: { band: Band }) {
  const light = SPECTRAL.light[band.id]
  const dark = SPECTRAL.dark[band.id]

  return (
    <article
      id={band.id}
      className="card scroll-mt-24 overflow-hidden"
      style={{ borderLeft: `3px solid light-dark(${light}, ${dark})` }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[19px] font-semibold tracking-tight text-[var(--ink)]">
            {band.label}
          </h2>
          <span className="num text-[12px] text-[var(--ink-3)]">{bandExtent(band)}</span>
        </div>

        <p className="mt-1 text-[14px] text-[var(--ink-2)]">{band.shortDescription}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-1.5">What it picks up</h3>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{band.whatItSees}</p>
          </div>
          <div>
            <h3 className="eyebrow mb-1.5">Where it fails</h3>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{band.limits}</p>
          </div>
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-4 text-[12px]">
          <div>
            <dt className="eyebrow">Role</dt>
            <dd className="num mt-0.5 text-[var(--ink-2)]">
              {band.role === 'detection' ? 'Detection' : 'Context only'}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Kind</dt>
            <dd className="num mt-0.5 text-[var(--ink-2)]">{band.kind}</dd>
          </div>
          <div>
            <dt className="eyebrow">Default unit</dt>
            <dd className="num mt-0.5 text-[var(--ink-2)]">{band.unitDefault}</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}
