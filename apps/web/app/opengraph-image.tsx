import { ImageResponse } from 'next/og'
import { BANDS } from '../lib/schema/generated'

export const runtime = 'edge'
export const alt = 'nband — an open multi-spectral sensing platform'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Social card. Renders the actual band taxonomy rather than a decorative
 * graphic: the fourteen bars are the fourteen bands in wavelength order,
 * generated from the same schema the instrument runs on.
 */
export default function OpenGraphImage() {
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
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#6f7788',
            }}
          >
            Open multi-spectral sensing
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 86,
              fontWeight: 700,
              letterSpacing: -3,
              color: '#eef1f6',
              lineHeight: 1.02,
            }}
          >
            Most of the sky is
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 86,
              fontWeight: 700,
              letterSpacing: -3,
              color: '#eef1f6',
              lineHeight: 1.02,
            }}
          >
            invisible to you.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 27,
              color: '#a8b0be',
              maxWidth: 900,
              lineHeight: 1.45,
            }}
          >
            Fourteen bands, one satellite-disciplined clock, an open archive.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 6, height: 54 }}>
            {BANDS.map((b, i) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  flex: 1,
                  borderRadius: 3,
                  background: `hsl(${b.hue} ${b.saturation === 0 ? 0 : 62}% ${i % 2 === 0 ? 62 : 52}%)`,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 22,
              color: '#6f7788',
            }}
          >
            <span>nband.space</span>
            <span>gamma · uv · visible · infrared · radar · radio · acoustic · seismic</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
