# nband

An open multi-spectral sensing platform. A buildable sensor node that watches the sky across fourteen bands at once, timestamps everything against a satellite-disciplined clock, and publishes what it records.

**Site:** https://nband.space

The motivating question is whether anything crosses the sky that conventional explanations do not cover. The design commitment is that the instrument is never allowed to claim more than it measured. The top of the classification ladder is `unresolved`, not `artificial`, and the schema has no way to encode the latter.

## What is in here

Hardware, firmware, database, analysis, and documentation are one repository on one version, because documentation that drifts from the hardware is worse than no documentation. `yarn check:drift` fails the build when they diverge.

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
tools/          codegen, drift checks, seeding, palette derivation.
```

## The parts that are load-bearing

**One schema, three languages.** `tools/codegen.mjs` generates TypeScript for the website and Python for the firmware from `schema/*.json`. The Postgres enums are checked against the same files. Adding a band means editing one file; there is no second place to forget.

**Timing is the whole product.** A node disciplines its clock against GNSS with a hardware pulse-per-second signal and holds a few hundred nanoseconds. That is what makes cross-band coincidence a measurement rather than a figure of speech, and what lets two nodes triangulate a real altitude. A node without PPS keeps recording and marks its data as unable to contribute geometry.

**Nanoseconds travel as strings.** Nanoseconds since the epoch is roughly 1.8×10¹⁸, two orders of magnitude past `Number.MAX_SAFE_INTEGER`. Sent as a JSON number it arrives already rounded, destroying exactly the precision the PPS lock exists to buy. Nodes send decimal strings; the API parses them as `BigInt`.

**Unavailable is not the same as clean.** Every catalogue lookup is recorded in three states: matched, checked and clean, or unreachable. An event with any unreachable catalogue cannot be called unresolved. Conflating those two is the easiest way to manufacture a mystery, and the test suite exists mostly to prevent it.

**Colour never carries meaning alone.** Fourteen bands cannot be separated by hue under colour-vision deficiency at any spacing; this was measured with a palette validator, not assumed. So band colour is an accent beside a written label, and the telemetry view uses one chart per band rather than fourteen overlaid traces.

## Running it

```bash
yarn install
yarn codegen          # regenerate bindings from schema/
yarn dev              # site at localhost:3000, mock telemetry feed

# Node agent, no hardware required
cd firmware
python3 -m nband_node.agent --config config.example.toml --simulate --self-test

# Tests
python3 firmware/tests/test_core.py          # 16 tests: clock, buffers, triggering
python3 discriminator/tests/test_engine.py   # 16 tests: mostly refusals
node tools/check-drift.mjs                   # schema, SQL, docs, cross-references
```

## Build one

Three tiers, priced from named vendor pages on a stated date. Component pricing moved sharply through 2026 as memory supply was redirected to AI datacentre demand, so the entry tier targets a 2 GB board and the firmware is written to fit it rather than pretending prices held.

See [/hardware](https://nband.space/hardware) for the bill of materials and [/build](https://nband.space/build) for the guide. Every build step ends in something you can verify before spending money on the next one.

If you are within 60 km of an existing node, put yours there. A second node with a good clock converts both from bearing-only instruments into a system that measures position, and that is worth more than any single sensor upgrade.

## Licence

Code MIT. Documentation and recorded data CC BY 4.0.
