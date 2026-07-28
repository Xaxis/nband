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

import datetime
import math
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass

from .config import ChannelConfig
from .core import Q_CALIBRATION_STALE, Q_CLOCK_DEGRADED, Q_SATURATED, Q_SELF_EMISSION, Sample
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
        except Exception as exc:
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
        import adafruit_bme680  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]

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
        import adafruit_mlx90640  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]

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


# ---------------------------------------------------------------------------
# GPIO, across two incompatible libgpiod generations
# ---------------------------------------------------------------------------
#
# libgpiod 2.0 removed Chip.get_line() and the LINE_REQ_* constants outright,
# replacing them with request_lines() and a LineSettings object. pyproject
# declares gpiod>=2.1, but both GPIO drivers were written against the 1.x API,
# so the gamma and beacon channels raised AttributeError the moment open() ran
# on a correctly installed node. Nothing caught it because neither driver is
# exercised without hardware attached.
#
# Bookworm ships 1.6.3 as python3-libgpiod while pip installs 2.x, so a node can
# genuinely have either depending on how its operator followed the guide. These
# shims pick at runtime rather than forcing anyone to reinstall.


def _chip_path(name: str) -> str:
    """Accept either 'gpiochip4' or '/dev/gpiochip4'; 2.x requires the path."""
    return name if name.startswith("/dev/") else f"/dev/{name}"


class _EdgeCounter:
    """Counts rising edges on one line, on either libgpiod generation."""

    def __init__(self, chip: str, pin: int, consumer: str) -> None:
        import gpiod  # type: ignore[import-not-found]

        self._pin = pin
        if hasattr(gpiod, "request_lines"):  # 2.x
            from gpiod.line import Edge  # type: ignore[import-not-found]

            self._v2 = True
            self._req = gpiod.request_lines(
                _chip_path(chip),
                consumer=consumer,
                config={pin: gpiod.LineSettings(edge_detection=Edge.RISING)},
            )
        else:  # 1.x
            self._v2 = False
            self._line = gpiod.Chip(chip).get_line(pin)
            self._line.request(consumer=consumer, type=gpiod.LINE_REQ_EV_RISING_EDGE)

    def drain(self) -> int:
        """Consume every edge waiting right now and return how many there were."""
        n = 0
        if self._v2:
            # timedelta(0) polls rather than blocking, so a quiet channel costs
            # nothing and a busy one cannot stall the worker thread.
            while self._req.wait_edge_events(datetime.timedelta(0)):
                n += len(self._req.read_edge_events())
        else:
            while self._line.event_wait(sec=0):
                self._line.event_read()
                n += 1
        return n

    def close(self) -> None:
        (self._req if self._v2 else self._line).release()


class _OutputLine:
    """A single output line, on either libgpiod generation."""

    def __init__(self, chip: str, pin: int, consumer: str) -> None:
        import gpiod  # type: ignore[import-not-found]

        self._pin = pin
        if hasattr(gpiod, "request_lines"):  # 2.x
            from gpiod.line import Direction, Value  # type: ignore[import-not-found]

            self._v2 = True
            self._on, self._off = Value.ACTIVE, Value.INACTIVE
            self._req = gpiod.request_lines(
                _chip_path(chip),
                consumer=consumer,
                config={
                    pin: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.INACTIVE)
                },
            )
        else:  # 1.x
            self._v2 = False
            self._on, self._off = 1, 0
            self._line = gpiod.Chip(chip).get_line(pin)
            self._line.request(consumer=consumer, type=gpiod.LINE_REQ_DIR_OUT)

    def set(self, on: bool) -> None:
        value = self._on if on else self._off
        if self._v2:
            self._req.set_value(self._pin, value)
        else:
            self._line.set_value(value)

    def close(self) -> None:
        self.set(False)
        (self._req if self._v2 else self._line).release()


