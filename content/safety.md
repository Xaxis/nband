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

The dose figure this page used to publish was wrong, and wrong in the reassuring direction, which is the worst way to be wrong about radiation.

It said roughly 40 nanogray per hour at one metre and called that "well under one percent of natural background". Working it through: nine microcuries is 0.33 megabecquerels, and the gamma dose constant for americium-241 is about 3.2 microsieverts per hour per megabecquerel at one metre, giving roughly 1,070 nanosieverts per hour from an unshielded point source. Natural background averages around 340 nanosieverts per hour. So the correct statement is about three times background at one metre, not one percent of it, and the published number was low by a factor of nearly thirty.

The shielding does not rescue it. Two millimetres of aluminium attenuates a 59.5 keV photon beam by only about fifteen percent; aluminium and acrylic are there to stop alpha and beta, which they do completely, and they are close to transparent at this photon energy by design, because the gamma line is the entire point of the assembly.

Three times background at one metre is still a small absolute dose, and it falls off as the square of distance, so at three metres it is back under background. It is not the hazard that should stop you. The regulatory position below is.

The regulatory position is the part this page previously got wrong, and the correction matters more than the dose figure. An earlier revision said the assembly "stays below the United States NRC general-license threshold in 10 CFR 30.15". That is not what 10 CFR 30.15 says. It is an exemption rather than a general license, general licenses live in Part 31, and §30.15(a)(7) exempts "ionization chamber smoke detectors containing not more than 1 microcurie of americium-241 per detector in the form of a foil and designed to protect life and property from fires". The limit is per detector, the exemption attaches to the detector as a fire-protection device, and there is no aggregate activity allowance to sit beneath.

Ten foils removed from their detectors and epoxied into an aluminium and acrylic cartridge is therefore outside that exemption on every count: nine times the per-item activity, no longer in a device designed to protect life and property from fires, and no longer the article the exemption describes. §30.15(b) points anyone wanting to incorporate byproduct material into a product towards a specific license under §32.14.

nband does not assert that building this is lawful, and the previous wording implied a regulatory cover that does not exist. The aggregated cartridge has been removed from the reference bill of materials. If you intend to pursue a gamma lure seriously, do it under a specific license with your regulator's knowledge, not on the strength of a citation you read on a website.

The handling advice stands regardless: do not open, machine, dissolve, or heat a foil. It is dangerous if the encapsulation is breached and ingested, and unremarkable if left alone.

Outside the United States, rules differ substantially and some jurisdictions prohibit possession of multiple sources regardless of individual activity. Check before building, not after.

If any of this is uncomfortable, skip the module. It is genuinely optional, every passive band works without it, and the platform is designed so that an emitter-free node is a first-class participant rather than a degraded one.

## Cameras and other people

A node pointed at the sky is not a surveillance device, but a wide-angle lens on a mast usually catches some ground. In populated areas, tilt the field of view at least 15 degrees above the horizon and confirm what is actually in frame rather than assuming.

Published node positions are fuzzed to the precision the operator declares, defaulting to one kilometre, and the offset is deterministic so that repeated readings cannot be averaged to recover the true point. That protects the operator. It does nothing for the neighbours, which is the operator's job.

## Aviation

A ground node on a mast is not an aviation matter until the mast is tall. Structures above roughly 60 metres, and anything near an aerodrome approach, are subject to marking and notification requirements almost everywhere.

If you are mounting the payload on an aircraft of any kind, everything about that is outside the scope of this guide and squarely inside your national aviation regulator's.
