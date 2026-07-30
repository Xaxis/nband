---
title: Build guide
description: Eleven steps from a bare board to a node reporting to the grid. Every step ends in something you can check before you spend money on the next one.
version: 0.1.0
section: Build
order: 10
updated: 2026-07-30
audience: Someone mid-build with a soldering iron down
---

Every step below ends in a verification: a command that prints an expected value, a file you can open, a number you can compare. If a step does not verify, stop there. The failure modes listed under each one cover most of what actually goes wrong, and continuing past a failed step means debugging two problems at once later.

The order is deliberate. Timing comes before sensors, one working sensor comes before five, and the box comes before the site, because a sensor that fails once the lid is on fails quietly and you want to find that indoors. You can stop after step 5 and have a node that contributes usefully to the grid.

## Before you start

You need a Raspberry Pi 5 (2 GB is enough and saves USD 110 over the 8 GB board at July 2026 prices), an endurance-rated microSD card, a 27 W USB-C supply, and the GNSS receiver. All four are in the bill of materials with sourced prices. Everything else can arrive later.

Two of those are worth a sentence each, because the obvious choice is wrong in both cases. Buy the card for write endurance rather than for speed class: a node writes its spool continuously for years and never launches an application, so the A2 random-read rating that sells consumer cards buys nothing here, and a card that wears out takes with it the only copy of anything the grid has not yet acknowledged. Buy the supply for its Power Delivery profile: the Pi 5 asks for 5 A over USB-C and quietly settles for 3 A on a supply that cannot offer it, which caps everything downstream of the USB ports at 600 mA. A node that runs for weeks and then starts dropping a channel under load is usually a node on a phone charger.

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

Wire the GNSS receiver: `VCC` to 3.3 V, `GND` to ground, `TX` to the Pi's `RX` (GPIO15), `RX` to the Pi's `TX` (GPIO14), and the `PPS` output to **GPIO4, physical pin 7**. The active antenna ships in the same box and reaches the board on a 170 mm lead, which is the real constraint on where it can go: take the receiver outside or put the antenna against a window and the board beside it. A cold start with a clear sky view takes 30 to 90 seconds; indoors under a roof it may never lock at all, and that is the single most common cause of "PPS is not working".

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

## Step 8: Close the box

Everything so far has run on a bench with the sensors in open air, which is the right way to find a miswired one and the reason this step is easy to underestimate. The enclosure is not packaging. A weatherproof box is a wall, most of these bands cannot cross a wall, and a node that was correct on the bench will read the inside of its own lid once the lid is on and report that as sky.

