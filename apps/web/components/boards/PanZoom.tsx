'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A pannable, zoomable frame for a technical drawing.
 *
 * The generated schematics are around 900 mm wide at their natural size. Scaled
 * to fit a column they are unreadable, and left at full size they force the page
 * to scroll sideways, which is the one thing the layout must never do. So they
 * get their own viewport with their own transform.
 *
 * Wheel zoom is deliberately not bound to a bare wheel event: a drawing that
 * swallows the scroll wheel traps the reader halfway down the page. Zoom needs
 * a modifier, or the buttons, and a plain scroll passes through to the page.
 * Pointer events cover mouse, pen and touch in one path.
 */
export function PanZoom({
  src,
  alt,
  surface = 'light',
}: {
  src: string
  alt: string
  surface?: 'light' | 'dark'
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [hint, setHint] = useState(false)

  // No effect resets this when `src` changes, because nothing needs to: the
  // parent gives each view its own `key`, so switching tier or view remounts
  // the frame and the transform starts at identity again.
  const reset = useCallback(() => setT({ x: 0, y: 0, k: 1 }), [])

  const zoomBy = useCallback((factor: number) => {
    setT((p) => ({ ...p, k: Math.min(8, Math.max(0.4, p.k * factor)) }))
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const onWheel = (e: WheelEvent) => {
      // Only claim the wheel when the reader has asked for zoom. Otherwise the
      // page keeps scrolling and the drawing is just a picture in the flow.
      if (!(e.ctrlKey || e.metaKey)) {
        setHint(true)
        return
      }
      e.preventDefault()
      const rect = frame.getBoundingClientRect()
      const px = e.clientX - rect.left - rect.width / 2
      const py = e.clientY - rect.top - rect.height / 2
      setT((p) => {
        const k = Math.min(8, Math.max(0.4, p.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        const ratio = k / p.k
        // Keep the point under the cursor fixed while scaling.
        return { k, x: px - (px - p.x) * ratio, y: py - (py - p.y) * ratio }
      })
    }
    frame.addEventListener('wheel', onWheel, { passive: false })
    return () => frame.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!hint) return
    const id = setTimeout(() => setHint(false), 1800)
    return () => clearTimeout(id)
  }, [hint])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setT((p) => ({ ...p, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }))
  }
  const endDrag = () => {
    drag.current = null
  }

  // Keyboard parity: the frame is focusable and arrow keys pan, +/- zoom.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      setT((p) => ({ ...p, x: p.x + dx, y: p.y + dy }))
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomBy(1.2)
    } else if (e.key === '-') {
      e.preventDefault()
      zoomBy(1 / 1.2)
    } else if (e.key === '0') {
      e.preventDefault()
      reset()
    }
  }

  return (
    <div className="relative">
      <div
        ref={frameRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className={`relative h-[420px] w-full cursor-grab touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing sm:h-[520px] ${
          surface === 'light' ? 'bg-[#f6f4ef]' : 'bg-[#0b0d10]'
        }`}
        aria-label={`${alt}. Drag to pan. Hold Control or Command and scroll to zoom. Arrow keys pan, plus and minus zoom, zero resets.`}
        role="application"
      >
        <div
          className="absolute left-1/2 top-1/2 origin-center will-change-transform"
          style={{ transform: `translate(-50%, -50%) translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} draggable={false} className="max-w-none select-none" />
        </div>

        {hint && (
          <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-[var(--surface-3)] px-3 py-1 text-[11.5px] text-[var(--ink-2)] shadow">
            Hold Ctrl or \u2318 and scroll to zoom
          </p>
        )}
      </div>

      <div className="absolute right-2 top-2 flex gap-1">
        {[
          ['−', () => zoomBy(1 / 1.25), 'Zoom out'],
          ['+', () => zoomBy(1.25), 'Zoom in'],
          ['Reset', reset, 'Reset the view'],
        ].map(([label, fn, title]) => (
          <button
            key={String(title)}
            type="button"
            onClick={fn as () => void}
            title={String(title)}
            aria-label={String(title)}
            className="num rounded-[6px] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[11.5px] text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            {label as string}
          </button>
        ))}
      </div>

      <p className="mt-1.5 text-right text-[11.5px] text-[var(--ink-3)]">
        {Math.round(t.k * 100)}%
      </p>
    </div>
  )
}
