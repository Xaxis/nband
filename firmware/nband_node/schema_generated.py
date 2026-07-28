# GENERATED FILE - DO NOT EDIT.
# Source: schema/bands.json, schema/spec.json, schema/hardware.json
# Regenerate with: yarn codegen
# Platform version: 0.1.0  Schema version: 0.1.0


from __future__ import annotations

from enum import Enum
from typing import Any, Final

PLATFORM_VERSION: Final[str] = "0.1.0"
SCHEMA_VERSION: Final[str] = "0.1.0"


class Band(str, Enum):
    """Canonical band taxonomy, ordered by increasing wavelength."""
    GAMMA = "gamma"
    UV = "uv"
    VIS = "vis"
    NIR = "nir"
    SWIR = "swir"
    LWIR = "lwir"
    MMW = "mmw"
    RF = "rf"
    ELF_VLF = "elf_vlf"
    ACOUSTIC = "acoustic"
    SEISMIC = "seismic"
    GRAV = "grav"
    ENV = "env"
    NAV = "nav"


BAND_ORDER: Final[tuple[str, ...]] = ("gamma", "uv", "vis", "nir", "swir", "lwir", "mmw", "rf", "elf_vlf", "acoustic", "seismic", "grav", "env", "nav")

BAND_META: Final[dict[str, dict[str, Any]]] = {
    "gamma": {
        "label": "Gamma",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "cps",
        "ordinal": 0
    },
    "uv": {
        "label": "Ultraviolet",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "uW/cm2",
        "ordinal": 1
    },
    "vis": {
        "label": "Visible",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "adu",
        "ordinal": 2
    },
    "nir": {
        "label": "Near infrared",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "adu",
        "ordinal": 3
    },
    "swir": {
        "label": "Short-wave infrared",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "adu",
        "ordinal": 4
    },
    "lwir": {
        "label": "Long-wave infrared",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "K",
        "ordinal": 5
    },
    "mmw": {
        "label": "Millimetre wave",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "m",
        "ordinal": 6
    },
    "rf": {
        "label": "Radio frequency",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "dBm",
        "ordinal": 7
    },
    "elf_vlf": {
        "label": "Magnetic and ELF/VLF",
        "kind": "electromagnetic",
        "role": "detection",
        "unitDefault": "nT",
        "ordinal": 8
    },
    "acoustic": {
        "label": "Acoustic and infrasound",
        "kind": "mechanical",
        "role": "detection",
        "unitDefault": "dBSPL",
        "ordinal": 9
    },
    "seismic": {
        "label": "Seismic",
        "kind": "mechanical",
        "role": "detection",
        "unitDefault": "m/s",
        "ordinal": 10
    },
    "grav": {
        "label": "Gravimetric",
        "kind": "gravitational",
        "role": "detection",
        "unitDefault": "nGal",
        "ordinal": 11
    },
    "env": {
        "label": "Environmental",
        "kind": "context",
        "role": "context",
        "unitDefault": "mixed",
        "ordinal": 12
    },
    "nav": {
        "label": "Navigation and pose",
        "kind": "context",
        "role": "context",
        "unitDefault": "mixed",
        "ordinal": 13
    }
}


class Tier(str, Enum):
    """Build tier. Determines which bands a node is expected to carry, never which bands it may carry. A tier 1 node that adds a thermal camera is still a tier 1 node with an extra channel, and the grid treats its LWIR data identically to a tier 3 node's. budgetUsd is the rounded sum of the tier's actual sourced part prices, checked against the registry by tools/check-drift.mjs, not an aspiration."""
    T1 = "t1"
    T2 = "t2"
    T3 = "t3"
    TR = "tr"

class NodeStatus(str, Enum):
    """Lifecycle state of a node as the grid sees it."""
    PROVISIONING = "provisioning"
    ONLINE = "online"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    RETIRED = "retired"

class ClockQuality(str, Enum):
    """How well a node's clock is disciplined at the moment a sample is taken. Cross-node time-of-arrival correlation is only meaningful at gnss_pps; every downstream calculation is weighted by this value rather than assuming the timestamp is good."""
    GNSS_PPS = "gnss_pps"
    GNSS_NOPPS = "gnss_nopps"
    NTP = "ntp"
    FREERUN = "freerun"

