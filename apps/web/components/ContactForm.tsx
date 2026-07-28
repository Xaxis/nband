'use client'

import { useState } from 'react'

/**
 * Contact, placed where someone who wants to reach the project already is.
 *
 * Deliberately not a standalone page. For an open-source hardware project most
 * "contact" traffic belongs somewhere more useful than an inbox: a bug is an
 * issue, a substitute part is a registry entry, a question about a build step
 * is worth answering in public where the next person finds it. So the form
 * leads with those routes and takes the residue.
 */

const SUBJECTS = [
  { id: 'build-help', label: 'Build help' },
  { id: 'variant', label: 'Hardware variant' },
  { id: 'data', label: 'Data and archive' },
  { id: 'site', label: 'Site issue' },
  { id: 'other', label: 'Something else' },
] as const

type State = 'idle' | 'sending' | 'sent' | 'error'

export function ContactForm() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    setError(null)
    const data = Object.fromEntries(new FormData(e.currentTarget))

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Surface the reason. A bare "something went wrong" leaves the sender
        // unable to tell a typo from an outage on this end.
        throw new Error(
          res.status === 503
            ? 'Contact is not configured on this deployment yet. Open a GitHub issue instead.'
            : (body.error ?? `Request failed (${res.status})`),
        )
      }
      setState('sent')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Could not send')
    }
  }

  if (state === 'sent') {
    return (
      <div className="card p-6">
        <p className="text-[15px] font-medium text-[var(--ink)]">Sent.</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
          If it needs an answer you will get one. If it turns out to be generally useful, the answer
          will probably end up in the documentation rather than only in your inbox.
        </p>
      </div>
    )
  }

  const field =
    'w-full rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus-visible:border-[var(--accent)]'

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow mb-1.5 block">Name</span>
          <input name="name" required maxLength={120} className={field} autoComplete="name" />
        </label>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Email</span>
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            className={field}
            autoComplete="email"
          />
        </label>
      </div>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Topic</span>
        <select name="subject" className={field} defaultValue="build-help">
          {SUBJECTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Message</span>
        <textarea name="message" required minLength={10} maxLength={5000} rows={5} className={field} />
      </label>

      {/* Honeypot. Hidden from people and from assistive technology; bots fill
          every field they find. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={state === 'sending'}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-[13.5px] font-medium text-[var(--accent-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
        {error && (
          <span role="alert" className="text-[12.5px] text-[#d03b3b]">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}
