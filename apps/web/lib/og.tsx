import { ImageResponse } from 'next/og'
import { BANDS } from './schema/generated'
import { SPECTRAL } from './spectrum'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

/**
 * Shared social card.
 *
 * Every page previously shared one image, so a link to the bill of materials
 * and a link to the safety notes looked identical in a chat window. This takes
 * a title, a line of context, and up to three real figures from the page it
 * represents, so the card carries information rather than branding.
 *
 * The band strip along the bottom is generated from the actual taxonomy, which
 * means it stays correct if a band is ever added.
 */
export function ogImage({
  eyebrow,
  title,
  lede,
  stats = [],
}: {
  eyebrow: string
  title: string
  lede?: string
  stats?: { k: string; v: string }[]
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0c0e12',
          padding: '58px 68px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              letterSpacing: 5,
              textTransform: 'uppercase',
              color: '#6f7788',
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: title.length > 40 ? 62 : 76,
              fontWeight: 700,
              letterSpacing: -2.5,
              color: '#eef1f6',
              lineHeight: 1.05,
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {lede && (
            <div
              style={{
                display: 'flex',
                marginTop: 20,
                fontSize: 25,
                color: '#a8b0be',
                maxWidth: 940,
                lineHeight: 1.42,
              }}
            >
              {lede}
            </div>
          )}
        </div>

        {stats.length > 0 && (
          <div style={{ display: 'flex', gap: 52 }}>
            {stats.map((s) => (
              <div key={s.k} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#eef1f6' }}>
                  {s.v}
                </div>
                <div style={{ display: 'flex', fontSize: 19, color: '#6f7788', marginTop: 4 }}>
                  {s.k}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 5, height: 38 }}>
            {/* The exact palette the site uses, not an approximation of it.
                An HSL re-derivation looked close in isolation and obviously
                wrong beside a screenshot of the real page. */}
            {BANDS.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  flex: 1,
                  borderRadius: 3,
                  background: SPECTRAL.dark[b.id],
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 21, color: '#6f7788' }}>
            <span>nband.space</span>
            <span>fourteen bands · one clock · an open archive</span>
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
