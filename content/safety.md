---
title: Safety and regulation
description: Optical, radio, electrical, and radiological hazards in an nband build, and the rules that apply to each.
version: 0.1.0
section: Reference
order: 60
updated: 2026-07-27
audience: Anyone building the active-emission module, and everyone else before they power up outdoors
---

Most of a nband node is passive and carries no more risk than a garden camera. The exceptions are concentrated in the optional active-emission module and in the fact that the whole thing lives outdoors on a mast.

Nothing here is legal advice. Rules differ by country and the operator is responsible for the ones that apply where the node stands.

## The passive build is genuinely low risk

Tier 1 emits nothing at all. Tier 2 is not passive: its bill of materials includes a 24 GHz tracking radar, which is an intentional radiator, and the optional 850 nm beacon if you fit one. Everything else in both tiers only receives. The hazards are otherwise the ordinary ones of outdoor electronics: a lithium battery that should not be punctured or charged below freezing, a mast that should not be raised near overhead lines, and mains wiring that should be on a residual-current device if it exists at all.

The one non-obvious risk is the lens. A large-aperture lens pointed at the sky will, at some point, be pointed near the Sun. This will not hurt you but it can destroy a sensor in seconds and can ignite debris inside an enclosure. If your node tracks, add a solar-exclusion zone to its pointing limits. If it stares, accept that a fixed camera looking upward will image the Sun daily and choose an aperture accordingly.

## Ultraviolet and infrared sensors are receivers, not emitters

The UV and thermal channels detect radiation, they do not produce it. There is no exposure risk from the sensors themselves. The germanium window in front of a thermal camera is brittle and moderately expensive and is the part most likely to be damaged by cleaning it with the wrong cloth.

## The infrared beacon is the one optical emitter

The 850 nm pulsed beacon is an LED rather than a laser. That matters for which standard applies, not for whether it is safe: LEDs are assessed under IEC 62471 photobiological safety rather than the IEC 60825 laser classes, and a 5 W peak infrared emitter is not automatically in the exempt group at close range. Earlier wording here implied the LED construction alone put it below a Class 3R threshold, which conflates two different standards.

Treat it as a real emitter. 850 nm is barely visible, so the blink reflex does not protect you. Do not look into it at close range, do not view it through binoculars or a camera with gain, keep it above head height, and do not point it at a road, a footpath, or anything on approach to an airfield.

Point it above the horizon. The node knows its own emission schedule exactly, so any near-infrared return correlating with the code is recognised as self-illumination and subtracted rather than reported.

## The broadband RF source is not something you can build under Part 15

An earlier revision of this page said the optional noise source ran "under 100 mW effective radiated power, inside FCC Part 15". That was wrong in a way worth stating plainly, because someone might have built it.

There is no general 100 mW allowance in Part 15. The 1 W figure people remember applies to digitally modulated or frequency-hopping systems inside the ISM bands under §15.247, and 400 to 600 MHz is not an ISM band. An intentional radiator there falls under the general radiated-emission limits of §15.209, which are expressed as field strength at three metres and correspond to something on the order of nanowatts, not milliwatts. Spreading the signal does not help: §15.209 constrains field strength, not power spectral density.

So that emitter has been withdrawn from the reference design. Building a deliberate broadband radiator in that range at any useful power requires an amateur or experimental licence, and if you hold one you already know more about the conditions attached to it than this page can usefully tell you.

The millimetre-wave radar modules are a different case. They are certified devices sold for exactly this use and operating in bands allocated for it. Leave their firmware alone; the certification belongs to the module as shipped, not to whatever you reflash it with.

## The radioisotope module needs to be read carefully

The optional signature module aggregates the encapsulated americium-241 foils already present in domestic ionisation smoke detectors. Roughly ten of them, at about 0.9 microcuries each, sit behind a 2 mm aluminium heat sink and an acrylic housing. The aluminium and acrylic absorb the alpha and beta emission entirely while remaining largely transparent to the 59.5 keV gamma line, which is the signature the module exists to produce.

This page has now published the dose figure wrong twice, in opposite directions, and the second time was worse because it was dressed as a correction.

The original text said roughly 40 nanogray per hour at one metre and called that "well under one percent of natural background". A later revision retracted it and claimed the true figure was about 1,070 nanosieverts per hour — three times background — and that the original had been understated by a factor of thirty. **That retraction was itself wrong, by about a factor of a hundred, and it is the number that stood on this page.**

