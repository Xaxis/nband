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
  and a drift check keeps them honest. Tiers now cost $460 / $1,650 / $5,100.
- The GNSS pulse-per-second input moved from GPIO18 to **GPIO4, physical pin 7**.
  GPIO18 is the I2S bit clock and was claimed by the microphone on any node
  carrying both. Existing builds must move one wire and update `config.txt`.
- `NoiseFloor` forgets exponentially instead of averaging over a node's whole
  lifetime, so thresholds follow a channel's diurnal cycle instead of sitting
  between day and night.

### Fixed
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
- The **americium-241 dose figure** was understated by a factor of nearly thirty:
  roughly 1,070 nSv/h at one metre, about three times natural background, not
  the "under one percent" published.

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
