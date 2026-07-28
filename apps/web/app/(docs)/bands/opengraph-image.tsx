import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../../lib/og'
import { BANDS, DETECTION_BANDS, PHENOMENA } from '../../../lib/schema/generated'
export const runtime = 'nodejs'
export const alt = 'What each band can actually see'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return ogImage({
    eyebrow: 'Reference',
    title: 'What each band can actually see',
    lede: 'Detection strength for every band against every phenomenon, with the limits that matter more than the capabilities.',
    // Every figure derived. An earlier version added a constant to the
    // detection-band count and printed 15 on a public card, and hardcoded the
    // cheapest band. Wrong numbers on the front of a project about measuring
    // things properly are worse than no numbers.
    stats: [
      { k: 'Bands', v: String(BANDS.length) },
      { k: 'Phenomena modelled', v: String(PHENOMENA.length) },
      {
        k: 'Cheapest band',
        v: `$${Math.min(...DETECTION_BANDS.map((b) => b.profile.entryCostUsd)).toFixed(0)}`,
      },
    ],
  })
}
