"""Every driver the platform advertises must actually exist.

This suite exists because it did not, and the gap was invisible from the
outside. `hardware.json` and `config.example.toml` both named drivers that
were never implemented, so the shipped example config would have crashed with
UnknownDriverError the first time a builder ran `--self-test` against real
hardware, at exactly the point in the build guide where they had just soldered
something and had every reason to blame their wiring.

Nothing here needs hardware. It checks that the declarations agree.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "firmware"))

from nband_node import config as configmod  # noqa: E402
from nband_node import sensors  # noqa: E402
from nband_node.schema_generated import Band  # noqa: E402

HARDWARE = json.loads((ROOT / "schema" / "hardware.json").read_text())


def test_every_hardware_driver_is_implemented():
    declared = {p["driver"] for p in HARDWARE["parts"] if p.get("driver")}
    missing = sorted(declared - set(sensors.REGISTRY))
    assert not missing, (
        f"schema/hardware.json names drivers with no implementation: {missing}. "
        f"Either implement them in sensors.py or set the part's driver to null."
    )


def test_example_config_loads_and_resolves_every_driver():
    cfg = configmod.load(ROOT / "firmware" / "config.example.toml")
    unresolved = [c.driver for c in cfg.channels if c.driver not in sensors.REGISTRY]
    assert not unresolved, (
        f"config.example.toml references unimplemented drivers: {unresolved}. "
        f"The build guide tells people to run this file."
    )


def test_example_config_builds_every_driver_without_hardware():
    # Constructing a driver must not touch hardware; only open() may. Otherwise
    # --self-test cannot report per-channel failures, it just dies on the first.
    cfg = configmod.load(ROOT / "firmware" / "config.example.toml")
    for ch in cfg.channels:
        drv = sensors.build(ch, simulate=False)
        assert drv.channel_id == ch.channel_id


def test_every_registered_driver_declares_a_band():
    for name, cls in sensors.REGISTRY.items():
        band = getattr(cls, "band", None)
        # Picamera2Driver takes its band from the channel, since the same sensor
        # is a visible or near-infrared channel depending on its filter.
        if band is None:
            assert name == "picamera2_still", f"driver '{name}' declares no band"
            continue
        assert isinstance(band, Band), f"driver '{name}' has a non-Band band: {band!r}"


def test_simulator_covers_every_detection_band():
    # A band with no simulated behaviour silently produces flat noise, which
    # would make the trigger pipeline look well-tuned when it is untested.
    from nband_node.config import ChannelConfig

    for band in Band:
        ch = ChannelConfig(
            channel_id=f"test.{band.value}",
            band=band,
            driver="sim",
            unit="x",
            sample_rate_hz=1.0,
        )
        drv = sensors.SimulatedDriver(ch)
        s = drv.read(1_700_000_000_000_000_000)
        assert s is not None, f"simulator produced nothing for band {band.value}"
        assert s.band is band


def test_context_bands_reject_triggers():
    # Enforced in config so a misconfigured node cannot flood the grid with
    # environmental "detections". This is a structural guarantee, not a policy.
    from nband_node.config import ConfigError

    import tomllib

    raw = (ROOT / "firmware" / "config.example.toml").read_text()
    bad = raw.replace(
        'id = "env.temp"\nband = "env"',
        'id = "env.temp"\nband = "env"\ntrigger_sigma = 3.0',
    )
    tmp = ROOT / "firmware" / ".test_bad_config.toml"
    tmp.write_text(bad)
    try:
        raised = False
        try:
            configmod.load(tmp)
        except ConfigError as exc:
            raised = "context band" in str(exc)
        assert raised, "a trigger_sigma on a context band must be rejected at load"
    finally:
        tmp.unlink(missing_ok=True)


def _run():
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as exc:
            failed += 1
            print(f"  FAIL  {name}  {exc}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  ERROR {name}  {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run())
