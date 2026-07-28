'use client'

import { createClient, type RealtimeChannel } from '@supabase/supabase-js'

/**
 * Live detections, events and verdicts, straight from the database.
 *
 * Subscribes only to what is worth interrupting for. Telemetry is deliberately
 * not in the publication: one node at 20 Hz across ten channels is two hundred
 * rows a second and a browser wants a summary, not the rows. See
 * schema/sql/0009_realtime.sql.
 *
 * Three things this has to get right, and they are the three that go wrong.
 *
 * Bounded memory. A tab left open overnight receives an unbounded number of
 * messages, and a naive `setState(prev => [...prev, row])` grows until the tab
 * dies. Everything here goes into a ring buffer with a fixed ceiling.
 *
 * Visible loss. When the buffer overflows the oldest entry is dropped and the
 * drop is counted and surfaced. Silent loss is the failure mode this whole
 * project exists to avoid, and that applies to the viewer as much as to the
 * node: a chart that quietly forgot the first hour is lying about what it
 * shows.
 *
 * Honest connection state. A stream that has disconnected looks exactly like a
 * stream where nothing is happening, and the difference matters completely. The
 * status is reported rather than inferred from whether rows are arriving.
 */

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'error' | 'closed'

export interface StreamEvent<T = Record<string, unknown>> {
  table: 'detections' | 'events' | 'verdicts' | 'node_heartbeats'
  kind: 'INSERT' | 'UPDATE' | 'DELETE'
  row: T
  /** When this client received it, not when it happened. */
  receivedAt: number
}

export interface StreamState {
  status: StreamStatus
  events: StreamEvent[]
  /** Rows discarded because the buffer was full. Displayed, never hidden. */
  dropped: number
  /** Rows seen since subscribing, including those since dropped. */
  seen: number
  lastMessageAt: number | null
}

const DEFAULT_CAPACITY = 300

export interface StreamOptions {
  tables?: StreamEvent['table'][]
  capacity?: number
}

/**
 * An external store, so React can subscribe without the component owning a
 * websocket. Same reasoning as the hash router elsewhere: this is state that
 * lives outside React and changes without React's involvement.
 */
export function createArchiveStream(opts: StreamOptions = {}) {
  const tables = opts.tables ?? (['detections', 'events', 'verdicts'] as const).slice()
  const capacity = opts.capacity ?? DEFAULT_CAPACITY

  let state: StreamState = {
    status: 'connecting',
    events: [],
    dropped: 0,
    seen: 0,
    lastMessageAt: null,
  }
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  const set = (patch: Partial<StreamState>) => {
    state = { ...state, ...patch }
    emit()
  }

  const push = (e: StreamEvent) => {
    const next = state.events.concat(e)
    let dropped = state.dropped
    // Drop the oldest, and count it. The count is what makes this honest
    // rather than merely bounded.
    while (next.length > capacity) {
      next.shift()
      dropped += 1
    }
    state = {
      ...state,
      events: next,
      dropped,
      seen: state.seen + 1,
      lastMessageAt: Date.now(),
    }
    emit()
  }

  let channel: RealtimeChannel | null = null
  let client: ReturnType<typeof createClient<any, 'nband', 'nband'>> | null = null

  const connect = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      set({ status: 'error' })
      return
    }
    // The anonymous key, so row-level security applies to the stream exactly as
    // it does to a query. A simulated node's detections never arrive here.
    // Same generic parameters the ingest and archive paths use: without them
    // the default Database type insists the schema is undefined.
    client = createClient<any, 'nband', 'nband'>(url, key, {
      db: { schema: 'nband' },
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })

    // The supabase-js overloads for postgres_changes are keyed on a literal
    // event name, so a loop over table names does not narrow. The subscription
    // itself is correct; the types cannot express it built dynamically.
    const ch = client.channel('nband-archive') as unknown as {
      on: (
        type: string,
        filter: Record<string, unknown>,
        cb: (payload: { eventType: string; new?: unknown; old?: unknown }) => void,
      ) => typeof ch
      subscribe: (cb: (status: string) => void) => RealtimeChannel
      unsubscribe: () => void
    }
    for (const table of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'nband', table }, (payload) => {
        push({
          table,
          kind: payload.eventType as StreamEvent['kind'],
          row: (payload.new ?? payload.old ?? {}) as Record<string, unknown>,
          receivedAt: Date.now(),
        })
      })
    }
    channel = ch as unknown as RealtimeChannel
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') set({ status: 'live' })
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') set({ status: 'reconnecting' })
      else if (status === 'CLOSED') set({ status: 'closed' })
    })
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) connect()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          channel?.unsubscribe()
          void client?.removeAllChannels()
          channel = null
          client = null
          set({ status: 'closed' })
        }
      }
    },
    getSnapshot: () => state,
    // The server has no stream, and must return a stable value or
    // useSyncExternalStore loops.
    getServerSnapshot: (): StreamState => SERVER_SNAPSHOT,
  }
}

const SERVER_SNAPSHOT: StreamState = {
  status: 'connecting',
  events: [],
  dropped: 0,
  seen: 0,
  lastMessageAt: null,
}
