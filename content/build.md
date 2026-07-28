---
title: Build guide
description: Ten steps from a bare board to a node reporting to the grid. Every step ends in something you can check before you spend money on the next one.
version: 0.1.0
section: Build
order: 10
updated: 2026-07-27
audience: Someone mid-build with a soldering iron down
---

Every step below ends in a verification: a command that prints an expected value, a file you can open, a number you can compare. If a step does not verify, stop there. The failure modes listed under each one cover most of what actually goes wrong, and continuing past a failed step means debugging two problems at once later.

The order is deliberate. Timing comes before sensors, and one working sensor comes before five. You can stop after step 5 and have a node that contributes usefully to the grid.

## Before you start

You need a Raspberry Pi 5 (2 GB is enough and saves USD 110 over the 8 GB board at July 2026 prices), a 32 GB or larger A2-rated microSD card, a 27 W USB-C supply, and the GNSS receiver from the bill of materials. Everything else can arrive later.

Two things are worth knowing now. The node runs headless, so you will need either SSH or a serial console. And the single most common way this build fails is skipping the pulse-per-second wiring in step 3, because it is fiddly and nothing appears broken without it. A node without PPS can never contribute to multi-node geometry, which is most of what the grid is for.

## Step 1: Flash and boot

Write Raspberry Pi OS Lite (64-bit) to the card. Use the Imager's advanced options to set the hostname, enable SSH, and configure your network before first boot; doing it afterwards on a headless machine is harder than it needs to be.

Boot, then update and install the packages the node needs:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git python3-pip python3-venv chrony pps-tools i2c-tools gpsd
```

**Verify.** You are on the expected kernel and the board reports 2 GB or more:

```bash
uname -m && free -h | awk '/Mem:/ {print $2}'
```

Expected: `aarch64` and a memory figure at or above `1.9Gi`. If `uname -m` prints `armv7l` you flashed the 32-bit image; reflash. The node agent requires 64-bit.

## Step 2: Enable the buses

The sensors sit on I2C, SPI, and the serial port. Enable them and free the UART from the login console, which claims it by default:

```bash
sudo raspi-config nonint do_i2c 0
sudo raspi-config nonint do_spi 0
sudo raspi-config nonint do_serial_hw 0
sudo raspi-config nonint do_serial_cons 1
sudo reboot
```

**Verify.** After the reboot, the buses exist:

```bash
ls /dev/i2c-* /dev/spidev* /dev/ttyAMA*
```

Expected: at least `/dev/i2c-1`, `/dev/spidev0.0`, and `/dev/ttyAMA0`. If `/dev/ttyAMA0` is missing, `do_serial_cons` did not take; check that `console=serial0` is gone from `/boot/firmware/cmdline.txt`.

## Step 3: Wire and verify the pulse-per-second signal

This is the step that determines whether your node is a member of an array or a lone camera. Do not skip it.

Wire the GNSS receiver: `VCC` to 3.3 V, `GND` to ground, `TX` to the Pi's `RX` (GPIO15), `RX` to the Pi's `TX` (GPIO14), and the `PPS` output to **GPIO4, physical pin 7**. Take the receiver outside or put the antenna against a window. A cold start with a clear sky view takes 30 to 90 seconds; indoors under a roof it may never lock at all, and that is the single most common cause of "PPS is not working".

Tell the kernel the PPS pin exists by adding this line to `/boot/firmware/config.txt`, then reboot:

```
dtoverlay=pps-gpio,gpiopin=4
```

**Verify, part one.** The kernel sees pulses:

```bash
sudo ppstest /dev/pps0
```

Expected: a line roughly once per second, with the `sequence` number incrementing by exactly 1 each time. If it prints `timed out`, the receiver has no satellite fix (check the receiver's own lock LED) or GPIO4 (pin 7) is not connected. If sequence numbers jump by more than 1, you have a marginal antenna position.

Now point chrony at it. Add to `/etc/chrony/chrony.conf`:

```
refclock PPS /dev/pps0 refid PPS lock NMEA prefer
refclock SHM 0 refid NMEA offset 0.200 delay 0.2 stratum 3
makestep 1.0 3
```

Restart chrony and give it five minutes to settle. It genuinely needs the five minutes; judging it earlier will tell you it is broken when it is merely young.

**Verify, part two.** The clock is disciplined to the pulse, not the network:

```bash
chronyc sources -v && chronyc tracking | grep -E 'Reference ID|RMS offset'
```

Expected: `PPS` marked with `*` in `chronyc sources` (the selected source), a `Reference ID` containing `PPS`, and an `RMS offset` below `0.000001` seconds, which is one microsecond. If the reference ID names a network server instead, chrony has not accepted the PPS source; the usual cause is that the NMEA reference is missing, since chrony will not lock to a bare pulse train with no idea which second it belongs to.

The node reads exactly this output to grade its own clock. If it says PPS here, the archive will record `gnss_pps` and your data can be combined with other nodes'. If it says anything else, it will honestly record that instead.

## Step 4: Install the node agent

```bash
git clone https://github.com/Xaxis/nband.git ~/nband
cd ~/nband/firmware
python3 -m venv ~/.nband-venv
~/.nband-venv/bin/pip install -e '.[pi]'
```

**Verify.** The agent imports and reports the version the docs were written against:

```bash
~/.nband-venv/bin/python -c "import nband_node; print(nband_node.__version__)"
```

Expected: `0.1.0`, matching the version stamped at the top of this page. A mismatch means the documentation and the firmware have drifted, which is a bug worth reporting rather than working around.

## Step 5: Run in simulation before touching a sensor

Prove the whole pipeline works before adding hardware that can fail. Simulation mode drives every configured channel from a synthetic source shaped like the real instrument.

```bash
cp config.example.toml ~/node.toml
~/.nband-venv/bin/python -m nband_node.agent \
  --config ~/node.toml --simulate --self-test
