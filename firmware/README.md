# nband node agent

The software that runs on the node. Samples every configured band, decides what is worth keeping, and delivers it to the grid without losing anything when the link goes down.

Runs on a Raspberry Pi 5. Runs on a laptop in `--simulate` mode, which is how the build guide lets you verify the whole pipeline before any hardware arrives.

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[pi]'
python3 -m nband_node.agent --config config.example.toml --simulate --self-test
```

## The memory budget

Tier 1 targets a 2 GB Raspberry Pi 5 because the 8 GB board costs USD 110 more at July 2026 prices, and that difference is a quarter of the entire tier 1 budget. Fitting in 2 GB is not an optimisation applied afterwards; it is a constraint the architecture is built around.

Three rules make it hold.

**Every buffer is bounded at construction.** `RingBuffer` takes a capacity and never resizes. Ring depth is `sample_rate_hz × (pre_roll_s + post_roll_s)`, capped at 20,000 samples per channel. A tier 2 node with eight channels holds well under 50 MB of sample history, and that figure is the same after a month of uptime as after a minute.

**Nothing decoded is queued.** Imaging drivers return a photometric scalar per frame, not the frame. A full 12-megapixel capture is roughly 36 MB decoded; queuing even a few would exhaust the board. Frames are held only inside the driver for the duration of one read, and full captures reach durable storage only when a detection promotes the window that contains them.

**The noise floor is constant-memory.** `NoiseFloor` uses Welford's algorithm rather than a window of recent samples, so a channel's adaptive threshold costs three floats regardless of how long the node has been running. A windowed implementation at 10 Hz over an hour would be 36,000 samples per channel for no additional accuracy.

The practical consequence for driver authors: if your `read()` allocates something proportional to uptime, or holds a decoded frame past return, it will work on your desk and strand a node in the field three weeks later.

## What the agent does each cycle

Reads any channel whose next sample is due. Appends the sample to that channel's ring buffer and to the local spool. Updates the channel's noise floor, but only with clean samples, because feeding a saturated reading into the floor teaches the channel that saturation is normal.

If a sample exceeds its channel's `trigger_sigma`, it is offered to the coincidence detector. A single crossing is held, not published. It becomes a detection when a second *band* crosses inside the coincidence window, or when one channel's excursion is extreme enough to be worth recording alone at a much lower score. Two cameras both seeing a bird is one observation, not corroboration, which is why the detector counts distinct bands rather than distinct channels.

When a detection fires, the window is promoted: every channel's buffered samples from `pre_roll_s` before the trigger to `post_roll_s` after it are written to the detection spool. That pre-roll is the reason the ring buffer exists at all.

## Offline-first

A node on a desert mast with intermittent backhaul is the design case, not the edge case.

Samples go to an append-only local spool first and are removed only once the grid acknowledges them. When the spool reaches its ceiling it drops the oldest *telemetry* and never touches detections: losing an hour of barometric pressure costs almost nothing, and losing a detection costs the entire point of the exercise.

A node with no network at all is a valid deployment. It accumulates until the disk fills and uploads in order when a link appears.

## Timing

The agent does not discipline the clock. `chrony` does that, against the GNSS pulse-per-second signal. What the agent does is read back how well disciplined the clock currently is and record that honestly with every sample.

`Clock.update_from_chrony` grades conservatively: the reference must actually be a PPS source and the RMS offset must be under a microsecond before the node claims `gnss_pps`. Anything else is `ntp` or `freerun`, and every sample taken under those conditions carries the clock-degraded quality bit.

This matters because cross-node time-of-arrival is the only way the grid measures position rather than bearing, and a node that overstates its timing corrupts geometry for every node it is correlated against.

## Layout

```
nband_node/
  config.py            TOML loading and hard validation
  core.py              Clock, RingBuffer, NoiseFloor, CoincidenceDetector
  sensors.py           Driver interface, simulated twins, 17 real drivers
  agent.py             Main loop, identity, spool, grid client, CLI
  schema_generated.py  Generated from schema/. Never edit.
tests/
  test_core.py         Clock grading, buffers, triggering
  test_registry.py     Every advertised driver exists and resolves
```

## Adding a driver

Subclass `Driver`, declare a band, implement `read()`. Four things are easy to get wrong and all of them are silent:

Declare capabilities honestly. `Capabilities` is how the discriminator knows whether it may score thermal morphology or only thermal presence. Overstating it corrupts analysis rather than improving it.

Return `None` rather than a fabricated value when a read fails. Several of these sensors drop frames routinely and the pipeline handles it. A zero standing in for a missing reading poisons the noise floor.

Mark compromised samples with the quality bitfield instead of dropping them. A silent gap reads as "nothing happened" when it means "we could not trust this".

Write the simulated path. `test_registry.py` requires every band to produce a sample under `--simulate`, so that someone without your hardware can still exercise the pipeline.

## Tests

```bash
python3 tests/test_core.py       # 16 cases
python3 tests/test_registry.py   #  6 cases
```

`test_registry.py` exists because thirteen drivers were once advertised in the hardware registry and the shipped example config with no implementation behind them. That config is what the build guide tells people to run, so it would have failed at the exact moment a builder had just soldered something and had every reason to blame their own wiring.
