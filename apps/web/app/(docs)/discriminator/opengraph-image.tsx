import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../../lib/og'
import { CLASSIFICATION_ORDER, HYPOTHESES, THRESHOLDS } from '../../../lib/schema/generated'
export const runtime = 'nodejs'
export const alt = 'It will never tell you what it was'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return ogImage({
    eyebrow: 'Analysis',
    title: 'It will never tell you what it was',
    lede: 'Known-source subtraction, hypothesis scoring, and four gates guarding the top of the ladder. The highest rung is unresolved.',
    stats: [
      { k: 'Rungs', v: String(CLASSIFICATION_ORDER.length) },
      { k: 'Hypotheses', v: String(HYPOTHESES.length) },
      { k: 'Score floor', v: String(THRESHOLDS.anomalyScoreUnresolvedFloor) },
    ],
  })
}