```

**Verify.** Every channel reports `PASS` with a plausible value in its own units. Then run the loop for a minute and confirm it is writing:

```bash
~/.nband-venv/bin/python -m nband_node.agent \
  --config ~/node.toml --simulate --spool /tmp/spool --key /tmp/node.key --duration 60
wc -l /tmp/spool/telemetry.ndjson
```

Expected: a non-zero line count, and `head -1 /tmp/spool/telemetry.ndjson` shows a JSON object with `channel_id`, `band`, `t_ns`, and `q`. If `q` is `1`, the clock is flagged degraded, which is correct in simulation and should become `0` once you run against real hardware with PPS locked.

You now have a working node in every respect except that it is imagining its data. Everything from here is replacing imagination with sensors.

## Step 6: First real sensor, on I2C

Start with the environmental sensor. It is cheap, it is hard to damage, and it is the easiest way to prove the I2C path works before you put a USD 329 thermal camera on the same bus.

Wire the BME688: `VIN` to 3.3 V, `GND` to ground, `SCL` to GPIO3, `SDA` to GPIO2.

**Verify.** The device answers on the bus:

```bash
i2cdetect -y 1
```

Expected: `77` (or `76`) appears in the grid. If the grid is entirely blank, check power and that SDA and SCL are not swapped. If every cell reads `00`, you have a short.

Now edit `~/node.toml`, remove the channels you do not have yet, and leave the two `env` channels. Run the self-test again:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --self-test
```

Expected: `env.temp` reads within a few degrees of the room and `env.pressure` reads between 950 and 1050 hPa. A pressure reading near 26 hPa means the driver is reading the wrong register; a temperature reading above 50 °C usually means the sensor is sitting on top of the Pi's SoC and needs moving.

## Step 7: Add the cameras

Connect the HQ camera to `CAM0` with the ribbon contacts facing away from the Ethernet jack. Ribbon orientation is the cause of most "camera not detected" reports.

**Verify.** The stack sees it, and you can take a picture you can actually look at:

```bash
rpicam-hello --list-cameras
rpicam-still -o /tmp/test.jpg --immediate
```

Expected: the camera is listed with its sensor name (`imx477`), and `/tmp/test.jpg` exists and is more than 100 kB. Copy it off the Pi and look at it. A uniformly grey frame means the lens cap is on or the aperture is closed; both are more common than a broken sensor.

If you are fitting the second, infrared camera, put the 850 nm bandpass filter in front of it now. **Without the filter this is not a near-infrared channel**, it is a second visible-light channel with extra noise, and the grid will treat any data you send from it as a duplicate rather than as an independent band.

## Step 8: Survey your horizon

The node needs to know what it physically cannot see. Without this, "nothing detected to the north" is ambiguous between a clear sky and a ridgeline.

Stand at the node position with a compass and a clinometer, or a phone app that does both. At each of the eight compass points, record the elevation angle above which sky is actually visible. Put those numbers in the `[site.horizon_mask]` table in `~/node.toml`.