class GeigerCountDriver(Driver):
    """Pulse counter on a GPIO pin, for a scintillator or GM tube."""

    band = Band.GAMMA

    def open(self) -> None:
        self._line = _EdgeCounter(
            str(self.channel.options.get("chip", "gpiochip4")),
            int(self.channel.options.get("pin", 17)),
            "nband",
        )
        self._count = 0
        self._last = time.monotonic()
        self._opened = True

    def close(self) -> None:
        if self._opened:
            self._line.close()
        self._opened = False

    def capabilities(self) -> Capabilities:
        return Capabilities(notes="count rate only; no energy spectrum from a bare pulse counter")

    def read(self, t_ns: int) -> Sample | None:
        self._count += self._line.drain()
        now = time.monotonic()
        elapsed = now - self._last
        if elapsed < 1.0:
            return None
        cps = self._count / elapsed
        self._count = 0
        self._last = now
        return Sample(self.channel_id, self.band, t_ns, round(cps, 3))


class Picamera2Driver(Driver):
    """Sky brightness from a Raspberry Pi camera, in magnitudes per square arcsecond.

    Reports a photometric scalar rather than pixels. The frame itself is only
    retained when a detection promotes it, because streaming full frames to the
    grid continuously would cost orders of magnitude more bandwidth than the
    number that actually drives the trigger.

    Band comes from the channel rather than the class: the same sensor is a
    visible channel with its IR-cut filter fitted and a near-infrared channel
    with the filter removed and an 850 nm bandpass in front. The registry
    records which, and the driver reports whichever the config declares.
    """

    def __init__(self, channel: ChannelConfig) -> None:
        super().__init__(channel)
        self.band = channel.band

    def open(self) -> None:
        from picamera2 import Picamera2  # type: ignore[import-not-found]

        self._cam = Picamera2(int(self.channel.options.get("camera_num", 0)))
        cfg = self._cam.create_still_configuration(
            main={"size": tuple(self.channel.options.get("size", (2028, 1520)))}
        )
        self._cam.configure(cfg)
        self._cam.set_controls(
            {
                "AnalogueGain": float(self.channel.options.get("gain", 8.0)),
                "ExposureTime": int(self.channel.options.get("exposure_us", 500_000)),
                "AeEnable": False,
                "AwbEnable": False,
            }
        )
        self._cam.start()
        # Zero point from calibration; until it is set the channel reports
        # relative values and the discriminator scores it accordingly.
        self._zero_point = float(self.channel.options.get("zero_point", 0.0))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            resolution=tuple(self.channel.options.get("size", (2028, 1520))),
            notes=(
                "photometric scalar per frame; rolling shutter, so fast crossings are "
                "geometrically skewed and that skew is not anomalous kinematics"
            )
            if not self.channel.options.get("global_shutter")
            else "global shutter",
        )

    def close(self) -> None:
        if self._opened:
            self._cam.stop()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        import numpy as np  # type: ignore[import-not-found]

        frame = self._cam.capture_array("main")
        if frame is None or frame.size == 0:
            return None
        mean = float(np.mean(frame))
        if mean <= 0:
            return None
        # Instrumental magnitude, offset by the site's calibrated zero point.
        mag = self._zero_point - 2.5 * math.log10(mean / 255.0)
        q = Q_SATURATED if mean > 250 else 0
        return Sample(self.channel_id, self.band, t_ns, round(mag, 3), q)


