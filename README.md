# nband

An open multi-spectral sensing platform. A buildable sensor node that watches the sky across fourteen bands at once, timestamps everything against a satellite-disciplined clock, and publishes what it records.

**Site:** https://nband.space

The motivating question is whether anything crosses the sky that conventional explanations do not cover. The design commitment is that the instrument is never allowed to claim more than it measured. The top of the classification ladder is `unresolved`, not `artificial`, and the schema has no way to encode the latter.

## What is in here

Hardware, firmware, database, analysis, and documentation are one repository on one version, because documentation that drifts from the hardware is worse than no documentation. `make check` fails when they diverge.

```
schema/         Canonical source of truth. bands.json and spec.json define the band
                taxonomy, enums, hypothesis set, and platform thresholds. Everything
                else is generated from them.
firmware/       The node agent. Python, runs on a Raspberry Pi 5, runs anywhere in
                --simulate mode.
discriminator/  The analysis engine. Subtracts known sources, scores hypotheses,
                produces verdicts that explain themselves.
apps/web/       The site: landing, documentation, hardware registry, live telemetry,
                and the grid ingest API.
content/        Flat-file documentation, versioned beside the firmware it describes.
tools/          codegen, the four checks, seeding, fixtures, palette derivation.
```

## The parts that are load-bearing

**One schema, three languages.** `tools/codegen.mjs` generates TypeScript for the website and Python for the firmware from `schema/*.json`. The Postgres enums are checked against the same files. Adding a band means editing one file; there is no second place to forget.

**Timing is the whole product.** A node disciplines its clock against GNSS with a hardware pulse-per-second signal and holds a few hundred nanoseconds. That is what makes cross-band coincidence a measurement rather than a figure of speech, and what lets two nodes triangulate a real altitude. A node without PPS keeps recording and marks its data as unable to contribute geometry.

**Nanoseconds travel as strings.** Nanoseconds since the epoch is roughly 1.8×10¹⁸, two orders of magnitude past `Number.MAX_SAFE_INTEGER`. Sent as a JSON number it arrives already rounded, destroying exactly the precision the PPS lock exists to buy. Nodes send decimal strings; the API parses them as `BigInt`.

**Unavailable is not the same as clean.** Every catalogue lookup is recorded in three states: matched, checked and clean, or unreachable. An event with any unreachable catalogue cannot be called unresolved. Conflating those two is the easiest way to manufacture a mystery, and the test suite exists mostly to prevent it.

**Colour never carries meaning alone.** Fourteen bands cannot be separated by hue under colour-vision deficiency at any spacing; this was measured with a palette validator, not assumed. So band colour is an accent beside a written label, and the telemetry view uses one chart per band rather than fourteen overlaid traces.

**Requests are single-use.** Every write is Ed25519-signed over the path, a timestamp, and a nonce as well as the body. The grid records each nonce, so a captured request cannot be replayed to fabricate archive content.

## Running it

Everything goes through `make`. `make` on its own lists the targets.

```bash
make install        # JS and Python dependencies
make dev            # site at localhost:3000, against the mock feed
make check          # everything CI runs
make node-selftest  # open every channel in simulation, no hardware needed
```

`make check` runs six things, each of which is a claim this repository makes
about itself:

| Target | What it proves |
|---|---|
| `make drift` | Generated bindings, Postgres enums, document versions, part cross-references, tier budgets and power sizing all agree |
| `make parity` | The browser discriminator scores identically to the Python engine |
| `make links` | Every internal link resolves and every document has a route |
| `make test-firmware` | Clock grading, bounded buffers, coincidence triggering, driver registry |
| `make test-discriminator` | The scoring engine, mostly asserting what it refuses to conclude |
| `make lint` `make build` | Types, lints, and a production build |

## Build one

Three tiers, priced from named vendor pages on a stated date. Component pricing moved sharply through 2026 as memory supply was redirected to AI datacentre demand, so the entry tier targets a 2 GB board and the firmware is written to fit it rather than pretending prices held.

See [/hardware](https://nband.space/hardware) for the bill of materials and [/build](https://nband.space/build) for the guide. Every build step ends in something you can verify before spending money on the next one.

If you are within 60 km of an existing node, put yours there. A second node with a good clock converts both from bearing-only instruments into a system that measures position, and that is worth more than any single sensor upgrade.

## Documentation

Everything is published at [nband.space](https://nband.space) and lives in
`content/` beside the firmware it describes. Start at
[nband.space/docs](https://nband.space/docs).

- [What the fourteen bands can and cannot see](https://nband.space/bands)
- [Bill of materials, wiring, and power budget](https://nband.space/hardware)
- [Build guide](https://nband.space/build) — ten steps, each one verifiable
- [How verdicts are reached](https://nband.space/discriminator) — runs live
- [Safety and regulation](https://nband.space/safety) — read before building an emitter

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), and
[SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability. Changes of note are recorded in [CHANGELOG.md](CHANGELOG.md).

## Licence

Code MIT. Documentation and recorded data CC BY 4.0. See [LICENSE](LICENSE).
