"""Node configuration.

A NBAND node is defined by a single TOML file. Everything the agent does is
determined by it: which sensors exist, where they point, how they are wired,
and where telemetry goes. There is no hidden state and no auto-detection, on
purpose. A node that silently reconfigures itself produces an archive nobody
can interpret two years later, because the metadata that explains a reading is
no longer recoverable from the reading.

The config is validated hard at startup. A node that cannot describe itself
completely refuses to run rather than emitting data with unknown provenance.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .schema_generated import BAND_META, PART_DRIVERS, SCHEMA_VERSION, Band, Tier


class ConfigError(ValueError):
    """Raised when a node cannot fully describe itself."""


@dataclass(frozen=True)
class ChannelConfig:
    """One sensor stream."""

    channel_id: str
    band: Band
    driver: str
    unit: str
    sample_rate_hz: float
    part_id: str | None = None
    #: Where this specific sensor points, independent of the node's heading.
    azimuth_deg: float | None = None
    elevation_deg: float | None = None
    fov_deg: float | None = None
    #: Driver-specific wiring: i2c address, device path, gain, and so on.
    options: dict[str, Any] = field(default_factory=dict)
    #: Trigger threshold in units of the running noise sigma. None disables
    #: triggering for this channel, which is mandatory for context bands.
    trigger_sigma: float | None = None
    enabled: bool = True

    @property
    def is_context(self) -> bool:
        return BAND_META[self.band.value]["role"] == "context"


@dataclass(frozen=True)
class SiteConfig:
    latitude: float
    longitude: float
    elevation_m: float
    #: Published position is fuzzed by this radius. Operators run these at home.
    location_precision_m: int = 1000
    #: Azimuth (degrees) -> minimum usable elevation (degrees). Without this, a
    #: node that physically cannot see below a ridgeline is indistinguishable
    #: from a node that looked and saw nothing.
    horizon_mask: dict[str, float] = field(default_factory=dict)
    timezone: str = "UTC"


@dataclass(frozen=True)
class GridConfig:
    endpoint: str
    node_slug: str
    #: Path to the node's Ed25519 private key. Never leaves the machine.
    key_path: Path
    enrollment_secret: str | None = None
    #: Upload batches this often; buffer to disk when the link is down.
    upload_interval_s: float = 30.0
    max_spool_bytes: int = 2_000_000_000
    verify_tls: bool = True


@dataclass(frozen=True)
class NodeConfig:
    node_name: str
    tier: Tier
    site: SiteConfig
    grid: GridConfig
    channels: tuple[ChannelConfig, ...]
    schema_version: str = SCHEMA_VERSION
    #: Ring buffer depth. Sized so a trigger can reach backwards in time.
    pre_roll_s: float = 15.0
    post_roll_s: float = 15.0
    #: Simulation mode runs every driver against a synthetic source, so the
    #: whole pipeline is testable on a laptop with no hardware attached.
    simulate: bool = False

    @property
    def detection_channels(self) -> tuple[ChannelConfig, ...]:
        return tuple(c for c in self.channels if c.enabled and not c.is_context)

    @property
    def bands(self) -> tuple[Band, ...]:
        seen: dict[Band, None] = {}
        for c in self.channels:
            if c.enabled:
                seen[c.band] = None
        return tuple(seen)


def _require(table: dict[str, Any], key: str, where: str) -> Any:
    if key not in table:
        raise ConfigError(f"{where}: missing required key '{key}'")
    return table[key]


def load(path: str | Path) -> NodeConfig:
    """Load and validate a node config. Raises ConfigError on any ambiguity."""
    path = Path(path)
    if not path.is_file():
        raise ConfigError(f"config not found: {path}")

    with path.open("rb") as fh:
        raw = tomllib.load(fh)

    node = _require(raw, "node", "config")
    site_raw = _require(raw, "site", "config")
    grid_raw = _require(raw, "grid", "config")
    channels_raw = raw.get("channel", [])

    if not channels_raw:
        raise ConfigError("config: at least one [[channel]] is required")

    try:
        tier = Tier(_require(node, "tier", "[node]"))
    except ValueError as exc:
        raise ConfigError(f"[node].tier: {exc}") from exc

    site = SiteConfig(
        latitude=float(_require(site_raw, "latitude", "[site]")),
        longitude=float(_require(site_raw, "longitude", "[site]")),
        elevation_m=float(site_raw.get("elevation_m", 0.0)),
        location_precision_m=int(site_raw.get("location_precision_m", 1000)),
        horizon_mask={str(k): float(v) for k, v in site_raw.get("horizon_mask", {}).items()},
        timezone=str(site_raw.get("timezone", "UTC")),
    )
    if not -90 <= site.latitude <= 90 or not -180 <= site.longitude <= 180:
        raise ConfigError("[site]: latitude/longitude out of range")

    grid = GridConfig(
        endpoint=str(_require(grid_raw, "endpoint", "[grid]")).rstrip("/"),
        node_slug=str(_require(grid_raw, "node_slug", "[grid]")),
        key_path=Path(str(grid_raw.get("key_path", "~/.nband/node.key"))).expanduser(),
        enrollment_secret=grid_raw.get("enrollment_secret"),
        upload_interval_s=float(grid_raw.get("upload_interval_s", 30.0)),
        max_spool_bytes=int(grid_raw.get("max_spool_bytes", 2_000_000_000)),
        verify_tls=bool(grid_raw.get("verify_tls", True)),
    )

    channels: list[ChannelConfig] = []
    seen_ids: set[str] = set()
    for i, c in enumerate(channels_raw):
        where = f"[[channel]] #{i + 1}"
        cid = str(_require(c, "id", where))
        if cid in seen_ids:
            raise ConfigError(f"{where}: duplicate channel id '{cid}'")
        seen_ids.add(cid)

        try:
            band = Band(_require(c, "band", where))
        except ValueError as exc:
            raise ConfigError(f"{where}: {exc}") from exc

        part_id = c.get("part")
        driver = c.get("driver") or (PART_DRIVERS.get(part_id) if part_id else None)
        if not driver:
            raise ConfigError(
                f"{where}: needs 'driver', or a 'part' that maps to one in the registry"
            )

        cfg = ChannelConfig(
            channel_id=cid,
            band=band,
            driver=str(driver),
            unit=str(c.get("unit") or BAND_META[band.value]["unitDefault"]),
            sample_rate_hz=float(_require(c, "sample_rate_hz", where)),
            part_id=part_id,
            azimuth_deg=c.get("azimuth_deg"),
            elevation_deg=c.get("elevation_deg"),
            fov_deg=c.get("fov_deg"),
            options=dict(c.get("options", {})),
            trigger_sigma=c.get("trigger_sigma"),
            enabled=bool(c.get("enabled", True)),
        )

        # Context bands describe conditions; they can never fire a trigger.
        # Enforced here rather than in the discriminator so that a misconfigured
        # node cannot flood the grid with environmental "detections".
        if cfg.is_context and cfg.trigger_sigma is not None:
            raise ConfigError(
                f"{where}: band '{band.value}' is a context band and cannot have trigger_sigma"
            )
        if cfg.sample_rate_hz <= 0:
            raise ConfigError(f"{where}: sample_rate_hz must be positive")

        channels.append(cfg)

    cfg = NodeConfig(
        node_name=str(_require(node, "name", "[node]")),
        tier=tier,
        site=site,
        grid=grid,
        channels=tuple(channels),
        pre_roll_s=float(node.get("pre_roll_s", 15.0)),
        post_roll_s=float(node.get("post_roll_s", 15.0)),
        simulate=bool(node.get("simulate", False)),
    )

    if not cfg.detection_channels:
        raise ConfigError("config: a node needs at least one detection channel")

    return cfg