class GnssPpsDriver(Driver):
    """Clock offset from GNSS, read back from chrony.

    Does not discipline the clock; chrony does that. This channel records how
    well disciplined it currently is, which is the number every downstream
    geometry calculation is weighted by. A node that cannot read its own offset
    reports the failure rather than a comforting zero.
    """

    band = Band.NAV

    def open(self) -> None:
        import shutil

        self._chronyc = shutil.which("chronyc")
        if self._chronyc is None:
            raise RuntimeError("chronyc not found; install chrony (see the build guide, step 3)")
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            accuracy=5e-7,
            notes="reports chrony's RMS offset; PPS lock is what makes cross-node geometry valid",
        )

    def read(self, t_ns: int) -> Sample | None:
        import subprocess

        try:
            out = subprocess.run(
                [self._chronyc, "tracking"], capture_output=True, text=True, timeout=4
            ).stdout
        except (subprocess.SubprocessError, OSError):
            return None

        offset_s = None
        ref_is_pps = False
        for line in out.splitlines():
            key, _, value = line.partition(":")
            key = key.strip().lower()
            if key == "reference id":
                ref_is_pps = "PPS" in value.upper()
            elif key == "rms offset":
                try:
                    offset_s = float(value.strip().split()[0])
                except (ValueError, IndexError):
                    return None

        if offset_s is None:
            return None
        q = 0 if (ref_is_pps and abs(offset_s) < 1e-6) else Q_CLOCK_DEGRADED
        return Sample(self.channel_id, self.band, t_ns, round(offset_s * 1e9, 1), q)


class Rm3100Driver(Driver):
    """PNI RM3100 magneto-inductive magnetometer over SPI.

    Reports the residual on one axis after subtracting the hard-iron offset
    measured during calibration. Without that offset the channel still detects
    change correctly but reports the wrong absolute field, which breaks
    comparison between nodes.
    """

    band = Band.ELF_VLF

    #: Datasheet gain at the default 200-cycle count, LSB per microtesla.
    _GAIN_LSB_PER_UT = 75.0

    def open(self) -> None:
        import spidev  # type: ignore[import-not-found]

        self._spi = spidev.SpiDev()
        self._spi.open(
            int(self.channel.options.get("bus", 0)), int(self.channel.options.get("device", 0))
        )
        self._spi.max_speed_hz = int(self.channel.options.get("speed_hz", 1_000_000))
        self._spi.mode = 0
        cycles = int(self.channel.options.get("cycle_count", 200))
        hi, lo = (cycles >> 8) & 0xFF, cycles & 0xFF
        # CCX/CCY/CCZ cycle counts, then continuous measurement on all axes.
        self._spi.xfer2([0x04, hi, lo, hi, lo, hi, lo])
        self._spi.xfer2([0x01, 0x79])
        self._axis = str(self.channel.options.get("axis", "z")).lower()
        self._offset_nt = float(
            self.channel.calibration.get("hard_iron_nt", {}).get(self._axis, 0.0)
        )
        self._opened = True

    def capabilities(self) -> Capabilities:
        calibrated = self._offset_nt != 0.0 if self._opened else False
        return Capabilities(
            accuracy=15.0,
            notes="~13 nT resolution, 15 nT noise"
            + (
                "" if calibrated else "; hard-iron offset NOT calibrated, absolute field unreliable"
            ),
        )

    def close(self) -> None:
        if self._opened:
            self._spi.close()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        # 0xA4 = read from the measurement results register, 9 bytes, 3 axes x 24 bit.
        raw = self._spi.xfer2([0xA4] + [0x00] * 9)[1:]
        if len(raw) < 9:
            return None
        idx = {"x": 0, "y": 3, "z": 6}[self._axis]
        v = (raw[idx] << 16) | (raw[idx + 1] << 8) | raw[idx + 2]
        if v & 0x800000:  # 24-bit two's complement
            v -= 1 << 24
        nt = (v / self._GAIN_LSB_PER_UT) * 1000.0
        return Sample(self.channel_id, self.band, t_ns, round(nt - self._offset_nt, 2))


