# The public data layer

Status: **plan, not implementation.** Nothing described here beyond the ingest
and storage section exists yet. It lives in `design/` rather than `content/`
precisely so it is not published as though it were a feature.

Written 2026-07-28, against platform v0.1.0.

## What is actually built today

Worth stating plainly, because the gap between the two halves is wide.

The write path is real. Nodes enrol with an Ed25519 key, sign every request
over a canonical payload binding path, timestamp and single-use nonce, and post
to four endpoints. Telemetry lands in monthly Postgres partitions provisioned
on demand. Detections open single-node events. Verdicts are versioned per
discriminator run rather than overwritten. Catalogue checks record
matched, checked-clean and unreachable as three distinct states. Row-level
security makes the browser key read-only, and simulated nodes are excluded from
every public read by policy rather than by convention.

The read path is not. `NEXT_PUBLIC_FEED_SOURCE` is `mock` in all three Vercel
environments, so `/grid` and `/telemetry` render synthetic data and have never
displayed a row from the database. The `supabase_realtime` publication contains
no tables, so nothing streams. There are no materialized views, so nothing is
aggregated. Site search covers documents, parts and bands, and does not reach a
single detection. There is no export.

So: the archive is designed to be indexable, searchable and aggregated. It is
none of those things yet, and the site is not even reading it.

## The order this has to happen in

Realtime before archive, and archive before export. Each depends on the one
before it having a settled shape, and building the query surface against mock
data would mean designing against a fiction.

### 1. Read the real database

Replace the mock feed with the Supabase one behind the existing `feed`
interface, which was written for exactly this substitution. Two things must be
true before the switch: the empty state has to read as "no node has reported
yet" rather than as a broken page, and the page has to say which source it is
showing. A site that silently swaps synthetic data for real data has taught its
readers that the distinction does not matter.

Keep the mock feed. It is how the interface is developed without a node, and
how the empty and degraded states stay testable.

### 2. Realtime

Two different needs, and conflating them produces something that serves
neither.

**Live telemetry** is high-rate, low-value-per-row, and only interesting in the
last few minutes. A node at 20 Hz across ten channels is 200 rows a second, and
a browser does not want them individually. This wants a server-side aggregate
pushed at a fixed cadence — one message per node per second carrying a summary
per channel — not a row-level subscription.

**Detections and verdicts** are the opposite: rare, individually meaningful,
and worth interrupting for. These want a genuine row-level subscription.

```
publication supabase_realtime:  detections, events, verdicts, node_heartbeats
                                (never telemetry — see above)
```

The subscription must respect the same RLS the REST surface does, so a
simulated node's detections never appear. That is worth an explicit test rather
than an assumption, because it is exactly the leak that migration 0005 already
had to close once.

Backpressure is a client concern the plan has to name: a tab left open for a
day must not accumulate unbounded state. Bounded ring buffer, drop oldest,
display the drop count. Silent loss is the failure mode this project exists to
avoid, and that applies to the viewer as much as to the node.

### 3. The archive

The query surface people will actually want:

```
GET /api/archive/events
  ?from=<iso8601>&to=<iso8601>
  &band=<band id, repeatable>
  &classification=<enum, repeatable>
  &node=<slug, repeatable>
  &min_score=<0-100>
  &corroboration=<enum>
  &catalogues=complete|any        # complete excludes any unreachable check
  &cursor=<opaque>&limit=<=200
```

`catalogues=complete` is the one filter that is not obvious and is the most
important. An event whose ADS-B check could not be performed is not evidence of
anything, and the default view of the archive must not mix those in with events
that were properly checked. It defaults to `complete`.

Cursor pagination, not offset: the archive only grows, and offset pagination
over a growing table silently repeats and skips rows.

Aggregation wants materialized views refreshed on a schedule, not computed per
request:

- `mv_events_daily` — count by day, band, classification, node
- `mv_node_uptime` — heartbeat coverage and clock quality distribution per node
- `mv_catalogue_availability` — how often each catalogue was reachable

That last one is a health metric for the archive itself. A rising unreachable
rate means the archive is accumulating events that could not be checked, and
that should be visible on the site rather than discovered later.

### 4. Export and citation

An archive nobody can download is not an archive. Versioned snapshots, content
addressed, with a stable schema and a documented deprecation policy:

```
/exports/2026-08/events.parquet        + .sha256
/exports/2026-08/verdicts.parquet
/exports/2026-08/MANIFEST.json         schema version, row counts, generated at
```

Every snapshot gets a citable identifier so a published analysis can name the
exact bytes it was computed from, and so a later reader can tell whether a
verdict has since been superseded. The discriminator is versioned per run for
this reason already; the export has to carry that through.

## The constraint that governs all of it

Never let the archive claim more than the instrument measured. For the data
layer specifically:

- An event with any unreachable catalogue is excluded from the default view and
  labelled wherever it does appear.
- Aggregates state their denominator. "Six unresolved events" without "of 4,200
  checked" is a number designed to mislead.
- A gap in a chart means no data, and must be visually distinct from a measured
  zero.
- Simulated data is never in a public aggregate, and the exclusion is enforced
  by policy and tested, not left to a query author to remember.
- Export snapshots are immutable. A verdict that changes produces a new row in a
  new snapshot; it never rewrites an old one.

## What has to be decided before building

- Retention. Full-rate telemetry is roughly 500 MB per node-year. Keep raw for
  90 days and downsample after, or keep everything and pay for it?
- Whether the archive API is a thin layer over PostgREST or its own route. The
  filters above, particularly `catalogues=complete`, argue for its own route.
- Rate limiting on a public read API that anyone can scrape.
- Whether verdict supersession is exposed in the API or only in exports.
