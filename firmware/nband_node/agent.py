"""The node agent: sample, trigger, spool, upload.

Offline-first by construction. A node on a desert mast with intermittent
Starlink is the design case, not the edge case, so nothing is discarded because
the link is down. Samples go to a local append-only spool first and are removed
only once the grid has acknowledged them. When the spool reaches its configured
ceiling the oldest *context* data is dropped before any detection is touched,
because losing an hour of barometric pressure costs almost nothing and losing a
detection costs the whole point of the exercise.

Every batch is signed with the node's Ed25519 key. The key is generated on the
node and never leaves it, so the grid can verify that telemetry attributed to a
node actually came from it.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import queue
import secrets
import subprocess
import shutil
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from base64 import urlsafe_b64encode
from dataclasses import asdict
from pathlib import Path

from . import config as configmod
from . import sensors
from .core import (
    Clock,
    CoincidenceDetector,
    ChannelTrigger,
    Detection,
    NoiseFloor,
    RingBuffer,
    Sample,
)
from .schema_generated import PLATFORM_VERSION, SCHEMA_VERSION, ClockQuality

log = logging.getLogger("nband")


def sd_notify(message: str) -> None:
    """Send a readiness or watchdog ping to systemd, if it is listening.

    The unit file declares Type=notify and WatchdogSec=300. Without these
    messages systemd concludes the agent never started, and then that it has
    hung, and SIGABRTs a perfectly healthy node every five minutes. No
    dependency: it is a datagram to the socket in NOTIFY_SOCKET.
    """
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    try:
        import socket

        # A leading '@' denotes the abstract namespace.
        path = "\0" + addr[1:] if addr.startswith("@") else addr
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
            sock.connect(path)
            sock.sendall(message.encode())
    except OSError as exc:
        log.debug("sd_notify failed: %s", exc)


class GridError(RuntimeError):
    """The grid rejected a request and said why."""


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------


class Identity:
    """Ed25519 node identity."""

    def __init__(self, key_path: Path) -> None:
        self.key_path = key_path
        self._private = self._load_or_create()

    def _load_or_create(self):
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        except ImportError as exc:  # pragma: no cover
            raise SystemExit(
                "nband: the 'cryptography' package is required for node identity.\n"
                "  pip install cryptography"
            ) from exc

        if self.key_path.exists():
            return Ed25519PrivateKey.from_private_bytes(self.key_path.read_bytes())

        key = Ed25519PrivateKey.generate()
        self.key_path.parent.mkdir(parents=True, exist_ok=True)
        # Written 0600 before any bytes land on disk.
        fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as fh:
            from cryptography.hazmat.primitives import serialization

            fh.write(
                key.private_bytes(
                    encoding=serialization.Encoding.Raw,
                    format=serialization.PrivateFormat.Raw,
                    encryption_algorithm=serialization.NoEncryption(),
                )
            )
        log.info("generated new node key at %s", self.key_path)
        return key

    @property
    def public_key_b64(self) -> str:
        from cryptography.hazmat.primitives import serialization

        raw = self._private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )
        return urlsafe_b64encode(raw).decode().rstrip("=")

    def sign(self, payload: bytes) -> str:
        return urlsafe_b64encode(self._private.sign(payload)).decode().rstrip("=")


# ---------------------------------------------------------------------------
# Spool
# ---------------------------------------------------------------------------


class Spool:
    """Append-only local buffer, newline-delimited JSON.

    Two files so that pressure on the disk never costs a detection: telemetry
    is expendable, detections are not.
    """

    def __init__(self, directory: Path, max_bytes: int) -> None:
        self.dir = directory
        self.dir.mkdir(parents=True, exist_ok=True)
        self.telemetry = self.dir / "telemetry.ndjson"
        self.detections = self.dir / "detections.ndjson"
        self.max_bytes = max_bytes

    def append(self, path: Path, record: dict) -> None:
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, separators=(",", ":")) + "\n")

    def size(self) -> int:
        return sum(p.stat().st_size for p in (self.telemetry, self.detections) if p.exists())

    def enforce_ceiling(self) -> None:
        """Drop the oldest telemetry when over budget. Detections are never cut."""
        if self.size() <= self.max_bytes or not self.telemetry.exists():
            return
        lines = self.telemetry.read_text(encoding="utf-8").splitlines()
        keep = lines[len(lines) // 2 :]
        self.telemetry.write_text("\n".join(keep) + ("\n" if keep else ""), encoding="utf-8")
        log.warning(
            "spool over %d bytes: dropped %d oldest telemetry records",
            self.max_bytes,
            len(lines) - len(keep),
        )

    def drain(self, path: Path, limit: int) -> list[dict]:
        """Read up to `limit` records, skipping any line that will not parse.

        A node loses power mid-write eventually, leaving a truncated final line.
        Letting json.loads raise here wedged the agent permanently: every flush
        hit the same bad line and no record after it could ever be delivered.
        """
        if not path.exists():
            return []
        out: list[dict] = []
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if len(out) >= limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    log.warning("skipping unparseable spool line in %s", path.name)
                    out.append({"__unparseable__": True})
        return out

    def commit(self, path: Path, count: int) -> None:
        """Remove the first `count` records after the grid has acknowledged them.

        Written to a temporary file and renamed. The previous version truncated
        and rewrote in place, so losing power mid-write destroyed the entire
        remaining spool rather than a single record. rename() within a directory
        is atomic on POSIX, so a crash leaves either the old file or the new one.
        """
        if not path.exists() or count <= 0:
            return
        lines = path.read_text(encoding="utf-8").splitlines()
        rest = lines[count:]
        tmp = path.with_suffix(path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            fh.write("\n".join(rest) + ("\n" if rest else ""))
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Uploader
# ---------------------------------------------------------------------------


class GridClient:
    def __init__(self, cfg: configmod.GridConfig, identity: Identity) -> None:
        self.cfg = cfg
        self.identity = identity

    def _post(self, path: str, body: dict, timeout: float = 20.0) -> dict:
        payload = json.dumps(body, separators=(",", ":")).encode()

        # The signature covers the path, a timestamp, and a single-use nonce as
        # well as the body. Signing the body alone left every request valid
        # forever and replayable on any endpoint, which is enough to fabricate
        # archive content: replayed detections become distinct events because
        # each insert mints a fresh id.
        timestamp = str(int(time.time()))
        nonce = secrets.token_urlsafe(18)
        canonical = b"nband/v1\n%s\n%s\n%s\n%s" % (
            path.encode(),
            timestamp.encode(),
            nonce.encode(),
            payload,
        )

        req = urllib.request.Request(
            f"{self.cfg.endpoint}{path}",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Nband-Node": self.cfg.node_slug,
                "X-Nband-Key": self.identity.public_key_b64,
                "X-Nband-Signature": self.identity.sign(canonical),
                "X-Nband-Timestamp": timestamp,
                "X-Nband-Nonce": nonce,
                "X-Nband-Schema": SCHEMA_VERSION,
                "User-Agent": f"nband-node/{PLATFORM_VERSION}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            # The grid returns a JSON body explaining every rejection. Losing it
            # leaves an operator staring at a bare status code, which is the
            # least actionable thing a network client can do.
            detail = exc.read().decode(errors="replace")
            try:
                parsed = json.loads(detail)
                msg = parsed.get("error", detail)
                extra = parsed.get("detail")
                raise GridError(
                    f"{exc.code} {msg}" + (f" :: {json.dumps(extra)}" if extra else "")
                ) from None
            except json.JSONDecodeError:
                raise GridError(f"{exc.code} {detail[:400]}") from None

    def enroll(self, cfg: configmod.NodeConfig) -> dict:
        return self._post(
            "/api/grid/register",
            {
                "slug": cfg.grid.node_slug,
                "display_name": cfg.node_name,
                "tier": cfg.tier.value,
                "pubkey": self.identity.public_key_b64,
                "enrollment_secret": cfg.grid.enrollment_secret,
                "firmware_version": PLATFORM_VERSION,
                "schema_version": SCHEMA_VERSION,
                # The node knows whether it is inventing its data, so it says
                # so rather than leaving the grid to guess. Simulated nodes are
                # excluded from the public feed and never reach a verdict.
                "is_simulated": cfg.simulate,
                "site": {
                    "lat": cfg.site.latitude,
                    "lon": cfg.site.longitude,
                    "elevation_m": cfg.site.elevation_m,
                    "location_precision_m": cfg.site.location_precision_m,
                    "horizon_mask": cfg.site.horizon_mask,
                },
                "channels": [
                    {
                        "channel_id": c.channel_id,
                        "band": c.band.value,
                        "unit": c.unit,
                        "sample_rate_hz": c.sample_rate_hz,
                        "part_id": c.part_id,
                        "azimuth_deg": c.azimuth_deg,
                        "elevation_deg": c.elevation_deg,
                        "fov_deg": c.fov_deg,
                        "role": "context" if c.is_context else "detection",
                    }
                    for c in cfg.channels
                    if c.enabled
                ],
            },
        )

    def send_telemetry(self, records: list[dict]) -> bool:
        try:
            self._post("/api/grid/telemetry", {"samples": records})
            return True
        except (GridError, urllib.error.URLError, OSError, TimeoutError) as exc:
            log.warning("telemetry upload failed, keeping spool: %s", exc)
            return False

    def send_detections(self, records: list[dict]) -> bool:
        try:
            self._post("/api/grid/detections", {"detections": records})
            return True
        except (GridError, urllib.error.URLError, OSError, TimeoutError) as exc:
            log.warning("detection upload failed, keeping spool: %s", exc)
            return False

    def heartbeat(self, body: dict) -> None:
        try:
            self._post("/api/grid/heartbeat", body, timeout=10.0)
        except (GridError, urllib.error.URLError, OSError, TimeoutError) as exc:
            log.debug("heartbeat failed: %s", exc)


# ---------------------------------------------------------------------------
# Channel workers
# ---------------------------------------------------------------------------


class ChannelWorker(threading.Thread):
    """Reads one channel on its own thread and posts samples to a queue.

    Every driver read used to happen inline on the single main loop, so any
    channel that blocked blocked all of them. That is not a hypothetical: an
    SDR read is tens of milliseconds, a camera capture can be hundreds, and a
    serial read sits on its timeout when the sensor is unplugged. One unplugged
    UART could stall a node's optical channels indefinitely, and the resulting
    gaps would look like quiet sky rather than a wiring fault.

    Each worker owns its own driver and its own cadence. A slow channel now
    delays only itself.
    """

    def __init__(
        self,
        channel: configmod.ChannelConfig,
        driver: "sensors.Driver",
        out: "queue.Queue[Sample]",
        clock: Clock,
        stop: threading.Event,
    ) -> None:
        super().__init__(name=f"ch-{channel.channel_id}", daemon=True)
        self.channel = channel
        self.driver = driver
        self.out = out
        self.clock = clock
        # NOT `self._stop`: threading.Thread has an internal _stop() that join()
        # calls, and shadowing it with an Event makes every join raise
        # TypeError after the thread has already done its work.
        self._halt = stop
        #: Samples discarded because the queue was full. Reported in heartbeats
        #: rather than silently lost, because a node dropping data should say so.
        self.dropped = 0
        self.failures = 0

    def run(self) -> None:
        interval = 1.0 / self.channel.sample_rate_hz
        next_read = time.monotonic()
        while not self._halt.is_set():
            now = time.monotonic()
            if now < next_read:
                # Sleep in slices so shutdown is prompt even on a 0.1 Hz channel.
                self._halt.wait(min(next_read - now, 0.25))
                continue
            next_read = now + interval
            try:
                sample = self.driver.read(self.clock.now_ns())
            except Exception as exc:  # noqa: BLE001
                self.failures += 1
                log.error("channel %s read failed: %s", self.channel.channel_id, exc)
                # Back off so a hard-failing driver cannot spin the CPU.
                self._halt.wait(1.0)
                continue
            if sample is None:
                continue
            try:
                self.out.put_nowait(sample)
            except queue.Full:
                # Bounded on purpose: the memory budget is the whole reason
                # tier 1 fits a 2 GB board. Dropping the newest sample keeps the
                # backlog ordered, and the count surfaces in the heartbeat.
                self.dropped += 1


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class Agent:
    def __init__(self, cfg: configmod.NodeConfig, spool_dir: Path) -> None:
        self.cfg = cfg
        # Always start undisciplined. A node that has not yet graded its own
        # clock must not claim discipline, and this constructor previously
        # asserted GNSS_PPS with an invented 240 ns offset for every real run,
        # which made the single strongest gate on the classification ladder a
        # constant in production. The tests exercised Clock directly and passed
        # while the agent never called it.
        self.clock = Clock(ClockQuality.FREERUN, offset_ns=0)
        self._chronyc = None if cfg.simulate else shutil.which("chronyc")
        if not cfg.simulate and self._chronyc is None:
            log.warning(
                "chronyc not found: clock cannot be graded and every sample will be "
                "marked degraded. Install chrony (build guide, step 3)."
            )
        self.identity = Identity(cfg.grid.key_path)
        self.spool = Spool(spool_dir, cfg.grid.max_spool_bytes)
        self.client = GridClient(cfg.grid, self.identity)
        self.detector = CoincidenceDetector()
        self._running = True
        self._started = time.monotonic()

        self.drivers: dict[str, sensors.Driver] = {}
        self.floors: dict[str, NoiseFloor] = {}
        self.buffers: dict[str, RingBuffer] = {}
        self._stop_workers = threading.Event()
        self._workers: list[ChannelWorker] = []
        # Sized to a couple of seconds of the busiest plausible channel set.
        # Bounded rather than unbounded because an unbounded queue turns a slow
        # consumer into unbounded memory growth, which is exactly the failure
        # the 2 GB budget exists to avoid.
        self._samples: "queue.Queue[Sample]" = queue.Queue(maxsize=4096)

        for ch in cfg.channels:
            if not ch.enabled:
                continue
            drv = sensors.build(ch, simulate=cfg.simulate, longitude=cfg.site.longitude)
            self.drivers[ch.channel_id] = drv
            self.floors[ch.channel_id] = NoiseFloor()
            # Bounded at construction: pre-roll seconds of samples, floor 64.
            depth = max(int(ch.sample_rate_hz * (cfg.pre_roll_s + cfg.post_roll_s)), 64)
            self.buffers[ch.channel_id] = RingBuffer(min(depth, 20_000))

    def stop(self, *_: object) -> None:
        self._running = False

    def open_all(self) -> None:
        for cid, drv in list(self.drivers.items()):
            try:
                drv.open()
            except Exception as exc:  # noqa: BLE001
                log.error("channel %s failed to open, disabling: %s", cid, exc)
                del self.drivers[cid]
        if not self.drivers:
            raise SystemExit("nband: no channels opened successfully; refusing to run")

    def close_all(self) -> None:
        for drv in self.drivers.values():
            try:
                drv.close()
            except Exception:  # noqa: BLE001, S110
                pass

    def _record(self, s: Sample) -> None:
        self.buffers[s.channel_id].append(s)
        self.spool.append(
            self.spool.telemetry,
            {
                "channel_id": s.channel_id,
                "band": s.band.value,
                # Nanoseconds since the epoch is ~1.8e18, which is far beyond
                # the 2^53 a JSON number survives in a JavaScript parser. Sent
                # as a string and parsed as a big integer server-side, the full
                # nanosecond resolution the PPS lock buys us actually arrives.
                "t_ns": str(s.t_ns),
                "v": s.value,
                "q": s.quality | self.clock.quality_bits(),
            },
        )

    def _maybe_trigger(self, s: Sample, ch: configmod.ChannelConfig) -> Detection | None:
        if ch.trigger_sigma is None:
            return None
        floor = self.floors[s.channel_id]
        # Only update the floor with clean samples, or a saturated channel
        # slowly teaches itself that saturation is normal.
        if s.quality == 0:
            floor.update(s.value)
        if not floor.ready:
            return None
        z = floor.z_score(s.value)
        if abs(z) < ch.trigger_sigma:
            return None
        return self.detector.offer(
            ChannelTrigger(s.channel_id, s.band, s.t_ns, s.value, round(z, 3)), self.clock
        )

    def _emit_detection(self, det: Detection) -> None:
        pre = int(self.cfg.pre_roll_s * 1e9)
        post = int(self.cfg.post_roll_s * 1e9)
        window = {
            cid: [
                asdict(s) | {"band": s.band.value, "t_ns": str(s.t_ns)}
                for s in buf.between(det.t_start_ns - pre, det.t_end_ns + post)
            ]
            for cid, buf in self.buffers.items()
        }
        record = {
            "t_start_ns": str(det.t_start_ns),
            "t_end_ns": str(det.t_end_ns),
            "reason": det.reason.value,
            "clock": det.clock.value,
            "bands": [b.value for b in det.bands],
            "channel_ids": det.channel_ids,
            "peak_z": det.peak_z,
            "triggers": [
                {
                    "channel_id": t.channel_id,
                    "band": t.band.value,
                    "t_ns": str(t.t_ns),
                    "value": t.value,
                    "z": t.z_score,
                }
                for t in det.triggers
            ],
            "window": window,
        }
        self.spool.append(self.spool.detections, record)
        log.info(
            "detection: %s across %s (peak z=%.1f, clock=%s)",
            det.reason.value,
            ", ".join(b.value for b in det.bands),
            det.peak_z,
            det.clock.value,
        )

    def _flush(self) -> None:
        tel = self.spool.drain(self.spool.telemetry, 2000)
        if tel:
            # Unparseable lines still consume their slot on commit, so a corrupt
            # record is dropped rather than blocking everything behind it.
            sendable = [r for r in tel if "__unparseable__" not in r]
            if not sendable or self.client.send_telemetry(sendable):
                self.spool.commit(self.spool.telemetry, len(tel))

        det = self.spool.drain(self.spool.detections, 20)
        if det:
            sendable = [r for r in det if "__unparseable__" not in r]
            if not sendable or self.client.send_detections(sendable):
                self.spool.commit(self.spool.detections, len(det))

        self.spool.enforce_ceiling()

    def _start_workers(self, by_id: dict[str, configmod.ChannelConfig]) -> None:
        for cid, drv in self.drivers.items():
            worker = ChannelWorker(by_id[cid], drv, self._samples, self.clock, self._stop_workers)
            worker.start()
            self._workers.append(worker)
        log.info("%d channel workers started", len(self._workers))

    def _drain_remaining(self, by_id: dict[str, configmod.ChannelConfig]) -> None:
        """Consume anything left in the queue at shutdown."""
        while True:
            try:
                sample = self._samples.get_nowait()
            except queue.Empty:
                return
            ch = by_id.get(sample.channel_id)
            if ch is None:
                continue
            self._record(sample)

    @property
    def dropped_samples(self) -> int:
        return sum(w.dropped for w in self._workers)

    def _grade_clock(self) -> None:
        """Ask chrony how well disciplined we actually are.

        Read back rather than assumed. Without this the node reports whatever
        it was constructed with, which is how a free-running clock came to be
        published as PPS-disciplined and fed into cross-node geometry.
        """
        if self._chronyc is None:
            return
        try:
            out = subprocess.run(
                [self._chronyc, "tracking"], capture_output=True, text=True, timeout=4
            ).stdout
        except (subprocess.SubprocessError, OSError) as exc:
            # Unreadable is not the same as fine. Degrade rather than keep the
            # last good grade, or a node whose GNSS dies keeps its old claim.
            log.warning("could not read chrony tracking (%s); clock marked free-running", exc)
            self.clock = Clock(ClockQuality.FREERUN, offset_ns=0)
            return
        before = self.clock.quality
        self.clock.update_from_chrony(out)
        if self.clock.quality is not before:
            log.info(
                "clock quality %s -> %s (offset %d ns)",
                before.value,
                self.clock.quality.value,
                self.clock.offset_ns,
            )

    def _heartbeat(self) -> None:
        self.client.heartbeat(
            {
                "t_ns": str(self.clock.now_ns()),
                "clock": self.clock.quality.value,
                "clock_offset_ns": self.clock.offset_ns,
                "uptime_s": int(time.monotonic() - self._started),
                "firmware_version": PLATFORM_VERSION,
                # Health from the workers themselves rather than from whether a
                # driver object exists. A channel whose reads are all failing is
                # not "ok" simply because it opened successfully at startup.
                "channel_health": {
                    w.channel.channel_id: (
                        "failing" if w.failures else "dropping" if w.dropped else "ok"
                    )
                    for w in self._workers
                }
                or {cid: "ok" for cid in self.drivers},
                "dropped_samples": self.dropped_samples,
            }
        )

    def run(self, duration_s: float | None = None) -> None:
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        self.open_all()
        sd_notify("READY=1")
        log.info(
            "nband node '%s' (%s) up: %d channels across %d bands, clock=%s",
            self.cfg.node_name,
            self.cfg.tier.value,
            len(self.drivers),
            len(self.cfg.bands),
            self.clock.quality.value,
        )

        by_id = {c.channel_id: c for c in self.cfg.channels}
        deadline = time.monotonic() + duration_s if duration_s else None
        last_flush = last_beat = time.monotonic()
        last_clock = last_ping = 0.0
        self._grade_clock()
        self._start_workers(by_id)

        try:
            while self._running:
                now = time.monotonic()
                if deadline and now >= deadline:
                    break

                # Drain whatever the workers have produced. Triggering and
                # spooling stay on this one thread, so the coincidence detector
                # and the noise floors need no locking: exactly one thread ever
                # touches them.
                drained = 0
                while drained < 512:
                    try:
                        sample = self._samples.get(timeout=0.05 if drained == 0 else 0)
                    except queue.Empty:
                        break
                    drained += 1
                    ch = by_id.get(sample.channel_id)
                    if ch is None:
                        continue
                    self._record(sample)
                    det = self._maybe_trigger(sample, ch)
                    if det:
                        self._emit_detection(det)

                if now - last_flush >= self.cfg.grid.upload_interval_s:
                    self._flush()
                    last_flush = now
                # Re-grade before each heartbeat so the status the grid records
                # reflects the clock as it is now, not as it was at startup.
                if now - last_clock >= 30:
                    self._grade_clock()
                    last_clock = now
                if now - last_beat >= 60:
                    self._heartbeat()
                    last_beat = now
                # Well inside WatchdogSec so a slow upload cannot trip it.
                if now - last_ping >= 30:
                    sd_notify("WATCHDOG=1")
                    last_ping = now

                # No sleep here: the queue get above already blocks briefly
                # when there is nothing to do, which is both responsive and
                # idle-friendly.
        finally:
            sd_notify("STOPPING=1")
            self._stop_workers.set()
            for w in self._workers:
                w.join(timeout=3.0)
            # Anything the workers produced before stopping is still data.
            self._drain_remaining(by_id)
            self._flush()
            self.close_all()
            log.info("nband node stopped")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="nband-node", description="nband node agent")
    p.add_argument("-c", "--config", default="/etc/nband/node.toml")
    p.add_argument("--spool", default="/var/lib/nband/spool")
    p.add_argument(
        "--key",
        help="override [grid].key_path. The packaged config points at /var/lib/nband, "
        "which needs root; use this to dry-run as an ordinary user.",
    )
    p.add_argument(
        "--simulate", action="store_true", help="run every channel against a synthetic source"
    )
    p.add_argument("--duration", type=float, help="stop after N seconds (used by the build guide)")
    p.add_argument(
        "--self-test", action="store_true", help="open every channel, print one reading, exit"
    )
    p.add_argument(
        "--enroll", action="store_true", help="register this node with the grid and exit"
    )
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
    )

    try:
        cfg = configmod.load(args.config)
    except configmod.ConfigError as exc:
        print(f"nband: {exc}", file=sys.stderr)
        return 2

    overrides: dict = {}
    if args.simulate:
        overrides["simulate"] = True
    if args.key:
        grid = cfg.grid
        overrides["grid"] = configmod.GridConfig(
            **{**grid.__dict__, "key_path": Path(args.key).expanduser()}
        )
    if overrides:
        cfg = configmod.NodeConfig(**{**cfg.__dict__, **overrides})

    if args.self_test:
        ok = True
        print(f"{'CHANNEL':<20} {'BAND':<10} {'RESULT'}")
        for ch in cfg.channels:
            if not ch.enabled:
                continue
            drv = sensors.build(ch, simulate=cfg.simulate, longitude=cfg.site.longitude)
            passed, detail = drv.self_test()
            ok &= passed
            print(
                f"{ch.channel_id:<20} {ch.band.value:<10} {'PASS' if passed else 'FAIL'}  {detail}"
            )
        return 0 if ok else 1

    agent = Agent(cfg, Path(args.spool))

    if args.enroll:
        result = agent.client.enroll(cfg)
        print(json.dumps(result, indent=2))
        return 0

    agent.run(duration_s=args.duration)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