class As7331Driver(Driver):
    """ams OSRAM AS7331 three-channel UV sensor over I2C.

    Three separate channels rather than a single index is what makes the part
    useful for discrimination: corona discharge, a lightning leader, and direct
    sunlight have distinguishable ratios across UVA, UVB, and UVC.
    """

    band = Band.UV

    def open(self) -> None:
        import board  # type: ignore[import-not-found]
        from adafruit_as7331 import AS7331  # type: ignore[import-not-found]

        self._dev = AS7331(board.I2C(), address=int(self.channel.options.get("address", 0x74)))
        self._dev.gain = int(self.channel.options.get("gain", 16))
        self._dev.integration_time = int(self.channel.options.get("integration_ms", 256))
        self._chan = str(self.channel.options.get("channel", "uva")).lower()
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            notes=(
                "UVA/UVB/UVC as separate channels. Needs a fused-silica or PTFE window; "
                "acrylic blocks UVB and UVC and silently reduces this to one channel"
            )
        )

    def read(self, t_ns: int) -> Sample | None:
        vals = {"uva": self._dev.uva, "uvb": self._dev.uvb, "uvc": self._dev.uvc}
        v = vals.get(self._chan)
        if v is None:
            return None
        return Sample(
            self.channel_id,
            self.band,
            t_ns,
            round(float(v), 3),
            vector=(float(vals["uva"]), float(vals["uvb"]), float(vals["uvc"])),
        )


class Ld2450Driver(Driver):
    """Hi-Link LD2450 24 GHz tracking radar over UART.

    Reports the number of tracked targets as the scalar and their positions in
    the vector. Eight metre range makes this a near-field and calibration
    instrument, not a sky radar, and the registry says so.
    """

    band = Band.MMW

    def open(self) -> None:
        import serial  # type: ignore[import-not-found]

        self._ser = serial.Serial(
            # Not ttyAMA0: that is the GNSS receiver, and sharing it would cost
            # the node its clock discipline, which is the one thing it cannot
            # do without. This expects 'dtoverlay=uart4' and the module wired to
            # GPIO12/13 on physical pins 32 and 33.
            str(self.channel.options.get("port", "/dev/ttyAMA4")),
            int(self.channel.options.get("baud", 256000)),
            timeout=0.2,
        )
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            notes="3 targets max, ~8 m range; near-field only, not usable for aerial targets"
        )

    def close(self) -> None:
        if self._opened:
            self._ser.close()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        # Frame: AA FF 03 00 <3 x 8-byte targets> 55 CC
        self._ser.reset_input_buffer()
        buf = self._ser.read(30)
        if len(buf) < 30 or buf[0:4] != b"\xaa\xff\x03\x00":
            return None

        targets: list[float] = []
        count = 0
        for i in range(3):
            off = 4 + i * 8
            x = int.from_bytes(buf[off : off + 2], "little")
            y = int.from_bytes(buf[off + 2 : off + 4], "little")
            # The module encodes sign in the high bit rather than two's complement.
            x = (x - 0x8000) if x & 0x8000 else -x
            y = (y - 0x8000) if y & 0x8000 else -y
            if x == 0 and y == 0:
                continue
            count += 1
            targets.extend([x / 1000.0, y / 1000.0])

        return Sample(self.channel_id, self.band, t_ns, float(count), vector=tuple(targets) or None)


class I2sMicDriver(Driver):
    """I2S MEMS microphone, reporting broadband sound pressure level."""

    band = Band.ACOUSTIC

    def open(self) -> None:
        import sounddevice as sd  # type: ignore[import-not-found]

        self._sd = sd
        self._device = self.channel.options.get("device")
        self._rate = int(self.channel.options.get("sample_rate", 48000))
        self._block = int(self.channel.options.get("block", 4096))
        # dB SPL that corresponds to full scale, from the datasheet.
        self._ref_spl = float(self.channel.options.get("full_scale_spl", 120.0))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            notes="rolls off below 50 Hz; audible band only, no infrasound without a separate sensor"
        )

    def read(self, t_ns: int) -> Sample | None:
        import numpy as np  # type: ignore[import-not-found]

        data = self._sd.rec(
            self._block, samplerate=self._rate, channels=1, dtype="float32", device=self._device
        )
        self._sd.wait()
        rms = float(np.sqrt(np.mean(np.square(data))))
        if rms <= 0:
            return None
        spl = self._ref_spl + 20 * math.log10(rms)
        return Sample(self.channel_id, self.band, t_ns, round(spl, 2))


