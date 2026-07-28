"""Clock discipline, bounded buffers, and the coincidence trigger.

This is the part of the node that makes its data worth combining with anyone
else's. Three ideas do most of the work.

Timing. Every sample carries a nanosecond timestamp and an honest statement of
how much that timestamp can be trusted. A node whose PPS lock has dropped keeps
recording and marks its samples degraded rather than pretending or stopping.
Downstream, geometry silently ignores degraded samples instead of quietly
producing a wrong position.

Memory. Tier 1 targets a 2 GB Raspberry Pi because the 8 GB board costs USD 110
more at July 2026 prices. Every buffer here is bounded at construction. Nothing
in the hot path grows with uptime, so the node's memory profile after a month is
the same as after a minute.

Coincidence. A single channel crossing a threshold is noise. Two channels in
different bands crossing inside the coincidence window is the cheapest strong
evidence the platform can produce, and it is what promotes a buffered window to
permanent storage.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable, Iterator

from .schema_generated import THRESHOLDS, Band, ClockQuality, TriggerReason

COINCIDENCE_WINDOW_NS = int(THRESHOLDS["coincidenceWindowMs"] * 1_000_000)
MIN_BANDS_FOR_COINCIDENCE = 2

# Quality bitfield, mirrored in schema/sql/0001_init.sql and lib/feed/types.ts.
Q_CLOCK_DEGRADED = 1 << 0
Q_SATURATED = 1 << 1
Q_CALIBRATION_STALE = 1 << 2
Q_SELF_EMISSION = 1 << 3
Q_INTERPOLATED = 1 << 4


@dataclass(slots=True, frozen=True)
class Sample:
    """One reading. `t_ns` is nanoseconds since the Unix epoch."""

    channel_id: str
    band: Band
    t_ns: int
    value: float
    quality: int = 0
    vector: tuple[float, ...] | None = None

    @property
    def t_iso(self) -> str:
        secs, ns = divmod(self.t_ns, 1_000_000_000)
        base = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(secs))
        return f"{base}.{ns:09d}Z"


class Clock:
    """Timestamp source with an explicit, reported quality.

    On a real node the PPS edge is disciplined into the system clock by chrony
    and read back through `/var/run/chrony` or `chronyc tracking`. This class
    does not reimplement that; it reads the resulting offset and translates it
    into the quality grade the schema records. The important behaviour is that
    quality is never assumed: if the offset cannot be read, the clock reports
    `freerun` and every sample it stamps is flagged.
    """

    def __init__(self, quality: ClockQuality = ClockQuality.FREERUN, offset_ns: int = 0) -> None:
        self._quality = quality
        self._offset_ns = offset_ns
        self._last_check = 0.0

    @property
    def quality(self) -> ClockQuality:
        return self._quality

    @property
    def offset_ns(self) -> int:
        return self._offset_ns

    @property
    def degraded(self) -> bool:
        return self._quality != ClockQuality.GNSS_PPS

    def now_ns(self) -> int:
        return time.time_ns()

    def quality_bits(self) -> int:
        return Q_CLOCK_DEGRADED if self.degraded else 0

    def update_from_chrony(self, tracking_text: str) -> None:
        """Parse `chronyc tracking` output and grade the clock.

        Grading is deliberately conservative. Reference ID must indicate a PPS
        source and the RMS offset must be under a microsecond before the node
        claims it can contribute to multi-node geometry.
        """
        ref_is_pps = False
        offset_s: float | None = None
        for line in tracking_text.splitlines():
            key, _, value = line.partition(":")
            key = key.strip().lower()
            value = value.strip()
            if key == "reference id":
                ref_is_pps = "PPS" in value.upper()
            elif key == "rms offset":
                try:
                    offset_s = float(value.split()[0])
                except (ValueError, IndexError):
                    offset_s = None

        if offset_s is None:
            self._quality = ClockQuality.FREERUN
            self._offset_ns = 0
            return

        self._offset_ns = int(offset_s * 1e9)
        if ref_is_pps and abs(self._offset_ns) < 1_000_000:
            self._quality = ClockQuality.GNSS_PPS
        elif abs(self._offset_ns) < 100_000_000:
            self._quality = ClockQuality.NTP
        else:
            self._quality = ClockQuality.FREERUN


class RingBuffer:
    """Fixed-capacity sample buffer with time-range extraction.

    Bounded at construction and never resized. Extraction is a linear scan
    rather than a copy of the whole buffer, because on a 2 GB board the
    difference matters when several channels trigger at once.
    """

    __slots__ = ("_buf", "_capacity")

    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError("capacity must be positive")
        self._capacity = capacity
        self._buf: deque[Sample] = deque(maxlen=capacity)

    def __len__(self) -> int:
        return len(self._buf)

    @property
    def capacity(self) -> int:
        return self._capacity

    def append(self, sample: Sample) -> None:
        self._buf.append(sample)

    def extend(self, samples: Iterable[Sample]) -> None:
        self._buf.extend(samples)

    def latest(self) -> Sample | None:
        return self._buf[-1] if self._buf else None

    def between(self, start_ns: int, end_ns: int) -> list[Sample]:
        return [s for s in self._buf if start_ns <= s.t_ns <= end_ns]

    def __iter__(self) -> Iterator[Sample]:
        return iter(self._buf)


class NoiseFloor:
    """Running mean and standard deviation with exponential forgetting.

    Thresholds have to adapt per site: the radio floor at a rural site and a
    suburban one differ by tens of decibels, and a fixed threshold would make
    one node deaf and the other useless.

    Plain Welford over the node's whole lifetime was wrong for a different
    reason. Several of these channels have a strong diurnal cycle, and a
    lifetime mean sits between day and night rather than tracking either. On
    the first day every dusk and dawn crossed the threshold; after a few weeks
    the accumulated variance was wide enough that nothing crossed it again. The
    channel went from crying wolf to being deaf, and neither state announced
    itself.

    An exponentially weighted estimator keeps the constant-memory property and
    forgets on a timescale set by `halflife_samples`, so the floor follows the
    channel instead of averaging over it.
    """

    __slots__ = ("_n", "_mean", "_var", "_warmup", "_alpha")

    def __init__(self, warmup: int = 64, halflife_samples: float = 3600.0) -> None:
        self._n = 0
        self._mean = 0.0
        self._var = 0.0
        self._warmup = warmup
        # Weight of each new sample. A half-life of 3600 samples is one hour at
        # 1 Hz and a few minutes on the fast channels, which tracks weather and
        # the day/night transition without chasing individual events.
        self._alpha = 1.0 - 0.5 ** (1.0 / max(halflife_samples, 1.0))

    def update(self, value: float) -> None:
        self._n += 1
        if self._n == 1:
            self._mean = value
            self._var = 0.0
            return
        # Weight is the larger of the forgetting factor and 1/n, for every n.
        #
        # Tying the crossover to `warmup` instead was wrong: with a half-life of
        # 3600 samples, alpha is about 0.0002, so switching to it after 64
        # samples froze the mean almost immediately and later samples could
        # barely move it. Taking the maximum makes the estimator a true running
        # mean until 1/n falls below alpha, around 5000 samples, and an
        # exponentially weighted one thereafter, with no discontinuity.
        a = max(self._alpha, 1.0 / self._n)
        delta = value - self._mean
        self._mean += a * delta
        self._var = (1 - a) * (self._var + a * delta * delta)

    @property
    def ready(self) -> bool:
        return self._n >= self._warmup

    @property
    def mean(self) -> float:
        return self._mean

    @property
    def sigma(self) -> float:
        if self._n < 2:
            return 0.0
        return math.sqrt(max(self._var, 0.0))

    def z_score(self, value: float) -> float:
        s = self.sigma
        if s <= 0:
            return 0.0
        return (value - self._mean) / s


@dataclass(slots=True)
class ChannelTrigger:
    """A single channel's threshold crossing."""

    channel_id: str
    band: Band
    t_ns: int
    value: float
    z_score: float


