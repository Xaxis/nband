"""Known-source catalogues.

Before an event can be called unresolved, it is checked against everything that
could plausibly explain it. The design rule that matters most here is that a
catalogue which could not be reached is recorded as unavailable rather than as
"no match". Those are different claims, and conflating them is the single
easiest way to manufacture a mystery: if the ADS-B feed was down, every
aircraft that night looks unexplained.

Each catalogue is a small adapter with a uniform result. Network sources are
expected to fail sometimes; failing is a normal, recorded outcome, not an
exception that aborts the pass.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Observation:
    """The event as the discriminator sees it, independent of storage."""

    t_start_ns: int
    t_end_ns: int
    bands: tuple[str, ...]
    clock: str
    lat: float
    lon: float
    elevation_m: float
    azimuth_deg: float | None = None
    elev_angle_deg: float | None = None
    range_m: float | None = None
    angular_rate_dps: float | None = None
    peak_z: float = 0.0
    node_count: int = 1
    #: Per-band peak values, keyed by band id.
    metrics: dict[str, float] = field(default_factory=dict)
    #: Sensor capability declarations, keyed by channel id.
    capabilities: dict[str, dict[str, Any]] = field(default_factory=dict)

    @property
    def duration_s(self) -> float:
        return max(self.t_end_ns - self.t_start_ns, 0) / 1e9


@dataclass(frozen=True)
class CatalogResult:
    source: str
    available: bool
    matched: bool = False
    object_id: str | None = None
    match_score: float = 0.0
    delta_t_s: float | None = None
    delta_bearing_deg: float | None = None
    detail: dict[str, Any] = field(default_factory=dict)

    @property
    def explains(self) -> bool:
        return self.available and self.matched and self.match_score >= 0.6


class Catalog(ABC):
    source: str

    @abstractmethod
    def check(self, obs: Observation) -> CatalogResult: ...

    def _unavailable(self, reason: str) -> CatalogResult:
        return CatalogResult(self.source, available=False, detail={"reason": reason})


def angular_separation(az1: float, el1: float, az2: float, el2: float) -> float:
    """Great-circle separation between two sky positions, in degrees."""
    a1, e1, a2, e2 = map(math.radians, (az1, el1, az2, el2))
    cos_sep = math.sin(e1) * math.sin(e2) + math.cos(e1) * math.cos(e2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos_sep))))


class AdsbCatalog(Catalog):
    """Cooperative aircraft, by position and time.

    Takes an injected provider so that a node with a local 1090 MHz receiver
    and a node using a network feed run identical logic. A provider that raises
    or returns None yields `available=False`, never a silent clean result.
    """

    source = "adsb"

    def __init__(self, provider=None, tolerance_deg: float = 3.0) -> None:
        self._provider = provider
        self._tol = tolerance_deg

    def check(self, obs: Observation) -> CatalogResult:
        if self._provider is None:
            return self._unavailable("no ADS-B provider configured")
        try:
            contacts = self._provider(obs)
        except Exception as exc:  # noqa: BLE001
            return self._unavailable(f"provider error: {type(exc).__name__}")
        if contacts is None:
            return self._unavailable("provider returned no data")

        if obs.azimuth_deg is None or obs.elev_angle_deg is None:
            return CatalogResult(self.source, available=True, matched=False,
                                 detail={"reason": "event has no bearing to compare"})

        best: tuple[float, dict] | None = None
        for c in contacts:
            sep = angular_separation(obs.azimuth_deg, obs.elev_angle_deg,
                                     c["azimuth_deg"], c["elevation_deg"])
            if best is None or sep < best[0]:
                best = (sep, c)

        if best is None:
            return CatalogResult(self.source, available=True, matched=False,
                                 detail={"contacts": 0})

        sep, contact = best
        if sep > self._tol:
            return CatalogResult(self.source, available=True, matched=False,
                                 delta_bearing_deg=round(sep, 3),
                                 detail={"nearest": contact.get("hex"), "contacts": len(contacts)})

        return CatalogResult(
            self.source,
            available=True,
            matched=True,
            object_id=contact.get("hex"),
            match_score=round(max(0.0, 1.0 - sep / self._tol), 3),
            delta_bearing_deg=round(sep, 3),
            detail={"altitude_m": contact.get("altitude_m"), "callsign": contact.get("callsign")},
        )


class TleCatalog(Catalog):
    """Satellites and rocket bodies, by propagated orbital elements."""

    source = "tle"

    def __init__(self, provider=None, tolerance_deg: float = 1.5) -> None:
        self._provider = provider
        self._tol = tolerance_deg

    def check(self, obs: Observation) -> CatalogResult:
        if self._provider is None:
            return self._unavailable("no TLE provider configured")
        try:
            passes = self._provider(obs)
        except Exception as exc:  # noqa: BLE001
            return self._unavailable(f"provider error: {type(exc).__name__}")
        if passes is None:
            return self._unavailable("provider returned no data")
        if obs.azimuth_deg is None or obs.elev_angle_deg is None:
            return CatalogResult(self.source, available=True, matched=False,
                                 detail={"reason": "event has no bearing to compare"})

        for p in passes:
            sep = angular_separation(obs.azimuth_deg, obs.elev_angle_deg,
                                     p["azimuth_deg"], p["elevation_deg"])
            if sep <= self._tol:
                return CatalogResult(
                    self.source, available=True, matched=True,
                    object_id=str(p.get("norad_id")),
                    match_score=round(max(0.0, 1.0 - sep / self._tol), 3),
                    delta_bearing_deg=round(sep, 3),
                    # An eclipsed satellite cannot be the source of an optical
                    # detection, so illumination is part of the match, not a note.
                    detail={"name": p.get("name"), "illuminated": p.get("illuminated", True)},
                )
        return CatalogResult(self.source, available=True, matched=False,
                             detail={"passes_considered": len(passes)})


class LightningCatalog(Catalog):
    """Sferic network fixes. Explains most UV/RF/magnetic coincidences."""

    source = "lightning"

    def __init__(self, provider=None, radius_km: float = 150.0, window_s: float = 4.0) -> None:
        self._provider = provider
        self._radius_km = radius_km
        self._window_s = window_s

    def check(self, obs: Observation) -> CatalogResult:
        if self._provider is None:
            return self._unavailable("no lightning provider configured")
        try:
            strokes = self._provider(obs)
        except Exception as exc:  # noqa: BLE001
            return self._unavailable(f"provider error: {type(exc).__name__}")
        if strokes is None:
            return self._unavailable("provider returned no data")

        for s in strokes:
            if s["distance_km"] <= self._radius_km and abs(s["delta_t_s"]) <= self._window_s:
                return CatalogResult(
                    self.source, available=True, matched=True,
                    object_id=str(s.get("id")),
                    match_score=round(1.0 - s["distance_km"] / self._radius_km, 3),
                    delta_t_s=s["delta_t_s"],
                    detail={"distance_km": s["distance_km"], "peak_current_ka": s.get("peak_current_ka")},
                )
        return CatalogResult(self.source, available=True, matched=False,
                             detail={"strokes_considered": len(strokes)})


class RfiBaselineCatalog(Catalog):
    """The node's own learned interference fingerprint.

    Always available, because it is derived from the node's own history rather
    than a network service. This is the catalogue that stops a site's local
    pager transmitter being rediscovered as an anomaly every single night.
    """

    source = "rfi"

    def __init__(self, known_signatures: list[dict] | None = None) -> None:
        self._sigs = known_signatures or []

    def check(self, obs: Observation) -> CatalogResult:
        if "rf" not in obs.bands:
            return CatalogResult(self.source, available=True, matched=False,
                                 detail={"reason": "no RF component in this event"})
        peak = obs.metrics.get("rf")
        if peak is None:
            return CatalogResult(self.source, available=True, matched=False)

        for sig in self._sigs:
            if abs(peak - sig["level_dbm"]) <= sig.get("tolerance_db", 3.0):
                return CatalogResult(
                    self.source, available=True, matched=True,
                    object_id=sig.get("label"),
                    match_score=0.85,
                    detail={"learned_level_dbm": sig["level_dbm"], "seen_count": sig.get("count")},
                )
        return CatalogResult(self.source, available=True, matched=False,
                             detail={"signatures_known": len(self._sigs)})


class WeatherCatalog(Catalog):
    """Atmospheric state. Rarely explains an event alone; frequently explains
    why an optical track near the horizon looked impossible."""

    source = "weather"

    def __init__(self, provider=None) -> None:
        self._provider = provider

    def check(self, obs: Observation) -> CatalogResult:
        if self._provider is None:
            return self._unavailable("no weather provider configured")
        try:
            wx = self._provider(obs)
        except Exception as exc:  # noqa: BLE001
            return self._unavailable(f"provider error: {type(exc).__name__}")
        if wx is None:
            return self._unavailable("provider returned no data")

        inversion = bool(wx.get("temperature_inversion"))
        low_angle = obs.elev_angle_deg is not None and obs.elev_angle_deg < 8.0
        if inversion and low_angle:
            return CatalogResult(
                self.source, available=True, matched=True, object_id="inversion",
                match_score=0.65,
                detail={"note": "temperature inversion with a sub-8-degree track; "
                                "refraction and mirage effects are plausible", **wx},
            )
        return CatalogResult(self.source, available=True, matched=False, detail=wx)


DEFAULT_CATALOGS: tuple[Catalog, ...] = (
    AdsbCatalog(),
    TleCatalog(),
    LightningCatalog(),
    RfiBaselineCatalog(),
    WeatherCatalog(),
)