class LeptonUvcDriver(Driver):
    """FLIR Lepton via a PureThermal UVC bridge.

    Radiometric: every pixel carries an absolute temperature, which is what
    turns a thermal track into an energy measurement. The flat-field shutter
    fires every few minutes and blanks the stream; those frames are marked
    invalid rather than dropped, so a gap stays visible as a gap.
    """

    band = Band.LWIR

    def open(self) -> None:
        import cv2  # type: ignore[import-not-found]

        self._cv2 = cv2
        self._cap = cv2.VideoCapture(int(self.channel.options.get("device", 0)))
        # Y16 preserves the raw 16-bit radiometric counts; without these two
        # calls OpenCV silently hands back an 8-bit visualisation instead.
        self._cap.set(cv2.CAP_PROP_CONVERT_RGB, 0)
        self._cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"Y16 "))
        if not self._cap.isOpened():
            raise RuntimeError("could not open Lepton UVC device")
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            radiometric=True,
            resolution=(160, 120),
            accuracy=5.0,
            self_interrupting=True,
            notes="8.7 Hz is an export-compliance limit, not a technical one",
        )

    def close(self) -> None:
        if self._opened:
            self._cap.release()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        ok, frame = self._cap.read()
        if not ok or frame is None:
            return None
        import numpy as np  # type: ignore[import-not-found]

        # Lepton radiometric output is centikelvin.
        peak_k = float(np.max(frame)) / 100.0
        # A frame that reads as uniformly near-zero is the shutter, not the sky.
        q = Q_CALIBRATION_STALE if float(np.ptp(frame)) < 5 else 0
        return Sample(self.channel_id, self.band, t_ns, round(peak_k, 2), q)


class Bno08xDriver(Driver):
    """BNO085 IMU, reporting platform heading.

    Records where the sensors were actually pointing rather than where the
    operator believes they were bolted. A mast that shifts two degrees in wind
    invalidates every bearing taken during the gust unless the shift is logged.
    """

    band = Band.NAV

    def open(self) -> None:
        import adafruit_bno08x  # type: ignore[import-not-found]
        import board  # type: ignore[import-not-found]
        from adafruit_bno08x.i2c import BNO08X_I2C  # type: ignore[import-not-found]

        self._dev = BNO08X_I2C(board.I2C())
        self._dev.enable_feature(adafruit_bno08x.BNO_REPORT_ROTATION_VECTOR)
        self._field = str(self.channel.options.get("field", "heading"))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(accuracy=2.0, notes="on-chip sensor fusion; ~2 deg heading accuracy")

    def read(self, t_ns: int) -> Sample | None:
        q = self._dev.quaternion
        if q is None:
            return None
        qi, qj, qk, qr = q
        yaw = math.degrees(math.atan2(2 * (qr * qk + qi * qj), 1 - 2 * (qj * qj + qk * qk))) % 360.0
        pitch = math.degrees(math.asin(max(-1.0, min(1.0, 2 * (qr * qj - qk * qi)))))
        value = yaw if self._field == "heading" else pitch
        return Sample(self.channel_id, self.band, t_ns, round(value, 2), vector=(qi, qj, qk, qr))


class Ina226Driver(Driver):
    """INA226 power monitor.

    Node power draw is telemetry in its own right. An unexplained current step
    is one of the more reliable early indicators of a sensor failing, and on a
    solar node the daily discharge curve is what tells you whether the panel is
    actually sized correctly.
    """

    band = Band.ENV

    def open(self) -> None:
        import board  # type: ignore[import-not-found]
        from adafruit_ina226 import INA226  # type: ignore[import-not-found]

        self._dev = INA226(board.I2C(), addr=int(self.channel.options.get("address", 0x40)))
        self._dev.set_calibration_custom(
            int(self.channel.options.get("shunt_uohm", 100_000)) // 1000
        )
        self._field = str(self.channel.options.get("field", "power"))
        self._opened = True

    def read(self, t_ns: int) -> Sample | None:
        vals = {
            "power": float(self._dev.power),
            "current": float(self._dev.current),
            "voltage": float(self._dev.bus_voltage),
        }
        v = vals.get(self._field)
        if v is None:
            return None
        return Sample(self.channel_id, self.band, t_ns, round(v, 3))


