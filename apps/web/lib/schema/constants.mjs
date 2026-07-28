// GENERATED FILE - DO NOT EDIT.
// Source: schema/bands.json, schema/spec.json, schema/hardware.json
// Regenerate with: yarn codegen
// Platform version: 0.1.0  Schema version: 0.1.0


export const PLATFORM_VERSION = '0.1.0'
export const SCHEMA_VERSION = '0.1.0'

export const HYPOTHESES = [
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
]

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
}

export const BAND_IDS = [
  "gamma",
  "uv",
  "vis",
  "nir",
  "swir",
  "lwir",
  "mmw",
  "rf",
  "elf_vlf",
  "acoustic",
  "seismic",
  "grav",
  "env",
  "nav"
]
