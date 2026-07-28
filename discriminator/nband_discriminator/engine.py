"""The discriminator.

Takes an observation, subtracts everything known, scores what is left against a
fixed hypothesis set, and produces a verdict that can explain itself.

Three commitments shape the design.

The ladder is open at the top but bounded. The highest rung is `unresolved`,
not `artificial`. The engine can establish that nothing it knows about explains
an event. It cannot establish what did, and it is not permitted to say so.

Absence of evidence is tracked separately from evidence of absence. A catalogue
that could not be reached is recorded as unavailable and, critically, blocks
promotion to the top rung. An event is only unresolved if the checks that could
have explained it actually ran.

Every verdict explains itself in prose. A number without a reason is not a
result anyone can argue with, and being arguable is the point.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "firmware"))

from nband_node.schema_generated import (
    HYPOTHESES,
    SCHEMA_VERSION,
    THRESHOLDS,
    Classification,
    ClockQuality,
    Corroboration,
)

from .catalogs import DEFAULT_CATALOGS, Catalog, CatalogResult, Observation

DISCRIMINATOR_VERSION = "0.1.0"

UNRESOLVED_FLOOR = float(THRESHOLDS["anomalyScoreUnresolvedFloor"])
MIN_BANDS_FOR_UNRESOLVED = int(THRESHOLDS["minBandsForUnresolved"])

#: Posterior below which no conventional hypothesis is considered to fit.
#: Above it the event is explained well enough to close; below it the gates
#: in _classify decide between "unresolved" and "bad measurement".
CONVENTIONAL_FIT_FLOOR = 0.40


@dataclass
class HypothesisScore:
    id: str
    label: str
    prior: float
    likelihood: float
    posterior: float = 0.0
    reasons: list[str] = field(default_factory=list)


@dataclass
class Verdict:
    classification: Classification
    anomaly_score: float
    corroboration: Corroboration
    hypotheses: list[HypothesisScore]
    explanation: str
    catalog_results: list[CatalogResult]
    unavailable_catalogs: list[str]
    discriminator_version: str = DISCRIMINATOR_VERSION
    schema_version: str = SCHEMA_VERSION

    @property
    def top(self) -> HypothesisScore:
        return self.hypotheses[0]

    def to_dict(self) -> dict:
        return {
            "classification": self.classification.value,
            "anomaly_score": round(self.anomaly_score, 2),
            "corroboration": self.corroboration.value,
            "hypotheses": [
                {
                    "id": h.id,
                    "label": h.label,
                    "prior": round(h.prior, 4),
                    "likelihood": round(h.likelihood, 4),
                    "posterior": round(h.posterior, 4),
                    "reasons": h.reasons,
                }
                for h in self.hypotheses
            ],
            "explanation": self.explanation,
            "unavailable_catalogs": self.unavailable_catalogs,
            "discriminator_version": self.discriminator_version,
            "schema_version": self.schema_version,
        }


class Discriminator:
    def __init__(self, catalogs: tuple[Catalog, ...] = DEFAULT_CATALOGS) -> None:
        self.catalogs = catalogs

    # -- likelihoods --------------------------------------------------------

    def _likelihoods(
        self, obs: Observation, results: dict[str, CatalogResult]
    ) -> dict[str, tuple[float, list[str]]]:
        """P(observation | hypothesis) for each hypothesis, with reasons.

        These are deliberately coarse. A model with more parameters than the
        archive can constrain would produce confident numbers that mean nothing,
        which is worse than a blunt model that is honest about its resolution.
        """
        out: dict[str, tuple[float, list[str]]] = {}
        bands = set(obs.bands)
        n_bands = len(bands)
        dur = obs.duration_s
        rate = obs.angular_rate_dps

        adsb = results.get("adsb")
        tle = results.get("tle")
        light = results.get("lightning")
        rfi = results.get("rfi")
        wx = results.get("weather")

        # Aircraft
        r: list[str] = []
        lk = 0.25
        if adsb and adsb.explains:
            lk = 0.98
            r.append(f"ADS-B match to {adsb.object_id} at {adsb.delta_bearing_deg}° separation")
        elif adsb and adsb.available and not adsb.matched:
            # The overwhelming majority of aircraft in controlled airspace
            # transmit ADS-B, so a reachable feed that reports nothing on this
            # bearing is strong evidence. Not conclusive: gliders, some
            # military traffic, and equipment failures are all non-cooperative,
            # which is why this is 0.03 and not 0.
            lk = 0.03
            r.append("ADS-B was reachable and reported no aircraft on this bearing")
        elif adsb and not adsb.available:
            lk = 0.30
            r.append("ADS-B unavailable, so an aircraft cannot be ruled out")
        if "acoustic" in bands and "vis" in bands:
            lk *= 1.4
            r.append("acoustic and optical both present, typical of a powered aircraft")
        out["aircraft"] = (min(lk, 1.0), r)

        # Satellite
        r = []
        lk = 0.12
        if tle and tle.explains:
            illuminated = tle.detail.get("illuminated", True)
            if illuminated:
                lk = 0.96
                r.append(
                    f"illuminated pass of NORAD {tle.object_id} within {tle.delta_bearing_deg}°"
                )
            else:
                # An eclipsed satellite cannot produce an optical detection.
                lk = 0.15
                r.append(f"NORAD {tle.object_id} was on this bearing but in eclipse")
        elif tle and tle.available:
            lk = 0.04
            r.append("no catalogued satellite pass on this bearing")
        if "acoustic" in bands:
            lk *= 0.02
            r.append("satellites are silent; an acoustic component argues strongly against")
        if "lwir" in bands and "mmw" in bands:
            lk *= 0.1
            r.append("radar return at this range is inconsistent with orbital altitude")
        out["satellite"] = (min(lk, 1.0), r)

        # Bird or insect
        r = []
        lk = 0.2
        if rate is not None and rate > 12:
            lk = 0.55
            r.append(f"high angular rate ({rate:.1f}°/s) is typical of something close and small")
        if "lwir" in bands and obs.metrics.get("lwir", 0) < 305:
            lk *= 1.3
            r.append("weak thermal signature consistent with a small animal")
        if "rf" in bands:
            lk *= 0.05
            r.append("birds and insects do not transmit")
        if dur > 30:
            lk *= 0.3
            r.append(f"{dur:.0f} s persistence is long for a close-range animal")
        # A measured range is the strongest constraint available, because it
        # converts angular size into physical size. Birds do not return radar
        # at several hundred metres, and treating them as a live hypothesis
        # once range is known is exactly how a system talks itself out of a
        # real detection.
        if obs.range_m is not None and obs.range_m > 400:
            lk *= 0.03
            r.append(
                f"radar range of {obs.range_m:.0f} m is far beyond bird or insect detectability"
            )
        out["bird_insect"] = (min(lk, 1.0), r)

        # Meteor
        r = []
        lk = 0.02
        if dur < 3 and "vis" in bands:
            lk = 0.4
            r.append(f"short optical event ({dur:.1f} s) is meteor-like")
            if rate is not None and rate > 20:
                lk = 0.7
                r.append("very high angular rate supports a meteor")
        if dur > 5:
            lk = 0.005
            r.append("far too long for a meteor")
        if "acoustic" in bands or "rf" in bands:
            lk *= 0.2
            r.append("acoustic or RF content is unusual for a meteor at this scale")
        if "mmw" in bands and obs.range_m is not None and obs.range_m < 5000:
            lk *= 0.02
            r.append("a radar return inside 5 km is inconsistent with meteor altitude")
        out["meteor"] = (min(lk, 1.0), r)

        # Balloon or debris
        r = []
        lk = 0.06
        if rate is not None and rate < 0.5 and dur > 60:
            lk = 0.45
            r.append("very slow and persistent, consistent with a drifting object")
        out["balloon_debris"] = (min(lk, 1.0), r)

        # Small uncrewed aircraft
        r = []
        lk = 0.1
        if "acoustic" in bands and "vis" in bands and (rate is None or rate < 15):
            lk = 0.35
            r.append("audible and optically tracked at moderate rate, typical of a small drone")
        if "rf" in bands:
            lk *= 1.8
            r.append("RF present, consistent with a control or video downlink")
        if adsb and adsb.explains:
            lk *= 0.1
            r.append("an ADS-B match makes a small uncrewed aircraft unlikely")
        out["drone"] = (min(lk, 1.0), r)

        # Atmospheric or optical effect
        r = []
        lk = 0.05
        if wx and wx.explains:
            lk = 0.6
            r.append(
                str(wx.detail.get("note", "atmospheric conditions favour a refraction artefact"))
            )
        if light and light.explains:
            lk = 0.9
            r.append(
                f"lightning fix at {light.detail.get('distance_km')} km, Δt {light.delta_t_s} s"
            )
        out["atmospheric"] = (min(lk, 1.0), r)

        # Instrumental
        r = []
        lk = 0.08
        if n_bands == 1:
            lk = 0.35
            r.append("single-band event; instrument artefacts are single-band by nature")
        if rfi and rfi.explains:
            lk = 0.8
            r.append(f"matches the site's learned RFI signature '{rfi.object_id}'")
        if obs.peak_z > 30:
            lk *= 1.5
            r.append(
                f"excursion of {obs.peak_z:.0f} sigma is more typical of a fault than a source"
            )
        if n_bands >= 3:
            lk *= 0.05
            r.append("three independent bands agreeing is very hard to produce with one fault")
        out["instrument"] = (min(lk, 1.0), r)

        # Unmodelled: what is left when everything else fits badly.
        r = []
        lk = 0.02
        if n_bands >= MIN_BANDS_FOR_UNRESOLVED:
            explained = [k for k, v in results.items() if v.explains]
            if not explained:
                lk = 0.5
                r.append(f"{n_bands} bands agreed and no catalogue explained it")
        if obs.node_count > 1:
            lk *= 1.6
            r.append(f"witnessed independently by {obs.node_count} nodes")
        if obs.range_m is not None:
            lk *= 1.3
            r.append("a measured range makes the kinematics checkable rather than assumed")
        out["unmodelled"] = (min(lk, 1.0), r)

        return out

    # -- scoring ------------------------------------------------------------

    def evaluate(self, obs: Observation) -> Verdict:
        results: dict[str, CatalogResult] = {}
        for cat in self.catalogs:
            try:
                results[cat.source] = cat.check(obs)
            except Exception as exc:
                results[cat.source] = CatalogResult(
                    cat.source, available=False, detail={"reason": f"raised {type(exc).__name__}"}
                )

        unavailable = sorted(k for k, v in results.items() if not v.available)
        likelihoods = self._likelihoods(obs, results)

        scored: list[HypothesisScore] = []
        for h in HYPOTHESES:
            lk, reasons = likelihoods.get(h["id"], (0.05, []))
            scored.append(
                HypothesisScore(h["id"], h["label"], float(h["prior"]), lk, reasons=reasons)
            )

        evidence = sum(h.prior * h.likelihood for h in scored)
        if evidence <= 0:
            for h in scored:
                h.posterior = h.prior
        else:
            for h in scored:
                h.posterior = (h.prior * h.likelihood) / evidence
        scored.sort(key=lambda h: h.posterior, reverse=True)

        corroboration = self._corroboration(obs)
        anomaly = self._anomaly_score(obs, scored, results, corroboration)
        classification = self._classify(obs, scored, results, unavailable, corroboration, anomaly)
        explanation = self._explain(
            obs, scored, results, unavailable, classification, corroboration
        )

        return Verdict(
            classification=classification,
            anomaly_score=anomaly,
            corroboration=corroboration,
            hypotheses=scored,
            explanation=explanation,
            catalog_results=list(results.values()),
            unavailable_catalogs=unavailable,
        )

    def _corroboration(self, obs: Observation) -> Corroboration:
        if obs.node_count > 1:
            return Corroboration.MULTI_NODE
        if len(set(obs.bands)) > 1:
            return Corroboration.MULTI_CHANNEL
        return Corroboration.SINGLE_CHANNEL

    @staticmethod
    def _best_conventional(scored: list[HypothesisScore]) -> HypothesisScore:
        """Highest-posterior hypothesis that is not the catch-all.

        The anomaly score is driven by how badly the best *conventional*
        explanation fits, not by whether `unmodelled` wins the argmax. With a
        cold-start prior of 0.01, `unmodelled` can essentially never be the
        argmax however well it fits, which would make the top rung of the
        ladder decorative. Asking "does anything ordinary actually explain
        this?" is both the honest question and the answerable one.
        """
        return max((h for h in scored if h.id != "unmodelled"), key=lambda h: h.posterior)

    def _anomaly_score(
        self,
        obs: Observation,
        scored: list[HypothesisScore],
        results: dict[str, CatalogResult],
        corr: Corroboration,
    ) -> float:
        best = self._best_conventional(scored)
        base = (1.0 - best.posterior) * 100

        # Corroboration raises confidence in whatever the score already says.
        if corr is Corroboration.MULTI_NODE:
            base *= 1.35
        elif corr is Corroboration.MULTI_CHANNEL:
            base *= 1.1

        # Any catalogue that positively explains the event collapses the score.
        if any(v.explains for v in results.values()):
            base *= 0.15

        # A degraded clock caps how much can be claimed, because the timing that
        # makes cross-band coincidence meaningful is exactly what is missing.
        if obs.clock != ClockQuality.GNSS_PPS.value:
            base = min(base, 45.0)

        return max(0.0, min(100.0, base))

    def _classify(
        self,
        obs: Observation,
        scored: list[HypothesisScore],
        results: dict[str, CatalogResult],
        unavailable: list[str],
        corr: Corroboration,
        anomaly: float,
    ) -> Classification:
        best = self._best_conventional(scored)
        explaining = [v for v in results.values() if v.explains]

        # A catalogue positively identified it. Nothing else matters.
        if explaining and best.id in {"aircraft", "satellite"} and best.posterior > 0.5:
            return Classification.TERRESTRIAL_KNOWN
        if best.id == "atmospheric" and explaining:
            return Classification.TERRESTRIAL_KNOWN
        if best.id == "instrument" and best.posterior > CONVENTIONAL_FIT_FLOOR:
            return Classification.INSTRUMENTAL

        # Something ordinary fits well enough. Most events land here.
        if best.posterior >= CONVENTIONAL_FIT_FLOOR:
            if best.id in {"aircraft", "satellite"}:
                return Classification.TERRESTRIAL_LIKELY
            if best.id == "instrument":
                return Classification.INSTRUMENTAL
            return Classification.TERRESTRIAL_LIKELY

        # Nothing conventional fits. Now the gates decide whether that means
        # "we checked properly and still cannot explain it" or merely
        # "this was a poor measurement".
        if len(set(obs.bands)) < MIN_BANDS_FOR_UNRESOLVED:
            return Classification.AMBIGUOUS
        if corr is Corroboration.SINGLE_CHANNEL:
            return Classification.AMBIGUOUS
        if unavailable:
            return Classification.AMBIGUOUS
        if obs.clock != ClockQuality.GNSS_PPS.value:
            return Classification.AMBIGUOUS
        if anomaly < UNRESOLVED_FLOOR:
            return Classification.AMBIGUOUS
        return Classification.ANOMALOUS_UNRESOLVED

    def _explain(
        self,
        obs: Observation,
        scored: list[HypothesisScore],
        results: dict[str, CatalogResult],
        unavailable: list[str],
        classification: Classification,
        corr: Corroboration,
    ) -> str:
        parts: list[str] = []
        bands = ", ".join(sorted(set(obs.bands)))
        parts.append(
            f"Event spanned {obs.duration_s:.1f} s across {len(set(obs.bands))} band(s) ({bands}), "
            f"corroboration {corr.value.replace('_', ' ')}, clock {obs.clock}."
        )

        checked = [v for v in results.values() if v.available]
        parts.append(f"Checked {len(checked)} of {len(results)} catalogues.")

        for v in results.values():
            if v.explains:
                parts.append(
                    f"{v.source.upper()} explained it: {v.object_id} (score {v.match_score})."
                )
            elif v.available and not v.matched:
                parts.append(f"{v.source.upper()} was reachable and found no match.")

        if unavailable:
            parts.append(
                "Unavailable at scoring time: "
                + ", ".join(unavailable)
                + ". This is recorded rather than treated as a clean result, and it prevents "
                "promotion to the unresolved rung."
            )

        top = scored[0]
        best_conv = self._best_conventional(scored)
        parts.append(f"Best hypothesis: {top.label} at posterior {top.posterior:.2f}.")
        if best_conv.id != top.id:
            parts.append(
                f"Best conventional explanation: {best_conv.label} at {best_conv.posterior:.2f}."
            )
        if best_conv.posterior < CONVENTIONAL_FIT_FLOOR:
            parts.append(
                f"No conventional hypothesis reached the {CONVENTIONAL_FIT_FLOOR:.2f} fit floor."
            )
        if top.reasons:
            parts.append("Because " + "; ".join(top.reasons) + ".")

        runner = scored[1] if len(scored) > 1 else None
        if runner and runner.posterior > 0.12:
            parts.append(f"Next best: {runner.label} at {runner.posterior:.2f}.")

        if classification is Classification.ANOMALOUS_UNRESOLVED:
            parts.append(
                "Classified unresolved. This states that no catalogue consulted explains the "
                "event, not that its cause is known to be unusual."
            )
        elif classification is Classification.AMBIGUOUS:
            parts.append("Classified ambiguous: the measurement is not good enough to decide.")

        return " ".join(parts)