class TiMmwaveDriver(Driver):
    """TI IWR6843 mmWave radar, reporting tracked-point count.

    The first part in the stack that produces a real three-dimensional point
    cloud with per-point Doppler. The learned per-site clutter map is subtracted
    before anything counts as a detection; a fixed building at 40 m is not a
    target no matter how reliably it returns.
    """

    band = Band.MMW

    _MAGIC = b"\x02\x01\x04\x03\x06\x05\x08\x07"

    def open(self) -> None:
        import serial  # type: ignore[import-not-found]

        self._data = serial.Serial(
            str(self.channel.options.get("data_port", "/dev/ttyUSB1")),
            int(self.channel.options.get("data_baud", 921600)),
            timeout=0.5,
        )
        self._clutter = set(self.channel.calibration.get("clutter_bins", []))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            notes="range-Doppler point cloud to a few hundred metres; rain attenuates heavily"
            + ("" if self._clutter else "; site clutter map NOT yet learned")
        )

    def close(self) -> None:
        if self._opened:
            self._data.close()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        # read_until returns everything up to AND INCLUDING the magic word, so
        # the 40-byte header follows it and has to be read separately. The
        # previous version searched the buffer it had just consumed for a
        # header that was still on the wire, and could never return a sample.
        if not self._data.read_until(self._MAGIC, 8192).endswith(self._MAGIC):
            return None
        header = self._data.read(40 - len(self._MAGIC))
        if len(header) < 40 - len(self._MAGIC):
            return None
        # Offsets are relative to the frame start, so subtract the magic length.
        off = 28 - len(self._MAGIC)
        num_objs = int.from_bytes(header[off : off + 4], "little")
        # Clutter bins are learned during commissioning and subtracted here so
        # that a fixed return never reaches the trigger.
        return Sample(
            self.channel_id, self.band, t_ns, float(max(0, num_objs - len(self._clutter)))
        )


class GenicamSwirDriver(Driver):
    """InGaAs SWIR camera over a GenICam/GigE Vision transport."""

    band = Band.SWIR

    def open(self) -> None:
        from harvesters.core import Harvester  # type: ignore[import-not-found]

        self._h = Harvester()
        cti = self.channel.options.get("cti_path")
        if not cti:
            raise RuntimeError("swir driver needs options.cti_path pointing at a GenTL producer")
        self._h.add_file(str(cti))
        self._h.update()
        if not self._h.device_info_list:
            raise RuntimeError("no GenICam devices found")
        self._ia = self._h.create()
        self._ia.start()
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(
            resolution=(640, 512),
            notes="0.9-1.7 um; export-controlled in most jurisdictions, check before shipping",
        )

    def close(self) -> None:
        if self._opened:
            self._ia.stop()
            self._ia.destroy()
            self._h.reset()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        import numpy as np  # type: ignore[import-not-found]

        with self._ia.fetch(timeout=1.0) as buffer:
            comp = buffer.payload.components[0]
            arr = np.asarray(comp.data).reshape(comp.height, comp.width)
            peak = float(np.max(arr))
            q = Q_SATURATED if peak >= np.iinfo(arr.dtype).max else 0
        return Sample(self.channel_id, self.band, t_ns, peak, q)


