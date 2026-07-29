import { BandChip } from './Bands'
import { BAND_BY_ID, PARTS, type BandId, type Part } from '../lib/schema/generated'

/**
 * What the box has to let through.
 *
 * A weatherproof enclosure is a wall, and most of these bands cannot see
 * through a wall. That is the single least obvious thing about building one of
 * these, and it was nowhere on the site: the bill of materials listed a case,
 * the render drew a case, and nothing said that a thermal camera inside it
 * images the inside of the lid.
 *
 * Every row here is generated. bands.json states what each band needs to get
 * through a wall and which materials only look like they pass it; the enclosure
 * part states what is actually cut into it and out of what. A drift check
 * refuses a build where a sensor has no aperture, or has one made of something
 * its band cannot cross, so this table cannot quietly stop being true.
 */

interface Aperture {
  id: string
  bands: string[]
  face: string
  material: string
  sizeMm: number | null
  note: string
}

export function EnclosureApertures() {
  const cases = PARTS.filter((p) => p.category === 'enclosure' && (p.apertures ?? []).length > 0)
  if (cases.length === 0) return null

  return (
    <div className="mt-7 space-y-8">
      {cases.map((shell: Part) => (
        <div key={shell.id}>
          {/* Named, because there is more than one and they are not
              interchangeable: one is bought and moulded, one is printed and
              has not been. */}
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[14px] font-semibold text-[var(--ink)]">
              {shell.vendor} {shell.model}
            </h4>
            <span className="num text-[11.5px] text-[var(--ink-3)]">
              {shell.tiers && shell.tiers.length > 0
                ? `ships with ${shell.tiers.join(', ')}`
                : 'registered alternative, unbuilt'}
              {' · '}
              {shell.mechanical?.interiorWidthMm} × {shell.mechanical?.interiorDepthMm} ×{' '}
              {shell.mechanical?.interiorHeightMm} mm inside
            </span>
          </div>
          <div className="card scroll-x">
            <table className="w-full min-w-[820px] border-collapse">
              <caption className="sr-only">
                Apertures cut into the {shell.model}, the band each serves, and the material each
                is made of
              </caption>
              <thead>
                <tr className="bg-[var(--surface-3)] text-left">
                  <th className="eyebrow px-3 py-2.5 font-normal">Bands</th>
                  <th className="eyebrow px-3 py-2.5 font-normal">Where</th>
                  <th className="eyebrow px-3 py-2.5 font-normal">What it is made of</th>
                </tr>
              </thead>
              <tbody>
                {((shell.apertures ?? []) as Aperture[]).map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {a.bands.map((b) => (
                          <BandChip key={b} band={b as BandId} size="sm" href={`/bands#${b}`} />
                        ))}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-[12px] text-[var(--ink-2)]">
                      {a.face === 'none' ? 'no hole' : a.face}
                      {a.sizeMm != null && (
                        <span className="block text-[11px] text-[var(--ink-3)]">
                          {a.sizeMm} mm
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-[13px] text-[var(--ink)]">{a.material}</div>
                      <p className="mt-1.5 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                        {a.note}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The same requirement stated per band rather than per hole, because someone
 * designing their own enclosure is working from the sensor they have rather
 * than from a case somebody else chose.
 */
export function ApertureByBand() {
  const withParts = new Set(PARTS.map((p) => p.band).filter(Boolean))
  const rows = Object.values(BAND_BY_ID)
    .filter((b) => withParts.has(b.id) && b.aperture.needs !== 'none')
    .sort((a, b) => a.ordinal - b.ordinal)

  return (
    <div className="card scroll-x mt-7">
      <table className="w-full min-w-[860px] border-collapse">
        <caption className="sr-only">
          What each band needs from an enclosure, what passes it, and what looks transparent and is
          not
        </caption>
        <thead>
          <tr className="bg-[var(--surface-3)] text-left">
            <th className="eyebrow px-3 py-2.5 font-normal">Band</th>
            <th className="eyebrow px-3 py-2.5 font-normal">Needs</th>
            <th className="eyebrow px-3 py-2.5 font-normal">Passes</th>
            <th className="eyebrow px-3 py-2.5 font-normal">Looks clear and is not</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-[var(--line)] align-top">
              <td className="px-3 py-3">
                <BandChip band={b.id} size="sm" href={`/bands#${b.id}`} />
              </td>
              <td className="num px-3 py-3 text-[12px] text-[var(--ink-2)]">{b.aperture.needs}</td>
              <td className="px-3 py-3 text-[12.5px] text-[var(--ink-2)]">
                {b.aperture.passedBy.join(', ') || 'nothing to pass'}
              </td>
              <td className="px-3 py-3 text-[12.5px]">
                {b.aperture.blockedBy.length > 0 ? (
                  <span className="text-[#b4453c]">{b.aperture.blockedBy.join(', ')}</span>
                ) : (
                  <span className="text-[var(--ink-3)]">nothing in particular</span>
                )}
                <p className="mt-1.5 max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                  {b.aperture.note}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
