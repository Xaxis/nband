# Contributing to nband

Full guidance, including the driver interface and the rules about capability
declarations, is at **[nband.space/contribute](https://nband.space/contribute)**.
That page is generated from `content/contribute.md` in this repository, so it
and this file cannot disagree.

## The rule everything else follows from

**Never let the archive claim more than the instrument measured.**

Most of the design follows from that one constraint, and a change that widens
what the data appears to support will be refused even if the code is good:

- The classification ladder tops out at `anomalous_unresolved`, never
  `artificial`. There is no database column capable of holding the latter.
- A catalogue that could not be **reached** is recorded distinctly from one that
  was checked and found nothing. Conflating them manufactures mysteries.
- `detections.range_m` stays null unless something physically measured it. An
  assumed range becomes an assumed size and an assumed speed.
- Drivers declare `Capabilities` honestly. A 32×24 thermal array reports thermal
  *presence*; only a driver claiming resolution is scored on morphology.
- Compromised samples are flagged, never dropped. A silent gap reads as
  "nothing happened" when it means "we could not trust this".

## Getting set up

```bash
make install
make check          # everything CI runs
make node-selftest  # exercise every driver with no hardware attached
```

## Before you open a pull request

```bash
make check
```

That runs the drift check (schema, SQL, docs, prices, power sizing), the
discriminator parity check (the browser port against the Python engine), the
link check, both Python test suites, type-checking, linting, and the build.

## Things that will bite you

**`schema/bands.json` and `schema/spec.json` are the source of truth.** The
TypeScript, the Python, and the search index are generated. Never hand-edit a
file marked `GENERATED`; run `make codegen` and commit the result.

**Band `ordinal` values are persisted in Postgres.** Reordering bands is a
breaking change requiring a migration, not an edit.

**Change the Python discriminator first.** The browser port in
`apps/web/lib/discriminator/core.mjs` exists so the interactive playground can
score client-side. Change `engine.py`, run `make fixtures`, then mirror it into
the port. `make parity` fails if they disagree, and regenerating the fixtures to
silence it just moves the disagreement somewhere nobody is looking.

**Adding a part with a `driver` means implementing that driver.**
`firmware/tests/test_registry.py` enforces it. Thirteen were once advertised
with nothing behind them, and the shipped example config would have crashed on
real hardware at the exact moment a builder had just soldered something.

**Documentation lives beside the firmware it describes**, in `content/`, and
declares the version it was written against. Change behaviour and its document
in the same commit.

## Style

Comments explain *why*, especially where a non-obvious constraint drove the
design. Prose avoids em-dashes, rhetorical questions, and marketing adjectives.
Section headings are declarative claims in sentence case.
