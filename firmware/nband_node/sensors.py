"""Sensor drivers.

Every band is behind one interface. That is what lets the grid treat a USD 75
thermal array and a USD 329 radiometric camera as the same band while still
knowing the difference: the driver declares its own capabilities, and the
discriminator reads those capabilities rather than assuming them.

Real hardware imports are all optional and local to the driver that needs them.
A node with no thermal camera does not need the thermal library installed, and
a laptop running `--simulate` needs none of them. Every driver has a simulated
twin so the entire pipeline is exercisable before any hardware arrives, which
is also how the build guide lets you verify each step.
"""

from __future__ import annotations

import math
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable

from .config import ChannelConfig
from .core import Q_CALIBRATION_STALE, Q_SATURATED, Sample
from .schema_generated import Band


@dataclass(frozen=True)
class Capabilities:
    """What a driver can actually resolve.

    This is the honest-substitution mechanism. Two thermal drivers both report
    band `lwir`, but only one reports `radiometric=True` and a useful
    `resolution`. The discriminator scores thermal morphology only when the
    driver claims it can resolve morphology, so registering a cheaper part
    degrades the analysis gracefully instead of corrupting it.
    """

    radiometric: bool = False
    resolution: tuple[int, int] | None = None
    #: Absolute accuracy in the channel's unit, where the datasheet states one.
    accuracy: float | None = None
    #: True when the driver periodically blanks its own stream (thermal
    #: flat-field shutters do this) and marks those samples invalid.
    self_interrupting: bool = False
    notes: str = ""


class Driver(ABC):
    """Base sensor driver."""

    #: Band this driver produces. Set by subclasses.
    band: Band

    def __init__(self, channel: ChannelConfig) -> None:
        self.channel = channel
        self._opened = False

    @property
    def channel_id(self) -> str:
        return self.channel.channel_id

    def capabilities(self) -> Capabilities:
        return Capabilities()

    def open(self) -> None:
        self._opened = True

    def close(self) -> None:
        self._opened = False

    @abstractmethod
    def read(self, t_ns: int) -> Sample | None:
        """Return one sample, or None if no reading is available right now."""

    def self_test(self) -> tuple[bool, str]:
        """Used by the build guide. Every step ends in something verifiable."""
        try:
            self.open()
            s = self.read(time.time_ns())
        except Exception as exc:  # noqa: BLE001 - surfaced to the operator
            return False, f"{type(exc).__name__}: {exc}"
        finally:
            self.close()
        if s is None:
            return False, "driver opened but produced no sample"
        return True, f"{s.value:g} {self.channel.unit}"


# ---------------------------------------------------------------------------
# Simulated drivers
# ---------------------------------------------------------------------------


def _solar_elevation(t_ns: int, lon: float) -> float:
    """Crude solar proxy, -1 at midnight to +1 at local noon."""
    day = (t_ns / 1e9) % 86_400
    local = (day + lon / 360 * 86_400) % 86_400
    return math.sin((local / 86_400 - 0.25) * 2 * math.pi)


