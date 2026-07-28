// Discriminator scoring, in plain JavaScript.
//
// Deliberately not TypeScript. This module is imported by the website bundle
// AND by tools/check-parity.mjs running under bare `node`, which is what keeps
// the browser port honest against the Python engine. A .ts file would need a
// transpile step in the parity check, and a regex-based strip of TypeScript is
// exactly the kind of fragile machinery that eventually passes a check it
// should have failed.
//
// Python (discriminator/nband_discriminator/engine.py) is authoritative.
// Change scoring there first, regenerate the fixtures, then mirror it here.

import { HYPOTHESES, THRESHOLDS, SCHEMA_VERSION } from '../schema/constants.mjs'

/**
 * Browser port of the discriminator.
 *
 * This exists for one reason: the interactive playground has to score a verdict
 * client-side as you move the controls, and the real engine is Python. Two
 * implementations of the same logic is exactly the drift this project is built
 * to prevent, so the Python engine is authoritative and this port is held to it
 * by a conformance check.
 *
 * `discriminator/fixtures/cases.json` defines the cases, `tools/gen-fixtures.py`
 * runs them through the real engine to produce `expected.json`, and
 * `tools/check-parity.mjs` runs them through this file and fails the build on
 * any disagreement in classification, score, corroboration, or hypothesis
 * ordering. If you change scoring in engine.py, regenerate the fixtures and
 * mirror the change here or CI will stop you.
 */

export const DISCRIMINATOR_VERSION = '0.1.0'
const UNRESOLVED_FLOOR = THRESHOLDS.anomalyScoreUnresolvedFloor
const MIN_BANDS_FOR_UNRESOLVED = THRESHOLDS.minBandsForUnresolved
const CONVENTIONAL_FIT_FLOOR = 0.4

/** Mirrors CatalogResult.explains: available, matched, and score >= 0.6. */
function explains(state) {
  return state === 'match'
}

