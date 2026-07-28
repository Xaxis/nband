#!/usr/bin/env python3
"""Run the conformance cases through the real engine and write expected.json.

Python is authoritative for discriminator behaviour. The browser port exists
only so the interactive playground can run client-side, and it is checked
against this file. Regenerate whenever the engine's scoring changes:

    python3 tools/gen-fixtures.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "discriminator"), str(ROOT / "firmware")]

from nband_discriminator.catalogs import (  # noqa: E402
    AdsbCatalog, LightningCatalog, Observation, RfiBaselineCatalog,
    TleCatalog, WeatherCatalog,
)
from nband_discriminator.engine import Discriminator  # noqa: E402

NS = 1_000_000_000
BEARING = dict(azimuth_deg=180.0, elev_angle_deg=40.0)


def catalogs_for(spec):
    """Build a catalogue set matching each case's declared availability."""
    def provider(state, payload):
        if state == "unavailable":
            return None            # reachable=False
        if state == "match":
            return [payload]
        return []                  # reachable, no match

    return (
        AdsbCatalog(provider=lambda o, s=spec["adsb"]: provider(s, {
            "hex": "a4f81c", "azimuth_deg": 180.2, "elevation_deg": 40.1,
            "altitude_m": 10300, "callsign": "TEST123"})),
        TleCatalog(provider=lambda o, s=spec["tle"]: provider(s, {
            "norad_id": 25544, "azimuth_deg": 180.1, "elevation_deg": 40.0,
            "name": "TESTSAT", "illuminated": True})),
        LightningCatalog(provider=lambda o, s=spec["lightning"]: provider(s, {
            "id": "L1", "distance_km": 41.0, "delta_t_s": 0.2, "peak_current_ka": -18})),
        RfiBaselineCatalog(
            known_signatures=[{"label": "site-sig", "level_dbm": -62.0, "tolerance_db": 3.0,
                               "count": 100}] if spec["rfi"] == "match" else []),
        WeatherCatalog(provider=lambda o, s=spec["weather"]: (
            None if s == "unavailable" else {})),
    )


def main() -> int:
    cases = json.loads((ROOT / "discriminator/fixtures/cases.json").read_text())["cases"]
    out = {}
    for c in cases:
        obs = Observation(
            t_start_ns=1_700_000_000 * NS,
            t_end_ns=int((1_700_000_000 + c["duration_s"]) * NS),
            bands=tuple(c["bands"]),
            clock=c["clock"],
            lat=31.94, lon=-109.31, elevation_m=1402.0,
            range_m=c["range_m"], peak_z=c["peak_z"], node_count=c["node_count"],
            metrics={"rf": -61.5} if "rf" in c["bands"] else {},
            **BEARING,
        )
        v = Discriminator(catalogs_for(c["catalogs"])).evaluate(obs)
        out[c["id"]] = {
            "classification": v.classification.value,
            "anomaly_score": round(v.anomaly_score, 2),
            "corroboration": v.corroboration.value,
            "unavailable_catalogs": v.unavailable_catalogs,
            "top_hypothesis": v.hypotheses[0].id,
            "posteriors": {h.id: round(h.posterior, 4) for h in v.hypotheses},
        }

    dest = ROOT / "discriminator/fixtures/expected.json"
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {len(out)} expected verdicts to {dest.relative_to(ROOT)}")
    for k, v in out.items():
        print(f"  {k:<32} {v['classification']:<22} score {v['anomaly_score']:>6}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