class SimulatedDriver(Driver):
    """Synthetic source shaped like the real instrument.

    Each band's simulator reproduces the statistical character of the real
    sensor rather than generic noise: Poisson counting on the scintillator, a
    solar curve on the optical bands, an impulsive radio floor, the thermal
    shutter. A trigger pipeline tuned against generic noise will misbehave the
    first time it meets real data, so the simulator is deliberately awkward in
    the same ways the hardware is.
    """

    def __init__(self, channel: ChannelConfig, longitude: float = 0.0) -> None:
        super().__init__(channel)
        self.band = channel.band
        self._lon = longitude
        self._rng_state = abs(hash(channel.channel_id)) % (2**31)

    def _rand(self) -> float:
        # Deterministic LCG. Reproducible runs make bugs reproducible.
        self._rng_state = (1103515245 * self._rng_state + 12345) % (2**31)
        return self._rng_state / 2**31

    def _gauss(self) -> float:
        u1 = max(self._rand(), 1e-9)
        u2 = self._rand()
        return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

    def capabilities(self) -> Capabilities:
        return Capabilities(notes="simulated source; not real measurement")

    def read(self, t_ns: int) -> Sample:
        b = self.band
        q = 0
        sun = _solar_elevation(t_ns, self._lon)

        if b is Band.GAMMA:
            lam = 38.0
            v = max(0.0, lam + self._gauss() * math.sqrt(lam))
        elif b is Band.UV:
            v = max(0.0, sun) ** 1.8 * 3400 + abs(self._gauss()) * 2
        elif b is Band.VIS:
            v = 9 + (1 - sun) * 4 if sun > 0 else 21.6 - abs(sun) * 0.5 + self._gauss() * 0.06
        elif b is Band.NIR:
            v = 120 + max(0.0, sun) * 2600 + self._gauss() * 14
        elif b is Band.LWIR:
            v = 243 + sun * 11 + self._gauss() * 0.4
            if int(t_ns / 1e9) % 180 == 0:
                q |= Q_CALIBRATION_STALE  # flat-field shutter
        elif b is Band.RF:
            impulse = 32.0 if self._rand() > 0.995 else 0.0
            v = -104 + self._gauss() * 1.6 + impulse
        elif b is Band.ELF_VLF:
            v = math.sin((t_ns / 1e9) / 13750) * 22 + self._gauss() * 6
        elif b is Band.ACOUSTIC:
            v = 28 + self._gauss() * 2 + (22 if self._rand() > 0.99 else 0)
        elif b is Band.MMW:
            r = self._rand()
            v = 2.0 if r > 0.99 else 1.0 if r > 0.94 else 0.0
        elif b is Band.SEISMIC:
            v = self._gauss() * 1e-7
        elif b is Band.ENV:
            # The env band carries several physically unrelated quantities, so
            # the simulator picks its curve from the declared unit. Emitting a
            # temperature curve for a pressure channel would produce readings
            # like 26 hPa, which is not a plausible barometer fault and would
            # quietly invalidate any test written against it.
            unit = self.channel.unit.lower()
            if "pa" in unit:
                v = 1013 + math.sin((t_ns / 1e9) / 1_146_000) * 4 + self._gauss() * 0.15
            elif "%" in unit or "rh" in unit:
                v = min(100.0, max(0.0, 45 - sun * 12 + self._gauss() * 1.5))
            else:
                v = 14 + sun * 12 + self._gauss() * 0.3
        elif b is Band.NAV:
            v = self._gauss() * 180
        else:
            v = self._gauss()

        return Sample(self.channel_id, b, t_ns, round(v, 4), q)


# ---------------------------------------------------------------------------
# Real drivers
# ---------------------------------------------------------------------------


class Bme68xDriver(Driver):
    """Bosch BME688 environmental sensor over I2C."""

    band = Band.ENV

    def open(self) -> None:
        import board  # type: ignore[import-not-found]
        import adafruit_bme680  # type: ignore[import-not-found]

        i2c = board.I2C()
        addr = int(self.channel.options.get("address", 0x77))
        self._dev = adafruit_bme680.Adafruit_BME680_I2C(i2c, address=addr)
        if "sea_level_hpa" in self.channel.options:
            self._dev.sea_level_pressure = float(self.channel.options["sea_level_hpa"])
        self._field = str(self.channel.options.get("field", "temperature"))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(accuracy=1.0, notes="±1.0 °C, ±0.6 hPa, ±3 %RH per datasheet")

    def read(self, t_ns: int) -> Sample:
        value = float(getattr(self._dev, self._field))
        return Sample(self.channel_id, self.band, t_ns, value)


