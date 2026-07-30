import { getDoc } from '../../../lib/content'
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from '../../../lib/og'
import { tierCost } from '../../../lib/schema/generated'
export const runtime = 'nodejs'

/**
 * The step count is counted rather than written down.
 *
 * This card said "Ten steps" in three places, and the guide grew an eleventh.
 * That is the same failure the band counts on the front page had: a number
 * that is true when it is typed and quietly false afterwards, on the artwork
 * that gets shared rather than on a page someone is reading closely. The
 * guide's own headings are the only honest source, so they are what is counted.
 *
 * Spelled out because the copy beside it is prose and "11 steps" reads as a
 * specification. The table stops well past where the guide plausibly stops
 * growing, and past that the numeral is better than a wrong word.
 */
const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
]

function stepCount(): number {
  return (getDoc('build')?.headings ?? []).filter((h) => /^Step \d+:/.test(h.text)).length
}

const spelled = (n: number) => WORDS[n] ?? String(n)

export const alt = `${spelled(stepCount())} steps, each one verifiable`
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  const steps = stepCount()
  return ogImage({
    eyebrow: 'Build',
    title: `${spelled(steps)} steps, each one verifiable`,
    lede: 'Every step ends in something you can check before spending money on the next. Stop after step five and still contribute real data.',
    stats: [
      { k: 'Steps', v: String(steps) },
      { k: 'Entry cost', v: `\$${tierCost('t1').toFixed(0)}` },
      { k: 'Hardware needed to start', v: 'a camera and a clock' },
    ],
  })
}