class TriggerReason(str, Enum):
    """Why the node decided a window of data was worth keeping. nband records continuously into a ring buffer and promotes only triggered windows to durable storage, so this field explains the provenance of every stored detection."""
    THRESHOLD = "threshold"
    MOTION = "motion"
    SPECTRAL = "spectral"
    COINCIDENCE = "coincidence"
    CROSS_NODE = "cross_node"
    SCHEDULED = "scheduled"
    MANUAL = "manual"

class Classification(str, Enum):
    """The discriminator's verdict ladder. It is deliberately open at the top: the highest rung is 'unresolved', not 'artificial' or 'non-human'. nband can establish that something was not explained by any catalogue it checked; it cannot establish what that something was, and the schema refuses to encode a claim the instrument cannot support."""
    INSTRUMENTAL = "instrumental"
    TERRESTRIAL_KNOWN = "terrestrial_known"
    TERRESTRIAL_LIKELY = "terrestrial_likely"
    AMBIGUOUS = "ambiguous"
    ANOMALOUS_UNRESOLVED = "anomalous_unresolved"

class Corroboration(str, Enum):
    """How much independent support an event has. Orthogonal to classification: an event can be strongly corroborated and still be a known aircraft."""
    SINGLE_CHANNEL = "single_channel"
    MULTI_CHANNEL = "multi_channel"
    MULTI_NODE = "multi_node"

class ArtifactKind(str, Enum):
    """Binary capture types held in object storage and referenced from detections."""
    IMAGE = "image"
    VIDEO = "video"
    IQ = "iq"
    SPECTROGRAM = "spectrogram"
    AUDIO = "audio"
    POINTCLOUD = "pointcloud"
    SERIES = "series"

class CatalogSource(str, Enum):
    """External catalogues the discriminator subtracts against before an event may be called unresolved. Every check is recorded, including checks that were unavailable, so that a verdict can never quietly benefit from a catalogue that simply failed to load."""
    ADSB = "adsb"
    TLE = "tle"
    LIGHTNING = "lightning"
    RFI = "rfi"
    METEOR = "meteor"
    WEATHER = "weather"
    SOLAR = "solar"
    AIRSPACE = "airspace"

class VariantStatus(str, Enum):
    """Standing of a hardware variant in the community registry."""
    REFERENCE = "reference"
    VERIFIED = "verified"
    SUBMITTED = "submitted"
    UNSUPPORTED = "unsupported"


THRESHOLDS: Final[dict[str, Any]] = {
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

HYPOTHESES: Final[list[dict[str, Any]]] = [
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

# Driver slug for every registered part, keyed by part id. The node agent
# uses this to resolve a configured sensor to a driver implementation.
PART_DRIVERS: Final[dict[str, str | None]] = {
    "pi5-2gb": None,
    "pi5-4gb": None,
    "pi5-8gb": None,
    "gnss-lc29h": "gnss_nmea_pps",
    "cam-hq-imx477": "picamera2_still",
    "cam-noir-imx477": "picamera2_still",
    "sdr-rtl-v3": "soapy_rtlsdr",
    "env-bme688": "bme68x",
    "imu-bno085": "bno08x",
    "lwir-lepton35": "uvc_lepton",
    "lwir-mlx90640": "mlx90640",
    "uv-as7331": "as7331",
    "radar-ld2450": "ld2450",
    "radar-iwr6843": "ti_mmwave",
    "mag-rm3100": "rm3100",
    "mic-ics43434": "i2s_mems",
    "gamma-csi-sipm": "open_gamma",
    "swir-ingaas640": "genicam_swir",
    "seis-sm24": None,
    "sem-ir-beacon": "sem_beacon",
    "case-pelican1500": None,
    "power-solar-150w": None,
    "power-solar-200w": None,
    "usb-hub-powered": None,
    "adc-ads1256": "geophone_ads1256",
    "pwr-ina226": "ina226_monitor"
}