The aperture table under [Enclosure on the hardware page](/hardware#enclosure) states what each case has to let through and what every window is made of, and there is a dimensioned drawing beside it placing each window on the part that looks through it. Cut or print to that drawing rather than to a hole saw you already own: the window positions come from the same packing rule that decides where the sensors sit, so a hole moved for convenience is a sensor looking at plastic.

Three of those materials are worth restating here, because they are the ones people substitute. The thermal window is germanium, and nothing cheap replaces it, since glass, acrylic and every printable filament are opaque between 8 and 14 micrometres. The ultraviolet window is fused silica, because glass and standard acrylic cut off somewhere between 350 and 400 nm and the sensor behind either of them still returns numbers. The short-wave window is fused silica rather than the acrylic that serves the visible cameras, which is the trap waiting in a tier 3 build: the cheapest window in the box is opaque to the most expensive sensor in it.

Three things about fitting the sensors that a plan view cannot show. Mount the thermal sensor against its window rather than behind a standoff, because a 110 degree field of view vignettes fast on a 25 mm aperture held away from it. Face the acoustic port down, or into the lee, since a port facing the sky is a drain and a port facing the wind is a microphone recording the wind. Put the environmental sensor at the vent rather than beside the Pi, which is the warmest object in the box and will otherwise be the thing it measures.

Fit the breather vent before you close anything, and put reusable desiccant in beside the electronics. A sealed enclosure traps moisture rather than excluding it: the air you shut the lid on is as humid as the room it was in, and the first cold night condenses it onto the coldest surface in the box, which is always the optics. The vent is not a hole in the waterproofing, it is what makes the waterproofing work, because a box that cannot equalise as it warms and cools pulls water in through whatever imperfection it has.

Do not drill anything for the navigation, radio or radar channels. All three read through a copolymer polypropylene or unfilled ASA wall, and the registry records that as an aperture precisely because the absence of a hole is the load-bearing part. The two ways to lose those three bands are substituting a metal case and printing in carbon-filled filament, and both look like reasonable choices at the time.

**Verify, part one.** The wall still passes what it is supposed to pass. Close the lid on a node that had PPS lock in step 3, leave it five minutes, then:

```bash
chronyc tracking | grep -E 'Reference ID|RMS offset'
```

Expected: the same reference ID and roughly the same offset as before the lid went on. A `Reference ID` that stops naming `PPS` when the box closes is a conductive wall rather than a failed receiver, and no window will fix it.

**Verify, part two.** Each optical channel is looking through its window rather than at it. Run the self-test with the box closed, hold a warm hand flat against the thermal window, and run it again:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --self-test
```

Expected: `lwir.main` moves by several kelvin between the two readings and settles back afterwards. This is the one failure in the build that produces a plausible number instead of an error. A Lepton behind acrylic reports a steady field at about indoor temperature, every channel still says `PASS`, and the archive fills with a careful measurement of the underside of a lid. The reading changing is the only evidence you get that the window passes 8 to 14 micrometres. If you fitted the ultraviolet channel, the equivalent test is that it reads near zero indoors and rises by orders of magnitude in direct sun; behind ordinary glass it will rise a little, and that little is UVA getting through and being recorded as the band.

**Verify, part three.** The environmental channel is measuring the outside and not the box. Leave the closed node outdoors for an hour, then run the self-test again.

Expected: `env.temp` within a couple of degrees of the outside air. Do not check this against a weather report, because those pressures are corrected to sea level and your sensor is not: at 300 metres the two legitimately differ by about 35 hPa, and chasing that difference has cost people an afternoon. What proves the vent is working is that temperature tracks the outside air instead of lagging it by tens of minutes, and that pressure moves at all across a day. A channel that sits high and barely changes is reading a sealed box, which means the vent is blocked, the membrane went on over the sensor rather than beside it, or the sensor is sitting in the Pi's exhaust.

## Step 9: Survey your horizon

The node needs to know what it physically cannot see. Without this, "nothing detected to the north" is ambiguous between a clear sky and a ridgeline.

Stand at the node position with a compass and a clinometer, or a phone app that does both. At each of the eight compass points, record the elevation angle above which sky is actually visible. Put those numbers in the `[site.horizon_mask]` table in `~/node.toml`.

**Verify.** The config still loads, which proves the table is well-formed:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --self-test
```

A malformed mask fails loudly at startup rather than silently defaulting to an unobstructed sky.

### Disable the pull-ups on your I2C breakouts

Nearly every breakout board ships with its own I2C pull-up resistors fitted, usually 10 k, and nearly every one of them has a jumper or a solder pad to remove them. Remove them on all but one.

The Raspberry Pi fits 1.8 k pull-ups to 3V3 on GPIO2 and GPIO3 on the board itself, and those cannot be removed. That value is correct on its own, which is why the carrier fits none of its own. Four breakouts left as shipped bring the bus to about 1,047 ohms, which still works. What does not work is adding more: I2C needs at least (3.3 - 0.4) / 3 mA, about 967 ohms, to pull a valid low, and it is easy to go under that without noticing because the symptom is not a dead bus. It is a bus that works until a hot afternoon or a longer cable, and then produces read errors that look like a failing sensor.

## Step 10: Enrol with the grid

Enrolling a new node needs a secret, and there is no self-service way to get one yet. Ask for it: open an issue on the repository titled "node enrolment", or email the address in [SECURITY.md](https://github.com/Xaxis/nband/blob/main/SECURITY.md). Say roughly where the node will be and which tier you built. You will get a secret back.

That gate exists because the archive's only real asset is that its contents are trustworthy, and an open write endpoint is an open invitation to poison it. It is a deliberate bottleneck rather than a permanent policy, and it will be replaced by something self-service once there is a reviewed way to admit a node without a human in the loop.

You do not need a secret to develop against the grid. `--simulate` runs the whole agent against synthetic data, and a simulated node's data is excluded from the public feed and can never reach a verdict, so you can exercise every code path before asking anyone for anything.

Set your node's slug, position, and the enrolment secret in `~/node.toml`, then:

```bash
~/.nband-venv/bin/python -m nband_node.agent --config ~/node.toml --enroll
```

**Verify.** The response contains a `node_id`, the channel count you expect, and a `published_position` that is **not** your exact coordinates. The published point sits somewhere inside a disc of the radius you declared, a random place inside it, not a fixed distance away, and the direction is derived from a secret the grid server holds, so it cannot be recomputed and subtracted by someone reading this page. Your home address does not appear on a public map.

Check the published point on a map before continuing. If it lands somewhere you would rather it did not, raise `location_precision_m` and re-enrol; the offset is recomputed from the new radius. If you are in a sparsely populated area, consider that a one-kilometre disc may still contain only a handful of buildings, and set the precision accordingly.

Your node key was generated on first run at the path in `[grid].key_path` and is `0600`. It never leaves the machine. Back it up somewhere safe: losing it means enrolling under a new slug, and the archive cannot connect the two.

## Step 11: Run it for real

Everything so far has run as you, out of your home directory, because that is the fastest way to find a miswired sensor. The service does not run that way. It runs as an unprivileged `nband` user with `ProtectHome=true`, which means it cannot read your home directory at all, not the venv, not the config, not the key. So installing it is a real step rather than a file copy:

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
