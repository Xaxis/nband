import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../../lib/og'
import { tierCost } from '../../../lib/schema/generated'
export const runtime = 'nodejs'
export const alt = 'Ten steps, each one verifiable'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return ogImage({
    eyebrow: 'Build',
    title: 'Ten steps, each one verifiable',
    lede: 'Every step ends in something you can check before spending money on the next. Stop after step five and still contribute real data.',
    stats: [
      { k: 'Steps', v: '10' },
      { k: 'Entry cost', v: `\$${tierCost('t1').toFixed(0)}` },
      { k: 'Hardware needed to start', v: 'a camera and a clock' },
    ],
  })
}
