import { pageMetadata } from '../../../../lib/metadata'
import Link from 'next/link'
import { BandChip } from '../../../../components/Bands'
import { Container, Note, PageHeader, Section } from '../../../../components/ui'
import { PARTS, VARIANTSTATUS, type VariantStatus } from '../../../../lib/schema/generated'

export const metadata = pageMetadata({
  title: 'Hardware variant registry',
  description:
    'Every part the grid knows how to calibrate, including community substitutes, and how to register one it does not.',
  path: '/hardware/variants',
})

const ORDER: VariantStatus[] = ['reference', 'verified', 'submitted', 'unsupported']

const STATUS_COLOR: Record<VariantStatus, string> = {
  reference: '#0ca30c',
  verified: '#4ea9ff',
  submitted: '#fab219',
  unsupported: '#d03b3b',
}

export default function VariantsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="People will build this with parts nobody picked."
        lede={
          <>
            The registry exists so that substituting a part is a supported path rather than a fork.
            Each entry declares what its sensor can and cannot resolve, and the discriminator reads
            those declarations rather than assuming them. That is what lets a USD 75 thermal array
            and a USD 329 radiometric camera both contribute to the same band honestly.
          </>
        }
      />

      <Container className="py-8">
        <div className="grid gap-3 sm:grid-cols-4">
          {ORDER.map((s) => {
            const n = PARTS.filter((p) => p.status === s).length
            return (
              <div key={s} className="card p-4">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: STATUS_COLOR[s] }}
                  />
                  <span className="eyebrow">{VARIANTSTATUS[s].label}</span>
                </div>
                <div className="num mt-1 text-[22px] font-semibold text-[var(--ink)]">{n}</div>
                <p className="mt-1 text-[11.5px] leading-snug text-[var(--ink-3)]">
                  {VARIANTSTATUS[s].summary}
                </p>
              </div>
            )
          })}
        </div>

        <div className="card scroll-x mt-4">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="bg-[var(--surface-3)] text-left">
                <th className="eyebrow px-3 py-2.5 font-normal">Part</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Band</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Driver</th>
                <th className="eyebrow px-3 py-2.5 font-normal">Standing</th>
                <th className="eyebrow px-3 py-2.5 text-right font-normal">Price</th>
              </tr>
            </thead>
            <tbody>
              {[...PARTS]
                .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
                .map((p) => (
                  <tr key={p.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-3 py-3">
                      <div className="text-[13.5px] font-medium text-[var(--ink)]">{p.model}</div>
                      <div className="num mt-0.5 text-[11px] text-[var(--ink-3)]">
                        {p.vendor} · {p.id}
                      </div>
                      {p.alternatives && p.alternatives.length > 0 && (
                        <div className="num mt-1 text-[11px] text-[var(--ink-3)]">
                          registered alternatives: {p.alternatives.join(', ')}
                        </div>
                      )}
                      {p.candidateAlternatives && p.candidateAlternatives.length > 0 && (
                        <div className="num mt-0.5 text-[11px] text-[var(--ink-3)]">
                          <span className="text-[#fab219]">unregistered:</span>{' '}
                          {p.candidateAlternatives.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.band ? (
                        <BandChip band={p.band} size="sm" />
                      ) : (
                        <span className="num text-[11.5px] text-[var(--ink-3)]">no band</span>
                      )}
                    </td>
                    <td className="num px-3 py-3 text-[12px] text-[var(--ink-2)]">
                      {p.driver ?? 'no driver'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--ink-2)]">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-[2px]"
                          style={{ background: STATUS_COLOR[p.status] }}
                        />
                        {VARIANTSTATUS[p.status].label}
                      </span>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-3 text-right text-[13px] text-[var(--ink)]">
                      {p.priceUsd === 0 ? 'recovered' : `$${p.priceUsd.toFixed(2)}`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Container>

      <Section
        className="border-t border-[var(--line)] bg-[var(--surface-0)]"
        eyebrow="Registering a part"
        title="What an entry has to say"
      >
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {[
            {
              h: 'What it cannot do',
              p: 'The most important field. The MLX90640 entry states plainly that at 768 pixels it establishes thermal presence but not thermal morphology, and the discriminator scores it accordingly. An entry that only lists capabilities corrupts analysis rather than extending it.',
            },
            {
              h: 'A sourced price with a date',
              p: 'Component pricing moved 80 to 150 percent on some parts during 2026. An unsourced number is worse than no number, so every entry links to the vendor page it was read from and records when.',
            },
            {
              h: 'A driver, or a note that one is needed',
              p: 'Parts on an existing bus with an existing driver need no code. Anything else needs a Driver subclass that declares its capabilities honestly, returns None rather than a fabricated value on a failed read, and has a simulated path so people without the hardware can still run the pipeline.',
            },
            {
              h: 'Conformance results, once you have them',
              p: 'New entries entering as submitted are accepted and flagged. Running the conformance suite and passing moves the part to verified and removes the flag. Parts that do not work are recorded as unsupported rather than deleted, so nobody buys one twice.',
            },
          ].map((c) => (
            <div key={c.h} className="card p-5">
              <h3 className="text-[15px] font-semibold text-[var(--ink)]">{c.h}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{c.p}</p>
            </div>
          ))}
        </div>

        <Note title="How to submit">
          <p>
            Add an entry to <code>schema/hardware.json</code> and open a pull request against{' '}
            <a href="https://github.com/Xaxis/nband">Xaxis/nband</a>. The schema is the registry;
            there is no separate database to keep in sync, which is the point. See the{' '}
            <Link href="/contribute">contribution guide</Link> for the driver interface and the
            rules about capability declarations.
          </p>
        </Note>
      </Section>
    </>
  )
}
