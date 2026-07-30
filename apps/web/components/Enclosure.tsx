import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { BandChip } from './Bands'
import { BAND_BY_ID, PARTS, type BandId, type Part } from '../lib/schema/generated'
import { Note } from './ui'

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
          {/* The drawing before the table, because the table says a 25 mm
              germanium window is needed and the drawing says where, and where
              is most of the work. */}
          <div className="card mb-3 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/boards/${shell.id}.svg`}
              alt={`Dimensioned drawing of the ${shell.model}: lid plan with its windows placed on the parts that look through them, body plan, and a section showing the interior height`}
              className="w-full"
            />
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

interface ModelPart {
  file: string
  part: string
  triangles: number
  note: string
  sizeMm: number[]
  volumeMm3: number
}

interface EnclosureModel {
  id: string
  model: string
  drawnFor: string
  parts: ModelPart[]
  windows: { id: string; part: string; band: string; apertureMm: number; discMm: number }[]
  seal: { cordMm: number; grooveMm: number; grooveDepthMm: number; cutInto: string }
  bedMm: number[] | null
  notModelled: string[]
  neverPrinted: boolean
}

function loadModels(): EnclosureModel[] {
  const path = resolve(process.cwd(), 'public/boards/enclosure-models.json')
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf8')) as EnclosureModel[]
}

/**
 * The printed enclosure as something you can actually print.
 *
 * This panel used to end by saying no printed enclosure was published yet and
 * that one would be generated from the aperture list above rather than drawn
 * beside it. That is now what happens, so the paragraph promising it had to
 * become the thing itself.
 *
 * The list of what is not modelled is as load-bearing as the download. A
 * printed part fails expensively and late: nine hours of filament in, or worse,
 * after it is on a pole. Someone should learn that the mounting bosses are
 * missing from this page rather than from a finished print.
 */
export function PrintableEnclosures() {
  const models = loadModels()
  if (models.length === 0) return null

  return (
    <div className="mt-7 space-y-8">
      {models.map((m) => {
        const grams = Math.round(m.parts.reduce((s, p) => s + p.volumeMm3, 0) * 1.24e-3)
        return (
          <div key={m.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-[14px] font-semibold text-[var(--ink)]">{m.model}</h4>
              <span className="num text-[11.5px] text-[var(--ink-3)]">
                drawn for {m.drawnFor} · about {grams} g of ASA
                {m.bedMm ? ` · fits a ${m.bedMm[0]} x ${m.bedMm[1]} mm bed` : ''}
              </span>
            </div>

            <div className="card scroll-x">
              <table className="w-full min-w-[720px] border-collapse">
                <caption className="sr-only">
                  Printable parts of the {m.model}, their size, and how each one is oriented on the
                  bed
                </caption>
                <thead>
                  <tr className="bg-[var(--surface-3)] text-left">
                    <th className="eyebrow px-3 py-2.5 font-normal">Part</th>
                    <th className="eyebrow px-3 py-2.5 font-normal">Size</th>
                    <th className="eyebrow px-3 py-2.5 font-normal">On the bed</th>
                    <th className="eyebrow px-3 py-2.5 font-normal">File</th>
                  </tr>
                </thead>
                <tbody>
                  {m.parts.map((p) => (
                    <tr key={p.file} className="border-t border-[var(--line)] align-top">
                      <td className="px-3 py-3 text-[13px] text-[var(--ink)]">{p.part}</td>
                      <td className="num px-3 py-3 text-[12px] text-[var(--ink-2)]">
                        {p.sizeMm.join(' x ')} mm
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-[var(--ink-2)]">{p.note}</td>
                      <td className="px-3 py-3">
                        <a className="link num text-[12px]" href={`/boards/${p.file}`} download>
                          {p.file}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-[var(--ink-2)]">
              The seal is a {m.seal.cordMm} mm cord in a {m.seal.grooveMm} mm groove{' '}
              {m.seal.grooveDepthMm} mm deep, cut into the {m.seal.cutInto} rather than the rim. A
              groove has to be wider than the wall it seals against, and this wall is 3 mm, so on
              the body it would have removed the wall it was meant to seal. That is also why the
              lid overhangs, and the overhang doubles as a drip edge.
            </p>

            <h5 className="eyebrow mb-2 mt-6">What is not in these files</h5>
            <ul className="max-w-[74ch] space-y-1.5">
              {m.notModelled.map((n) => (
                <li key={n} className="text-[12.5px] leading-relaxed text-[var(--ink-2)]">
                  {n}
                </li>
              ))}
            </ul>

            {m.neverPrinted && (
              <div className="mt-5">
                <Note kind="warning" title="Never printed">
                  Generated from the registry and never printed. The geometry is checked on every
                  build for a closed mesh, for the dimensions the registry publishes, and for an
                  open hole at every window, which is not the same as somebody having made one and
                  put it outside for a winter.
                </Note>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
