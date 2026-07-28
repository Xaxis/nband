import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/**
 * In-memory sliding window, keyed by client IP.
 *
 * The only control here was a honeypot field, which stops naive bots and does
 * nothing against anyone who reads the form. This is not a substitute for a
 * real rate limiter backed by shared state, and on a serverless platform each
 * instance keeps its own window, so the effective limit is per-instance. It
 * raises the cost of using this endpoint as a mail relay from nothing to
 * something, and the ceiling is stated rather than implied.
 */
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 3
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k)
    }
  }
  return false
}

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.email().max(200),
  subject: z.enum(['build-help', 'variant', 'data', 'site', 'other']),
  message: z.string().min(10).max(5000),
  // Honeypot. Real people leave it empty; most bots fill everything in.
  website: z.string().max(0).optional(),
})

const SUBJECTS: Record<string, string> = {
  'build-help': 'Build help',
  variant: 'Hardware variant',
  data: 'Data and archive',
  site: 'Site issue',
  other: 'Other',
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'too many messages from this address, try again later' },
      { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid submission' }, { status: 422 })
  }
  const { name, email, subject, message, website } = parsed.data

  // Silently accept honeypot hits so the bot does not learn to adapt.
  if (website) return NextResponse.json({ ok: true })

  const key = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_TO_EMAIL
  const from = process.env.RESEND_FROM_EMAIL
  if (!key || !to || !from) {
    return NextResponse.json(
      { error: 'contact is not configured on this deployment' },
      { status: 503 },
    )
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `nband <${from}>`,
      to: [to],
      // Validated as an email by zod, so it cannot carry a newline and inject
      // additional headers. Stated because reply_to is attacker-controlled.
      reply_to: email,
      subject: `[nband] ${SUBJECTS[subject]} — ${name}`,
      text: `From: ${name} <${email}>\nTopic: ${SUBJECTS[subject]}\n\n${message}`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    // Surface the provider's reason rather than a bare failure: the usual
    // cause is an unverified sending domain, which is fixable and specific.
    return NextResponse.json(
      { error: 'could not send', detail: detail.slice(0, 300) },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
