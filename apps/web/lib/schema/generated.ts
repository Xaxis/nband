// GENERATED FILE - DO NOT EDIT.
// Source: schema/bands.json, schema/spec.json, schema/hardware.json
// Regenerate with: yarn codegen
// Platform version: 0.1.0  Schema version: 0.1.0


export const PLATFORM_VERSION = '0.1.0' as const
export const SCHEMA_VERSION = '0.1.0' as const

// --- Bands -----------------------------------------------------------------

export type BandId = 'gamma' | 'uv' | 'vis' | 'nir' | 'swir' | 'lwir' | 'mmw' | 'rf' | 'elf_vlf' | 'acoustic' | 'seismic' | 'grav' | 'env' | 'nav'

export interface BandRange { minM?: number; maxM?: number; minHz?: number; maxHz?: number; minEv?: number; maxEv?: number }

export interface Band {
  id: BandId
  ordinal: number
  label: string
  kind: 'electromagnetic' | 'mechanical' | 'gravitational' | 'context'
  role: 'detection' | 'context'
  wavelength?: BandRange
  frequency?: BandRange
  energy?: BandRange
  /** Hue in degrees, ordered by wavelength. See lib/spectrum.ts. */
  hue: number
  saturation?: number
  unitDefault: string
  shortDescription: string
  whatItSees: string
  limits: string
  typicalSensors: string[]
  profile: BandProfile
}

export interface BandProfile {
  /** Detection strength per phenomenon: 0 blind, 1 marginal, 2 usable, 3 strong. */
  detects: Record<PhenomenonId, 0 | 1 | 2 | 3>
  day: number
  night: number
  /** Penetration through each obscurant, same 0-3 scale. */
  penetrates: { cloud: number; rain: number; fog: number; smoke: number; dark: number }
  typicalRangeM: number
  entryCostUsd: number
}

export type PhenomenonId = 'aircraft' | 'satellite' | 'bird_insect' | 'meteor' | 'lightning' | 'drone' | 'balloon' | 'exhaust_plume' | 'rf_emitter' | 'ground_vehicle'
export interface Phenomenon { id: PhenomenonId; label: string }
export const PHENOMENA: readonly Phenomenon[] = [
  {
    "id": "aircraft",
    "label": "Aircraft"
  },
  {
    "id": "satellite",
    "label": "Satellite"
  },
  {
    "id": "bird_insect",
    "label": "Bird or insect"
  },
  {
    "id": "meteor",
    "label": "Meteor"
  },
  {
    "id": "lightning",
    "label": "Lightning"
  },
  {
    "id": "drone",
    "label": "Small drone"
  },
  {
    "id": "balloon",
    "label": "Balloon"
  },
  {
    "id": "exhaust_plume",
    "label": "Exhaust plume"
  },
  {
    "id": "rf_emitter",
    "label": "RF emitter"
  },
  {
    "id": "ground_vehicle",
    "label": "Ground vehicle"
  }
] as const

