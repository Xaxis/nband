---
title: API reference
description: The four signed endpoints a node speaks to the grid, and the public read surface.
version: 0.1.0
section: Reference
order: 40
updated: 2026-07-27
audience: Anyone writing a client or debugging a node that will not report
---

Base URL is `https://nband.space`. Writes require a signature. Reads do not require anything.

## Authentication

Every write is signed with the node's Ed25519 private key, which is generated on the node at first run and never leaves it. Six headers accompany each request:

```
X-Nband-Node:       your-node-slug
X-Nband-Key:        base64url public key, no padding
X-Nband-Signature:  base64url signature over the canonical payload below
X-Nband-Timestamp:  seconds since the epoch, as a decimal string
X-Nband-Nonce:      a value never used before by this node
X-Nband-Schema:     0.1.0
```

The signature does **not** cover the body alone. It covers a canonical payload that binds the request to one endpoint, one moment, and one use:

```
nband/v1\n{path}\n{timestamp}\n{nonce}\n{body}
```

`{path}` is the request path exactly as sent, such as `/api/grid/telemetry`. The four newlines are literal. A signature over the body alone was valid forever, on any endpoint, and could be replayed to fabricate archive content, the three bound fields close that, and each closes a different hole. The path stops a telemetry signature being presented to `/detections`. The timestamp bounds how long a captured request stays usable: more than **300 seconds** of skew in either direction is refused with a 401. The nonce is recorded in a server-side ledger and makes the request usable exactly once inside that window; a repeat is refused with a 409.

Omitting `X-Nband-Timestamp` or `X-Nband-Nonce` is a 401, not a warning. Nodes on the body-only scheme cannot write to the grid.

The body portion is the raw bytes, so serialise once and sign the bytes you actually send. Re-serialising between signing and sending is the most common cause of a 401 that looks inexplicable.

The schema header is checked against the grid's own version. A node running a different schema is writing rows whose meaning may differ, so it is rejected with a 409 naming both versions rather than accepted and quietly reconciled.

Failures return a JSON body with an `error` string and usually a `detail` object. The node agent surfaces both; a client that discards them leaves its operator staring at a bare status code.

## POST /api/grid/register

Enrols a node and declares its channels. This is the only write that cannot use normal authentication, because the node is not on record yet. It instead proves two things: possession of the private key matching the public key it claims, by signing the request, and knowledge of the grid enrolment secret.

Re-enrolment by a node signing with the key already on record is allowed and is how you update the channel list after adding hardware. Enrolling a new slug requires the secret. The channel set is replaced wholesale, because a stale channel row would advertise a band the node no longer has, which the discriminator would read as "looked and saw nothing".

```json
{
  "slug": "kp-01-sonoran",
  "display_name": "KP-01 Sonoran",
  "tier": "t2",
  "pubkey": "<base64url>",
  "enrollment_secret": "...",
  "site": { "lat": 31.9403, "lon": -109.312, "elevation_m": 1402,
            "location_precision_m": 1000, "horizon_mask": { "0": 4.0, "180": 12.0 } },
  "channels": [
    { "channel_id": "vis.wide", "band": "vis", "unit": "mag/arcsec2",
      "sample_rate_hz": 0.2, "part_id": "cam-hq-imx477", "role": "detection" }
  ]
}
```

The response returns the `published_position`, which is your declared position offset by the precision you asked for. Check it before continuing. Your exact coordinates are not stored anywhere.

## POST /api/grid/telemetry

Up to 5000 samples per batch.

```json
{ "samples": [
  { "channel_id": "lwir.main", "band": "lwir", "t_ns": "1785177283687169000", "v": 243.12, "q": 0 }
] }
```

`t_ns` is a decimal **string**. Sent as a JSON number it exceeds what a JavaScript parser can represent exactly and arrives already rounded, which destroys the nanosecond precision the pulse-per-second lock exists to provide. A number is still accepted below the safe-integer ceiling, for hand-written requests, and rejected with an explanation above it.

The handler provisions any monthly partitions the batch touches before inserting, so a node returning from three weeks offline backfills correctly. If a partition cannot be created the request fails with a 500 rather than letting rows fall into the default partition, which is a fault that stays invisible until someone inspects the database directly.

## POST /api/grid/detections

Up to 50 per batch. Each detection also opens a single-node event so the discriminator has something to score; cross-node fusion merges events afterwards.

Omit `range_m` unless something measured it. Do not compute it from an assumed altitude.

## POST /api/grid/heartbeat

Health, every 60 seconds. This is the only thing that moves a node between `online`, `degraded`, and `offline`.

A node whose clock has fallen below GNSS discipline is marked `degraded` even when every sensor is healthy, because without pulse-per-second lock it can no longer contribute the geometry that makes a node worth having in an array.

## GET /api/archive/events

The query surface over the archive. No authentication: everything the platform records is public.

