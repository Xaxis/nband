"""Run the discriminator over unscored events in the grid.

Reads events that have no current verdict, builds an Observation from the
detections attached to them, scores it, and writes back a verdict plus one
catalog_checks row per lookup performed.

Verdicts are never overwritten. Re-running an improved discriminator marks the
previous verdict as no longer current and inserts a new one beside it, so the
history of how the platform's opinion changed stays in the record. An event
called unresolved in 2026 and explained in 2028 keeps both entries.

    python -m nband_discriminator.cli --limit 100
    python -m nband_discriminator.cli --event <uuid> --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "firmware"))

from .catalogs import DEFAULT_CATALOGS, Observation  # noqa: E402
from .engine import DISCRIMINATOR_VERSION, Discriminator, Verdict  # noqa: E402


def load_env() -> None:
    """Read the repo .env without adding a dependency for one file."""
    p = ROOT / ".env"
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


class Grid:
    """Thin PostgREST client. The service role bypasses row-level security,
    which is why this runs server-side and never in a browser."""

    def __init__(self, url: str, key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.key = key

    def _request(self, method: str, path: str, body=None, prefer: str | None = None):
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept-Profile": "nband",
            "Content-Profile": "nband",
        }
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else []
        except urllib.error.HTTPError as exc:
            raise RuntimeError(
                f"{method} {path} -> {exc.code} {exc.read().decode()[:400]}"
            ) from None

    def get(self, path: str):
        return self._request("GET", path)

    def post(self, path: str, body):
        return self._request("POST", path, body, prefer="return=representation")

    def patch(self, path: str, body):
        return self._request("PATCH", path, body)


def build_observation(event: dict, detections: list[dict], node: dict) -> Observation:
    """Fuse an event's detections into the shape the engine scores.

    Range and bearing are taken only from detections that actually carry them.
    Nothing is inferred: an assumed range silently becomes an assumed size and
    an assumed speed, and the whole point of the ladder is that it does not
    rest on assumptions like that.
    """
    bands: list[str] = []
    for d in detections:
        for b in d.get("bands") or []:
            if b not in bands:
                bands.append(b)

    bearings = [d["azimuth_deg"] for d in detections if d.get("azimuth_deg") is not None]
    elevs = [d["elevation_deg"] for d in detections if d.get("elevation_deg") is not None]
    ranges = [d["range_m"] for d in detections if d.get("range_m") is not None]
    zs = [d["snr_db"] for d in detections if d.get("snr_db") is not None]

    # A detection whose clock was degraded poisons the whole fused event for
    # geometry purposes, so the worst clock present wins.
    order = ["gnss_pps", "gnss_nopps", "ntp", "freerun"]
    clocks = [d.get("clock", "freerun") for d in detections] or ["freerun"]
    clock = max(clocks, key=lambda c: order.index(c) if c in order else len(order))

    def ns(ts: str) -> int:
        from datetime import datetime

        return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1e9)

    return Observation(
        t_start_ns=ns(event["t_start"]),
        t_end_ns=ns(event["t_end"]),
        bands=tuple(bands),
        clock=clock,
        lat=node.get("lat") or 0.0,
        lon=node.get("lon") or 0.0,
        elevation_m=node.get("elevation_m") or 0.0,
        azimuth_deg=sum(bearings) / len(bearings) if bearings else None,
        elev_angle_deg=sum(elevs) / len(elevs) if elevs else None,
        range_m=min(ranges) if ranges else None,
        peak_z=max(zs) if zs else 0.0,
        node_count=event.get("node_count", 1),
        metrics={},
    )


def write_verdict(grid: Grid, event_id: str, verdict: Verdict) -> None:
    # Supersede rather than overwrite.
    grid.patch(
        f"/verdicts?event_id=eq.{event_id}&is_current=is.true",
        {"is_current": False},
    )
    payload = verdict.to_dict()
    grid.post(
        "/verdicts",
        [
            {
                "event_id": event_id,
                "classification": payload["classification"],
                "anomaly_score": payload["anomaly_score"],
                "corroboration": payload["corroboration"],
                "hypotheses": payload["hypotheses"],
                "explanation": payload["explanation"],
                "unavailable_catalogs": payload["unavailable_catalogs"],
                "discriminator_version": payload["discriminator_version"],
                "schema_version": payload["schema_version"],
                "is_current": True,
            }
        ],
    )
    # One row per lookup, including the ones that found nothing and the ones
    # that could not run. This audit trail is what makes a verdict checkable.
    rows = [
        {
            "event_id": event_id,
            "source": r.source,
            "available": r.available,
            "matched": r.matched,
            "object_id": r.object_id,
            "match_score": r.match_score,
            "delta_t_s": r.delta_t_s,
            "delta_bearing_deg": r.delta_bearing_deg,
            "detail": r.detail,
        }
        for r in verdict.catalog_results
    ]
    if rows:
        grid.post("/catalog_checks", rows)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="nband-discriminator")
    p.add_argument("--limit", type=int, default=50, help="max events to score in this pass")
    p.add_argument("--event", help="score one specific event id")
    p.add_argument(
        "--rescore", action="store_true", help="include events that already have a verdict"
    )
    p.add_argument("--dry-run", action="store_true", help="print verdicts, write nothing")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    load_env()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "nband: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
            file=sys.stderr,
        )
        return 2

    grid = Grid(url, key)
    engine = Discriminator(DEFAULT_CATALOGS)

    select = "id,t_start,t_end,node_count,bands,corroboration"
    if args.event:
        events = grid.get(f"/events?id=eq.{args.event}&select={select}")
    else:
        query = f"/events?select={select}&order=t_start.desc&limit={args.limit}"
        events = grid.get(query)
        if not args.rescore:
            scored = {
                v["event_id"]
                for v in grid.get("/verdicts?select=event_id&is_current=is.true&limit=10000")
            }
            events = [e for e in events if e["id"] not in scored]

    if not events:
        print("No events to score.")
        return 0

    counts: dict[str, int] = {}
    skipped_simulated = 0
    for ev in events:
        links = grid.get(f"/event_detections?event_id=eq.{ev['id']}&select=detection_id")
        det_ids = [link["detection_id"] for link in links]
        if not det_ids:
            continue
        ids = ",".join(det_ids)
        detections = grid.get(
            f"/detections?id=in.({ids})"
            "&select=id,node_id,bands,clock,azimuth_deg,elevation_deg,range_m,snr_db"
        )
        if not detections:
            continue
        nodes = grid.get(
            f"/nodes?id=eq.{detections[0]['node_id']}&select=lat,lon,elevation_m,is_simulated,slug"
        )
        node = nodes[0] if nodes else {}
        # Synthetic data is useful for exercising the pipeline and worthless as
        # evidence. Scoring it would put verdicts in the archive that look
        # exactly like verdicts about the sky.
        if node.get("is_simulated"):
            skipped_simulated += 1
            continue

        verdict = engine.evaluate(build_observation(ev, detections, node))
        counts[verdict.classification.value] = counts.get(verdict.classification.value, 0) + 1

        if args.dry_run or args.verbose:
            print(f"\n--- event {ev['id']}")
            print(f"    {verdict.classification.value}  score {verdict.anomaly_score:.1f}")
            print(f"    {verdict.explanation}")
        if not args.dry_run:
            write_verdict(grid, ev["id"], verdict)

    if skipped_simulated:
        print(f"\nSkipped {skipped_simulated} event(s) from simulated nodes.")
    print(f"\nScored {sum(counts.values())} event(s) with discriminator {DISCRIMINATOR_VERSION}:")
    for k in sorted(counts, key=lambda k: -counts[k]):
        print(f"  {counts[k]:>4}  {k}")
    if args.dry_run:
        print("\n(dry run: nothing written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