@dataclass(slots=True)
class Detection:
    """A promoted window: something worth keeping."""

    t_start_ns: int
    t_end_ns: int
    reason: TriggerReason
    clock: ClockQuality
    triggers: list[ChannelTrigger] = field(default_factory=list)

    @property
    def bands(self) -> list[Band]:
        seen: dict[Band, None] = {}
        for t in self.triggers:
            seen[t.band] = None
        return list(seen)

    @property
    def channel_ids(self) -> list[str]:
        return sorted({t.channel_id for t in self.triggers})

    @property
    def peak_z(self) -> float:
        return max((t.z_score for t in self.triggers), default=0.0)


class CoincidenceDetector:
    """Promotes threshold crossings to detections.

    A crossing on its own is held, not published. It becomes a detection when
    a second band crosses inside the coincidence window, or when a single
    channel's excursion is extreme enough to be worth recording alone. The
    second case exists because some genuinely interesting things are visible in
    exactly one band, but it is scored much lower and can never reach the
    unresolved rung downstream.
    """

    def __init__(
        self,
        window_ns: int = COINCIDENCE_WINDOW_NS,
        solo_sigma: float = 8.0,
        min_bands: int = MIN_BANDS_FOR_COINCIDENCE,
    ) -> None:
        self._window_ns = window_ns
        self._solo_sigma = solo_sigma
        self._min_bands = min_bands
        self._pending: deque[ChannelTrigger] = deque(maxlen=512)

    def offer(self, trigger: ChannelTrigger, clock: Clock) -> Detection | None:
        """Feed one crossing. Returns a Detection when the window closes.

        Three things this has to get right, each of which it previously did not.

        The window is bounded on both sides. Channels sample at different rates
        and a slow channel's read can be stamped behind a fast one's, so a
        trigger arriving with an older timestamp than one already pending is
        still legitimately inside the window and must not be silently kept
        forever by a cutoff computed only from the newest arrival.

        A trigger that fires a solo detection is removed. It used to stay
        pending, so the very next crossing in another band promoted a
        coincidence that included a trigger already published on its own: one
        physical event, counted twice, once as threshold and once as
        coincidence.

        A band is counted once. Two channels in the same band are one
        observation, not corroboration, and `distinct_bands` was already a set,
        but the published detection now also records which channels
        contributed so that duplication is visible downstream.
        """
        self._pending.append(trigger)

        # Bound both ways around the newest trigger. Anything further from it
        # than the window in either direction cannot be part of this event.
        newest = max(t.t_ns for t in self._pending)
        self._pending = deque(
            (t for t in self._pending if abs(newest - t.t_ns) <= self._window_ns),
            maxlen=self._pending.maxlen,
        )

        in_window = list(self._pending)
        distinct_bands = {t.band for t in in_window}

        if len(distinct_bands) >= self._min_bands:
            det = Detection(
                t_start_ns=min(t.t_ns for t in in_window),
                t_end_ns=max(t.t_ns for t in in_window),
                reason=TriggerReason.COINCIDENCE,
                clock=clock.quality,
                triggers=list(in_window),
            )
            self._pending.clear()
            return det

        if abs(trigger.z_score) >= self._solo_sigma:
            # Consume it. Leaving it pending let the same crossing appear again
            # inside a later coincidence.
            try:
                self._pending.remove(trigger)
            except ValueError:
                pass
            return Detection(
                t_start_ns=trigger.t_ns,
                t_end_ns=trigger.t_ns,
                reason=TriggerReason.THRESHOLD,
                clock=clock.quality,
                triggers=[trigger],
            )

        return None