function likelihoods(
  o,
) {
  const out = {}
  const bands = new Set(o.bands)
  const nBands = bands.size
  const dur = o.durationS
  const rate = o.angularRateDps ?? null
  const c = o.catalogs

  // Aircraft
  {
    const r = []
    let lk = 0.25
    if (explains(c.adsb)) {
      lk = 0.98
      r.push('ADS-B match to a4f81c at 0.2° separation')
    } else if (c.adsb === 'clean') {
      lk = 0.03
      r.push('ADS-B was reachable and reported no aircraft on this bearing')
    } else {
      lk = 0.3
      r.push('ADS-B unavailable, so an aircraft cannot be ruled out')
    }
    if (bands.has('acoustic') && bands.has('vis')) {
      lk *= 1.4
      r.push('acoustic and optical both present, typical of a powered aircraft')
    }
    out.aircraft = { lk: Math.min(lk, 1), reasons: r }
  }

  // Satellite
  {
    const r = []
    let lk = 0.12
    if (explains(c.tle)) {
      lk = 0.96
      r.push('illuminated pass of NORAD 25544 within 0.1°')
    } else if (c.tle === 'clean') {
      lk = 0.04
      r.push('no catalogued satellite pass on this bearing')
    }
    if (bands.has('acoustic')) {
      lk *= 0.02
      r.push('satellites are silent; an acoustic component argues strongly against')
    }
    if (bands.has('lwir') && bands.has('mmw')) {
      lk *= 0.1
      r.push('radar return at this range is inconsistent with orbital altitude')
    }
    out.satellite = { lk: Math.min(lk, 1), reasons: r }
  }

  // Bird or insect
  {
    const r = []
    let lk = 0.2
    if (rate !== null && rate > 12) {
      lk = 0.55
      r.push(`high angular rate (${rate.toFixed(1)}°/s) is typical of something close and small`)
    }
    if (bands.has('lwir')) {
      lk *= 1.3
      r.push('weak thermal signature consistent with a small animal')
    }
    if (bands.has('rf')) {
      lk *= 0.05
      r.push('birds and insects do not transmit')
    }
    if (dur > 30) {
      lk *= 0.3
      r.push(`${dur.toFixed(0)} s persistence is long for a close-range animal`)
    }
    if (o.rangeM !== null && o.rangeM > 400) {
      lk *= 0.03
      r.push(`radar range of ${o.rangeM.toFixed(0)} m is far beyond bird or insect detectability`)
    }
    out.bird_insect = { lk: Math.min(lk, 1), reasons: r }
  }

  // Meteor
  {
    const r = []
    let lk = 0.02
    if (dur < 3 && bands.has('vis')) {
      lk = 0.4
      r.push(`short optical event (${dur.toFixed(1)} s) is meteor-like`)
      if (rate !== null && rate > 20) {
        lk = 0.7
        r.push('very high angular rate supports a meteor')
      }
    }
    if (dur > 5) {
      lk = 0.005
      r.push('far too long for a meteor')
    }
    if (bands.has('acoustic') || bands.has('rf')) {
      lk *= 0.2
      r.push('acoustic or RF content is unusual for a meteor at this scale')
    }
    if (bands.has('mmw') && o.rangeM !== null && o.rangeM < 5000) {
      lk *= 0.02
      r.push('a radar return inside 5 km is inconsistent with meteor altitude')
    }
    out.meteor = { lk: Math.min(lk, 1), reasons: r }
  }

  // Balloon or debris
  {
    const r = []
    let lk = 0.06
    if (rate !== null && rate < 0.5 && dur > 60) {
      lk = 0.45
      r.push('very slow and persistent, consistent with a drifting object')
    }
    out.balloon_debris = { lk: Math.min(lk, 1), reasons: r }
  }

  // Small uncrewed aircraft
  {
    const r = []
    let lk = 0.1
    if (bands.has('acoustic') && bands.has('vis') && (rate === null || rate < 15)) {
      lk = 0.35
      r.push('audible and optically tracked at moderate rate, typical of a small drone')
    }
    if (bands.has('rf')) {
      lk *= 1.8
      r.push('RF present, consistent with a control or video downlink')
    }
    if (explains(c.adsb)) {
      lk *= 0.1
      r.push('an ADS-B match makes a small uncrewed aircraft unlikely')
    }
    out.drone = { lk: Math.min(lk, 1), reasons: r }
  }

  // Atmospheric or optical effect
  {
    const r = []
    let lk = 0.05
    if (explains(c.lightning)) {
      lk = 0.9
      r.push('lightning fix at 41 km, Δt 0.2 s')
    }
    out.atmospheric = { lk: Math.min(lk, 1), reasons: r }
  }

  // Instrumental
  {
    const r = []
    let lk = 0.08
    if (nBands === 1) {
      lk = 0.35
      r.push('single-band event; instrument artefacts are single-band by nature')
    }
    if (explains(c.rfi)) {
      lk = 0.8
      r.push("matches the site's learned RFI signature 'site-sig'")
    }
    if (o.peakZ > 30) {
      lk *= 1.5
      r.push(`excursion of ${o.peakZ.toFixed(0)} sigma is more typical of a fault than a source`)
    }
    if (nBands >= 3) {
      lk *= 0.05
      r.push('three independent bands agreeing is very hard to produce with one fault')
    }
    out.instrument = { lk: Math.min(lk, 1), reasons: r }
  }

  // Unmodelled
  {
    const r = []
    let lk = 0.02
    if (nBands >= MIN_BANDS_FOR_UNRESOLVED) {
      const anyExplained = (Object.values(c)).some(explains)
      if (!anyExplained) {
        lk = 0.5
        r.push(`${nBands} bands agreed and no catalogue explained it`)
      }
    }
    if (o.nodeCount > 1) {
      lk *= 1.6
      r.push(`witnessed independently by ${o.nodeCount} nodes`)
    }
    if (o.rangeM !== null) {
      lk *= 1.3
      r.push('a measured range makes the kinematics checkable rather than assumed')
    }
    out.unmodelled = { lk: Math.min(lk, 1), reasons: r }
  }

  return out
}

// The site's own learned interference fingerprint is derived from the node's
// history rather than fetched from a service, so unlike the other four it can
// never be unreachable. The Python engine reflects this by construction
// (RfiBaselineCatalog takes no provider); the port has to mirror it or the two
// disagree about how many catalogues were actually consulted.
const ALWAYS_AVAILABLE = new Set(['rfi'])

