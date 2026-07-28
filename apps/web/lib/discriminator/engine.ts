import { evaluate as evaluateCore, DISCRIMINATOR_VERSION } from './core.mjs'
import type { Classification, Corroboration } from '../schema/generated'

/**
 * Typed surface over the plain-JS scoring core.
 *
 * The logic lives in core.mjs so that the parity check can run it under bare
 * node and hold it to the Python engine. This file only adds types.
 */

export type CatalogState = 'match' | 'clean' | 'unavailable' | 'eclipsed'
export type CatalogId = 'adsb' | 'tle' | 'lightning' | 'rfi' | 'weather'

export interface ObservationInput {
  bands: string[]
  clock: 'gnss_pps' | 'gnss_nopps' | 'ntp' | 'freerun'
  nodeCount: number
  rangeM: number | null
  durationS: number
  peakZ: number
  angularRateDps?: number | null
  catalogs: Record<CatalogId, CatalogState>
}

export interface ScoredHypothesis {
  id: string
  label: string
  prior: number
  likelihood: number
  posterior: number
  reasons: string[]
}

export interface VerdictResult {
  classification: Classification
  anomalyScore: number
  corroboration: Corroboration
  hypotheses: ScoredHypothesis[]
  unavailableCatalogs: CatalogId[]
  explanation: string
  discriminatorVersion: string
  schemaVersion: string
}

export function evaluate(o: ObservationInput): VerdictResult {
  return evaluateCore(o) as VerdictResult
}

export { DISCRIMINATOR_VERSION }
