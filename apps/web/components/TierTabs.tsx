'use client'

/**
 * One tier picker, used everywhere a tier is picked.
 *
 * There were three: the board viewer's, the system schematic's, and the one on
 * the wiring and power panels. The buttons were byte-identical by luck rather
 * than by construction, the surrounding chrome was not, and the accessible name
 * was "Board tier" in one place, "Node tier" in another and "Tier" in a third
 * for a control that does the same thing to the same three tiers. A reader
 * moving between panels on /hardware met two visibly different pickers.
 *
 * Two variants, because there are genuinely two positions. `header` sits at the
 * top of a card as its own strip. `standalone` sits above content that brings
 * its own card and needs its own outline.
 */

export interface TierTabItem {
  id: string
  label: string
  /** Small monospace note after the label: part count, module count, cost. */
  meta?: string
}

export function TierTabs({
  items,
  active,
  onSelect,
  status,
  controls,
  variant = 'header',
}: {
  items: TierTabItem[]
  active: string
  onSelect: (id: string) => void
  /** Right-aligned summary of whatever is selected. */
  status?: string
  /** id of the panel this controls, for aria-controls. */
  controls?: string
  variant?: 'header' | 'standalone'
}) {
  const shell =
    variant === 'header'
      ? 'border-b border-[var(--line)]'
      : 'mb-5 rounded-[var(--radius-card)] border border-[var(--line)]'

  return (
    <div
      role="tablist"
      aria-label="Tier"
      className={`flex flex-wrap items-center gap-1 bg-[var(--surface-3)] p-2 ${shell}`}
    >
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          aria-controls={controls}
          onClick={() => onSelect(t.id)}
          className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
            t.id === active
              ? 'bg-[var(--surface-1)] font-semibold text-[var(--ink)]'
              : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
          }`}
        >
          {t.label}
          {t.meta && <span className="num ml-2 text-[11.5px] text-[var(--ink-3)]">{t.meta}</span>}
        </button>
      ))}
      {status && (
        <span className="num ml-auto pr-1 text-[11.5px] text-[var(--ink-3)]">{status}</span>
      )}
    </div>
  )
}
