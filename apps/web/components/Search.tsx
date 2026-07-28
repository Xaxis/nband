'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import index from '../lib/search-index.json'

/**
 * Site search.
 *
 * The index is generated from the same structured data the site is built from,
 * so a new band or part becomes searchable by existing. At 115 entries and
 * 53 kB, scoring in the browser is faster than a round trip and works with no
 * network, which matters for the one audience most likely to need it: somebody
 * mid-build in a shed with bad signal, trying to remember which pin the
 * pulse-per-second signal goes to.
 */

interface Entry {
  kind: 'page' | 'section' | 'band' | 'part' | 'concept'
  title: string
  href: string
  parent?: string
  text: string
  meta?: string
}

const ENTRIES = (index as { entries: Entry[] }).entries

const KIND_LABEL: Record<Entry['kind'], string> = {
  page: 'Page',
  section: 'Section',
  band: 'Band',
  part: 'Part',
  concept: 'Concept',
}

/**
 * Rank by where the match lands, not just whether it lands.
 *
 * A query matching the start of a title is almost always what was meant; a
 * query matching somewhere in a 400-character body usually is not. Without the
 * weighting, searching "gamma" surfaced four paragraphs that mention gamma
 * before the band called Gamma.
 */
function score(entry: Entry, q: string, terms: string[]): number {
  const title = entry.title.toLowerCase()
  const parent = (entry.parent ?? '').toLowerCase()
  const text = entry.text.toLowerCase()

  let s = 0
  if (title === q) s += 1000
  else if (title.startsWith(q)) s += 500
  else if (title.includes(q)) s += 250
  if (parent.includes(q)) s += 60

  for (const t of terms) {
    if (title.includes(t)) s += 40
    if (parent.includes(t)) s += 12
    if (text.includes(t)) s += 6
  }

  // Every term must appear somewhere, or a two-word query matches far too much.
  const haystack = `${title} ${parent} ${text}`
  if (!terms.every((t) => haystack.includes(t))) return 0

  // Nudge whole pages above deep sections when scores are otherwise close.
  if (entry.kind === 'page') s += 25
  return s
}

export function Search() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const router = useRouter()

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (query.length < 2) return []
    const terms = query.split(/\s+/).filter(Boolean)
    return ENTRIES.map((e) => ({ e, s: score(e, query, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.e)
  }, [q])

  useEffect(() => setActive(0), [q])

  const close = useCallback(() => {
    setOpen(false)
    setQ('')
  }, [])

  const go = useCallback(
    (href: string) => {
      close()
      router.push(href)
    },
    [close, router],
  )

  // Cmd-K / Ctrl-K, and "/" when not already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return close()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active].href)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[13px] text-[var(--ink-3)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-2)]"
        aria-label="Search"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="num hidden rounded border border-[var(--line)] px-1 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh]">
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--surface-0)_72%,transparent)] backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search nband"
            className="card relative z-10 flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden shadow-2xl"
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-[var(--ink-3)]">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Bands, parts, pins, thresholds…"
                className="flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)]"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="num rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--ink-3)]">
                esc
              </kbd>
            </div>

            <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {q.trim().length < 2 && (
                <li className="px-3 py-6 text-center text-[12.5px] text-[var(--ink-3)]">
                  Search {ENTRIES.length} pages, sections, bands, and parts.
                </li>
              )}
              {q.trim().length >= 2 && results.length === 0 && (
                <li className="px-3 py-6 text-center text-[12.5px] text-[var(--ink-3)]">
                  Nothing matches “{q}”.
                </li>
              )}
              {results.map((r, i) => (
                <li key={`${r.href}-${r.title}`}>
                  <button
                    type="button"
                    onClick={() => go(r.href)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-baseline gap-2.5 rounded-md px-3 py-2 text-left transition-colors ${
                      i === active ? 'bg-[var(--surface-3)]' : ''
                    }`}
                  >
                    <span className="num w-[58px] shrink-0 text-[10px] text-[var(--ink-3)]">
                      {KIND_LABEL[r.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-[var(--ink)]">
                        {r.title}
                        {r.parent && (
                          <span className="text-[var(--ink-3)]"> · {r.parent}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--ink-3)]">
                        {r.text.slice(0, 110)}
                      </span>
                    </span>
                    {r.meta && (
                      <span className="num shrink-0 text-[11px] text-[var(--ink-2)]">{r.meta}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2 text-[10.5px] text-[var(--ink-3)]">
              <span className="num">↑↓ navigate</span>
              <span className="num">↵ open</span>
              <span className="num ml-auto">{results.length} of {ENTRIES.length}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