class GeophoneDriver(Driver):
    """Geophone element through an ADS1256 24-bit ADC.

    Mostly a noise-characterisation channel. A 10 Hz element does not reach
    infrasound and is not a substitute for a broadband seismometer; its job at
    tier 3 is ground-coupled detection of low overflights and establishing
    whether a site is quiet enough to ever justify a gravimeter.
    """

    band = Band.SEISMIC

    def open(self) -> None:
        import spidev  # type: ignore[import-not-found]

        self._spi = spidev.SpiDev()
        self._spi.open(
            int(self.channel.options.get("bus", 0)), int(self.channel.options.get("device", 1))
        )
        self._spi.max_speed_hz = int(self.channel.options.get("speed_hz", 1_920_000))
        self._spi.mode = 1
        self._v_ref = float(self.channel.options.get("v_ref", 2.5))
        self._sensitivity = float(self.channel.options.get("v_per_m_per_s", 28.8))
        self._opened = True

    def capabilities(self) -> Capabilities:
        return Capabilities(notes="10 Hz natural frequency; does not reach the infrasound band")

    def close(self) -> None:
        if self._opened:
            self._spi.close()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        self._spi.xfer2([0x01])  # RDATA
        raw = self._spi.xfer2([0x00, 0x00, 0x00])
        v = (raw[0] << 16) | (raw[1] << 8) | raw[2]
        if v & 0x800000:
            v -= 1 << 24
        volts = (v / 0x7FFFFF) * self._v_ref
        return Sample(self.channel_id, self.band, t_ns, round(volts / self._sensitivity, 12))


class SemBeaconDriver(Driver):
    """Pulsed infrared beacon in the optional active-emission module.

    This is an emitter, and the only reason it appears as a driver is that its
    emission schedule has to be part of the record. The node knows exactly when
    it fired, so any near-infrared return correlating with the code is
    self-illumination and is subtracted rather than reported. Its samples are
    always marked with the self-emission quality bit for that reason.
    """

    band = Band.NIR

    def open(self) -> None:
        self._line = _OutputLine(
            str(self.channel.options.get("chip", "gpiochip4")),
            int(self.channel.options.get("pin", 23)),
            "nband-sem",
        )
        self._duty = float(self.channel.options.get("duty", 0.05))
        self._enabled = bool(self.channel.options.get("enabled", False))
        self._opened = True

    def capabilities(self) -> Capabilities:
        # Not "below Class 3R": that was a retracted claim. Class 3R is an IEC
        # 60825 laser class and this is an LED, assessed under IEC 62471 instead.
        # Naming a laser class it was never assessed against read as a safety
        # clearance nobody had issued.
        return Capabilities(
            notes=(
                "850 nm LED emitter, not a laser. Assessed under IEC 62471, not the "
                "IEC 60825 laser classes. Near-infrared defeats the blink reflex; "
                "point above the horizon and do not view at close range."
            )
        )

    def close(self) -> None:
        if self._opened:
            self._line.close()
        self._opened = False

    def read(self, t_ns: int) -> Sample | None:
        if not self._enabled:
            return Sample(self.channel_id, self.band, t_ns, 0.0, Q_SELF_EMISSION)
        # Deterministic pseudo-random gating, seeded on the second, so the
        # schedule is reconstructable from the timestamp alone during analysis.
        on = (hash((self.channel_id, t_ns // 1_000_000_000)) & 0xFFFF) / 0xFFFF < self._duty
        self._line.set(on)
        return Sample(self.channel_id, self.band, t_ns, 1.0 if on else 0.0, Q_SELF_EMISSION)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

DriverFactory = Callable[[ChannelConfig], Driver]

REGISTRY: dict[str, type[Driver]] = {
    "bme68x": Bme68xDriver,
    "mlx90640": Mlx90640Driver,
    "soapy_rtlsdr": RtlSdrPowerDriver,
    "open_gamma": GeigerCountDriver,
    "picamera2_still": Picamera2Driver,
    "gnss_nmea_pps": GnssPpsDriver,
    "rm3100": Rm3100Driver,
    "as7331": As7331Driver,
    "ld2450": Ld2450Driver,
    "i2s_mems": I2sMicDriver,
    "uvc_lepton": LeptonUvcDriver,
    "bno08x": Bno08xDriver,
    "ina226_monitor": Ina226Driver,
    "ti_mmwave": TiMmwaveDriver,
    "genicam_swir": GenicamSwirDriver,
    "geophone_ads1256": GeophoneDriver,
    "sem_beacon": SemBeaconDriver,
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