export function evaluate(o) {
  const unavailable = (Object.keys(o.catalogs))
    .filter((k) => o.catalogs[k] === 'unavailable' && !ALWAYS_AVAILABLE.has(k))
    .sort()

  const lk = likelihoods(o)

  const scored = HYPOTHESES.map((h) => {
    const entry = lk[h.id] ?? { lk: 0.05, reasons: [] }
    return {
      id: h.id,
      label: h.label,
      prior: h.prior,
      likelihood: entry.lk,
      posterior: 0,
      reasons: entry.reasons,
    }
  })

  const evidence = scored.reduce((a, h) => a + h.prior * h.likelihood, 0)
  for (const h of scored) {
    h.posterior = evidence <= 0 ? h.prior : (h.prior * h.likelihood) / evidence
  }
  scored.sort((a, b) => b.posterior - a.posterior)

  const corroboration =
    o.nodeCount > 1 ? 'multi_node' : new Set(o.bands).size > 1 ? 'multi_channel' : 'single_channel'

  const bestConventional = scored
    .filter((h) => h.id !== 'unmodelled')
    .reduce((a, h) => (h.posterior > a.posterior ? h : a))

  // --- score ---
  let anomaly = (1 - bestConventional.posterior) * 100
  if (corroboration === 'multi_node') anomaly *= 1.35
  else if (corroboration === 'multi_channel') anomaly *= 1.1
  if ((Object.values(o.catalogs)).some(explains)) anomaly *= 0.15
  if (o.clock !== 'gnss_pps') anomaly = Math.min(anomaly, 45)
  anomaly = Math.max(0, Math.min(100, anomaly))

  // --- classification ---
  const anyExplaining = (Object.values(o.catalogs)).some(explains)
  let classification

  if (
    anyExplaining &&
    (bestConventional.id === 'aircraft' || bestConventional.id === 'satellite') &&
    bestConventional.posterior > 0.5
  ) {
    classification = 'terrestrial_known'
  } else if (bestConventional.id === 'atmospheric' && anyExplaining) {
    classification = 'terrestrial_known'
  } else if (
    bestConventional.id === 'instrument' &&
    bestConventional.posterior > CONVENTIONAL_FIT_FLOOR
  ) {
    classification = 'instrumental'
  } else if (bestConventional.posterior >= CONVENTIONAL_FIT_FLOOR) {
    classification = bestConventional.id === 'instrument' ? 'instrumental' : 'terrestrial_likely'
  } else if (new Set(o.bands).size < MIN_BANDS_FOR_UNRESOLVED) {
    classification = 'ambiguous'
  } else if (corroboration === 'single_channel') {
    classification = 'ambiguous'
  } else if (unavailable.length > 0) {
    classification = 'ambiguous'
  } else if (o.clock !== 'gnss_pps') {
    classification = 'ambiguous'
  } else if (anomaly < UNRESOLVED_FLOOR) {
    classification = 'ambiguous'
  } else {
    classification = 'anomalous_unresolved'
  }

  // --- explanation ---
  const parts = []
  const bandList = [...new Set(o.bands)].sort().join(', ')
  parts.push(
    `Event spanned ${o.durationS.toFixed(1)} s across ${new Set(o.bands).size} band(s) (${bandList}), ` +
      `corroboration ${corroboration.replace('_', ' ')}, clock ${o.clock}.`,
  )
  const checked = (Object.keys(o.catalogs)).filter(
    (k) => o.catalogs[k] !== 'unavailable' || ALWAYS_AVAILABLE.has(k),
  )
  parts.push(`Checked ${checked.length} of ${Object.keys(o.catalogs).length} catalogues.`)
  for (const k of Object.keys(o.catalogs)) {
    if (o.catalogs[k] === 'match') parts.push(`${k.toUpperCase()} explained it.`)
    else if (o.catalogs[k] === 'clean' || ALWAYS_AVAILABLE.has(k))
      parts.push(`${k.toUpperCase()} was reachable and found no match.`)
  }
  if (unavailable.length) {
    parts.push(
      `Unavailable at scoring time: ${unavailable.join(', ')}. This is recorded rather than treated ` +
        `as a clean result, and it prevents promotion to the unresolved rung.`,
    )
  }
  parts.push(`Best hypothesis: ${scored[0].label} at posterior ${scored[0].posterior.toFixed(2)}.`)
  if (bestConventional.id !== scored[0].id) {
    parts.push(
      `Best conventional explanation: ${bestConventional.label} at ${bestConventional.posterior.toFixed(2)}.`,
    )
  }
  if (bestConventional.posterior < CONVENTIONAL_FIT_FLOOR) {
    parts.push(`No conventional hypothesis reached the ${CONVENTIONAL_FIT_FLOOR.toFixed(2)} fit floor.`)
  }
  if (scored[0].reasons.length) parts.push('Because ' + scored[0].reasons.join('; ') + '.')
  if (classification === 'anomalous_unresolved') {
    parts.push(
      'Classified unresolved. This states that no catalogue consulted explains the event, not that ' +
        'its cause is known to be unusual.',
    )
  } else if (classification === 'ambiguous') {
    parts.push('Classified ambiguous: the measurement is not good enough to decide.')
  }

  return {
    classification,
    anomalyScore: Math.round(anomaly * 100) / 100,
    corroboration,
    hypotheses: scored,
    unavailableCatalogs: unavailable,
    explanation: parts.join(' '),
    discriminatorVersion: DISCRIMINATOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
  }
}
