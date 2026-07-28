---
title: Data schema
description: The contract every node, the database, the discriminator, and the website share. What each table means and why it is shaped that way.
version: 0.1.0
section: Reference
order: 30
updated: 2026-07-27
audience: Anyone reading the archive or writing against it
---

Two files in the repository define the platform: `schema/bands.json` and `schema/spec.json`. The band taxonomy, every enumeration, the hypothesis set, and the platform-wide thresholds live there and nowhere else. TypeScript for the website and Python for the firmware are generated from them, the Postgres enumerations are checked against them, and `yarn check:drift` fails the build if any of those three drift apart.

That is the whole reason the website and a node on a mast cannot disagree about what a band is. Adding one means editing a single file and regenerating.

## Bands are physics, not products

A band is defined by what it physically responds to, never by which part you bought. Two builders using different thermal cameras contribute to the same `lwir` band; the difference between them is carried by the sensor's declared capabilities rather than by pretending the data is identical.

Fourteen bands are ordered by increasing wavelength, and that order is persisted: `ordinal` is stored in the database, so reordering bands is a breaking change requiring a migration rather than an edit. Twelve are detection bands. Two are context bands that describe the conditions a detection was made under and can never produce one themselves. Thirteen of the fourteen have a sensor in the hardware registry; the gravimetric band has none and is documented as aspirational.

## Timestamps carry their own precision

A Postgres `timestamptz` holds microseconds. A GNSS-disciplined node holds nanoseconds. Rather than throwing away the difference, `telemetry` stores `t` as a `timestamptz` plus `t_ns_offset`, a small integer holding the remaining 0 to 999 nanoseconds. Full fidelity survives the round trip.

This matters in exactly one place and matters completely there: time-of-arrival differences between nodes. Everything else reads `t` alone and ignores the offset.

Nodes transmit these as decimal strings rather than JSON numbers. Nanoseconds since the epoch is roughly 1.8 × 10^18, about two hundred times larger than the biggest integer a JavaScript number can hold exactly, so a JSON number would arrive already rounded and the precision would be gone before anything could validate it. The ingest API parses them as arbitrary-precision integers.

## Every sample carries a quality bitfield

`telemetry.q` is a bitfield, not a boolean. Bit 0 means the clock was degraded when the sample was taken, bit 1 that the sensor was saturated, bit 2 that its calibration was stale, bit 3 that the node's own emitter was active, bit 4 that the value was interpolated.

Compromised samples are recorded and flagged rather than dropped. A gap in a chart reads as "nothing happened" when the truth is "we could not trust this", and those are different claims.

## Detections are local, events are global

A `detection` is one node deciding a window of data was worth keeping. It carries the bands that witnessed it, the trigger reason, the clock quality at that moment, and a bearing. Its `range_m` is null unless something physically measured it, and the schema keeps it null rather than inferring it, because an assumed range silently becomes an assumed size and an assumed speed.

An `event` is one or more detections fused into a single object, possibly across nodes. Geometry fields are populated only when geometry was actually solvable: two or more nodes with pulse-per-second lock inside the baseline limit.

## Verdicts are versioned, never overwritten

Each `verdict` records the discriminator version and schema version that produced it, and only one per event is `is_current`. Re-running an improved discriminator over the archive inserts a new verdict beside the old one and demotes the previous. An event called unresolved in 2026 and explained in 2028 keeps both entries, and the history of how the platform's opinion changed is itself part of the record.

## Catalogue checks record what was not checked

`catalog_checks` has an `available` column separate from `matched`. Three outcomes are distinguishable: a catalogue matched the event, a catalogue was reachable and found nothing, or a catalogue could not be consulted at all.

This is the most important design decision in the schema. If the aircraft transponder feed was down, every aircraft that night looks unexplained, and a system that records only "no match" will confidently manufacture mysteries out of its own outages. An event with any unavailable catalogue is structurally barred from the top of the classification ladder.

## Node positions are deliberately imprecise

Operators run these at home, so an exact coordinate is a home address. `nodes.lat` and `nodes.lon` are already fuzzed when written; the true position is never stored anywhere. `location_precision_m` records how much fuzz was applied so downstream geometry can widen its error bars rather than treating a fuzzed point as exact.

The offset has to be two things at once, and an earlier version of this platform delivered only the first.

It must be **deterministic** per node, because an offset regenerated on each request is averaged away by anyone patient enough to collect samples, and the mean of that collection is the operator's front door.

It must also be **unguessable**, because a deterministic offset that a stranger can recompute is not an offset at all — it is the true position written in a cipher whose key is printed next to it. In 0.1.0 the bearing was derived by hashing the node's public key, which is stored on the same publicly readable row, and the distance was always exactly `location_precision_m`. Both halves could be reconstructed from published data, and reviewers inverted them to about five metres.

Now the offset is an HMAC keyed on a salt held only in the server's environment, and the distance is drawn as `precision × √u` so that the true point is uniform across the whole disc rather than pinned to its rim. A searcher who knows the slug, the declared precision, the published coordinate and every line of this codebase is left with the full disc — for the default one-kilometre precision, about three square kilometres, with a median error of roughly 700 m. `tools/check-privacy.mjs` measures that distribution on every build rather than taking this paragraph's word for it.

`horizon_mask` maps azimuth to the minimum elevation at which sky is actually visible. Without it, "nothing detected to the north" is ambiguous between a clear sky and a ridgeline, and the archive cannot tell you which.

## Reading it

Everything is public. The browser-visible key is read-only by row-level-security policy rather than by convention, and every write goes through the signed ingest API using the service role.

```sql
-- Unresolved events with their reasoning, most recent first.
select e.t_start, e.bands, v.anomaly_score, v.explanation
  from nband.events e
  join nband.verdicts v on v.event_id = e.id and v.is_current
 where v.classification = 'anomalous_unresolved'
 order by e.t_start desc;

-- Which catalogues were unavailable, and how often. A high count here means
-- the archive is accumulating events that could not be properly checked.
select source, count(*) filter (where not available) as unavailable, count(*) as total
  from nband.catalog_checks
 group by source order by unavailable desc;
```
