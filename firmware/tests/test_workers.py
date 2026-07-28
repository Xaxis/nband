"""One slow channel must not stall the others.

Every driver read used to happen inline on the single main loop, so a channel
that blocked blocked all of them. That is not hypothetical: an SDR read is tens
of milliseconds, a camera capture can be hundreds, and a serial read sits on its
full timeout when the sensor is unplugged. A node with one dead UART would have
produced gaps across its optical channels that look exactly like quiet sky.

These tests use a deliberately slow driver and assert that the fast channel
keeps its cadence anyway.
"""

from __future__ import annotations

import queue
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from nband_node.agent import ChannelWorker  # noqa: E402
from nband_node.config import ChannelConfig  # noqa: E402
from nband_node.core import Clock, Sample  # noqa: E402
from nband_node.schema_generated import Band, ClockQuality  # noqa: E402


class _Driver:
    """Minimal stand-in: sleeps for `delay` then returns a sample."""

    def __init__(self, channel_id: str, band: Band, delay: float = 0.0, fail: bool = False):
        self.channel_id = channel_id
        self.band = band
        self.delay = delay
        self.fail = fail
        self.reads = 0

    def read(self, t_ns: int):
        self.reads += 1
        if self.delay:
            time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("sensor unplugged")
        return Sample(self.channel_id, self.band, t_ns, float(self.reads))


def _channel(cid: str, band: Band, rate: float) -> ChannelConfig:
    return ChannelConfig(
        channel_id=cid, band=band, driver="test", unit="x", sample_rate_hz=rate
    )


def _run(workers: list[ChannelWorker], halt: threading.Event, seconds: float):
    for w in workers:
        w.start()
    time.sleep(seconds)
    halt.set()
    for w in workers:
        w.join(timeout=2.0)


def test_a_slow_channel_does_not_stall_a_fast_one():
    q: queue.Queue = queue.Queue(maxsize=4096)
    halt = threading.Event()
    clock = Clock(ClockQuality.GNSS_PPS)

    slow = _Driver("slow.ch", Band.RF, delay=0.4)
    fast = _Driver("fast.ch", Band.VIS, delay=0.0)

    workers = [
        ChannelWorker(_channel("slow.ch", Band.RF, 20.0), slow, q, clock, halt),
        ChannelWorker(_channel("fast.ch", Band.VIS, 20.0), fast, q, clock, halt),
    ]
    _run(workers, halt, 1.5)

    counts: dict[str, int] = {}
    while not q.empty():
        s = q.get_nowait()
        counts[s.channel_id] = counts.get(s.channel_id, 0) + 1

    # 20 Hz for 1.5 s is about 30 reads. The slow driver takes 400 ms per read,
    # so it manages a handful. The fast one must be unaffected.
    assert counts.get("fast.ch", 0) >= 20, f"fast channel was starved: {counts}"
    assert counts.get("slow.ch", 0) <= 6, f"slow channel unexpectedly fast: {counts}"


def test_a_failing_channel_does_not_stall_the_others():
    q: queue.Queue = queue.Queue(maxsize=4096)
    halt = threading.Event()
    clock = Clock(ClockQuality.GNSS_PPS)

    broken = _Driver("broken.ch", Band.RF, fail=True)
    good = _Driver("good.ch", Band.VIS)

    workers = [
        ChannelWorker(_channel("broken.ch", Band.RF, 20.0), broken, q, clock, halt),
        ChannelWorker(_channel("good.ch", Band.VIS, 20.0), good, q, clock, halt),
    ]
    _run(workers, halt, 1.2)

    got = 0
    while not q.empty():
        q.get_nowait()
        got += 1

    assert got >= 15, f"a failing channel starved a healthy one: {got} samples"
    assert workers[0].failures > 0, "the failing channel recorded no failures"
    # Backs off rather than spinning: ~1 s backoff over 1.2 s means very few tries.
    assert broken.reads <= 3, f"failing driver spun the CPU: {broken.reads} reads"


def test_queue_pressure_is_counted_not_hidden():
    # A full queue must drop visibly. Silent loss is the failure mode the whole
    # project exists to avoid, and a node dropping data should say so.
    q: queue.Queue = queue.Queue(maxsize=5)
    halt = threading.Event()
    clock = Clock(ClockQuality.GNSS_PPS)

    fast = _Driver("flood.ch", Band.VIS)
    w = ChannelWorker(_channel("flood.ch", Band.VIS, 500.0), fast, q, clock, halt)
    _run([w], halt, 0.5)

    assert w.dropped > 0, "queue overflowed without recording a single drop"
    assert q.qsize() == 5, "bounded queue grew past its ceiling"


def test_workers_stop_promptly_even_on_a_slow_channel():
    # A 0.1 Hz channel sleeps ten seconds between reads. Shutdown must not wait
    # for that, or systemd's stop timeout kills the agent before it can flush.
    q: queue.Queue = queue.Queue(maxsize=64)
    halt = threading.Event()
    clock = Clock(ClockQuality.GNSS_PPS)

    slow = _Driver("rare.ch", Band.ENV)
    w = ChannelWorker(_channel("rare.ch", Band.ENV, 0.1), slow, q, clock, halt)
    w.start()
    time.sleep(0.3)

    started = time.monotonic()
    halt.set()
    w.join(timeout=3.0)
    elapsed = time.monotonic() - started

    assert not w.is_alive(), "worker did not stop"
    assert elapsed < 1.0, f"shutdown waited {elapsed:.1f}s for a slow channel"


def _run_all():
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
    raise SystemExit(_run_all())