**Verify.** The config still loads, which proves the table is well-formed:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --self-test
```

A malformed mask fails loudly at startup rather than silently defaulting to an unobstructed sky.

### Disable the pull-ups on your I2C breakouts

Nearly every breakout board ships with its own I2C pull-up resistors fitted, usually 10 k, and nearly every one of them has a jumper or a solder pad to remove them. Remove them on all but one.

The Raspberry Pi fits 1.8 k pull-ups to 3V3 on GPIO2 and GPIO3 on the board itself, and those cannot be removed. That value is correct on its own. Four breakouts left as shipped bring the bus to about 1,047 ohms, which still works. What does not work is adding more: I2C needs at least (3.3 - 0.4) / 3 mA, about 967 ohms, to pull a valid low, and it is easy to go under that without noticing because the symptom is not a dead bus. It is a bus that works until a hot afternoon or a longer cable, and then produces read errors that look like a failing sensor.

An earlier revision of the carrier board fitted an extra 4.7 k pair here for exactly the reason above and made it worse rather than better. It has been removed.

## Step 9: Enrol with the grid

Enrolling a new node needs a secret, and there is no self-service way to get one yet. Ask for it: open an issue on the repository titled "node enrolment", or email the address in [SECURITY.md](https://github.com/Xaxis/nband/blob/main/SECURITY.md). Say roughly where the node will be and which tier you built. You will get a secret back.

That gate exists because the archive's only real asset is that its contents are trustworthy, and an open write endpoint is an open invitation to poison it. It is a deliberate bottleneck rather than a permanent policy, and it will be replaced by something self-service once there is a reviewed way to admit a node without a human in the loop.

You do not need a secret to develop against the grid. `--simulate` runs the whole agent against synthetic data, and a simulated node's data is excluded from the public feed and can never reach a verdict, so you can exercise every code path before asking anyone for anything.

Set your node's slug, position, and the enrolment secret in `~/node.toml`, then:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --enroll
```

**Verify.** The response contains a `node_id`, the channel count you expect, and a `published_position` that is **not** your exact coordinates. The published point sits somewhere inside a disc of the radius you declared — a random place inside it, not a fixed distance away — and the direction is derived from a secret the grid server holds, so it cannot be recomputed and subtracted by someone reading this page. Your home address does not appear on a public map.

Check the published point on a map before continuing. If it lands somewhere you would rather it did not, raise `location_precision_m` and re-enrol; the offset is recomputed from the new radius. If you are in a sparsely populated area, consider that a one-kilometre disc may still contain only a handful of buildings, and set the precision accordingly.

Your node key was generated on first run at the path in `[grid].key_path` and is `0600`. It never leaves the machine. Back it up somewhere safe: losing it means enrolling under a new slug, and the archive cannot connect the two.

## Step 10: Run it for real

Everything so far has run as you, out of your home directory, because that is the fastest way to find a miswired sensor. The service does not run that way. It runs as an unprivileged `nband` user with `ProtectHome=true`, which means it cannot read your home directory at all — not the venv, not the config, not the key. So installing it is a real step rather than a file copy:

```bash
sudo ~/nband/firmware/install.sh
```

That creates the `nband` service account, builds `/opt/nband/venv`, copies your config to `/etc/nband/node.toml` with the paths rewritten, moves your node key to `/var/lib/nband/node.key` so the service can reach it, installs the unit, and starts it. Run it again any time you change your config. If your config is not at `~/node.toml`, pass the path as an argument.

Back up `/var/lib/nband/node.key` before you delete the copy in your home directory. Losing it means enrolling under a new slug, and the archive cannot connect the two.

**Verify.** The service is running, the clock is disciplined, and the grid has heard from you:

```bash
systemctl status nband-node --no-pager
journalctl -u nband-node -n 20 --no-pager
```

Expected: `active (running)`, a startup line reporting your channel and band count, and `clock=gnss_pps`. If it reports `clock=freerun` or `clock=ntp`, go back to step 3; the node will still record, but its data will be marked as unable to contribute to multi-node geometry.

Then open the node's page on the grid and confirm telemetry is arriving. First data usually appears within a minute of the first upload interval.

## What to do when it does not work

The spool is the first place to look. If `/var/lib/nband/spool/telemetry.ndjson` is growing but the grid shows nothing, the node is recording and the upload is failing, which is a network or credential problem rather than a sensor one. Check `journalctl` for `upload failed`. The node is designed to keep recording through outages and backfill later, so a few hours of failed uploads costs nothing as long as the disk holds.

If the spool is not growing, no channel is producing samples. Run `--self-test` to find which one.

If a channel reports wildly wrong values, check its `unit` in the config against what the driver actually returns. A unit mismatch does not crash anything; it quietly poisons the archive, which is worse.