export const BANDS: readonly Band[] = [
  {
    "id": "gamma",
    "ordinal": 0,
    "label": "Gamma",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 1e-14,
      "maxM": 1e-11
    },
    "frequency": {
      "minHz": 30000000000000000000,
      "maxHz": 3e+22
    },
    "energy": {
      "minEv": 100000,
      "maxEv": 100000000
    },
    "hue": 295,
    "unitDefault": "cps",
    "shortDescription": "Ionizing photons above 100 keV.",
    "whatItSees": "Radioisotope decay, cosmic-ray secondaries, and any source emitting hard photons. The only band in the stack that responds to nuclear rather than thermal or electronic processes.",
    "limits": "Counting statistics dominate. A small scintillator sees roughly 20-60 counts per second of background, so a real excursion needs either a large deviation or a long integration. Air attenuates low-energy gammas strongly, which caps useful range at tens of metres for weak sources.",
    "typicalSensors": [
      "csi-tl-sipm",
      "gm-tube"
    ],
    "profile": {
      "detects": {
        "aircraft": 0,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 0,
        "lightning": 1,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 0
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 30,
      "entryCostUsd": 189
    }
  },
  {
    "id": "uv",
    "ordinal": 1,
    "label": "Ultraviolet",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 1e-7,
      "maxM": 4e-7
    },
    "frequency": {
      "minHz": 750000000000000,
      "maxHz": 3000000000000000
    },
    "hue": 258,
    "unitDefault": "uW/cm2",
    "shortDescription": "100 to 400 nanometres, above the violet edge of vision.",
    "whatItSees": "Corona discharge, electrical arcing, plasma, combustion, and lightning leaders. Solar UV sets the daytime floor, so the band is far more informative after dark.",
    "limits": "Ordinary glass blocks most of it, so the sensor needs a quartz or fused-silica window. Atmospheric ozone absorbs hard UV entirely. Daytime dynamic range is brutal: the Sun is roughly six orders of magnitude above any plausible target.",
    "typicalSensors": [
      "ltr-390",
      "as7331",
      "guva-s12sd"
    ],
    "profile": {
      "detects": {
        "aircraft": 1,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 2,
        "lightning": 3,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 2,
        "rf_emitter": 0,
        "ground_vehicle": 1
      },
      "day": 0,
      "night": 3,
      "penetrates": {
        "cloud": 0,
        "rain": 0,
        "fog": 0,
        "smoke": 1,
        "dark": 3
      },
      "typicalRangeM": 5000,
      "entryCostUsd": 24.95
    }
  },
  {
    "id": "vis",
    "ordinal": 2,
    "label": "Visible",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 3.8e-7,
      "maxM": 7.5e-7
    },
    "frequency": {
      "minHz": 400000000000000,
      "maxHz": 790000000000000
    },
    "hue": 150,
    "unitDefault": "adu",
    "shortDescription": "380 to 750 nanometres, the band your eye already covers.",
    "whatItSees": "Anything that reflects sunlight or emits its own light: aircraft, satellites, meteors, balloons, birds, and the occasional thing that fits none of those. Provides the astrometry that turns a detection into a bearing.",
    "limits": "Useless through cloud and nearly useless in daylight against a bright sky for dim targets. A single camera gives bearing but never range, which is why nband treats single-node visible detections as unresolvable in distance by construction.",
    "typicalSensors": [
      "imx477-hq",
      "imx296-gs",
      "imx678"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 3,
        "bird_insect": 2,
        "meteor": 3,
        "lightning": 3,
        "drone": 2,
        "balloon": 3,
        "exhaust_plume": 2,
        "rf_emitter": 0,
        "ground_vehicle": 2
      },
      "day": 2,
      "night": 3,
      "penetrates": {
        "cloud": 0,
        "rain": 0,
        "fog": 0,
        "smoke": 0,
        "dark": 0
      },
      "typicalRangeM": 30000,
      "entryCostUsd": 78
    }
  },
  {
    "id": "nir",
    "ordinal": 3,
    "label": "Near infrared",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 7.5e-7,
      "maxM": 0.0000014
    },
    "frequency": {
      "minHz": 210000000000000,
      "maxHz": 400000000000000
    },
    "hue": 20,
    "unitDefault": "adu",
    "shortDescription": "750 to 1400 nanometres, just past the red edge.",
    "whatItSees": "Hot exhaust, incandescent surfaces, IR illuminators and rangefinders, and haze-penetrating reflected light. Silicon sensors are natively sensitive here, so removing the IR-cut filter from a normal camera buys the band for free.",
    "limits": "Sensitivity falls off a cliff past 1100 nm where silicon stops absorbing. Sunlight is rich in NIR, so daytime contrast is poor. Without a bandpass filter the channel is contaminated by ordinary visible light.",
    "typicalSensors": [
      "imx477-noir",
      "imx462-noir"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 2,
        "bird_insect": 1,
        "meteor": 2,
        "lightning": 2,
        "drone": 2,
        "balloon": 2,
        "exhaust_plume": 3,
        "rf_emitter": 0,
        "ground_vehicle": 2
      },
      "day": 1,
      "night": 3,
      "penetrates": {
        "cloud": 0,
        "rain": 1,
        "fog": 1,
        "smoke": 1,
        "dark": 2
      },
      "typicalRangeM": 20000,
      "entryCostUsd": 96
    }
  },
  {
    "id": "swir",
    "ordinal": 4,
    "label": "Short-wave infrared",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 0.0000014,
      "maxM": 0.000003
    },
    "frequency": {
      "minHz": 100000000000000,
      "maxHz": 210000000000000
    },
    "hue": 48,
    "unitDefault": "adu",
    "shortDescription": "1.4 to 3 micrometres. Reflective, not thermal.",
    "whatItSees": "Sees through haze, thin smoke, and some fog far better than visible light. Discriminates materials by reflectance in a way no other band in this stack can. Night-sky airglow illuminates targets passively at 1.5 to 1.7 micrometres.",
    "limits": "Requires an InGaAs sensor. This is the single most expensive band per pixel in the platform and the reason tier 3 exists. Water vapour absorption bands carve holes in the spectrum.",
    "typicalSensors": [
      "ingaas-640"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 1,
        "bird_insect": 1,
        "meteor": 2,
        "lightning": 1,
        "drone": 2,
        "balloon": 2,
        "exhaust_plume": 3,
        "rf_emitter": 0,
        "ground_vehicle": 2
      },
      "day": 2,
      "night": 3,
      "penetrates": {
        "cloud": 0,
        "rain": 1,
        "fog": 2,
        "smoke": 2,
        "dark": 3
      },
      "typicalRangeM": 25000,
      "entryCostUsd": 2400
    }
  },
  {
    "id": "lwir",
    "ordinal": 5,
    "label": "Long-wave infrared",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 0.000008,
      "maxM": 0.000014
    },
    "frequency": {
      "minHz": 21000000000000,
      "maxHz": 37000000000000
    },
    "hue": 4,
    "unitDefault": "K",
    "shortDescription": "8 to 14 micrometres. Pure thermal emission.",
    "whatItSees": "Everything warmer than absolute zero, by its own emitted heat rather than reflected light. Works in total darkness and through smoke. A radiometric sensor reports actual temperature per pixel, which turns a track into an energy-budget measurement.",
    "limits": "Resolution is low and expensive to increase; 160x120 is the affordable tier. Germanium optics only, which are costly and fragile. Uncooled microbolometers drift, so a shutter-based flat-field correction interrupts the stream every few minutes.",
    "typicalSensors": [
      "lepton-3-5",
      "boson-640",
      "mlx90640"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 1,
        "bird_insect": 2,
        "meteor": 1,
        "lightning": 1,
        "drone": 2,
        "balloon": 1,
        "exhaust_plume": 3,
        "rf_emitter": 0,
        "ground_vehicle": 3
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 0,
        "rain": 1,
        "fog": 1,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 8000,
      "entryCostUsd": 74.95
    }
  },
  {
    "id": "mmw",
    "ordinal": 6,
    "label": "Millimetre wave",
    "kind": "electromagnetic",
    "role": "detection",
    "wavelength": {
      "minM": 0.0037,
      "maxM": 0.0125
    },
    "frequency": {
      "minHz": 24000000000,
      "maxHz": 81000000000
    },
    "hue": 320,
    "unitDefault": "m",
    "shortDescription": "24 to 81 gigahertz active radar.",
    "whatItSees": "The only band in the stack that measures range and radial velocity directly, by illuminating the target and timing the return. Gives the discriminator a physical distance, which is what converts an angular track into a real trajectory.",
    "limits": "Short range for small radar cross-sections: a few hundred metres for a drone-sized target with a hobby module. Rain attenuates heavily. Ground clutter and multipath produce persistent false returns that have to be learned and subtracted per site.",
    "typicalSensors": [
      "iwr6843",
      "ld2450",
      "cdm324"
    ],
    "profile": {
      "detects": {
        "aircraft": 2,
        "satellite": 0,
        "bird_insect": 1,
        "meteor": 0,
        "lightning": 0,
        "drone": 3,
        "balloon": 1,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 3
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 1,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 250,
      "entryCostUsd": 14.5
    }
  },
  {
    "id": "rf",
    "ordinal": 7,
    "label": "Radio frequency",
    "kind": "electromagnetic",
    "role": "detection",
    "frequency": {
      "minHz": 500000,
      "maxHz": 6000000000
    },
    "wavelength": {
      "minM": 0.05,
      "maxM": 600
    },
    "hue": 205,
    "unitDefault": "dBm",
    "shortDescription": "500 kilohertz to 6 gigahertz, received passively.",
    "whatItSees": "Emissions rather than reflections. Aircraft transponders, satellite downlinks, control links, broadband impulsive noise from discharge events, and anything transmitting where nothing should be. Also feeds passive radar: an aircraft crossing a broadcast transmitter's illumination produces a Doppler-shifted echo.",
    "limits": "The spectrum is crowded and every site has a unique interference fingerprint that must be characterised before anything can be called anomalous. A single antenna gives no bearing without a rotator or a coherent multi-receiver array.",
    "typicalSensors": [
      "rtl-sdr-v4",
      "airspy-mini",
      "hackrf-one"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 3,
        "bird_insect": 0,
        "meteor": 1,
        "lightning": 3,
        "drone": 3,
        "balloon": 2,
        "exhaust_plume": 0,
        "rf_emitter": 3,
        "ground_vehicle": 1
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 300000,
      "entryCostUsd": 39.95
    }
  },
  {
    "id": "elf_vlf",
    "ordinal": 8,
    "label": "Magnetic and ELF/VLF",
    "kind": "electromagnetic",
    "role": "detection",
    "frequency": {
      "minHz": 0,
      "maxHz": 30000
    },
    "hue": 237,
    "unitDefault": "nT",
    "shortDescription": "DC to 30 kilohertz field measurement, not photon detection.",
    "whatItSees": "Static and slowly varying magnetic fields, sferics from distant lightning, power-line harmonics, and any moving ferromagnetic or current-carrying mass close enough to perturb the local field. This is the band that has historically carried the most repeatable anomalous reports.",
    "limits": "Falls off as the cube of distance for a dipole source, which makes it a close-range channel: metres to low tens of metres for anything realistic. The Earth's 25 to 65 microtesla background is five orders of magnitude larger than any plausible signal, so everything depends on differential measurement and gradiometry.",
    "typicalSensors": [
      "rm3100",
      "fgm-3",
      "qmc5883l"
    ],
    "profile": {
      "detects": {
        "aircraft": 1,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 0,
        "lightning": 3,
        "drone": 1,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 1,
        "ground_vehicle": 2
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 30,
      "entryCostUsd": 39.95
    },
    "wavelength": {
      "minM": 10000,
      "maxM": 10000000
    }
  },
  {
    "id": "acoustic",
    "ordinal": 9,
    "label": "Acoustic and infrasound",
    "kind": "mechanical",
    "role": "detection",
    "frequency": {
      "minHz": 0.05,
      "maxHz": 20000
    },
    "hue": 108,
    "unitDefault": "dBSPL",
    "shortDescription": "0.05 hertz to 20 kilohertz pressure waves.",
    "whatItSees": "Propeller and rotor signatures, jet noise, sonic booms, and the infrasound tail that survives to long range when audible sound has already been absorbed. Independently corroborates or refutes a claim that an optical track was silent.",
    "limits": "Sound arrives seconds after light, so acoustic correlation needs a range estimate to line up. Wind noise dominates infrasound and requires a mechanical wind filter to suppress. Urban sites are close to unusable below 100 hertz.",
    "typicalSensors": [
      "ics-43434",
      "sph0645",
      "infrabsu"
    ],
    "profile": {
      "detects": {
        "aircraft": 3,
        "satellite": 0,
        "bird_insect": 1,
        "meteor": 1,
        "lightning": 3,
        "drone": 3,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 3
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 1,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 12000,
      "entryCostUsd": 12.5
    }
  },
  {
    "id": "seismic",
    "ordinal": 10,
    "label": "Seismic",
    "kind": "mechanical",
    "role": "detection",
    "frequency": {
      "minHz": 0.008,
      "maxHz": 100
    },
    "hue": 60,
    "unitDefault": "m/s",
    "shortDescription": "Ground motion from 0.008 to 100 hertz.",
    "whatItSees": "Ground-coupled acoustic energy from low overflights, and, at high-tier sites, the vibration reference a gravimeter needs to separate real gravitational signal from the ground moving underneath it.",
    "limits": "Almost entirely a noise-characterisation channel at low tiers. Cultural noise from roads and machinery swamps everything below a few hertz at any site near people.",
    "typicalSensors": [
      "sm-24-geophone",
      "trillium-compact",
      "raspberryshake"
    ],
    "profile": {
      "detects": {
        "aircraft": 1,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 1,
        "lightning": 1,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 2
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 2,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 3000,
      "entryCostUsd": 89
    }
  },
  {
    "id": "grav",
    "ordinal": 11,
    "label": "Gravimetric",
    "kind": "gravitational",
    "role": "detection",
    "hue": 340,
    "unitDefault": "nGal",
    "shortDescription": "Absolute local gravitational acceleration.",
    "whatItSees": "The only channel that responds to mass-energy directly rather than to photons or fields. A discrepancy between the mass implied by radar cross-section and the mass implied by gravitational perturbation is a measurement no other instrument in the stack can produce.",
    "limits": "Research tier only, and not reachable today. Atom-interferometer gravimeters cost six figures and need vibration isolation and a co-located seismometer for noise subtraction. A 1000 kilogram object at 50 metres produces roughly 2.7 nanogal, three to four orders of magnitude below any portable instrument: a transportable atom interferometer sits around 50 microgal and the best absolute gravimeters around 2 microgal, and no amount of integration time closes that gap for a transient. The band is defined because the schema should be able to represent a measurement it cannot yet make, and because absence should be recorded rather than assumed. No nband node carries one, and none is expected to.",
    "typicalSensors": [
      "atom-interferometer",
      "squid-gradiometer"
    ],
    "profile": {
      "detects": {
        "aircraft": 1,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 0,
        "lightning": 0,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 0
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 100,
      "entryCostUsd": 150000
    }
  },
  {
    "id": "env",
    "ordinal": 12,
    "label": "Environmental",
    "kind": "context",
    "role": "context",
    "hue": 180,
    "unitDefault": "mixed",
    "shortDescription": "Pressure, temperature, humidity, wind, sky quality, cloud cover.",
    "whatItSees": "Nothing on its own. It exists so that every detection carries the atmospheric state it was made under, which is what allows a refraction artefact, a temperature inversion, or a wet radome to be ruled in or out afterwards rather than argued about.",
    "limits": "Not a detection channel. Treating an environmental excursion as a detection is a known failure mode of amateur sensor networks and the discriminator refuses to score on it alone.",
    "typicalSensors": [
      "bme688",
      "sqm-lu",
      "mlx90614-sky"
    ],
    "profile": {
      "detects": {
        "aircraft": 0,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 0,
        "lightning": 0,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 0
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 3,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 0,
      "entryCostUsd": 22.5
    }
  },
  {
    "id": "nav",
    "ordinal": 13,
    "label": "Navigation and pose",
    "kind": "context",
    "role": "context",
    "hue": 0,
    "saturation": 0,
    "unitDefault": "mixed",
    "shortDescription": "GNSS position, disciplined clock, and platform attitude.",
    "whatItSees": "Where the node is, which way each sensor is pointing, and what time it is to within a few hundred nanoseconds. Every other band's data is worthless for cross-node correlation without this one.",
    "limits": "GNSS is spoofable and jammable. A node that loses PPS lock degrades from nanosecond to millisecond timing, and the schema records that degradation explicitly so downstream correlation can be weighted accordingly rather than silently trusted.",
    "typicalSensors": [
      "neo-m9n",
      "lea-m8t",
      "bno085"
    ],
    "profile": {
      "detects": {
        "aircraft": 0,
        "satellite": 0,
        "bird_insect": 0,
        "meteor": 0,
        "lightning": 0,
        "drone": 0,
        "balloon": 0,
        "exhaust_plume": 0,
        "rf_emitter": 0,
        "ground_vehicle": 0
      },
      "day": 3,
      "night": 3,
      "penetrates": {
        "cloud": 2,
        "rain": 3,
        "fog": 3,
        "smoke": 3,
        "dark": 3
      },
      "typicalRangeM": 0,
      "entryCostUsd": 49.99
    }
  }
] as const

export const BAND_BY_ID: Record<BandId, Band> = Object.fromEntries(
  BANDS.map((b) => [b.id, b]),
) as Record<BandId, Band>

export const DETECTION_BANDS: readonly Band[] = BANDS.filter((b) => b.role === 'detection')
export const CONTEXT_BANDS: readonly Band[] = BANDS.filter((b) => b.role === 'context')

// --- Enums -----------------------------------------------------------------

/** Build tier. Determines which bands a node is expected to carry, never which bands it may carry. A tier 1 node that adds a thermal camera is still a tier 1 node with an extra channel, and the grid treats its LWIR data identically to a tier 3 node's. budgetUsd is the rounded sum of the tier's actual sourced part prices, checked against the registry by tools/check-drift.mjs, not an aspiration. */
export type Tier = 't1' | 't2' | 't3' | 'tr'

export const TIER: Record<Tier, TierMeta> = {
  "t1": {
    "id": "t1",
    "label": "Tier 1 - Baseline",
    "budgetUsd": 510,
    "summary": "Visible, near-infrared, long-wave infrared, radio, environmental, and disciplined time. The minimum configuration that can contribute usefully to the grid.",
    "buildable": true
  },
  "t2": {
    "id": "t2",
    "label": "Tier 2 - Core",
    "budgetUsd": 1670,
    "summary": "Adds ultraviolet, millimetre-wave radar, acoustic, and magnetometry, and upgrades the thermal array to a 160x120 imager. This is the first tier that survives outdoors, and the weatherproof case and solar supply are most of the price increase rather than the sensors. The configuration the build guide is written against.",
    "buildable": true
  },
  "t3": {
    "id": "t3",
    "label": "Tier 3 - Extended",
    "budgetUsd": 5350,
    "summary": "Adds short-wave infrared, gamma spectroscopy, and a seismometer, and replaces the presence radar with an imaging one. The short-wave imager is close to half the tier on its own. Research-grade coverage without research-grade cost.",
    "buildable": true
  },
  "tr": {
    "id": "tr",
    "label": "Research",
    "budgetUsd": 200000,
    "summary": "Tier 3 plus quantum gravimetry and SQUID or NV-centre magnetometry. There is no bill of materials for this tier and nband does not publish one: no part in the registry belongs to it, and the six-figure budget is an order-of-magnitude marker rather than a costed build. It exists so the schema can represent an instrument class it cannot yet specify.",
    "buildable": false
  }
} as const

export interface TierMeta {
  id: string
  label: string
  budgetUsd: number
  summary: string
  buildable: boolean
}

export const TIER_ORDER: readonly Tier[] = ['t1', 't2', 't3', 'tr'] as const

/** Lifecycle state of a node as the grid sees it. */
export type NodeStatus = 'provisioning' | 'online' | 'degraded' | 'offline' | 'retired'

export const NODESTATUS: Record<NodeStatus, NodeStatusMeta> = {
  "provisioning": {
    "id": "provisioning",
    "label": "Provisioning",
    "summary": "Enrolled but has not yet delivered a valid heartbeat."
  },
  "online": {
    "id": "online",
    "label": "Online",
    "summary": "Heartbeat within the last 5 minutes, all declared channels reporting."
  },
  "degraded": {
    "id": "degraded",
    "label": "Degraded",
    "summary": "Heartbeat current but one or more declared channels are failing, or clock quality has fallen below GNSS discipline."
  },
  "offline": {
    "id": "offline",
    "label": "Offline",
    "summary": "No heartbeat for more than 30 minutes. Buffered data may still arrive later; the schema is offline-first."
  },
  "retired": {
    "id": "retired",
    "label": "Retired",
    "summary": "Permanently decommissioned. Historical data is retained and remains queryable."
  }
} as const

export interface NodeStatusMeta {
  id: string
  label: string
  summary: string
}

export const NODESTATUS_ORDER: readonly NodeStatus[] = ['provisioning', 'online', 'degraded', 'offline', 'retired'] as const

/** How well a node's clock is disciplined at the moment a sample is taken. Cross-node time-of-arrival correlation is only meaningful at gnss_pps; every downstream calculation is weighted by this value rather than assuming the timestamp is good. */
export type ClockQuality = 'gnss_pps' | 'gnss_nopps' | 'ntp' | 'freerun'

export const CLOCKQUALITY: Record<ClockQuality, ClockQualityMeta> = {
  "gnss_pps": {
    "id": "gnss_pps",
    "label": "GNSS + PPS",
    "expectedAccuracyNs": 500,
    "summary": "Pulse-per-second hardware discipline against GNSS. Enables multilateration between nodes."
  },
  "gnss_nopps": {
    "id": "gnss_nopps",
    "label": "GNSS, no PPS",
    "expectedAccuracyNs": 100000000,
    "summary": "Serial NMEA time only. Adequate for single-node work, useless for time-of-arrival."
  },
  "ntp": {
    "id": "ntp",
    "label": "NTP",
    "expectedAccuracyNs": 20000000,
    "summary": "Network time only. Correlation limited to coarse windowing."
  },
  "freerun": {
    "id": "freerun",
    "label": "Free-running",
    "expectedAccuracyNs": 5000000000,
    "summary": "No external discipline. Data is accepted and flagged; it never contributes to multi-node geometry."
  }
} as const

export interface ClockQualityMeta {
  id: string
  label: string
  expectedAccuracyNs: number
  summary: string
}

export const CLOCKQUALITY_ORDER: readonly ClockQuality[] = ['gnss_pps', 'gnss_nopps', 'ntp', 'freerun'] as const

/** Why the node decided a window of data was worth keeping. nband records continuously into a ring buffer and promotes only triggered windows to durable storage, so this field explains the provenance of every stored detection. */
export type TriggerReason = 'threshold' | 'motion' | 'spectral' | 'coincidence' | 'cross_node' | 'scheduled' | 'manual'

export const TRIGGERREASON: Record<TriggerReason, TriggerReasonMeta> = {
  "threshold": {
    "id": "threshold",
    "label": "Threshold",
    "summary": "A channel exceeded its adaptive noise-floor threshold."
  },
  "motion": {
    "id": "motion",
    "label": "Motion",
    "summary": "Frame-differencing on an imaging channel found a moving object above the size and persistence floor."
  },
  "spectral": {
    "id": "spectral",
    "label": "Spectral",
    "summary": "An RF or gamma channel found power where the learned site baseline says there should be none."
  },
  "coincidence": {
    "id": "coincidence",
    "label": "Coincidence",
    "summary": "Two or more channels in different bands triggered inside the coincidence window. The highest-value trigger class."
  },
  "cross_node": {
    "id": "cross_node",
    "label": "Cross-node",
    "summary": "A neighbouring node's trigger propagated over the grid and armed this node's buffer retroactively."
  },
  "scheduled": {
    "id": "scheduled",
    "label": "Scheduled",
    "summary": "Routine calibration or baseline capture, not a candidate."
  },
  "manual": {
    "id": "manual",
    "label": "Manual",
    "summary": "An operator marked the window by hand."
  }
} as const

export interface TriggerReasonMeta {
  id: string
  label: string
  summary: string
}

export const TRIGGERREASON_ORDER: readonly TriggerReason[] = ['threshold', 'motion', 'spectral', 'coincidence', 'cross_node', 'scheduled', 'manual'] as const

/** The discriminator's verdict ladder. It is deliberately open at the top: the highest rung is 'unresolved', not 'artificial' or 'non-human'. nband can establish that something was not explained by any catalogue it checked; it cannot establish what that something was, and the schema refuses to encode a claim the instrument cannot support. */
export type Classification = 'instrumental' | 'terrestrial_known' | 'terrestrial_likely' | 'ambiguous' | 'anomalous_unresolved'

export const CLASSIFICATION: Record<Classification, ClassificationMeta> = {
  "instrumental": {
    "id": "instrumental",
    "ordinal": 0,
    "label": "Instrumental",
    "hue": 220,
    "summary": "The signal originated in the instrument: sensor glitch, hot pixel, shutter event, self-interference from the node's own emitters, condensation on optics, or a cable fault."
  },
  "terrestrial_known": {
    "id": "terrestrial_known",
    "ordinal": 1,
    "label": "Known source",
    "hue": 160,
    "summary": "Matched to a specific catalogued object. An ADS-B airframe by hex code, a satellite by NORAD ID, a lightning stroke by network fix, a licensed transmitter by frequency and bearing."
  },
  "terrestrial_likely": {
    "id": "terrestrial_likely",
    "ordinal": 2,
    "label": "Likely conventional",
    "hue": 100,
    "summary": "Consistent with a known class but not matched to a specific object. A bird, an insect near the lens, a balloon, a meteor, an aircraft not transmitting ADS-B. Common and uninteresting, and by far the largest bucket after known sources."
  },
  "ambiguous": {
    "id": "ambiguous",
    "ordinal": 3,
    "label": "Ambiguous",
    "hue": 45,
    "summary": "Insufficient data to classify. Too few bands, too short a track, clock quality too poor, or the only witness channel was one the discriminator does not score alone. Not a mystery, just a bad measurement."
  },
  "anomalous_unresolved": {
    "id": "anomalous_unresolved",
    "ordinal": 4,
    "label": "Unresolved",
    "hue": 340,
    "summary": "Survived every catalogue subtraction available, was witnessed coherently in two or more bands, and has kinematics or energetics the discriminator could not reconcile with any conventional class it knows. This is a statement about the limits of the catalogues, not a claim about the object."
  }
} as const

export interface ClassificationMeta {
  id: string
  ordinal: number
  label: string
  hue: number
  summary: string
}

export const CLASSIFICATION_ORDER: readonly Classification[] = ['instrumental', 'terrestrial_known', 'terrestrial_likely', 'ambiguous', 'anomalous_unresolved'] as const

/** How much independent support an event has. Orthogonal to classification: an event can be strongly corroborated and still be a known aircraft. */
export type Corroboration = 'single_channel' | 'multi_channel' | 'multi_node'

export const CORROBORATION: Record<Corroboration, CorroborationMeta> = {
  "single_channel": {
    "id": "single_channel",
    "ordinal": 0,
    "label": "Single channel",
    "summary": "One sensor on one node. Never eligible for the unresolved rung."
  },
  "multi_channel": {
    "id": "multi_channel",
    "ordinal": 1,
    "label": "Multi-band",
    "summary": "Two or more bands on one node agreed within the coincidence window."
  },
  "multi_node": {
    "id": "multi_node",
    "ordinal": 2,
    "label": "Multi-node",
    "summary": "Two or more nodes saw it. With PPS-disciplined clocks this yields a geometric fix and therefore a real range, altitude, and speed rather than an angular track."
  }
} as const

export interface CorroborationMeta {
  id: string
  ordinal: number
  label: string
  summary: string
}

export const CORROBORATION_ORDER: readonly Corroboration[] = ['single_channel', 'multi_channel', 'multi_node'] as const

/** Binary capture types held in object storage and referenced from detections. */
export type ArtifactKind = 'image' | 'video' | 'iq' | 'spectrogram' | 'audio' | 'pointcloud' | 'series'

export const ARTIFACTKIND: Record<ArtifactKind, ArtifactKindMeta> = {
  "image": {
    "id": "image",
    "label": "Still image",
    "mime": "image/png",
    "summary": "Single frame, usually the peak frame of an imaging detection."
  },
  "video": {
    "id": "video",
    "label": "Video clip",
    "mime": "video/mp4",
    "summary": "Ring-buffer excerpt spanning the trigger window plus pre-roll."
  },
  "iq": {
    "id": "iq",
    "label": "IQ recording",
    "mime": "application/octet-stream",
    "summary": "Raw complex baseband from an SDR channel. Large, and retained only for high-scoring events."
  },
  "spectrogram": {
    "id": "spectrogram",
    "label": "Spectrogram",
    "mime": "image/png",
    "summary": "Time-frequency representation of an RF or acoustic window."
  },
  "audio": {
    "id": "audio",
    "label": "Audio",
    "mime": "audio/flac",
    "summary": "Lossless acoustic capture including the infrasound band."
  },
  "pointcloud": {
    "id": "pointcloud",
    "label": "Radar point cloud",
    "mime": "application/octet-stream",
    "summary": "Range-Doppler detections from a millimetre-wave module."
  },
  "series": {
    "id": "series",
    "label": "Series export",
    "mime": "text/csv",
    "summary": "Numeric channel data over the trigger window, for reproduction of the discriminator's arithmetic."
  }
} as const

export interface ArtifactKindMeta {
  id: string
  label: string
  mime: string
  summary: string
}

export const ARTIFACTKIND_ORDER: readonly ArtifactKind[] = ['image', 'video', 'iq', 'spectrogram', 'audio', 'pointcloud', 'series'] as const

/** External catalogues the discriminator subtracts against before an event may be called unresolved. Every check is recorded, including checks that were unavailable, so that a verdict can never quietly benefit from a catalogue that simply failed to load. */
export type CatalogSource = 'adsb' | 'tle' | 'lightning' | 'rfi' | 'meteor' | 'weather' | 'solar' | 'airspace'

export const CATALOGSOURCE: Record<CatalogSource, CatalogSourceMeta> = {
  "adsb": {
    "id": "adsb",
    "label": "ADS-B",
    "summary": "Cooperative aircraft transponders, received locally on 1090 MHz or pulled from a network feed. Matches by position, altitude, and time."
  },
  "tle": {
    "id": "tle",
    "label": "Satellite TLE",
    "summary": "Orbital elements propagated to the node's horizon to find satellites and rocket bodies in the field of view, including their illumination state."
  },
  "lightning": {
    "id": "lightning",
    "label": "Lightning",
    "summary": "Sferic network fixes, used to explain UV, RF, acoustic, and magnetic coincidences."
  },
  "rfi": {
    "id": "rfi",
    "label": "RFI baseline",
    "summary": "The node's own learned per-site radio interference fingerprint, plus licensed transmitter records where available."
  },
  "meteor": {
    "id": "meteor",
    "label": "Meteor",
    "summary": "Shower radiants and sporadic rates for the date, used to weight a fast optical streak."
  },
  "weather": {
    "id": "weather",
    "label": "Weather",
    "summary": "Cloud, precipitation, temperature profile, and inversion state at the time of the event."
  },
  "solar": {
    "id": "solar",
    "label": "Solar and geomagnetic",
    "summary": "Solar flux, Kp index, and aurora extent, which explain most wide-area magnetometer and HF excursions."
  },
  "airspace": {
    "id": "airspace",
    "label": "Airspace activity",
    "summary": "NOTAMs, temporary flight restrictions, and published launch or test windows."
  }
} as const

export interface CatalogSourceMeta {
  id: string
  label: string
  summary: string
}

export const CATALOGSOURCE_ORDER: readonly CatalogSource[] = ['adsb', 'tle', 'lightning', 'rfi', 'meteor', 'weather', 'solar', 'airspace'] as const

/** Standing of a hardware variant in the community registry. */
export type VariantStatus = 'reference' | 'verified' | 'submitted' | 'unsupported'

export const VARIANTSTATUS: Record<VariantStatus, VariantStatusMeta> = {
  "reference": {
    "id": "reference",
    "label": "Reference",
    "summary": "Part used in the canonical build. Calibration constants are shipped with the firmware."
  },
  "verified": {
    "id": "verified",
    "label": "Verified",
    "summary": "Community-submitted substitute that has been run against the conformance suite and produced data the discriminator accepts without adjustment."
  },
  "submitted": {
    "id": "submitted",
    "label": "Submitted",
    "summary": "Proposed by a builder, not yet run against the conformance suite. Data is accepted but flagged."
  },
  "unsupported": {
    "id": "unsupported",
    "label": "Unsupported",
    "summary": "Known not to work, or works but produces data the discriminator cannot calibrate. Documented so nobody buys it twice."
  }
} as const

export interface VariantStatusMeta {
  id: string
  label: string
  summary: string
}

export const VARIANTSTATUS_ORDER: readonly VariantStatus[] = ['reference', 'verified', 'submitted', 'unsupported'] as const

// --- Hypotheses and thresholds ---------------------------------------------

export interface Hypothesis { id: string; label: string; prior: number; classification: Classification }
export const HYPOTHESES: readonly Hypothesis[] = [
  {
    "id": "aircraft",
    "label": "Aircraft",
    "prior": 0.42,
    "classification": "terrestrial_known"
  },
  {
    "id": "satellite",
    "label": "Satellite or rocket body",
    "prior": 0.11,
    "classification": "terrestrial_known"
  },
  {
    "id": "bird_insect",
    "label": "Bird or insect",
    "prior": 0.18,
    "classification": "terrestrial_likely"
  },
  {
    "id": "meteor",
    "label": "Meteor",
    "prior": 0.03,
    "classification": "terrestrial_likely"
  },
  {
    "id": "balloon_debris",
    "label": "Balloon or wind-borne debris",
    "prior": 0.04,
    "classification": "terrestrial_likely"
  },
  {
    "id": "drone",
    "label": "Small uncrewed aircraft",
    "prior": 0.07,
    "classification": "terrestrial_likely"
  },
  {
    "id": "atmospheric",
    "label": "Atmospheric or optical effect",
    "prior": 0.05,
    "classification": "terrestrial_likely"
  },
  {
    "id": "instrument",
    "label": "Instrumental artefact",
    "prior": 0.09,
    "classification": "instrumental"
  },
  {
    "id": "unmodelled",
    "label": "Unmodelled",
    "prior": 0.01,
    "classification": "anomalous_unresolved"
  }
] as const

export const THRESHOLDS = {
  "$comment": "Platform-wide constants the discriminator and firmware both depend on. Changing any of these changes what the archive means, so they live in the schema and are versioned with it rather than sitting in a config file on one machine.",
  "coincidenceWindowMs": 250,
  "crossNodeWindowMs": 2000,
  "minBandsForUnresolved": 2,
  "minClockQualityForGeometry": "gnss_pps",
  "maxNodeSeparationKmForGeometry": 60,
  "heartbeatIntervalS": 60,
  "degradedAfterS": 300,
  "offlineAfterS": 1800,
  "ringBufferPreRollS": 15,
  "ringBufferPostRollS": 15,
  "anomalyScoreUnresolvedFloor": 70,
  "locationFuzzDefaultM": 1000
} as const

// --- Hardware registry -----------------------------------------------------

export interface Part {
  id: string
  category: string
  band: BandId | null
  vendor: string
  model: string
  status: VariantStatus
  tiers?: Tier[]
  priceUsd: number
  priceAsOf: string
  sourceUrl: string
  interface: string
  driver: string | null
  restricted?: boolean
  keySpecs: Record<string, string | number | boolean>
  notes: string
  alternatives?: string[]
  /** Substitutes people use that have not been through conformance. */
  candidateAlternatives?: string[]
  electrical?: Electrical
}

export interface Electrical {
  idleW: number
  activeW: number
  /** Which supply rail or bus it hangs off. */
  rail: string
  pins: { signal: string; pin: string }[]
}

export const PARTS: readonly Part[] = [
  {
    "id": "pi5-2gb",
    "category": "compute",
    "band": null,
    "vendor": "Raspberry Pi",
    "model": "Raspberry Pi 5, 2GB",
    "status": "reference",
    "tiers": [
      "t1"
    ],
    "priceUsd": 65,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.pishop.us/product/raspberry-pi-5-2gb/",
    "interface": "host",
    "driver": null,
    "keySpecs": {
      "soc": "BCM2712 quad Cortex-A76 @ 2.4 GHz",
      "ram": "2 GB LPDDR4X",
      "csi": "2 lanes (dual 4-lane MIPI)",
      "usb": "2x USB 3.0, 2x USB 2.0",
      "pcie": "1x PCIe 2.0 via FFC",
      "ethernet": "Gigabit with hardware timestamping"
    },
    "notes": "The tier 1 reference host. Two gigabytes is genuinely sufficient because the node agent holds bounded ring buffers and never queues decoded frames; see firmware/README.md on the memory budget. Choosing 2 GB over 8 GB saves USD 110 at July 2026 prices, which is more than a quarter of the entire tier 1 budget. The Pi 5's Ethernet MAC supports hardware timestamping, which is what makes sub-microsecond cross-node timing achievable at all.",
    "alternatives": [
      "pi5-4gb",
      "pi5-8gb"
    ],
    "candidateAlternatives": [
      "pi4-4gb"
    ],
    "electrical": {
      "idleW": 2.7,
      "activeW": 6.4,
      "rail": "5V",
      "pins": []
    },
    "mechanical": {
      "widthMm": 85,
      "depthMm": 56,
      "heightMm": 18,
      "mount": "host",
      "dimensionsSourced": true,
      "note": "Raspberry Pi 5 mechanical spec: 85 x 56 mm board, ~18 mm to the top of the Ethernet jack.",
      "features": [
        {
          "id": "gpio",
          "label": "40-pin GPIO header",
          "x": 2.2,
          "y": 48.7,
          "w": 52.4,
          "d": 5.1,
          "h": 8.5,
          "colour": "#1c1f24"
        },
        {
          "id": "eth",
          "label": "Gigabit Ethernet",
          "x": 70.5,
          "y": 1.5,
          "w": 14.5,
          "d": 16,
          "h": 13.5,
          "colour": "#43484f"
        },
        {
          "id": "usb3",
          "label": "USB 3.0 x2",
          "x": 70.5,
          "y": 20,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#2f4f8f"
        },
        {
          "id": "usb2",
          "label": "USB 2.0 x2",
          "x": 70.5,
          "y": 38.5,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#26292f"
        },
        {
          "id": "usbc",
          "label": "USB-C power",
          "x": 8.5,
          "y": -0.6,
          "w": 9,
          "d": 3.4,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi0",
          "label": "micro-HDMI 0",
          "x": 22.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi1",
          "label": "micro-HDMI 1",
          "x": 36.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "sd",
          "label": "microSD",
          "x": 22,
          "y": -1.2,
          "w": 12,
          "d": 1.6,
          "h": 1.6,
          "colour": "#6b7078"
        },
        {
          "id": "csi0",
          "label": "CSI/DSI 0",
          "x": 45,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "csi1",
          "label": "CSI/DSI 1",
          "x": 56,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "soc",
          "label": "BCM2712 SoC",
          "x": 30.5,
          "y": 22,
          "w": 15,
          "d": 15,
          "h": 2.4,
          "colour": "#53585f"
        },
        {
          "id": "rp1",
          "label": "RP1 southbridge",
          "x": 50,
          "y": 30,
          "w": 10,
          "d": 10,
          "h": 1.7,
          "colour": "#4a4f56"
        },
        {
          "id": "ram",
          "label": "LPDDR4X",
          "x": 30,
          "y": 40.5,
          "w": 12.5,
          "d": 9.5,
          "h": 1.4,
          "colour": "#3f444b"
        },
        {
          "id": "pmic",
          "label": "PMIC",
          "x": 58,
          "y": 16,
          "w": 6,
          "d": 6,
          "h": 1.2,
          "colour": "#4a4f56"
        },
        {
          "id": "pcie",
          "label": "PCIe FFC",
          "x": 62,
          "y": 44,
          "w": 3,
          "d": 12,
          "h": 2.6,
          "colour": "#b9a97f"
        },
        {
          "id": "fan",
          "label": "Fan header",
          "x": 64,
          "y": 52,
          "w": 4.5,
          "d": 2.5,
          "h": 3,
          "colour": "#d8d0b0"
        }
      ],
      "featureNote": "Connector and chip positions approximated from the published Raspberry Pi 5 mechanical drawing. Accurate enough to recognise the board and to land a cable on the correct port, which is what the model is for; not a substitute for the drawing itself."
    }
  },
  {
    "id": "pi5-4gb",
    "category": "compute",
    "band": null,
    "vendor": "Raspberry Pi",
    "model": "Raspberry Pi 5, 4GB",
    "status": "reference",
    "tiers": [
      "t2"
    ],
    "priceUsd": 110,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.pishop.us/product/raspberry-pi-5-4gb/",
    "interface": "host",
    "driver": null,
    "keySpecs": {
      "ram": "4 GB LPDDR4X"
    },
    "notes": "The tier 2 reference host. The extra headroom over 2 GB is spent on the LWIR pipeline and on holding a longer pre-roll for the coincidence trigger.",
    "alternatives": [
      "pi5-8gb"
    ],
    "candidateAlternatives": [
      "cm5"
    ],
    "electrical": {
      "idleW": 2.9,
      "activeW": 7,
      "rail": "5V",
      "pins": []
    },
    "mechanical": {
      "widthMm": 85,
      "depthMm": 56,
      "heightMm": 18,
      "mount": "host",
      "dimensionsSourced": true,
      "note": "Raspberry Pi 5 mechanical spec.",
      "features": [
        {
          "id": "gpio",
          "label": "40-pin GPIO header",
          "x": 2.2,
          "y": 48.7,
          "w": 52.4,
          "d": 5.1,
          "h": 8.5,
          "colour": "#1c1f24"
        },
        {
          "id": "eth",
          "label": "Gigabit Ethernet",
          "x": 70.5,
          "y": 1.5,
          "w": 14.5,
          "d": 16,
          "h": 13.5,
          "colour": "#43484f"
        },
        {
          "id": "usb3",
          "label": "USB 3.0 x2",
          "x": 70.5,
          "y": 20,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#2f4f8f"
        },
        {
          "id": "usb2",
          "label": "USB 2.0 x2",
          "x": 70.5,
          "y": 38.5,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#26292f"
        },
        {
          "id": "usbc",
          "label": "USB-C power",
          "x": 8.5,
          "y": -0.6,
          "w": 9,
          "d": 3.4,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi0",
          "label": "micro-HDMI 0",
          "x": 22.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi1",
          "label": "micro-HDMI 1",
          "x": 36.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "sd",
          "label": "microSD",
          "x": 22,
          "y": -1.2,
          "w": 12,
          "d": 1.6,
          "h": 1.6,
          "colour": "#6b7078"
        },
        {
          "id": "csi0",
          "label": "CSI/DSI 0",
          "x": 45,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "csi1",
          "label": "CSI/DSI 1",
          "x": 56,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "soc",
          "label": "BCM2712 SoC",
          "x": 30.5,
          "y": 22,
          "w": 15,
          "d": 15,
          "h": 2.4,
          "colour": "#53585f"
        },
        {
          "id": "rp1",
          "label": "RP1 southbridge",
          "x": 50,
          "y": 30,
          "w": 10,
          "d": 10,
          "h": 1.7,
          "colour": "#4a4f56"
        },
        {
          "id": "ram",
          "label": "LPDDR4X",
          "x": 30,
          "y": 40.5,
          "w": 12.5,
          "d": 9.5,
          "h": 1.4,
          "colour": "#3f444b"
        },
        {
          "id": "pmic",
          "label": "PMIC",
          "x": 58,
          "y": 16,
          "w": 6,
          "d": 6,
          "h": 1.2,
          "colour": "#4a4f56"
        },
        {
          "id": "pcie",
          "label": "PCIe FFC",
          "x": 62,
          "y": 44,
          "w": 3,
          "d": 12,
          "h": 2.6,
          "colour": "#b9a97f"
        },
        {
          "id": "fan",
          "label": "Fan header",
          "x": 64,
          "y": 52,
          "w": 4.5,
          "d": 2.5,
          "h": 3,
          "colour": "#d8d0b0"
        }
      ],
      "featureNote": "Connector and chip positions approximated from the published Raspberry Pi 5 mechanical drawing. Accurate enough to recognise the board and to land a cable on the correct port, which is what the model is for; not a substitute for the drawing itself."
    }
  },
  {
    "id": "pi5-8gb",
    "category": "compute",
    "band": null,
    "vendor": "Raspberry Pi",
    "model": "Raspberry Pi 5, 8GB",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 175,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.pishop.us/product/raspberry-pi-5-8gb/",
    "interface": "host",
    "driver": null,
    "keySpecs": {
      "ram": "8 GB LPDDR4X"
    },
    "notes": "Tier 3 host. Needed once SWIR imaging and wideband SDR are both running, since each wants a multi-hundred-megabyte buffer of its own.",
    "alternatives": [],
    "candidateAlternatives": [
      "cm5",
      "jetson-orin-nano"
    ],
    "electrical": {
      "idleW": 3.1,
      "activeW": 7.6,
      "rail": "5V",
      "pins": []
    },
    "mechanical": {
      "widthMm": 85,
      "depthMm": 56,
      "heightMm": 18,
      "mount": "host",
      "dimensionsSourced": true,
      "note": "Raspberry Pi 5 mechanical spec.",
      "features": [
        {
          "id": "gpio",
          "label": "40-pin GPIO header",
          "x": 2.2,
          "y": 48.7,
          "w": 52.4,
          "d": 5.1,
          "h": 8.5,
          "colour": "#1c1f24"
        },
        {
          "id": "eth",
          "label": "Gigabit Ethernet",
          "x": 70.5,
          "y": 1.5,
          "w": 14.5,
          "d": 16,
          "h": 13.5,
          "colour": "#43484f"
        },
        {
          "id": "usb3",
          "label": "USB 3.0 x2",
          "x": 70.5,
          "y": 20,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#2f4f8f"
        },
        {
          "id": "usb2",
          "label": "USB 2.0 x2",
          "x": 70.5,
          "y": 38.5,
          "w": 14.5,
          "d": 17.5,
          "h": 16.4,
          "colour": "#26292f"
        },
        {
          "id": "usbc",
          "label": "USB-C power",
          "x": 8.5,
          "y": -0.6,
          "w": 9,
          "d": 3.4,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi0",
          "label": "micro-HDMI 0",
          "x": 22.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "hdmi1",
          "label": "micro-HDMI 1",
          "x": 36.5,
          "y": -0.6,
          "w": 7.2,
          "d": 3.2,
          "h": 3.3,
          "colour": "#9aa0a8"
        },
        {
          "id": "sd",
          "label": "microSD",
          "x": 22,
          "y": -1.2,
          "w": 12,
          "d": 1.6,
          "h": 1.6,
          "colour": "#6b7078"
        },
        {
          "id": "csi0",
          "label": "CSI/DSI 0",
          "x": 45,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "csi1",
          "label": "CSI/DSI 1",
          "x": 56,
          "y": 2,
          "w": 2.6,
          "d": 21,
          "h": 3,
          "colour": "#c8b48a"
        },
        {
          "id": "soc",
          "label": "BCM2712 SoC",
          "x": 30.5,
          "y": 22,
          "w": 15,
          "d": 15,
          "h": 2.4,
          "colour": "#53585f"
        },
        {
          "id": "rp1",
          "label": "RP1 southbridge",
          "x": 50,
          "y": 30,
          "w": 10,
          "d": 10,
          "h": 1.7,
          "colour": "#4a4f56"
        },
        {
          "id": "ram",
          "label": "LPDDR4X",
          "x": 30,
          "y": 40.5,
          "w": 12.5,
          "d": 9.5,
          "h": 1.4,
          "colour": "#3f444b"
        },
        {
          "id": "pmic",
          "label": "PMIC",
          "x": 58,
          "y": 16,
          "w": 6,
          "d": 6,
          "h": 1.2,
          "colour": "#4a4f56"
        },
        {
          "id": "pcie",
          "label": "PCIe FFC",
          "x": 62,
          "y": 44,
          "w": 3,
          "d": 12,
          "h": 2.6,
          "colour": "#b9a97f"
        },
        {
          "id": "fan",
          "label": "Fan header",
          "x": 64,
          "y": 52,
          "w": 4.5,
          "d": 2.5,
          "h": 3,
          "colour": "#d8d0b0"
        }
      ],
      "featureNote": "Connector and chip positions approximated from the published Raspberry Pi 5 mechanical drawing. Accurate enough to recognise the board and to land a cable on the correct port, which is what the model is for; not a substitute for the drawing itself."
    }
  },
  {
    "id": "gnss-lc29h",
    "category": "timing",
    "band": "nav",
    "vendor": "Quectel / Waveshare",
    "model": "LC29H(DA) RTK HAT with PPS",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 49.99,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.waveshare.com/lc29h-gps-hat.htm",
    "interface": "uart+gpio",
    "driver": "gnss_nmea_pps",
    "keySpecs": {
      "constellations": "GPS, GLONASS, Galileo, BeiDou",
      "ppsAccuracyNs": 20,
      "ppsPin": "GPIO4 (physical pin 7)"
    },
    "notes": "RTK-capable, but that is not why it is here. The pulse-per-second output is, because it is the difference between a node that can join an array and one that can only ever file solo reports. Without PPS a timestamp is good to milliseconds, three to four orders of magnitude too coarse for time-of-arrival work between nodes. PPS lands on GPIO4, physical pin 7. Not GPIO18: that is the I2S bit clock and the microphone claims it on any node carrying both.",
    "alternatives": [],
    "candidateAlternatives": [
      "gnss-neo-m9n",
      "gnss-lea-m8t"
    ],
    "electrical": {
      "idleW": 0.13,
      "activeW": 0.17,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "1"
        },
        {
          "signal": "GND",
          "pin": "6"
        },
        {
          "signal": "TXD->RXD",
          "pin": "10"
        },
        {
          "signal": "RXD<-TXD",
          "pin": "8"
        },
        {
          "signal": "PPS",
          "pin": "7"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 65,
      "depthMm": 56,
      "heightMm": 13,
      "mount": "hat",
      "dimensionsSourced": true,
      "note": "Raspberry Pi HAT mechanical standard: 65 x 56 mm."
    }
  },
  {
    "id": "cam-hq-imx477",
    "category": "imager",
    "band": "vis",
    "vendor": "Raspberry Pi",
    "model": "HQ Camera (IMX477) + 6mm CS lens",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 78,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.raspberrypi.com/products/raspberry-pi-high-quality-camera/",
    "interface": "csi",
    "driver": "picamera2_still",
    "keySpecs": {
      "sensor": "Sony IMX477, 12.3 MP, 1/2.3 inch",
      "resolution": "4056x3040",
      "shutter": "rolling",
      "mount": "C/CS"
    },
    "notes": "Rolling shutter is a real limitation for fast targets: a fast-crossing object is geometrically skewed, and that skew must not be read as anomalous kinematics. The firmware records the readout time per frame so the discriminator can correct for it. Where budget allows, the global-shutter IMX296 removes the problem entirely at the cost of resolution.",
    "alternatives": [],
    "candidateAlternatives": [
      "cam-gs-imx296",
      "cam-imx678"
    ],
    "electrical": {
      "idleW": 0.25,
      "activeW": 1.1,
      "rail": "CSI",
      "pins": [
        {
          "signal": "CSI-0",
          "pin": "CAM0"
        }
      ]
    },
    "mechanical": {
      "widthMm": 38,
      "depthMm": 38,
      "heightMm": 48,
      "mount": "csi",
      "dimensionsSourced": false,
      "note": "38 x 38 mm HQ camera body is sourced; height includes a 6 mm CS lens and is approximate.",
      "plugsInto": "csi0",
      "detail": [
        {
          "id": "body",
          "label": "HQ camera board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 10,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "lens",
          "label": "6 mm CS lens",
          "cx": 0.5,
          "cy": 0.5,
          "w": 30,
          "d": 30,
          "h": 36,
          "colour": "#232629",
          "base": 10,
          "round": true
        }
      ]
    }
  },
  {
    "id": "cam-noir-imx477",
    "category": "imager",
    "band": "nir",
    "vendor": "Raspberry Pi",
    "model": "HQ Camera NoIR + 850nm bandpass",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 96,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.raspberrypi.com/products/raspberry-pi-high-quality-camera/",
    "interface": "csi",
    "driver": "picamera2_still",
    "keySpecs": {
      "sensor": "Sony IMX477 without IR-cut filter",
      "bandpass": "850 nm, 40 nm FWHM",
      "usefulTo": "~1050 nm"
    },
    "notes": "The cheapest genuinely additional band in the platform. A second HQ camera body with the IR-cut filter removed and a hard 850 nm bandpass in front of it produces a channel that is physically independent of the visible camera rather than a filtered copy of it. Without the bandpass filter this is not a NIR channel, it is a visible channel with extra noise, and the registry will mark it as such.",
    "alternatives": [],
    "candidateAlternatives": [
      "cam-noir-imx462"
    ],
    "electrical": {
      "idleW": 0.25,
      "activeW": 1.1,
      "rail": "CSI",
      "pins": [
        {
          "signal": "CSI-1",
          "pin": "CAM1"
        }
      ]
    },
    "mechanical": {
      "widthMm": 38,
      "depthMm": 38,
      "heightMm": 48,
      "mount": "csi",
      "dimensionsSourced": false,
      "note": "As above, with the bandpass filter fitted.",
      "plugsInto": "csi1",
      "detail": [
        {
          "id": "body",
          "label": "NoIR camera board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 10,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "lens",
          "label": "6 mm CS lens + 850 nm bandpass",
          "cx": 0.5,
          "cy": 0.5,
          "w": 30,
          "d": 30,
          "h": 36,
          "colour": "#232629",
          "base": 10,
          "round": true
        }
      ]
    }
  },
  {
    "id": "sdr-rtl-v3",
    "category": "receiver",
    "band": "rf",
    "vendor": "RTL-SDR Blog",
    "model": "RTL-SDR Blog V3",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 39.95,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.rtl-sdr.com/buy-rtl-sdr-dvb-t-dongles/",
    "interface": "usb",
    "driver": "soapy_rtlsdr",
    "keySpecs": {
      "tuningHz": "500 kHz - 1.766 GHz",
      "bandwidthHz": 2400000,
      "adcBits": 8,
      "tcxoPpm": 1
    },
    "notes": "The V3 is the current reference, not the V4. RTL-SDR Blog announced the V4 as end-of-line in 2026 after Rafael Micro stopped producing the R828D tuner and the remaining stock proved faulty; the V3 remains in stable production. A V4L using the R828S is expected but was not shippable at the time of writing. Any BOM still specifying a V4 is out of date. The 1 ppm TCXO matters here: an uncompensated dongle drifts enough to smear a narrowband detection across the analysis window.",
    "alternatives": [],
    "candidateAlternatives": [
      "sdr-airspy-mini",
      "sdr-hackrf"
    ],
    "electrical": {
      "idleW": 1.4,
      "activeW": 1.9,
      "rail": "USB",
      "pins": [
        {
          "signal": "USB 2.0",
          "pin": "USB-A"
        }
      ]
    },
    "mechanical": {
      "widthMm": 80,
      "depthMm": 27,
      "heightMm": 15,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate dongle body, excluding the antenna.",
      "plugsInto": "usb3a",
      "detail": [
        {
          "id": "body",
          "label": "RTL-SDR body",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 13,
          "colour": "#5a5f66",
          "fill": true
        },
        {
          "id": "plug",
          "label": "USB-A plug",
          "cx": 0.06,
          "cy": 0.5,
          "w": 14,
          "d": 12,
          "h": 5,
          "colour": "#9aa0a8",
          "base": 3
        },
        {
          "id": "sma",
          "label": "SMA antenna",
          "cx": 0.97,
          "cy": 0.5,
          "w": 7,
          "d": 7,
          "h": 8,
          "colour": "#c9a961",
          "base": 3,
          "round": true
        }
      ]
    },
    "poweredBy": "usb-hub-powered"
  },
  {
    "id": "env-bme688",
    "category": "environmental",
    "band": "env",
    "vendor": "Bosch",
    "model": "BME688",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 22.5,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.adafruit.com/product/5046",
    "interface": "i2c",
    "driver": "bme68x",
    "keySpecs": {
      "pressureHpa": "300-1100, +/-0.6 hPa",
      "temperatureC": "-40 to 85, +/-1.0 C",
      "humidityPct": "0-100, +/-3 %"
    },
    "notes": "Context only, never a detection channel. Its job is to make a refraction argument settleable after the fact instead of arguable forever. Pressure trend and dewpoint spread are what let the discriminator recognise a temperature inversion, which is the single most common cause of a genuinely strange-looking optical track near the horizon.",
    "alternatives": [],
    "candidateAlternatives": [
      "env-bme280"
    ],
    "electrical": {
      "idleW": 0.001,
      "activeW": 0.04,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "9"
        },
        {
          "signal": "SDA",
          "pin": "3"
        },
        {
          "signal": "SCL",
          "pin": "5"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 18,
      "heightMm": 5,
      "mount": "enclosure-wall",
      "dimensionsSourced": false,
      "note": "Needs ambient air to measure it. Mounted at a vented enclosure wall on a short cable, not on the carrier, where it would read the temperature of the Raspberry Pi.",
      "detail": [
        {
          "id": "pcb",
          "label": "BME688 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "BME688",
          "cx": 0.5,
          "cy": 0.55,
          "w": 3.2,
          "d": 3.2,
          "h": 1.1,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "imu-bno085",
    "category": "pose",
    "band": "nav",
    "vendor": "CEVA / Adafruit",
    "model": "BNO085 9-DoF IMU",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 29.95,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.adafruit.com/product/4754",
    "interface": "i2c",
    "driver": "bno08x",
    "keySpecs": {
      "output": "fused quaternion at 100 Hz",
      "headingAccuracyDeg": 2
    },
    "notes": "Records where each sensor was actually pointing rather than where the operator believes it was bolted. A mast that shifts two degrees in wind invalidates every bearing taken during the gust unless the shift is recorded. The onboard sensor-fusion output is used directly; running fusion on the host wastes CPU that the trigger pipeline needs.",
    "alternatives": [],
    "candidateAlternatives": [
      "imu-icm20948"
    ],
    "electrical": {
      "idleW": 0.01,
      "activeW": 0.04,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "9"
        },
        {
          "signal": "SDA",
          "pin": "3"
        },
        {
          "signal": "SCL",
          "pin": "5"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 18,
      "heightMm": 5,
      "mount": "carrier",
      "dimensionsSourced": false,
      "note": "Genuinely board-mounted, and has to be: it records the orientation of the node itself, so it is only meaningful if it is rigidly attached to the thing whose pose it reports.",
      "detail": [
        {
          "id": "pcb",
          "label": "BNO085 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "BNO085",
          "cx": 0.5,
          "cy": 0.55,
          "w": 5.2,
          "d": 3.8,
          "h": 1.1,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "lwir-lepton35",
    "category": "imager",
    "band": "lwir",
    "vendor": "Teledyne FLIR",
    "model": "Lepton 3.5 + PureThermal 3",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 329,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://groupgets.com/products/flir-lepton-3-5",
    "interface": "usb",
    "driver": "uvc_lepton",
    "keySpecs": {
      "resolution": "160x120",
      "radiometric": true,
      "fovDeg": 57,
      "frameRateHz": 8.7,
      "neTdMk": 50
    },
    "notes": "Radiometric output is the reason this is the reference rather than a cheaper array: every pixel carries an absolute temperature, which turns a thermal track into an energy measurement the discriminator can reason about. The flat-field shutter fires every few minutes and blanks the stream for roughly half a second; the firmware marks those windows invalid rather than letting them register as a detection. Export-controlled in some jurisdictions, and the 8.7 Hz frame rate is a deliberate export-compliance limit, not a technical one.",
    "alternatives": [
      "lwir-mlx90640"
    ],
    "candidateAlternatives": [
      "lwir-boson640"
    ],
    "electrical": {
      "idleW": 0.65,
      "activeW": 0.95,
      "rail": "USB",
      "pins": [
        {
          "signal": "USB 2.0",
          "pin": "USB-A"
        }
      ]
    },
    "mechanical": {
      "widthMm": 30,
      "depthMm": 30,
      "heightMm": 12,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate PureThermal carrier footprint.",
      "plugsInto": "usb3a"
    },
    "poweredBy": "usb-hub-powered"
  },
  {
    "id": "lwir-mlx90640",
    "category": "imager",
    "band": "lwir",
    "vendor": "Melexis",
    "model": "MLX90640 32x24 thermal array",
    "status": "verified",
    "tiers": [
      "t1"
    ],
    "priceUsd": 74.95,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.adafruit.com/product/4407",
    "interface": "i2c",
    "driver": "mlx90640",
    "keySpecs": {
      "resolution": "32x24",
      "radiometric": true,
      "fovDeg": 110,
      "frameRateHz": 16,
      "accuracyC": 2
    },
    "notes": "The honest budget thermal option and a fully supported variant, not a downgrade to be apologised for. At 768 pixels it cannot image a shape, but it can absolutely register that something warm crossed the field, and that is enough to make a coincidence trigger with the optical channel. The discriminator knows the difference: detections from this part are scored for thermal presence and never for thermal morphology. This is the variant registry working as intended.",
    "alternatives": [
      "lwir-lepton35"
    ],
    "electrical": {
      "idleW": 0.02,
      "activeW": 0.09,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "9"
        },
        {
          "signal": "SDA",
          "pin": "3"
        },
        {
          "signal": "SCL",
          "pin": "5"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 25,
      "heightMm": 9,
      "mount": "enclosure-wall",
      "dimensionsSourced": false,
      "note": "Points at the sky through a germanium window. Mounted at the enclosure wall.",
      "detail": [
        {
          "id": "pcb",
          "label": "MLX90640 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "lens",
          "label": "thermal lens",
          "cx": 0.5,
          "cy": 0.55,
          "w": 9,
          "d": 9,
          "h": 6.5,
          "colour": "#8a8f98",
          "base": 1.2,
          "round": true
        }
      ]
    }
  },
  {
    "id": "uv-as7331",
    "category": "photometer",
    "band": "uv",
    "vendor": "ams OSRAM",
    "model": "AS7331 UVA/UVB/UVC sensor",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 24.95,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.sparkfun.com/products/23517",
    "interface": "i2c",
    "driver": "as7331",
    "keySpecs": {
      "channels": "UVA 320-400nm, UVB 280-320nm, UVC 200-280nm",
      "irradianceRange": "nW/cm2 to mW/cm2"
    },
    "notes": "Three separate UV channels rather than a single index, which is what makes the part useful for discrimination instead of merely for sun exposure. A corona discharge, a lightning leader, and direct sunlight have distinguishable ratios across the three. Needs a fused-silica or PTFE diffuser window; ordinary acrylic blocks UVB and UVC entirely and will silently turn this into a one-channel sensor.",
    "alternatives": [],
    "candidateAlternatives": [
      "uv-ltr390"
    ],
    "electrical": {
      "idleW": 0.002,
      "activeW": 0.01,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "9"
        },
        {
          "signal": "SDA",
          "pin": "3"
        },
        {
          "signal": "SCL",
          "pin": "5"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 18,
      "heightMm": 5,
      "mount": "enclosure-wall",
      "dimensionsSourced": false,
      "note": "Needs sky view through its own gasketed window. Mounted at the enclosure wall.",
      "detail": [
        {
          "id": "pcb",
          "label": "AS7331 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "AS7331",
          "cx": 0.5,
          "cy": 0.55,
          "w": 3,
          "d": 3,
          "h": 0.9,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "radar-ld2450",
    "category": "radar",
    "band": "mmw",
    "vendor": "Hi-Link",
    "model": "LD2450 24 GHz tracking radar",
    "status": "reference",
    "tiers": [
      "t2"
    ],
    "priceUsd": 14.5,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.aliexpress.com/w/wholesale-hlk-ld2450.html",
    "interface": "uart",
    "driver": "ld2450",
    "keySpecs": {
      "frequencyGhz": 24,
      "rangeM": 8,
      "targets": 3,
      "outputs": "x, y, speed per target"
    },
    "notes": "Sets an honest expectation: an eight metre range makes this a calibration and near-field instrument, not a sky radar. It earns its place by being the cheapest way to get a true range and radial velocity into the schema at all, which lets a builder exercise and validate the entire radar path before deciding whether to spend forty times more on a module that can actually reach altitude. Do not present a tier 2 node as radar-covered for aerial targets. Wiring note: this needs a second UART. Physical pins 16 and 18 (GPIO23/24) have no UART alternate function and were wrong; GPIO14/15 are the console and /dev/ttyAMA0 belongs to the GNSS receiver, whose pulse-per-second discipline is the one thing a node cannot afford to lose. Add 'dtoverlay=uart4' to /boot/firmware/config.txt and wire to GPIO12/13 on physical pins 32 and 33, which appear as /dev/ttyAMA4.",
    "alternatives": [
      "radar-iwr6843"
    ],
    "candidateAlternatives": [
      "radar-cdm324"
    ],
    "electrical": {
      "idleW": 0.32,
      "activeW": 0.44,
      "rail": "5V",
      "pins": [
        {
          "signal": "5V",
          "pin": "4"
        },
        {
          "signal": "GND",
          "pin": "14"
        },
        {
          "signal": "TX",
          "pin": "33"
        },
        {
          "signal": "RX",
          "pin": "32"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": true,
      "logicVoltageNote": "Runs from 5 V but its UART is 3.3 V TTL, which is why it can face the Pi directly. This is a property of the module, not of its rail, and it is recorded because the distinction is invisible otherwise: a 5 V-supplied module with 5 V logic on the same pins would damage the Pi's GPIO, and nothing in this registry could previously say which of the two it was."
    },
    "mechanical": {
      "widthMm": 35,
      "depthMm": 25,
      "heightMm": 6,
      "mount": "carrier",
      "dimensionsSourced": false,
      "note": "Approximate module footprint.",
      "detail": [
        {
          "id": "pcb",
          "label": "LD2450 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "LD2450",
          "cx": 0.5,
          "cy": 0.55,
          "w": 14,
          "d": 10,
          "h": 1.6,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "radar-iwr6843",
    "category": "radar",
    "band": "mmw",
    "vendor": "Texas Instruments",
    "model": "IWR6843ISK 60 GHz mmWave",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 299,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.ti.com/tool/IWR6843ISK",
    "interface": "usb",
    "driver": "ti_mmwave",
    "keySpecs": {
      "frequencyGhz": "60-64",
      "rangeM": 250,
      "output": "range-Doppler point cloud",
      "antennas": "4 Rx, 3 Tx"
    },
    "notes": "The first part in the stack that produces a genuine three-dimensional point cloud with per-point Doppler. Range to a few hundred metres for a drone-sized cross-section under good conditions, far less in rain. Every site develops a fixed clutter map from buildings and terrain within the first hour; that map is learned, stored per node, and subtracted before anything is called a detection.",
    "alternatives": [
      "radar-ld2450"
    ],
    "electrical": {
      "idleW": 1.8,
      "activeW": 3.6,
      "rail": "USB",
      "pins": [
        {
          "signal": "USB",
          "pin": "USB-A"
        }
      ]
    },
    "mechanical": {
      "widthMm": 55,
      "depthMm": 55,
      "heightMm": 16,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate evaluation-module footprint.",
      "plugsInto": "usb2a"
    },
    "poweredBy": "usb-hub-powered"
  },
  {
    "id": "mag-rm3100",
    "category": "magnetometer",
    "band": "elf_vlf",
    "vendor": "PNI Sensor",
    "model": "RM3100 3-axis geomagnetic sensor",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 39.95,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.sparkfun.com/products/23088",
    "interface": "spi",
    "driver": "rm3100",
    "keySpecs": {
      "resolutionNt": 13,
      "noiseNt": 15,
      "sampleRateHz": 440,
      "rangeUt": 800
    },
    "notes": "Magneto-inductive rather than Hall-effect, which is why it reaches tens of nanotesla instead of hundreds. Mount it at least two metres from the node's own electronics and from any of the active-emission hardware, on a non-ferrous mast section. In practice the dominant signal at most sites is the operator walking past with a phone, and learning that local signature is part of commissioning rather than a nuisance.",
    "alternatives": [],
    "candidateAlternatives": [
      "mag-qmc5883l",
      "mag-fgm3"
    ],
    "electrical": {
      "idleW": 0.004,
      "activeW": 0.03,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "25"
        },
        {
          "signal": "MOSI",
          "pin": "19"
        },
        {
          "signal": "MISO",
          "pin": "21"
        },
        {
          "signal": "SCLK",
          "pin": "23"
        },
        {
          "signal": "CS",
          "pin": "24"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 25,
      "heightMm": 5,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate breakout footprint. Mounts remote from the node on a non-ferrous mast section. Mounted remote from the node, not on the carrier: its own siting requirement is at least two metres from the node's electronics on a non-ferrous mast section, and an assembly that drew it bolted to the board contradicted the part's own note on screen.",
      "detail": [
        {
          "id": "pcb",
          "label": "RM3100 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "RM3100",
          "cx": 0.5,
          "cy": 0.55,
          "w": 6,
          "d": 6,
          "h": 2.4,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "mic-ics43434",
    "category": "acoustic",
    "band": "acoustic",
    "vendor": "TDK InvenSense",
    "model": "ICS-43434 I2S MEMS microphone",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 12.5,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.adafruit.com/product/3421",
    "interface": "i2s",
    "driver": "i2s_mems",
    "keySpecs": {
      "snrDb": 65,
      "responseHz": "50-20000",
      "bitDepth": 24
    },
    "notes": "Digital output straight to the Pi's I2S peripheral, which keeps the analogue path short and avoids the ground-loop noise that plagues USB audio interfaces on a solar-powered mast. Rolls off below 50 Hz, so this covers audible acoustics only. Infrasound needs a dedicated differential pressure sensor and a mechanical wind filter, which is a tier 3 addition.",
    "alternatives": [],
    "candidateAlternatives": [
      "mic-sph0645",
      "mic-infrabsu"
    ],
    "electrical": {
      "idleW": 0.002,
      "activeW": 0.005,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "20"
        },
        {
          "signal": "BCLK",
          "pin": "12"
        },
        {
          "signal": "LRCL",
          "pin": "35"
        },
        {
          "signal": "DOUT",
          "pin": "38"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 20,
      "depthMm": 15,
      "heightMm": 4,
      "mount": "enclosure-wall",
      "dimensionsSourced": false,
      "note": "Needs acoustic access to outside air through a vented, water-shedding port.",
      "detail": [
        {
          "id": "pcb",
          "label": "ICS-43434 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "ICS-43434",
          "cx": 0.5,
          "cy": 0.55,
          "w": 3.5,
          "d": 2.6,
          "h": 1,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "gamma-csi-sipm",
    "category": "radiation",
    "band": "gamma",
    "vendor": "OpenGammaDetector",
    "model": "CsI(Tl) + SiPM open gamma spectrometer",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 189,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://github.com/OpenGammaProject/Open-Gamma-Detector",
    "interface": "usb",
    "driver": "open_gamma",
    "keySpecs": {
      "crystal": "CsI(Tl) 10x10x30 mm",
      "energyRangeKev": "30-1500",
      "resolutionPctAt662": 9,
      "backgroundCps": "20-60"
    },
    "notes": "Open hardware, fully documented, and the only practical route to a real energy spectrum rather than a bare count rate at this price. A spectrum is what separates a cosmic-ray shower from an isotope line, and it lets the node characterise its own radiological background properly rather than reporting an unattributed count rate. Earlier text here justified it partly as the readback for the aggregated americium lure; that module has been withdrawn (see the safety page on 10 CFR 30.15) and this part stands on its own merits as a passive instrument.",
    "alternatives": [],
    "candidateAlternatives": [
      "gamma-gm-tube"
    ],
    "electrical": {
      "idleW": 0.28,
      "activeW": 0.35,
      "rail": "USB",
      "pins": [
        {
          "signal": "USB",
          "pin": "USB-A"
        }
      ]
    },
    "mechanical": {
      "widthMm": 70,
      "depthMm": 40,
      "heightMm": 22,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate; the CsI crystal sets the depth.",
      "plugsInto": "usb2a"
    },
    "poweredBy": "usb-hub-powered"
  },
  {
    "id": "swir-ingaas640",
    "category": "imager",
    "band": "swir",
    "vendor": "various",
    "model": "InGaAs 640x512 SWIR module",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 2400,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.alliedvision.com/en/camera-selector/",
    "interface": "usb3",
    "driver": "genicam_swir",
    "keySpecs": {
      "resolution": "640x512",
      "spectralRangeUm": "0.9-1.7",
      "frameRateHz": 30
    },
    "notes": "The single largest line item in any tier and the reason tier 3 exists as a category. It buys haze penetration and material discrimination that no other band provides, and it exploits night-sky airglow to illuminate targets passively at 1.5 to 1.7 micrometres with no emitter at all. Export-controlled in most jurisdictions; check ITAR and EAR status before shipping across a border. Most builders should skip this and put the money into a second complete node instead, which buys geometry, and geometry beats spectral coverage.",
    "alternatives": [],
    "electrical": {
      "idleW": 3.2,
      "activeW": 5.5,
      "rail": "USB3",
      "pins": [
        {
          "signal": "USB 3.0",
          "pin": "USB-A"
        }
      ]
    },
    "mechanical": {
      "widthMm": 60,
      "depthMm": 60,
      "heightMm": 75,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate camera body with lens.",
      "plugsInto": "usb3a"
    },
    "poweredBy": "usb-hub-powered"
  },
  {
    "id": "seis-sm24",
    "category": "seismic",
    "band": "seismic",
    "vendor": "ION / Sercel",
    "model": "SM-24 geophone element",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 89,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.sparkfun.com/products/11744",
    "interface": "analog",
    "driver": null,
    "keySpecs": {
      "naturalFrequencyHz": 10,
      "sensitivityVPerMPerS": 28.8
    },
    "notes": "A 10 Hz element does not reach the infrasound band and is not a substitute for a broadband seismometer. Its role at tier 3 is ground-coupled acoustic detection of low overflights and, more importantly, characterising the site's vibration background, which is the prerequisite for ever siting a gravimeter there. Electrically it is a coil moving in a magnetic field: two wires, tens of millivolts, no supply and no digital interface. It reaches the node through the ADS1256.",
    "alternatives": [],
    "candidateAlternatives": [
      "seis-trillium",
      "seis-raspberryshake"
    ],
    "electrical": {
      "idleW": 0.05,
      "activeW": 0.08,
      "rail": "3V3",
      "pins": [
        {
          "signal": "SIG+",
          "pin": "ADC-AIN0"
        },
        {
          "signal": "SIG-",
          "pin": "ADC-AIN1"
        }
      ]
    },
    "mechanical": {
      "widthMm": 32,
      "depthMm": 32,
      "heightMm": 35,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate: SM-24 geophone body, cylindrical, buried or ground-coupled.",
      "detail": [
        {
          "id": "body",
          "label": "geophone can",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 33,
          "colour": "#4a4f56",
          "fill": true,
          "round": true
        },
        {
          "id": "spike",
          "label": "ground spike",
          "cx": 0.5,
          "cy": 0.5,
          "w": 6,
          "d": 6,
          "h": 10,
          "colour": "#6b7078",
          "base": -10,
          "round": true
        }
      ]
    },
    "connectsTo": "adc-ads1256"
  },
  {
    "id": "sem-ir-beacon",
    "category": "emitter",
    "band": "nir",
    "vendor": "generic",
    "model": "850 nm pulsed IR beacon, 5 W peak",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 34,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.digikey.com/",
    "interface": "gpio+pwm",
    "driver": "sem_beacon",
    "restricted": true,
    "keySpecs": {
      "wavelengthNm": 850,
      "peakPowerW": 5,
      "prfHz": 10000,
      "dutyCycle": "randomised"
    },
    "notes": "Optional, tier 3 only. LED rather than laser, which changes which standard applies (IEC 62471 photobiological, not the IEC 60825 laser classes) rather than making it inherently safe: a 5 W peak infrared emitter is not automatically exempt at close range. The randomised duty cycle is what makes it identifiable in the archive: the node knows its own emission schedule exactly, so any near-infrared return correlating with the code is self-illumination and is subtracted rather than reported. Point it above head height, never at a road or a flight path, and read /safety before fitting it.",
    "electrical": {
      "idleW": 0.01,
      "activeW": 1.6,
      "rail": "5V",
      "pins": [
        {
          "signal": "5V",
          "pin": "2"
        },
        {
          "signal": "GND",
          "pin": "30"
        },
        {
          "signal": "GATE",
          "pin": "16"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "Gate is driven from a 3.3 V GPIO. The emitter itself runs from 5 V; the gate does not.",
      "peakW": 5,
      "peakNote": "A 5 W pulsed emitter at a 5 percent duty cycle averages 1.6 W once its drive losses are counted, and the power budget correctly used the average. The rail does not see an average. It sees 1 A pulses arriving through one 5 V header pin, and the Raspberry Pi budgets roughly 1.5 A across all of its 5 V pins for everything. Sizing the reservoir for the average would sag the rail on every pulse, which browns out whatever else shares it. A 220 uF electrolytic sits at the emitter itself: at a 200 microsecond gate the 1 A pulse pulls about 9 mV out of it, which the rail never sees. Without it the same charge comes down the header pin and everything else on 5 V sees the sag.",
      "localReservoirUf": 220
    },
    "mechanical": {
      "widthMm": 30,
      "depthMm": 20,
      "heightMm": 12,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate. Mounted remote from the node, on the mast and pointing above the horizon. It is an emitter and belongs where it can be aimed, not sitting on the carrier among the receivers it would otherwise illuminate.",
      "detail": [
        {
          "id": "pcb",
          "label": "beacon board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "led",
          "label": "850 nm emitter",
          "cx": 0.5,
          "cy": 0.5,
          "w": 6,
          "d": 6,
          "h": 4.5,
          "colour": "#5a1f1f",
          "base": 1.2,
          "round": true
        }
      ]
    }
  },
  {
    "id": "case-pelican1500",
    "category": "enclosure",
    "band": null,
    "vendor": "Pelican",
    "model": "1500 case with breather vent and feedthroughs",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 179,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.pelican.com/us/en/product/cases/protector/1500",
    "interface": "none",
    "driver": null,
    "keySpecs": {
      "ipRating": "IP67",
      "internalMm": "430x290x155"
    },
    "notes": "Sealed enclosures trap moisture rather than excluding it: the air inside is humid when you close the lid, and the first cold night condenses it onto the coldest surface, which is always the optics. A Gore breather vent plus reusable desiccant solves this. Every optical port needs its own gasketed window rather than a hole, and germanium for the LWIR port because glass is opaque at 10 micrometres. Carries tier 2 and tier 3 alike: packed, tier 3's contents take about a third of the interior floor and the tallest part is half the interior height.",
    "electrical": {
      "idleW": 0,
      "activeW": 0,
      "rail": "none",
      "pins": []
    },
    "mechanical": {
      "widthMm": 434,
      "depthMm": 332,
      "heightMm": 157,
      "mount": "enclosure",
      "dimensionsSourced": true,
      "note": "Pelican 1500 published dimensions. Exterior 434 x 332 x 157 mm, interior 425 x 284 x 155 mm. The interior is the figure that answers whether a node fits.",
      "interiorWidthMm": 425,
      "interiorDepthMm": 284,
      "interiorHeightMm": 155
    }
  },
  {
    "id": "power-solar-150w",
    "category": "power",
    "band": null,
    "vendor": "generic",
    "model": "120 W panel + 30 A MPPT + 180 Ah LiFePO4",
    "status": "reference",
    "tiers": [
      "t2"
    ],
    "priceUsd": 589,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.amazon.com/",
    "interface": "none",
    "driver": null,
    "keySpecs": {
      "panelW": 120,
      "batteryWh": 2160,
      "autonomyDays": 3
    },
    "notes": "Sized against the summed draw of the tier 2 parts list, 12.8 W continuous or 307 Wh per day, rather than against a round number. Assumptions: four peak-sun-hours, 35 percent margin, LiFePO4 at 50 percent usable depth of discharge, three days of autonomy. A panel too small for the node it ships with strands a remote build, which is why the drift check recomputes this from the parts rather than trusting the label.",
    "electrical": {
      "idleW": 0,
      "activeW": 0,
      "rail": "none",
      "pins": []
    },
    "mechanical": {
      "widthMm": 1480,
      "depthMm": 670,
      "heightMm": 35,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate 120 W panel; the MPPT and battery are separate bodies not modelled."
    },
    "powerChain": [
      {
        "id": "panel",
        "label": "120 W panel",
        "detail": "4 peak-sun-hours assumed",
        "outV": 18,
        "outW": 120
      },
      {
        "id": "mppt",
        "label": "30 A MPPT controller",
        "detail": "tracks panel Vmp against battery state",
        "outV": 14.4,
        "outW": 115
      },
      {
        "id": "battery",
        "label": "180 Ah LiFePO4",
        "detail": "2160 Wh, 50 percent usable, 3 days autonomy",
        "outV": 12.8,
        "outW": null
      },
      {
        "id": "rail",
        "label": "5 V regulator",
        "detail": "feeds the Pi and the header rails",
        "outV": 5,
        "outW": 75
      }
    ]
  },
  {
    "id": "power-solar-200w",
    "category": "power",
    "band": null,
    "vendor": "generic",
    "model": "220 W array + 40 A MPPT + 300 Ah LiFePO4",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 1140,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.amazon.com/",
    "interface": "none",
    "driver": null,
    "keySpecs": {
      "panelW": 220,
      "batteryWh": 3840,
      "autonomyDays": 3
    },
    "notes": "Tier 3 draws 24.6 W continuous, 591 Wh per day, which is 92 percent more than tier 2. The short-wave infrared imager and the wideband receiver account for most of the difference. Same assumptions as the tier 2 kit: four peak-sun-hours, 35 percent margin, LiFePO4 at 50 percent usable depth of discharge, three days of autonomy.",
    "electrical": {
      "idleW": 0,
      "activeW": 0,
      "rail": "none",
      "pins": []
    },
    "mechanical": {
      "widthMm": 1620,
      "depthMm": 700,
      "heightMm": 35,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate 220 W array; the MPPT and battery are separate bodies not modelled."
    },
    "powerChain": [
      {
        "id": "panel",
        "label": "220 W array",
        "detail": "4 peak-sun-hours assumed",
        "outV": 18,
        "outW": 220
      },
      {
        "id": "mppt",
        "label": "40 A MPPT controller",
        "detail": "tracks panel Vmp against battery state",
        "outV": 14.4,
        "outW": 210
      },
      {
        "id": "battery",
        "label": "300 Ah LiFePO4",
        "detail": "3840 Wh, 50 percent usable, 3 days autonomy",
        "outV": 12.8,
        "outW": null
      },
      {
        "id": "rail",
        "label": "5 V regulator",
        "detail": "feeds the Pi and the header rails",
        "outV": 5,
        "outW": 120
      }
    ]
  },
  {
    "id": "usb-hub-powered",
    "category": "power",
    "band": null,
    "vendor": "generic",
    "model": "4-port USB 3.0 hub with 5 V 4 A external supply",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 38,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.amazon.com/s?k=powered+usb+3.0+hub+4+port+external+power",
    "interface": "usb",
    "driver": null,
    "keySpecs": {
      "ports": 4,
      "supplyA": 4,
      "perPortA": 0.9
    },
    "alternatives": [],
    "candidateAlternatives": [],
    "electrical": {
      "idleW": 0.5,
      "activeW": 0.5,
      "rail": "12V",
      "pins": [
        {
          "signal": "USB",
          "pin": "USB-A"
        }
      ]
    },
    "notes": "Not optional on tier 3. That tier lists five bus-powered peripherals drawing 12.3 W between them, 2.46 A at 5 V, against a Raspberry Pi 5 that budgets 1.6 A across all USB ports even with a 5 A supply, and has four ports for five devices. Plugged in directly, the short-wave infrared imager and the millimetre-wave radar alone exceed the budget, and the failure mode is not a clean refusal: the Pi brown-outs peripherals under load, so channels drop out intermittently under exactly the conditions that matter. Put the two highest-draw devices on the hub at minimum.",
    "mechanical": {
      "widthMm": 100,
      "depthMm": 42,
      "heightMm": 22,
      "mount": "usb",
      "dimensionsSourced": false,
      "note": "Approximate 4-port hub body.",
      "plugsInto": "usb3a",
      "detail": [
        {
          "id": "body",
          "label": "hub body",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 18,
          "colour": "#2a2d33",
          "fill": true
        },
        {
          "id": "ports",
          "label": "4 x USB-A",
          "cx": 0.5,
          "cy": 0.92,
          "w": 56,
          "d": 4,
          "h": 11,
          "colour": "#2f4f8f",
          "base": 3
        }
      ]
    }
  },
  {
    "id": "psu-usbc-27w",
    "category": "power",
    "band": null,
    "vendor": "Raspberry Pi",
    "model": "27 W USB-C power supply",
    "status": "reference",
    "tiers": [
      "t1"
    ],
    "priceUsd": 12.95,
    "priceAsOf": "2026-07-29",
    "sourceUrl": "https://www.pishop.us/product/raspberry-pi-27w-usb-c-power-supply-black-us/",
    "interface": "none",
    "driver": null,
    "keySpecs": {
      "outputV": 5.1,
      "outputA": 5,
      "outputW": 27,
      "connector": "USB-C PD"
    },
    "powerChain": [
      {
        "id": "mains",
        "label": "Mains",
        "detail": "no autonomy: the node stops when the grid does",
        "outV": null,
        "outW": null
      },
      {
        "id": "psu",
        "label": "27 W USB-C supply",
        "detail": "5 A PD profile, negotiated not assumed",
        "outV": 5.1,
        "outW": 27
      }
    ],
    "alternatives": [],
    "candidateAlternatives": [],
    "electrical": {
      "idleW": 0,
      "activeW": 0,
      "rail": "none",
      "pins": []
    },
    "notes": "Tier 1 is mains powered and this is what powers it. The Pi 5 negotiates 5 A over USB-C Power Delivery and falls back to 3 A on a supply that cannot offer it, which silently caps the current available to USB peripherals at 600 mA. A node that runs for weeks and then drops a channel under load is usually a node on a phone charger. Tiers 2 and 3 do not list this part because their 5 V rail comes off the solar regulator.",
    "mechanical": {
      "widthMm": 45,
      "depthMm": 45,
      "heightMm": 30,
      "mount": "external",
      "dimensionsSourced": false,
      "note": "Approximate wall-plug body. Lives outside the enclosure.",
      "detail": [
        {
          "id": "body",
          "label": "supply body",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 30,
          "colour": "#1c1f24",
          "fill": true
        }
      ]
    }
  },
  {
    "id": "storage-microsd-64gb",
    "category": "storage",
    "band": null,
    "vendor": "SanDisk",
    "model": "High Endurance microSDXC 64 GB",
    "status": "reference",
    "tiers": [
      "t1",
      "t2",
      "t3"
    ],
    "priceUsd": 34.95,
    "priceAsOf": "2026-07-29",
    "sourceUrl": "https://www.pishop.us/product/sandisk-64gb-high-endurance-microsdxc-card/",
    "interface": "none",
    "driver": null,
    "keySpecs": {
      "capacityGb": 64,
      "speedClass": "Class 10 U1",
      "endurance": "rated for continuous recording"
    },
    "alternatives": [],
    "candidateAlternatives": [],
    "electrical": {
      "idleW": 0,
      "activeW": 0,
      "rail": "3V3",
      "pins": []
    },
    "notes": "Endurance rated rather than speed rated, which is the opposite of the usual advice and is deliberate. A node writes its spool continuously for years and never launches an application, so the A2 random-IOPS class that sells consumer cards buys nothing here while the write endurance that wears them out buys everything. A card that fails takes the local spool with it, which is the only copy of anything the grid has not yet acknowledged. 64 GB is far more than the spool needs; the smaller cards in this range are not cheaper by enough to matter.",
    "mechanical": {
      "widthMm": 15,
      "depthMm": 11,
      "heightMm": 1,
      "mount": "host-slot",
      "dimensionsSourced": true,
      "note": "microSD form factor, 15 x 11 x 1 mm. Sits in the Pi's card slot.",
      "plugsInto": "sd"
    }
  },
  {
    "id": "adc-ads1256",
    "category": "seismic",
    "band": "seismic",
    "vendor": "generic",
    "model": "ADS1256 24-bit delta-sigma ADC board",
    "status": "reference",
    "tiers": [
      "t3"
    ],
    "priceUsd": 28,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.aliexpress.com/w/wholesale-ads1256-module.html",
    "interface": "spi",
    "driver": "geophone_ads1256",
    "keySpecs": {
      "bits": 24,
      "channels": 8,
      "maxSps": 30000,
      "pgaMax": 64
    },
    "notes": "Not optional: the geophone is an analogue element and cannot reach the node without it. Twenty-four bits and a programmable gain up to 64 are what make a 28.8 V/(m/s) coil readable at the amplitudes that matter, which are microvolts. The differential input pair also rejects the common-mode noise picked up over a multi-metre cable run to a ground-coupled element, which a single-ended input would not.",
    "alternatives": [],
    "candidateAlternatives": [],
    "electrical": {
      "idleW": 0.03,
      "activeW": 0.05,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "39"
        },
        {
          "signal": "MOSI",
          "pin": "19"
        },
        {
          "signal": "MISO",
          "pin": "21"
        },
        {
          "signal": "SCLK",
          "pin": "23"
        },
        {
          "signal": "CS",
          "pin": "26"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 55,
      "depthMm": 35,
      "heightMm": 12,
      "mount": "carrier",
      "dimensionsSourced": false,
      "note": "Board-mounted alongside the carrier.",
      "detail": [
        {
          "id": "pcb",
          "label": "ADS1256 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "ADS1256",
          "cx": 0.5,
          "cy": 0.55,
          "w": 11,
          "d": 11,
          "h": 1.5,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    }
  },
  {
    "id": "pwr-ina226",
    "category": "power",
    "band": "env",
    "vendor": "Texas Instruments / generic breakout",
    "model": "INA226 bidirectional current and power monitor",
    "status": "reference",
    "tiers": [
      "t2",
      "t3"
    ],
    "priceUsd": 12,
    "priceAsOf": "2026-07-27",
    "sourceUrl": "https://www.adafruit.com/product/5832",
    "interface": "i2c",
    "driver": "ina226_monitor",
    "keySpecs": {
      "shuntMilliohm": 2,
      "busVoltageMax": 36,
      "resolutionUv": 2.5
    },
    "notes": "Node power draw is telemetry rather than an accessory, and this is the part that produces it. A node that cannot see its own consumption cannot distinguish a flat battery from a failed sensor, and on an off-grid mast that is the difference between a diagnosable outage and a site visit. Mounts where the supply enters the enclosure, with its shunt in series with the feed it measures.",
    "alternatives": [],
    "candidateAlternatives": [],
    "electrical": {
      "idleW": 0.01,
      "activeW": 0.02,
      "rail": "3V3",
      "pins": [
        {
          "signal": "3V3",
          "pin": "17"
        },
        {
          "signal": "GND",
          "pin": "9"
        },
        {
          "signal": "SDA",
          "pin": "3"
        },
        {
          "signal": "SCL",
          "pin": "5"
        }
      ],
      "logicVoltage": 3.3,
      "logicVoltageSourced": false,
      "logicVoltageNote": "3.3 V logic, the Pi's GPIO domain."
    },
    "mechanical": {
      "widthMm": 25,
      "depthMm": 18,
      "heightMm": 5,
      "mount": "enclosure-wall",
      "dimensionsSourced": false,
      "note": "Mounted where the supply enters the enclosure, not on the carrier. Its shunt has to sit in series with the feed it is measuring, so putting the board in the middle of the stack would mean running the full node current up to the carrier and back down again.",
      "detail": [
        {
          "id": "pcb",
          "label": "INA226 board",
          "x": 0,
          "y": 0,
          "w": null,
          "d": null,
          "h": 1.2,
          "colour": "#1f5f3a",
          "fill": true
        },
        {
          "id": "pkg",
          "label": "INA226",
          "cx": 0.5,
          "cy": 0.55,
          "w": 3,
          "d": 3,
          "h": 1,
          "colour": "#2a2d33",
          "base": 1.2
        },
        {
          "id": "hdr",
          "label": "header",
          "cx": 0.5,
          "cy": 0.12,
          "w": null,
          "wFrac": 0.7,
          "d": 2.4,
          "h": 3,
          "colour": "#1c1f24",
          "base": 1.2
        }
      ]
    },
    "measuresBetween": [
      "battery",
      "rail"
    ]
  }
] as unknown as readonly Part[]
export const PRICES_AS_OF = '2026-07-27' as const
export const PRICE_NOTE = "Silicon pricing through 2026 is being distorted by LPDDR4 and DRAM supply being redirected to AI datacentre demand. Raspberry Pi board prices have risen in three separate rounds since December 2025 and are now 80 to 150 percent above original MSRP depending on memory size. Treat every figure here as a snapshot, not a quote. The tier budgets are held stable by moving down the memory ladder rather than by pretending prices did not move." as const

export function partsForTier(tier: Tier): Part[] {
  return PARTS.filter((p) => p.tiers?.includes(tier))
}

export function tierCost(tier: Tier): number {
  return partsForTier(tier).reduce((sum, p) => sum + p.priceUsd, 0)
}

/** Continuous draw for a tier, in watts. Active is the realistic figure:
 *  a node samples continuously, so idle is only reached between captures. */
export function tierPower(tier: Tier): { idleW: number; activeW: number } {
  return partsForTier(tier).reduce(
    (a, p) => ({
      idleW: a.idleW + (p.electrical?.idleW ?? 0),
      activeW: a.activeW + (p.electrical?.activeW ?? 0),
    }),
    { idleW: 0, activeW: 0 },
  )
}
