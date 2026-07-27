---
title: Software and configuration
description: Flashing, configuration, calibration, the data schema, and the API surface a node speaks to the grid.
version: 0.1.0
section: Build
order: 20
updated: 2026-07-27
audience: Someone with a node running who wants to change how it behaves
---

The node agent is a single Python package with no service dependencies beyond the grid endpoint. It is designed to run for months without attention on a board with 2 GB of memory, which constrains the architecture more than anything else: every buffer is bounded at construction, nothing in the hot path grows with uptime, and decoded frames are never queued.

## The configuration file is the whole interface

A node is defined entirely by one TOML file. There is no hidden state and no auto-detection, deliberately. A node that silently reconfigures itself produces an archive nobody can interpret two years later, because the metadata explaining a reading is no longer recoverable from the reading.

The file is validated hard at startup and the agent refuses to run if anything is ambiguous. That includes rejecting a `trigger_sigma` on a context band, which is how the platform structurally prevents a barometric wobble from being reported as a detection.

```toml
[node]
name = "KP-01 Sonoran"
tier = "t2"
pre_roll_s = 15.0     # buffered history promoted when a trigger fires
post_roll_s = 15.0

[site]
latitude = 31.9403
longitude = -109.3120
elevation_m = 1402.0
location_precision_m = 1000   # published position is fuzzed by this radius

[grid]
endpoint = "https://nband.space"
node_slug = "kp-01-sonoran"
key_path = "/var/lib/nband/node.key"

[[channel]]
id = "vis.wide"
band = "vis"
part = "cam-hq-imx477"
unit = "mag/arcsec2"
sample_rate_hz = 0.2
trigger_sigma = 4.5
```

`part` refers to an entry in the hardware registry and resolves automatically to a driver. Specify `driver` directly only when using hardware the registry does not know about, and register the variant afterwards so the next person does not have to guess.

## Choosing trigger thresholds

`trigger_sigma` is measured in standard deviations of that channel's own running noise floor, not in absolute units. This is what lets the same configuration work at a rural site and a suburban one whose radio floor is thirty decibels higher.

The floor is computed with Welford's algorithm over the channel's whole history, so it adapts slowly and does not need recomputing from a window. It requires 64 samples before it will fire at all, which on a 0.2 Hz channel is five minutes. A node that has just restarted is deliberately deaf for that period rather than firing on its own startup transient.

Start at `4.5` for imaging channels and `6.0` for radio. Lower values produce more candidate events, which is not the same as producing more information: the coincidence requirement means a channel that fires constantly mostly generates noise for the other channels to fail to corroborate. If a channel is triggering more than a few times an hour, raise its sigma rather than filtering downstream.

## Calibration

Three channels need calibration before their data means anything in absolute terms.

The magnetometer needs a hard-iron offset, measured by rotating the sensor through all orientations and recording the midpoint of each axis. Without it the channel still detects changes correctly but reports the wrong absolute field, which matters when comparing across nodes.

The thermal camera's flat-field shutter runs automatically every few minutes and blanks the stream for roughly half a second. The agent marks those samples with the calibration-stale quality bit rather than dropping them, so a gap in the record is always visible as a gap rather than as an absence of events.

The sky-brightness channel needs a zero point, which is the reading on a clear moonless night with no artificial light in frame. Until you set it, the channel reports relative values and the discriminator scores it accordingly.

## The data schema

Everything the platform records derives from two files in the repository, `schema/bands.json` and `schema/spec.json`. Those define the band taxonomy, the enumerations, the hypothesis set, and the platform-wide thresholds. TypeScript for the website and Python for the firmware are generated from them by `yarn codegen`, and a drift check fails the build if the generated files are stale.

This is why the website and the node cannot disagree about what a band is. Adding a band means editing one JSON file and regenerating; there is no second place to update and forget.

Two details in the storage schema are worth knowing. Timestamps are stored as a Postgres `timestamptz`, which holds microseconds, plus a separate `t_ns_offset` column holding the remaining 0 to 999 nanoseconds. Nanosecond fidelity therefore survives the round trip, which matters only for cross-node time-of-arrival work but matters completely there. And verdicts are versioned per discriminator run rather than overwritten, so re-running an improved discriminator over the archive produces a new verdict alongside the old one instead of quietly rewriting history.

## The API surface

Four endpoints, all requiring an Ed25519 signature over the request body using the node's key.

`POST /api/grid/register` enrols a node and declares its channels. Re-enrolment by a node signing with the key already on record is allowed and is how you update the channel list after adding hardware. Enrolling a new slug requires the grid enrolment secret.

`POST /api/grid/telemetry` accepts up to 5000 samples per batch. The handler provisions any monthly partitions the batch touches before inserting, so a node returning from three weeks offline backfills correctly rather than dumping into a default partition.

`POST /api/grid/detections` accepts up to 50 detections per batch and opens a single-node event for each so the discriminator has something to score.

`POST /api/grid/heartbeat` reports health and is the only thing that moves a node between online, degraded, and offline. A node whose clock has fallen below GNSS discipline is marked degraded even when every sensor is healthy, because without the pulse-per-second lock it can no longer contribute the geometry that makes it useful.

Reads need no authentication. The archive is public, and the browser-visible key is read-only by row-level-security policy rather than by convention.

## Running offline

The node buffers to a local append-only spool and removes records only once the grid acknowledges them. When the spool reaches its configured ceiling it drops the oldest telemetry first and never touches detections, because losing an hour of barometric pressure costs almost nothing and losing a detection costs the entire point of the exercise.

A node with no network at all is a valid deployment. It will accumulate data until the disk fills, and everything uploads in order when a link appears.