```
GET /api/archive/events
  ?from=<iso8601>&to=<iso8601>
  &band=<band id, repeatable>
  &classification=<enum, repeatable>
  &corroboration=<enum>
  &min_score=<0-100>
  &catalogues=complete|any
  &cursor=<iso8601 from next_cursor>&limit=<=200
```

`catalogues` defaults to **complete**, and this is the one parameter worth understanding before you use the endpoint. An event whose ADS-B check could not be performed is not evidence of anything: if the transponder feed was unreachable, every aircraft that night looks unexplained. Those events are excluded from the default view and asking for them with `catalogues=any` is a deliberate choice that comes back labelled in the response.

Every response carries the filters that produced it and the denominator behind it:

```json
{
  "query":  { "band": ["rf", "vis"], "min_score": 70, "catalogues": "complete", "...": "..." },
  "counts": { "returned": 12, "examined": 47, "excluded_incomplete_catalogues": 35 },
  "note":   "Events with any unreachable catalogue check are excluded...",
  "next_cursor": "2026-07-14T22:19:03.221Z",
  "events": []
}
```

`counts.examined` is there so that "twelve unresolved events" is never quoted without "of forty-seven examined". A count without its denominator is a number designed to mislead, and this endpoint is what people will build that sentence from.

Positions come back as `fix_lat`, `fix_lon` and `fix_altitude_m` with `fix_error_m` beside them, because a fix is something that was solved rather than a property the event has, and a coordinate published without its error bar is the same overclaim as a range that was assumed rather than measured. All three are null unless geometry was actually solvable.

Pagination is by cursor rather than offset. The archive only grows, and an offset into a growing table silently repeats and skips rows as it does. Pass the `next_cursor` you were given; a null means you have reached the end.

Reads are served through the same anonymous key the browser uses, so row-level security applies identically. Simulated nodes are excluded by policy rather than by the query remembering to.

## GET /api/archive/export

Bulk download, as newline-delimited JSON. An archive nobody can download is not an archive.

```
GET /api/archive/export?table=events|verdicts|detections|catalog_checks
  &from=<iso8601>&to=<iso8601>&max=<=100000
```

NDJSON rather than CSV or Parquet, for reasons that are specific rather than taste. CSV cannot represent the shape of this data: `bands` is an array, `peak_metrics` and `track` are JSON, and flattening them loses the structure that makes them worth keeping. Parquet would be better for anything columnar but needs a writer holding the result in memory, and this streams, because the archive grows without bound. NDJSON streams, survives being cut in half, and every language reads it.

The last line of every export is a manifest rather than a row:

```json
{"nband_manifest": true, "schema_version": "0.1.0", "table": "events", "rows": 5,
 "truncated": false, "sha256": "8efeda08...", "generated_at": "2026-07-28T19:24:11Z",
 "excludes": "Simulated nodes, by row-level security..."}
```

It is last because the digest is only knowable once the rows are written; a reader who wants it first can read the file backwards, and a reader who wants to stream does not have to wait. The digest covers the row lines exactly as transmitted, so an analysis can name the bytes it was computed from and a later reader can check they have the same ones. It is verifiable with `sha256sum` over everything except the final line.

`truncated` tells you whether `max` cut the result short, so a partial export is never mistaken for a complete one.

Exports go through the same anonymous key and the same row-level security as everything else, so simulated nodes are absent, and the manifest says so rather than leaving you to wonder why the row count is lower than the grid page suggests. Superseded verdicts are present and marked `is_current: false`; nothing is ever rewritten in place.

## Reading

`GET /api/telemetry?node=<slug>&from=<ms>&to=<ms>` returns band-by-band series and the events overlapping that window, capped at 31 days. It reports which feed served it, so a client can tell synthetic data from real.

Everything else is reachable through Supabase's PostgREST surface using the public anon key, which is read-only by row-level-security policy. The tables are documented under the data schema.

One exception is worth knowing before it surprises you. `select=*` against `nodes` returns a 403, and you must name the columns you want:

```
GET /rest/v1/nodes?select=slug,display_name,tier,status,lat,lon
```

The anonymous role holds column-level grants on that table rather than a table-level one, so that `pubkey` can be withheld. A node's public key is how it authenticates, it was never needed by any reader, and while it was readable it could be used to reconstruct the offset that obscures an operator's position. Every other column is public and every other table accepts `select=*` normally. New columns added to `nodes` are private until explicitly published, which is deliberate: the failure mode is a visible 403 rather than a silent disclosure.

## Rate limits and etiquette

There are no hard limits yet. The batch ceilings above are the practical ones. A node uploading every 30 seconds with a few thousand samples per batch is the design case.

If you are backfilling weeks of data after an outage, the node agent already paces itself: it drains the spool in bounded batches and stops when the grid stops accepting them, then resumes. Do not replace that with a tight loop.
