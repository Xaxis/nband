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
  initial = 'actual',
  maxHeight = 900,
}: {
  src: string
  alt: string
  surface?: 'light' | 'dark'
  /**
   * Where the view starts. A board schematic is close to a metre wide and is
   * read by moving around it, so it opens at full size. A drawing laid out to
   * be taken in whole opens fitted, because opening it cropped into the middle
   * of its own signal section hides that it has a power chain at all.
   */
  initial?: 'actual' | 'fit'
  /** Ceiling on the fitted frame, so a tall sheet cannot own the whole viewport. */
  maxHeight?: number
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [t, setT] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [hint, setHint] = useState(false)

  // A fitted frame takes its height from the drawing rather than the other way
  // round. Fitting a tall drawing into a fixed-height box letterboxes it, and
  // the first attempt did exactly that: the sheet arrived scaled to the frame's
  // height with a third of its width unused and its last two rows still cut
  // off. The height is capped so a very tall sheet still cannot run away with
  // the page.
  const [frameH, setFrameH] = useState<number | null>(null)

  // The fitted scale is held in state rather than recomputed from the refs on
  // demand. Reading a ref inside a callback that render then puts in an array
  // is exactly what react-hooks/refs forbids, and the rule is right: the value
  // only changes when the image loads or the frame resizes, both of which are
  // effects, so it belongs in state where a re-render can see it.
  const [fitK, setFitK] = useState(1)

  // Fit on load and on resize.
  const applyFit = useCallback(() => {
    const frame = frameRef.current
    const img = imgRef.current
    if (!frame || !img?.naturalWidth) return
    const k = Math.min(1, frame.clientWidth / img.naturalWidth)
    setFitK(k)
    setFrameH(Math.min(maxHeight, Math.round(img.naturalHeight * k)))
    // Only while the reader has not moved. Rescaling under someone who zoomed
    // in to read a pin label is worse than a slightly wrong scale.
    setT((p) => (p.x === 0 && p.y === 0 ? { ...p, k } : p))
  }, [maxHeight])

  // Reset returns to wherever the view started, not to 100 percent. Sending a
  // fitted drawing to 1:1 is not a reset, it is a different view.
  const reset = useCallback(() => {
    setT({ x: 0, y: 0, k: initial === 'fit' ? fitK : 1 })
  }, [initial, fitK])

  useEffect(() => {
    if (initial !== 'fit') return
    if (imgRef.current?.complete) applyFit()
    const frame = frameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(applyFit)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [initial, applyFit, src])

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
    // Primary button only. Any-button drag meant a right-click began a pan that
    // the context menu then stranded mid-gesture.
    if (e.button !== 0) return
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
        // touch-pan-y, not touch-none. A full-width element that swallows every
        // touch gesture is a scroll trap: on a phone the drawing occupies the
        // width of the screen and the page cannot be scrolled past it at all.
        // Vertical drags scroll the page; horizontal drags pan the drawing,
        // which is the axis that actually needs panning on a wide schematic.
        style={frameH ? { height: frameH } : undefined}
        className={`relative w-full cursor-grab touch-pan-y overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing ${
          frameH ? '' : 'h-[420px] sm:h-[520px]'
        } ${surface === 'light' ? 'bg-[#f6f4ef]' : 'bg-[#0b0d10]'}`}
        aria-label={`${alt}. Drag to pan. Hold Control or Command and scroll to zoom. Arrow keys pan, plus and minus zoom, zero resets.`}
        role="group"
      >
        <div
          className="absolute left-1/2 top-1/2 origin-center will-change-transform"
          style={{ transform: `translate(-50%, -50%) translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => initial === 'fit' && applyFit()}
            className="max-w-none select-none"
          />
        </div>

        {hint && (
          <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-[var(--surface-3)] px-3 py-1 text-[11.5px] text-[var(--ink-2)] shadow">
            Hold Ctrl or Cmd and scroll to zoom
          </p>
        )}
      </div>

      {/* Bottom right, not top right. Technical drawings put their title block
          and their caveats at the top, which is precisely what a floating
          control cluster must not cover. */}
      <div className="absolute bottom-2 right-2 flex gap-1">
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
