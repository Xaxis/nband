import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../../lib/og'
import { tierCost, tierPower } from '../../../lib/schema/generated'
export const runtime = 'nodejs'
export const alt = 'Three tiers, every price sourced'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return ogImage({
    eyebrow: 'Hardware',
    title: 'Three tiers, every price sourced',
    lede: 'Bill of materials, wiring, pinout, and power budget, all generated from one registry so the diagrams cannot drift from the parts.',
    stats: [
      { k: 'Entry tier', v: `\$${tierCost('t1').toFixed(0)}` },
      { k: 'Core tier', v: `\$${tierCost('t2').toFixed(0)}` },
      { k: 'Continuous draw', v: `${tierPower('t2').activeW.toFixed(1)} W` },
    ],
  })
}
