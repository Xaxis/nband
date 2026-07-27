# nband

Open multi-spectral sensing platform. A buildable Raspberry Pi node that samples fourteen bands simultaneously, disciplines its clock against GNSS, and publishes to a shared grid. Site at **nband.space**, deployed on Vercel, backed by Supabase project `futnukppkvxmjfuexthx` (schema `nband`).

Formerly called BIFROST. Renamed 2026-07-27. The GitHub repo is still `Xaxis/bifrost` and the local checkout is still `~/Projects/bifrost`; both are pending rename.

## The rule everything else follows from

**Never let the archive claim more than the instrument measured.**

That single constraint explains most of the design and should govern any change:

- The classification ladder tops out at `anomalous_unresolved`, not "artificial". There is no schema field capable of encoding the latter, deliberately.
- A catalogue that could not be reached is recorded distinctly from one that was checked and found nothing. Conflating them manufactures mysteries. `catalog_checks.available` is the field; the discriminator tests exist mostly to defend it.
- `detections.range_m` stays null unless something physically measured it. An assumed range becomes an assumed size and an assumed speed.
- Drivers declare `Capabilities` honestly. A 32×24 thermal array reports thermal *presence*; only a driver claiming resolution gets scored on morphology.
- Compromised samples are flagged via the quality bitfield, never dropped. A silent gap reads as "nothing happened".

If a proposed change would widen what the data appears to support, it is wrong even if the code is good.

## Layout

```
schema/         Source of truth: bands.json, spec.json, hardware.json, sql/
firmware/       nband_node — the node agent (Python 3.11+)
discriminator/  nband_discriminator — analysis engine + CLI
apps/web/       Next.js 15 App Router site + grid ingest API
content/        Flat-file docs, versioned beside the firmware
tools/          codegen, check-drift, seed, gen-palette
```

## Commands

```bash
yarn codegen                                   # regenerate TS + Python from schema/
node tools/check-drift.mjs                     # schema/SQL/docs/xref agreement
python3 firmware/tests/test_core.py            # 16 tests
python3 firmware/tests/test_registry.py        # 6 tests
python3 discriminator/tests/test_engine.py     # 16 tests
yarn workspace @nband/web build

# Node agent, no hardware needed
cd firmware && python3 -m nband_node.agent --config config.example.toml --simulate --self-test

# Discriminator against the live grid
cd discriminator && python3 -m nband_discriminator.cli --limit 50 --dry-run
```

## Things that will bite you

**`schema/bands.json` + `schema/spec.json` are canonical.** TypeScript and Python are generated. Never hand-edit `apps/web/lib/schema/generated.ts` or `firmware/nband_node/schema_generated.py`. Run `yarn codegen` and commit the result; `check-drift` fails the build otherwise.

**Band `ordinal` values are persisted in Postgres.** Reordering bands is a breaking change requiring a migration, not an edit.

**Nanosecond timestamps travel as decimal strings, not JSON numbers.** ~1.8×10¹⁸ exceeds `Number.MAX_SAFE_INTEGER`; a JSON number arrives already rounded, destroying the precision the PPS lock exists to buy. The API parses them with `BigInt` (`nanosSchema` in `lib/grid/ingest.ts`).

**`ensure_telemetry_partition` is `SECURITY DEFINER` with a pinned `search_path`.** It performs DDL that the service role cannot do directly. It failed silently once and every row landed in the default partition. The telemetry route now checks its error and returns 500.

**Renaming the Postgres schema does not rewrite function bodies.** Migration 0003 exists because of this. The function now uses unqualified names resolved via `search_path`.

**Supabase needs the schema exposed to PostgREST.** `db_schema` must include `nband`, plus grants on schema/tables/functions. Not automatic on project creation.

**Adding a part to `hardware.json` with a `driver` requires implementing that driver.** `test_registry.py` enforces it. Thirteen were advertised-but-missing at one point and the shipped example config would have crashed on real hardware.

**Colour never carries meaning alone.** Fourteen band hues cannot clear CVD separation at any spacing — measured with the dataviz palette validator, not assumed. Band colour is an accent beside a label; telemetry uses small multiples, never overlaid series. The five-class verdict palette is a validated categorical set and must stay in its validated order.

## Environment

`.env` at repo root, never committed. Vercel holds the same values as project env vars. `gh` fails because an invalid `GITHUB_TOKEN` shadows the keyring token — use `env -u GITHUB_TOKEN` or push over SSH. The keyring token lacks `workflow` scope, so `.github/workflows/` pushes need `gh auth refresh -s workflow`.

## Style

Prose in docs and comments follows the author's blog conventions: no em-dashes, no rhetorical questions, no "imagine", no bullet lists inside body prose, declarative sentence-case headings. Comments explain *why*, especially where a non-obvious constraint drove the design.
