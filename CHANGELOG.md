# Changelog

Notable changes to the platform. Because hardware, firmware, database, and
documentation ship on one version, an entry here can affect all four.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are the value in `VERSION`, which every document declares itself
written against and which `make drift` enforces.

## [Unreleased]

### Changed
- Renamed from BIFROST to **nband**, with the domain **nband.space**. The
  Postgres schema, Python packages, npm workspace, HTTP headers, environment
  variables, filesystem paths, and CLI all moved with it.
- **Breaking (wire protocol).** Ingest signatures now cover the request path, a
  timestamp, and a single-use nonce in addition to the body. Nodes must send
  `X-Nband-Timestamp` and `X-Nband-Nonce`; requests older than five minutes or
  replaying a nonce are refused. Older agents cannot write to the grid.
- Tier budgets are restated from the sourced part prices rather than aspiration,
  and a drift check keeps them honest. Tiers now cost $460 / $1,650 / $5,228.
- The GNSS pulse-per-second input moved from GPIO18 to **GPIO4, physical pin 7**.
  GPIO18 is the I2S bit clock and was claimed by the microphone on any node
  carrying both. Existing builds must move one wire and update `config.txt`.
- `NoiseFloor` forgets exponentially instead of averaging over a node's whole
  lifetime, so thresholds follow a channel's diurnal cycle instead of sitting
  between day and night.

### Fixed
- **Row level security stopped at the telemetry partitions.** Every policy the
  archive relies on was attached to `nband.telemetry`, the partitioned parent,
  and none of them to the partitions underneath it. Postgres applies the
  parent's policy only when the parent is the table being queried, so a
  partition named directly answered with every row it held, including samples
  from simulated and non-public nodes that 0004 and 0005 exist to withhold.
  Migration 0002 compounded it by granting `select` on each new partition to
  `anon` and `authenticated`, grants that were never needed because permission
  for a partitioned read is checked on the parent alone. Nothing was served:
  PostgREST does not route to partitions, so the Data API never exposed them.
  That is one component's behaviour rather than a guarantee this schema made.
  Migration 0010 enables RLS with no policy on every partition, which denies
  direct access outright, drops the grants, and adds an event trigger so a
  partition created by the ingest path or by hand is secured on creation rather
  than on remembering. Verified against the live database: a read through the
  parent still returns its rows, and a direct partition read is refused.
- **Published node positions could be de-fuzzed to about five metres.** The
  offset's bearing was derived by hashing the node's Ed25519 public key, which
  was itself a column on the world-readable `nodes` row, so anyone could
  recompute the offset and subtract it. The distance was always exactly
  `location_precision_m`, placing every node on a known circle rather than
  anywhere inside a disc — a 1 km precision meant a 0.14 km² annulus instead of
  3.1 km². Four pages promised operators the opposite. The offset is now an
  HMAC over a server-only `NBAND_FUZZ_SALT`, the radius is drawn as
  `precision × √u` so the point is uniform over the disc, the public key is no
  longer granted to the anonymous role, and `make privacy` measures the
  resulting distribution rather than asserting it in a comment. No operator was
  affected: the node table was empty and the feed was still mock.
- **The americium-241 dose "correction" was wrong by two orders of magnitude**,
  in the alarming direction, and stood on the live safety page. A tabulated
  constant of 3.2 × 10⁻² mGy·m²/(GBq·h) was published as "3.2 µSv/h per MBq" —
  the mGy→µGy and GBq→MBq conversions cancel, so the only error was the dropped
  10⁻², a factor of exactly one hundred.
  The real figure is 1–28 nSv/h at one metre depending on whether the soft
  neptunium L X-rays are counted, against a 340 nSv/h background — a few
  percent of background, never three times it. The retracted original was
  approximately right. The accompanying claim that 2 mm of aluminium does not
  help was also wrong. The module stays withdrawn: 10 CFR 30.15 was always the
  real reason and is sufficient on its own.
- **The node agent never graded its own clock.** It asserted `gnss_pps` with a
  fabricated offset on every real run, so the strongest gate on the
  classification ladder was a constant in production and a free-running node
  could contribute to cross-node geometry.
- **Nanosecond timestamps lost up to 999 microseconds** on ingest. The
  timestamp was built with millisecond-resolution `Date`, while the schema
  documentation promised a lossless round trip. It is lossless now.
- **Catalogue checks that could not be performed were recorded as clean.** An
  event with no bearing was treated as though ADS-B had cleared it.
- Three of the eight declared catalogues had no implementation, so an event
  could reach `unresolved` having silently skipped meteor showers, space
  weather, and airspace notices.
- Simulated data was publicly readable through events, verdicts, catalogue
  checks, artifacts, and heartbeats despite being flagged.
- The coincidence detector bounded its window on one side only, and a solo
  detection left its trigger pending so one crossing could be counted twice.
- `ChannelConfig.calibration` did not exist; two drivers raised
  `AttributeError` on every real node.
- The systemd unit set `WatchdogSec` with nothing sending notifications, which
  would SIGABRT a healthy node every five minutes.
- The spool rewrote itself non-atomically, and a single truncated line wedged
  the agent permanently.
- `--ink-3` failed WCAG AA against every surface in both themes.
- Every page shared one Open Graph title, so any shared link claimed to be the
  homepage.
- The spectrum axis placed acoustic and seismic channels on the electromagnetic
  wavelength scale, converting sound frequency with the speed of light.

### Corrected
Claims that were wrong, and wrong in the reassuring direction:
- **10 CFR 30.15** was described as a general-license threshold covering a 9 µCi
  aggregate. It is an exemption, limited to 1 µCi **per detector** in an intact
  fire-protection device. The aggregated source is withdrawn from the reference
  bill of materials.
- **FCC Part 15** has no 100 mW allowance at 400–600 MHz; that band is not ISM
  and §15.209 limits field strength to nearer nanowatts. The broadband emitter
  is withdrawn.
- The **americium-241 dose figure** was restated as roughly 1,070 nSv/h at one
  metre, "about three times natural background". **This correction was wrong**
  and is itself retracted below. The dose was never the reason the
  module was withdrawn; 10 CFR 30.15 was, and that part of the entry stands.

### Added
- Site search over pages, document sections, bands, parts, and concepts.
- Interactive discriminator that runs the real scoring logic, held to the Python
  engine by a conformance check.
- Wiring, pinout, and power-budget diagrams generated from the hardware registry.
- Band-versus-phenomenon detection matrix and atmospheric transmission curve.
- 3D hero scene showing detection shells at their real schema ranges.
- Replay protection, `make` as a single entry point, and this changelog.

## [0.1.0] — 2026-07-27

Initial platform: canonical schema, grid database, node agent, discriminator,
ingest API, and the documentation site.
