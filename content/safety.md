---
title: Safety and regulation
description: Optical, radio, electrical, and radiological hazards in a NBAND build, and the rules that apply to each.
version: 0.1.0
section: Reference
order: 60
updated: 2026-07-27
audience: Anyone building the active-emission module, and everyone else before they power up outdoors
---

Most of a NBAND node is passive and carries no more risk than a garden camera. The exceptions are concentrated in the optional active-emission module and in the fact that the whole thing lives outdoors on a mast.

Nothing here is legal advice. Rules differ by country and the operator is responsible for the ones that apply where the node stands.

## The passive build is genuinely low risk

Nothing in tiers 1 or 2 emits anything. The hazards are the ordinary ones of outdoor electronics: a lithium battery that should not be punctured or charged below freezing, a mast that should not be raised near overhead lines, and mains wiring that should be on a residual-current device if it exists at all.

The one non-obvious risk is the lens. A large-aperture lens pointed at the sky will, at some point, be pointed near the Sun. This will not hurt you but it can destroy a sensor in seconds and can ignite debris inside an enclosure. If your node tracks, add a solar-exclusion zone to its pointing limits. If it stares, accept that a fixed camera looking upward will image the Sun daily and choose an aperture accordingly.

## Ultraviolet and infrared sensors are receivers, not emitters

The UV and thermal channels detect radiation, they do not produce it. There is no exposure risk from the sensors themselves. The germanium window in front of a thermal camera is brittle and moderately expensive and is the part most likely to be damaged by cleaning it with the wrong cloth.

## The infrared beacon is the one optical emitter

The 850 nm pulsed beacon in the active-emission module is an LED rather than a laser, chosen specifically to stay below any Class 3R ocular hazard threshold while still producing a distinctive pulse-coded signature. 850 nm is barely visible, which means the blink reflex does not protect you: do not look into it at close range, and do not point it at a road, a footpath, or anything on approach to an airfield.

Point it above the horizon. The node knows its own emission schedule exactly, so any near-infrared return correlating with the code is recognised as self-illumination and subtracted rather than reported.

## Radio emissions stay inside unlicensed limits

The passive receivers transmit nothing. The optional broadband noise source in the active-emission module operates as a spread-spectrum chirp under 100 mW effective radiated power, which sits inside the United States FCC Part 15 limits for unlicensed intentional radiators and has equivalents in most jurisdictions. Spreading the signal is what keeps the power spectral density low enough to qualify.

Do not raise the power. An unlicensed transmitter that exceeds Part 15 is an unlicensed transmitter, and the fact that it was built for science does not change that. If you want more radiated power, get a licence.

The millimetre-wave radar modules are certified devices operating in bands allocated for exactly this use. Leave their firmware alone.

## The radioisotope module needs to be read carefully

The optional signature module aggregates the encapsulated americium-241 foils already present in domestic ionisation smoke detectors. Roughly ten of them, at about 0.9 microcuries each, sit behind a 2 mm aluminium heat sink and an acrylic housing. The aluminium and acrylic absorb the alpha and beta emission entirely while remaining largely transparent to the 59.5 keV gamma line, which is the signature the module exists to produce.

The dose rate is roughly 40 nanogray per hour at one metre. That is well under one percent of natural background and lower than the additional dose from a single commercial flight. Total activity stays below the United States NRC general-license threshold in 10 CFR 30.15 that already covers these devices in ordinary household use.

That framing matters and so do its limits. The exemption covers the sources as manufactured and encapsulated. It does not cover opening a foil, machining one, dissolving one, or aggregating enough of them to exceed the threshold. Do not do any of those things. The foil is dangerous if the encapsulation is breached and ingested; it is unremarkable if left alone.

Outside the United States, rules differ substantially and some jurisdictions prohibit possession of multiple sources regardless of individual activity. Check before building, not after.

If any of this is uncomfortable, skip the module. It is genuinely optional, every passive band works without it, and the platform is designed so that an emitter-free node is a first-class participant rather than a degraded one.

## Cameras and other people

A node pointed at the sky is not a surveillance device, but a wide-angle lens on a mast usually catches some ground. In populated areas, tilt the field of view at least 15 degrees above the horizon and confirm what is actually in frame rather than assuming.

Published node positions are fuzzed to the precision the operator declares, defaulting to one kilometre, and the offset is deterministic so that repeated readings cannot be averaged to recover the true point. That protects the operator. It does nothing for the neighbours, which is the operator's job.

## Aviation

A ground node on a mast is not an aviation matter until the mast is tall. Structures above roughly 60 metres, and anything near an aerodrome approach, are subject to marking and notification requirements almost everywhere.

If you are mounting the payload on an aircraft of any kind, everything about that is outside the scope of this guide and squarely inside your national aviation regulator's.
