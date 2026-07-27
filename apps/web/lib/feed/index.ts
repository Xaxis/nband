import { MockFeed } from './mock'
import { SupabaseFeed } from './supabase'
import type { TelemetryFeed } from './types'

/**
 * The single place the feed implementation is chosen.
 *
 * Swapping the whole site from synthetic data to a live grid is this function
 * returning a different object. No component imports MockFeed or SupabaseFeed
 * directly, so nothing above this line knows or cares which one is running.
 * If NEXT_PUBLIC_FEED_SOURCE is 'live' but the Supabase environment is
 * incomplete, this falls back to the mock rather than rendering a broken page,
 * and says so through `feed.kind`, which the UI surfaces to the reader.
 */

let cached: TelemetryFeed | null = null

export function getFeed(): TelemetryFeed {
  if (cached) return cached

  const source = process.env.NEXT_PUBLIC_FEED_SOURCE ?? 'mock'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  cached = source === 'live' && url && key ? new SupabaseFeed(url, key) : new MockFeed()
  return cached
}

export type { TelemetryFeed } from './types'
export * from './types'
