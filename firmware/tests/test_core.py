"""Tests for the parts of the node that decide what is worth keeping.

These cover the logic that determines what enters the archive. A bug in the
coincidence detector either floods the grid with noise or silently discards the
only interesting thing a node ever saw, and neither failure is visible from the
outside until much later.

Run: python3 -m pytest firmware/tests -q     (or: python3 firmware/tests/test_core.py)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nband_node.core import (  # noqa: E402
    Q_CLOCK_DEGRADED,
    ChannelTrigger,
    Clock,
    CoincidenceDetector,
    NoiseFloor,
    RingBuffer,
    Sample,
)
from nband_node.schema_generated import Band, ClockQuality, TriggerReason  # noqa: E402

MS = 1_000_000


# --- Clock -----------------------------------------------------------------


def test_clock_grades_pps_lock():
    c = Clock()
    c.update_from_chrony("Reference ID : 50505300 (PPS)\nRMS offset : 0.000000180 seconds\n")
    assert c.quality is ClockQuality.GNSS_PPS
    assert not c.degraded
    assert c.quality_bits() == 0


def test_clock_demotes_when_offset_is_large():
    c = Clock()
    c.update_from_chrony("Reference ID : C0A80101 (192.168.1.1)\nRMS offset : 0.004 seconds\n")
    assert c.quality is ClockQuality.NTP
    assert c.degraded
    assert c.quality_bits() & Q_CLOCK_DEGRADED


def test_clock_falls_back_to_freerun_when_unparseable():
    # A node that cannot read its own offset must not claim it is disciplined.
    c = Clock(ClockQuality.GNSS_PPS)
    c.update_from_chrony("garbage output from a failed chronyc call")
    assert c.quality is ClockQuality.FREERUN


# --- RingBuffer ------------------------------------------------------------


def test_ring_buffer_is_bounded():
    # The whole memory argument for running tier 1 on a 2 GB board rests on this.
    buf = RingBuffer(capacity=100)
    for i in range(1000):
        buf.append(Sample("c", Band.VIS, i * MS, float(i)))
    assert len(buf) == 100
    assert buf.latest().value == 999.0


def test_ring_buffer_extracts_time_range():
    buf = RingBuffer(capacity=500)
    for i in range(200):
        buf.append(Sample("c", Band.VIS, i * MS, float(i)))
    got = buf.between(50 * MS, 59 * MS)
    assert [s.value for s in got] == [float(i) for i in range(50, 60)]


# --- NoiseFloor ------------------------------------------------------------


def test_noise_floor_needs_warmup():
    f = NoiseFloor(warmup=64)
    for _ in range(10):
        f.update(1.0)
    assert not f.ready
    for _ in range(60):
        f.update(1.0)
    assert f.ready


def test_noise_floor_tracks_mean_and_sigma():
    f = NoiseFloor(warmup=4)
    for v in (2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0):
        f.update(v)
    assert abs(f.mean - 5.0) < 1e-9
    assert abs(f.sigma - 2.13809) < 1e-4  # sample stdev
    assert abs(f.z_score(9.0) - 1.8708) < 1e-3


def test_noise_floor_flat_signal_never_triggers():
    # A perfectly constant channel has zero sigma; z must be 0, not infinity.
    f = NoiseFloor(warmup=4)
    for _ in range(50):
        f.update(3.0)
    assert f.z_score(99.0) == 0.0


# --- CoincidenceDetector ---------------------------------------------------


def _trig(ch, band, t_ms, z=5.0):
    return ChannelTrigger(ch, band, t_ms * MS, 1.0, z)


def test_single_band_crossing_is_held_not_published():
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    assert d.offer(_trig("vis.wide", Band.VIS, 1000), clock) is None


def test_two_bands_inside_window_promote():
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    assert d.offer(_trig("vis.wide", Band.VIS, 1000), clock) is None
    det = d.offer(_trig("lwir.main", Band.LWIR, 1100), clock)
    assert det is not None
    assert det.reason is TriggerReason.COINCIDENCE
    assert set(det.bands) == {Band.VIS, Band.LWIR}
    assert det.channel_ids == ["lwir.main", "vis.wide"]


def test_two_bands_outside_window_do_not_promote():
    # 250 ms window; 900 ms apart is two unrelated events, not a coincidence.
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    assert d.offer(_trig("vis.wide", Band.VIS, 1000), clock) is None
    assert d.offer(_trig("lwir.main", Band.LWIR, 1900), clock) is None


def test_same_band_twice_is_not_a_coincidence():
    # Two cameras both seeing a bird is one observation, not corroboration.
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    assert d.offer(_trig("vis.wide", Band.VIS, 1000), clock) is None
    assert d.offer(_trig("vis.narrow", Band.VIS, 1050), clock) is None


def test_extreme_single_channel_excursion_publishes_alone():
    d = CoincidenceDetector(solo_sigma=8.0)
    clock = Clock(ClockQuality.GNSS_PPS)
    det = d.offer(_trig("rf.sdr0", Band.RF, 1000, z=12.0), clock)
    assert det is not None
    assert det.reason is TriggerReason.THRESHOLD
    assert det.bands == [Band.RF]


def test_detection_records_clock_quality_at_trigger_time():
    # Downstream geometry weights on this; it must reflect reality, not hope.
    d = CoincidenceDetector()
    degraded = Clock(ClockQuality.NTP)
    d.offer(_trig("vis.wide", Band.VIS, 1000), degraded)
    det = d.offer(_trig("rf.sdr0", Band.RF, 1050), degraded)
    assert det is not None
    assert det.clock is ClockQuality.NTP


def test_pending_triggers_expire():
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    d.offer(_trig("vis.wide", Band.VIS, 1000), clock)
    # Far future: the old trigger must have aged out, so this is solo again.
    assert d.offer(_trig("lwir.main", Band.LWIR, 60_000), clock) is None


def test_peak_z_reports_largest_excursion():
    d = CoincidenceDetector()
    clock = Clock(ClockQuality.GNSS_PPS)
    d.offer(_trig("vis.wide", Band.VIS, 1000, z=4.0), clock)
    det = d.offer(_trig("lwir.main", Band.LWIR, 1050, z=6.5), clock)
    assert det is not None
    assert det.peak_z == 6.5


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