class Mlx90640Driver(Driver):
    """Melexis MLX90640 32x24 thermal array.

    Reports the maximum apparent temperature in the field rather than the whole
    frame. At 768 pixels the array cannot resolve a shape, so it declares
    `resolution` but not the morphology the discriminator would need to score
    thermal structure. That distinction is the point of Capabilities.
    """

    band = Band.LWIR

    def open(self) -> None:
        import board  # type: ignore[import-not-found]
        import adafruit_mlx90640  # type: ignore[import-not-found]

        i2c = board.I2C()
        self._dev = adafruit_mlx90640.MLX90640(i2c)
        self._dev.refresh_rate = adafruit_mlx90640.RefreshRate.REFRESH_16_HZ
        self._frame = [0.0] * 768
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            radiometric=True,
            resolution=(32, 24),
            accuracy=2.0,
            notes="768 px: thermal presence only, insufficient for morphology",
        )

    def read(self, t_ns: int) -> Sample | None:
        try:
            self._dev.getFrame(self._frame)
        except (ValueError, RuntimeError):
            return None  # dropped frame; the array does this routinely
        peak = max(self._frame)
        q = Q_SATURATED if peak > 295 else 0
        return Sample(
            self.channel_id,
            self.band,
            t_ns,
            round(peak + 273.15, 2),
            q,
            vector=tuple(round(v, 2) for v in self._frame),
        )


class RtlSdrPowerDriver(Driver):
    """Band power from an RTL-SDR, in dBm.

    Integrates power across a configured span rather than emitting raw IQ. Raw
    IQ is retained only for high-scoring detections; streaming it continuously
    would saturate both the node's disk and the grid's ingest for no analytic
    gain in the common case.
    """

    band = Band.RF

    def open(self) -> None:
        from rtlsdr import RtlSdr  # type: ignore[import-not-found]

        self._sdr = RtlSdr()
        self._sdr.sample_rate = float(self.channel.options.get("sample_rate", 2.048e6))
        self._sdr.center_freq = float(self.channel.options.get("center_freq", 450e6))
        self._sdr.gain = self.channel.options.get("gain", "auto")
        self._nfft = int(self.channel.options.get("nfft", 1024))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(notes="integrated band power; IQ retained only on high-score events")

    def read(self, t_ns: int) -> Sample | None:
        samples = self._sdr.read_samples(self._nfft * 4)
        if len(samples) == 0:
            return None
        power = sum(abs(complex(s)) ** 2 for s in samples) / len(samples)
        dbm = 10 * math.log10(power + 1e-20)
        return Sample(self.channel_id, self.band, t_ns, round(dbm, 2))


class GeigerCountDriver(Driver):
    """Pulse counter on a GPIO pin, for a scintillator or GM tube."""

    band = Band.GAMMA

    def open(self) -> None:
        import gpiod  # type: ignore[import-not-found]

        chip = gpiod.Chip(str(self.channel.options.get("chip", "gpiochip4")))
        self._line = chip.get_line(int(self.channel.options.get("pin", 17)))
        self._line.request(consumer="nband", type=gpiod.LINE_REQ_EV_RISING_EDGE)
        self._count = 0
        self._last = time.monotonic()
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(notes="count rate only; no energy spectrum from a bare pulse counter")

    def read(self, t_ns: int) -> Sample | None:
        while self._line.event_wait(sec=0):
            self._line.event_read()
            self._count += 1
        now = time.monotonic()
        elapsed = now - self._last
        if elapsed < 1.0:
            return None
        cps = self._count / elapsed
        self._count = 0
        self._last = now
        return Sample(self.channel_id, self.band, t_ns, round(cps, 3))


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

DriverFactory = Callable[[ChannelConfig], Driver]

REGISTRY: dict[str, type[Driver]] = {
    "bme68x": Bme68xDriver,
    "mlx90640": Mlx90640Driver,
    "soapy_rtlsdr": RtlSdrPowerDriver,
    "open_gamma": GeigerCountDriver,
}


class UnknownDriverError(LookupError):
    pass


def build(channel: ChannelConfig, *, simulate: bool, longitude: float = 0.0) -> Driver:
    """Resolve a channel config to a driver instance."""
    if simulate:
        return SimulatedDriver(channel, longitude)

    cls = REGISTRY.get(channel.driver)
    if cls is None:
        raise UnknownDriverError(
            f"channel '{channel.channel_id}': no driver '{channel.driver}'. "
            f"Known drivers: {', '.join(sorted(REGISTRY))}. "
            f"Register a new variant at /hardware/variants."
        )
    return cls(channel)
