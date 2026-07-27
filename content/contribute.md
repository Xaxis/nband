---
title: Contributing
description: How to add hardware variants, drivers, catalogues, and documentation without breaking the archive for everyone else.
version: 0.1.0
section: Participate
order: 70
updated: 2026-07-27
audience: Anyone who wants to extend the platform
---

NBAND is built on the assumption that people will construct it with parts nobody anticipated. The registry, the driver interface, and the capability declaration all exist to make that a supported path rather than a fork.

## The one rule that matters

Do not add anything that makes the archive claim more than the instrument measured.

Almost every design decision in this project follows from that. It is why the discriminator records a catalogue it could not reach separately from a catalogue that found nothing, why range stays null unless something measured it, why a driver declares what it cannot resolve, and why the top of the classification ladder is "unresolved" rather than anything more interesting. A contribution that quietly widens what the data appears to support will be refused even if the code is good.

## Registering a hardware variant

If you built a node with a substitute part, register it. An unregistered part means the grid receives data it cannot calibrate and has to discount.

A variant entry needs the band it serves, the driver it uses, a sourced price with a date, and an honest account of what it cannot do. The MLX90640 entry is the model to follow: it is a fully supported thermal variant at a fifth of the reference price, and its registry entry states plainly that at 768 pixels it can establish thermal presence but not thermal morphology. The discriminator reads that and scores accordingly.

New variants enter as `submitted`. Data from a submitted part is accepted and flagged. Running the conformance suite and having it pass moves the part to `verified`, at which point the flag comes off. Parts that do not work are documented as `unsupported` rather than deleted, so nobody buys one twice.

## Writing a driver

Subclass `Driver`, declare a band, implement `read()`, and return a `Sample`. The parts that are easy to get wrong:

Declare your capabilities honestly. `Capabilities` is how the discriminator knows whether it may score thermal morphology or only thermal presence. Overstating it corrupts analysis rather than improving it.

Return `None` rather than a fabricated value when a read fails. A dropped frame is normal for several of these sensors and the pipeline handles it. A zero standing in for a missing reading is a lie that propagates into the noise floor.

Mark compromised samples instead of dropping them. The quality bitfield exists so that a saturated sensor, a stale calibration, or a shutter event stays visible in the record. A silent gap reads as "nothing happened" when it means "we could not trust this".

Write a simulated path. Every driver needs to work under `--simulate` so that someone without your hardware can still exercise the pipeline, and so the build guide's verification steps work before parts arrive.

## Adding a catalogue

Catalogues subtract known sources. A new one implements `check()` and returns a `CatalogResult`.

The critical contract is that unreachable is not the same as clean. If your provider times out, raises, or returns nothing, return `available=False`. Returning a no-match result for a failed lookup is the single most damaging bug possible in this codebase: it manufactures mysteries by making unchecked events look checked. The test suite has cases for exactly this and they are not optional.

## Changing the schema

`schema/bands.json` and `schema/spec.json` are the source of truth for the whole platform. Editing them and running `yarn codegen` regenerates the TypeScript and Python bindings; `yarn check:drift` fails if you forgot.

Band `ordinal` values are persisted in the database. Reordering bands is a breaking change and needs a schema version bump and a migration, not an edit.

## Documentation

Content lives in `/content` at the repository root, next to the firmware rather than inside the website. Each document declares the platform version it was written against, and the drift check fails the build when a document claims a version that no longer exists.

If you change firmware behaviour that a document describes, change the document in the same commit. Documentation that drifts from the hardware is worse than no documentation, because it is trusted.

## Running the tests

```bash
python3 firmware/tests/test_core.py
python3 discriminator/tests/test_engine.py
yarn check:drift && yarn type-check
```

The discriminator tests are mostly about refusal: they assert that events get downgraded when the clock is degraded, when a catalogue was unavailable, or when only one band saw it. Those are the cases that protect the archive from false claims, which is the only failure mode that actually costs this project anything.
