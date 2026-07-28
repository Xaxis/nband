import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../lib/og'
import { tierCost } from '../lib/schema/generated'

export const runtime = 'nodejs'
export const alt = 'nband, instrument-grade evidence for unexplained aerial phenomena'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return ogImage({
    eyebrow: 'Open instrument for anomalous aerial phenomena',
    title: 'Unexplained should not mean unmeasured.',
    lede: 'Thousands of sightings a year and almost no usable evidence. A sensor node you can build that rules out the ordinary and publishes the rest.',
    stats: [
      { k: 'Bands at once', v: '14' },
      { k: 'Timing', v: '±500 ns' },
      { k: 'Entry build', v: `$${tierCost('t1').toFixed(0)}` },
    ],
  })
}