The error was a dropped exponent. The tabulated air-kerma rate constant for americium-241 is roughly 3.2 × 10⁻² mGy·m²/(GBq·h). Converting milligray to microgray multiplies by a thousand and converting gigabecquerels to megabecquerels divides by a thousand, so those cancel exactly and the value in the units the retraction wanted is still 3.2 × 10⁻², or 0.032 µSv·m²/(MBq·h). It was published as "3.2 microsieverts per hour per megabecquerel" — the mantissa carried across and the 10⁻² left behind. A factor of exactly one hundred, from one keystroke. Nobody caught it because it pointed the alarming way, and because the surrounding paragraph was busy congratulating itself on rigour.

Worked through properly. Nine microcuries is 0.33 megabecquerels. Computing the air kerma directly from the 59.5 keV line — 35.9 percent yield, NIST mass energy-absorption coefficients for air — gives about **1 nSv/h at one metre**. Including the neptunium L X-rays around 14 to 21 keV, which are soft but numerous, raises it to about **9 nSv/h**. The most conservative published constant found in a supplier safety sheet, 85 µSv/h per GBq, gives **28 nSv/h**. Natural background averages around 340 nSv/h.

So across the entire spread of defensible values the answer is between a fraction of a percent and about eight percent of background. It is never above background, and the "three times background" figure this page published was wrong in the alarming direction by roughly two orders of magnitude.

The original 40 nGy/h was about right in magnitude — within a factor of four of the best estimate — though its label was not: 40 nGy/h is around twelve percent of background, not "well under one percent". Both the original figure and its retraction were sloppy. Only one of them was sloppy while claiming to be a correction.

The claim that "the shielding does not rescue it" was also wrong. Two millimetres of aluminium passes about 86 percent of the 59.5 keV line, which is where that sentence came from, but only about 16 percent of the 17 keV L X-rays — and those X-rays dominate the bare dose. The housing removes most of it. That was never the reason to shield, since alpha and beta are what the aluminium and acrylic exist to stop, and they do that completely.

**The dose was never the problem, and this page should not have implied it was.** A few percent of background at one metre, falling off as the square of distance, is not what should stop you. The regulatory position below is, and it is sufficient on its own.

The regulatory position is the part this page previously got wrong, and the correction matters more than the dose figure. An earlier revision said the assembly "stays below the United States NRC general-license threshold in 10 CFR 30.15". That is not what 10 CFR 30.15 says. It is an exemption rather than a general license, general licenses live in Part 31, and §30.15(a)(7) exempts "ionization chamber smoke detectors containing not more than 1 microcurie of americium-241 per detector in the form of a foil and designed to protect life and property from fires". The limit is per detector, the exemption attaches to the detector as a fire-protection device, and there is no aggregate activity allowance to sit beneath.

Ten foils removed from their detectors and epoxied into an aluminium and acrylic cartridge is therefore outside that exemption on every count: nine times the per-item activity, no longer in a device designed to protect life and property from fires, and no longer the article the exemption describes. §30.15(b) points anyone wanting to incorporate byproduct material into a product towards a specific license under §32.14.

nband does not assert that building this is lawful, and the previous wording implied a regulatory cover that does not exist. The aggregated cartridge has been removed from the reference bill of materials. If you intend to pursue a gamma lure seriously, do it under a specific license with your regulator's knowledge, not on the strength of a citation you read on a website.

The handling advice stands regardless: do not open, machine, dissolve, or heat a foil. It is dangerous if the encapsulation is breached and ingested, and unremarkable if left alone.

Outside the United States, rules differ substantially and some jurisdictions prohibit possession of multiple sources regardless of individual activity. Check before building, not after.

If any of this is uncomfortable, skip the module. It is genuinely optional, every passive band works without it, and the platform is designed so that an emitter-free node is a first-class participant rather than a degraded one.

## Cameras and other people

A node pointed at the sky is not a surveillance device, but a wide-angle lens on a mast usually catches some ground. In populated areas, tilt the field of view at least 15 degrees above the horizon and confirm what is actually in frame rather than assuming.

Published node positions are fuzzed to the precision the operator declares, defaulting to one kilometre. The offset is deterministic, so repeated readings cannot be averaged back to the true point, and it is keyed on a server-held secret, so it cannot simply be recomputed and subtracted. Both properties are required; in 0.1.0 this platform had only the first, and the published position was recoverable to a few metres by anyone who read the source. That protects the operator. It does nothing for the neighbours, which is the operator's job.

## Aviation

A ground node on a mast is not an aviation matter until the mast is tall. Structures above roughly 60 metres, and anything near an aerodrome approach, are subject to marking and notification requirements almost everywhere.

If you are mounting the payload on an aircraft of any kind, everything about that is outside the scope of this guide and squarely inside your national aviation regulator's.
