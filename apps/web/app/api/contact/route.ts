import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

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
