'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The scene as a hero underlay.
 *
 * It sits behind the headline rather than beside it, so the page opens on the
 * instrument instead of on a diagram of it. Two consequences follow. The canvas
 * has to be legible under text, which is what the gradient scrim handles, and
 * it has to be escapable, which is what the expand control is for: a wide, short
 * hero is the worst possible aspect ratio for a dome, so anyone who actually
 * wants to look at it needs a way to get a square-ish frame.
 *
 * ~600 kB of WebGL is loaded only on the client and only after the page is
 * interactive. Everything the hero must communicate is in the DOM before it
 * arrives.
 */
const SkyScene = dynamic(() => import('./SkyScene'), {
  ssr: false,
  loading: () => null,
})

export function HeroScene({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Takes over the viewport rather than requesting browser fullscreen. The
  // Fullscreen API hides the URL bar and the rest of the page chrome, which is
  // the wrong trade for a panel someone wants to glance at and dismiss; it also
  // needs a user gesture and is refused outright in several mobile browsers.
  const toggle = useCallback(() => setExpanded((v) => !v), [])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    // Stop the page scrolling underneath the overlay.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  return (
    <div
      ref={wrapRef}
      className={
        expanded
          ? 'fixed inset-0 z-[60] h-[100dvh] w-screen bg-[var(--surface-1)]'
          : 'relative isolate overflow-hidden border-b border-[var(--line)]'
      }
    >
      {/* The scene. Absolutely positioned so hero text composes on top of it. */}
      <div
        className={expanded ? 'absolute inset-0' : 'absolute inset-0 -z-10'}
        aria-hidden="true"
      >
        <SkyScene expanded={expanded} />
      </div>

      {/* Scrim. Without it the headline sits on moving geometry and neither
          reads. Heavier on the left, where the text is, and in light mode,
          where the scene has less contrast against the surface to begin with. */}
      {!expanded && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(100deg, var(--surface-1) 0%, color-mix(in oklab, var(--surface-1) 88%, transparent) 34%, color-mix(in oklab, var(--surface-1) 30%, transparent) 62%, transparent 100%)',
          }}
        />
      )}

      {!expanded && children}

      {expanded && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Close expanded view"
          className="absolute inset-0 z-0 cursor-zoom-out"
          tabIndex={-1}
        />
      )}

      <button
        type="button"
        onClick={toggle}
        className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-1)_82%,transparent)] px-2.5 py-1.5 text-[12px] text-[var(--ink-2)] backdrop-blur transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
        aria-label={expanded ? 'Exit expanded view' : 'Expand the sensor volume'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d={
              expanded
                ? 'M9 3v6H3M15 21v-6h6M3 15h6v6M21 9h-6V3'
                : 'M3 9V3h6M21 15v6h-6M3 15v6h6M21 9V3h-6'
            }
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {expanded ? 'Close' : 'Expand'}
      </button>
    </div>
  )
}
