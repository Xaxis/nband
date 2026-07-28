'use client'

import dynamic from 'next/dynamic'
import { SpectrumBar } from '../Bands'

/**
 * The scene is ~600 kB of WebGL machinery for a decorative-but-explanatory
 * panel, so it is loaded only on the client and only after the page is
 * interactive. Everything the hero actually has to communicate is present
 * before it arrives: the fallback below is the spectrum bar, which is the same
 * information in two dimensions.
 */
const SkyScene = dynamic(() => import('./SkyScene'), {
  ssr: false,
  loading: () => (
    <div className="grid h-[300px] w-full place-items-center sm:h-[400px] lg:h-[460px]">
      <span className="num text-[11.5px] text-[var(--ink-3)]">initialising sensor volume…</span>
    </div>
  ),
})

export function HeroScene() {
  return (
    <div className="relative">
      <SkyScene />
      <noscript>
        <SpectrumBar interactive={false} />
      </noscript>
    </div>
  )
}
