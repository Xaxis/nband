"""Tests for the discriminator.

The behaviour these lock down is not "does it find things". It is "does it
refuse to find things when it should". Every test that asserts a downgrade is
protecting the archive from a false claim, which is the only failure mode that
actually costs the project anything.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "discriminator"))
sys.path.insert(0, str(ROOT / "firmware"))

from nband_discriminator.catalogs import (  # noqa: E402
    AdsbCatalog,
    LightningCatalog,
    Observation,
    RfiBaselineCatalog,
    TleCatalog,
    WeatherCatalog,
    angular_separation,
)
from nband_discriminator.engine import Discriminator  # noqa: E402
from nband_node.schema_generated import Classification, Corroboration  # noqa: E402

NS = 1_000_000_000


def obs(**kw):
    base = dict(
        t_start_ns=1_700_000_000 * NS,
        t_end_ns=1_700_000_002 * NS,
        bands=("vis", "lwir"),
        clock="gnss_pps",
        lat=31.94,
        lon=-109.31,
        elevation_m=1402.0,
        azimuth_deg=180.0,
        elev_angle_deg=40.0,
        peak_z=6.0,
        node_count=1,
        metrics={},
    )
    base.update(kw)
    return Observation(**base)


def all_available(adsb_contacts=(), tle_passes=(), strokes=(), wx=None, rfi_sigs=()):
    """A full catalogue set that is reachable and, by default, finds nothing."""
    return (
        AdsbCatalog(provider=lambda o: list(adsb_contacts)),
        TleCatalog(provider=lambda o: list(tle_passes)),
        LightningCatalog(provider=lambda o: list(strokes)),
        RfiBaselineCatalog(known_signatures=list(rfi_sigs)),
        WeatherCatalog(provider=lambda o: dict(wx or {})),
    )


# --- geometry --------------------------------------------------------------


def test_angular_separation_zero_for_identical_bearings():
    assert angular_separation(90, 30, 90, 30) < 1e-9


def test_angular_separation_is_symmetric_and_sane():
    a = angular_separation(0, 0, 90, 0)
    assert abs(a - 90.0) < 1e-6
    assert abs(a - angular_separation(90, 0, 0, 0)) < 1e-9


# --- catalogue availability semantics --------------------------------------


def test_missing_provider_is_unavailable_not_clean():
    # The core honesty guarantee. No provider must never read as "no match".
    res = AdsbCatalog(provider=None).check(obs())
    assert res.available is False
    assert res.matched is False
    assert res.explains is False


def test_provider_exception_is_unavailable():
    def boom(_):
        raise ConnectionError("feed down")

    res = AdsbCatalog(provider=boom).check(obs())
    assert res.available is False
    assert "ConnectionError" in res.detail["reason"]


def test_reachable_provider_with_no_contacts_is_a_clean_check():
    res = AdsbCatalog(provider=lambda o: []).check(obs())
    assert res.available is True
    assert res.matched is False


# --- known-source explanation ----------------------------------------------


def test_adsb_match_classifies_as_known():
    cats = all_available(
        adsb_contacts=[{"hex": "a4f81c", "azimuth_deg": 180.4, "elevation_deg": 40.2,
                        "altitude_m": 10300, "callsign": "SWA1234"}]
    )
    v = Discriminator(cats).evaluate(obs(bands=("vis", "nir", "acoustic")))
    assert v.classification is Classification.TERRESTRIAL_KNOWN
    assert v.anomaly_score < 20
    assert "a4f81c" in v.explanation


def test_eclipsed_satellite_does_not_explain_an_optical_event():
    # A satellite in Earth's shadow emits no visible light, so a bearing match
    # alone must not close an optical detection.
    cats = all_available(
        tle_passes=[{"norad_id": 25544, "azimuth_deg": 180.1, "elevation_deg": 40.0,
                     "name": "ISS", "illuminated": False}]
    )
    v = Discriminator(cats).evaluate(obs(bands=("vis",)))
    sat = next(h for h in v.hypotheses if h.id == "satellite")
    assert sat.posterior < 0.4
    assert "eclipse" in " ".join(sat.reasons)


def test_lightning_explains_a_uv_rf_magnetic_coincidence():
    cats = all_available(strokes=[{"id": "L1", "distance_km": 41.0, "delta_t_s": 0.2,
                                   "peak_current_ka": -18}])
    v = Discriminator(cats).evaluate(obs(bands=("uv", "rf", "elf_vlf")))
    assert v.classification in {Classification.TERRESTRIAL_KNOWN, Classification.TERRESTRIAL_LIKELY}
    assert v.anomaly_score < 30


def test_learned_rfi_signature_marks_event_instrumental():
    cats = all_available(rfi_sigs=[{"label": "site-pager-462MHz", "level_dbm": -62.0,
                                    "tolerance_db": 3.0, "count": 4120}])
    v = Discriminator(cats).evaluate(obs(bands=("rf",), metrics={"rf": -61.5}))
    assert v.classification is Classification.INSTRUMENTAL


# --- the gates that block a false mystery -----------------------------------


def test_single_band_cannot_reach_unresolved():
    v = Discriminator(all_available()).evaluate(obs(bands=("vis",)))
    assert v.classification is not Classification.ANOMALOUS_UNRESOLVED
    assert v.corroboration is Corroboration.SINGLE_CHANNEL


def test_unavailable_catalog_blocks_unresolved():
    # Three bands, nothing explains it, high score. The only thing missing is a
    # reachable ADS-B feed, and that alone must prevent the top rung.
    cats = (
        AdsbCatalog(provider=None),  # unavailable
        TleCatalog(provider=lambda o: []),
        LightningCatalog(provider=lambda o: []),
        RfiBaselineCatalog([]),
        WeatherCatalog(provider=lambda o: {}),
    )
    v = Discriminator(cats).evaluate(
        obs(bands=("vis", "lwir", "mmw"), node_count=2, range_m=900.0)
    )
    # The guarantee is that the top rung is unreachable and the gap is on the
    # record, not that the verdict must be 'ambiguous'. With ADS-B down,
    # "probably an aircraft" is the honest reading, and the engine reaching it
    # is correct behaviour rather than a failure.
    assert "adsb" in v.unavailable_catalogs
    assert v.classification is not Classification.ANOMALOUS_UNRESOLVED
    assert "Unavailable at scoring time" in v.explanation


def test_degraded_clock_blocks_unresolved_and_caps_score():
    v = Discriminator(all_available()).evaluate(
        obs(bands=("vis", "lwir", "mmw"), clock="ntp", node_count=2, range_m=900.0)
    )
    # Identical to the event that does reach 'unresolved', except the clock.
    # Millisecond timing cannot support the cross-band coincidence claim, so
    # the verdict is capped and the top rung is closed.
    assert v.classification is Classification.AMBIGUOUS
    assert v.anomaly_score <= 45.0


def test_fully_checked_multiband_multinode_event_can_reach_unresolved():
    # Everything reachable, nothing matched, three bands, two nodes, real range.
    # This is the only shape that is allowed to reach the top rung.
    v = Discriminator(all_available()).evaluate(
        obs(bands=("vis", "lwir", "mmw"), node_count=2, range_m=900.0, clock="gnss_pps")
    )
    assert v.unavailable_catalogs == []
    assert v.classification is Classification.ANOMALOUS_UNRESOLVED
    assert v.anomaly_score >= 70
    assert v.corroboration is Corroboration.MULTI_NODE
    # The claim must be stated in limited terms.
    assert "not that its cause is known" in v.explanation


def test_verdict_always_explains_itself():
    v = Discriminator(all_available()).evaluate(obs())
    assert len(v.explanation) > 80
    assert "catalogues" in v.explanation
    assert v.to_dict()["explanation"] == v.explanation


def test_posteriors_are_a_distribution():
    v = Discriminator(all_available()).evaluate(obs(bands=("vis", "lwir")))
    total = sum(h.posterior for h in v.hypotheses)
    assert abs(total - 1.0) < 1e-6
    assert v.hypotheses == sorted(v.hypotheses, key=lambda h: h.posterior, reverse=True)


def test_three_bands_argue_against_instrument_fault():
    v = Discriminator(all_available()).evaluate(obs(bands=("vis", "lwir", "rf")))
    inst = next(h for h in v.hypotheses if h.id == "instrument")
    assert inst.posterior < 0.15


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
