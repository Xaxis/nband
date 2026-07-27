import { NextResponse } from 'next/server'
import { getFeed } from '../../../lib/feed'

export const dynamic = 'force-dynamic'

/**
 * Window read for the telemetry view. Deliberately thin: it validates and
 * clamps the request, then delegates to whichever feed is configured. The
 * route has no idea whether it is serving synthetic or live data.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const node = url.searchParams.get('node')
  const from = Number(url.searchParams.get('from'))
  const to = Number(url.searchParams.get('to'))

  if (!node || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return NextResponse.json({ error: 'node, from, and to are required' }, { status: 400 })
  }

  // Cap the span so a hand-crafted URL cannot ask for a year of samples.
  const MAX_SPAN_MS = 31 * 86_400_000
  const span = Math.min(to - from, MAX_SPAN_MS)
  const window = { from: to - span, to }

  const feed = getFeed()
  try {
    const [series, events] = await Promise.all([
      feed.getSeries(node, window),
      feed.listEvents(node, window),
    ])
    return NextResponse.json(
      { source: feed.kind, window, series, events },
      { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=30' } },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'feed error' },
      { status: 502 },
    )
  }
}
