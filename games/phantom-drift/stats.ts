// Numbers shown to the player: speed, distance, time and the run summary.
// One sim depth unit counts as one metre.

import type { SummaryRow } from '@forge/app'
import type { Params } from '@forge/core/i18n'
import { TICK_RATE, type DriftState } from './sim'

/** Speed in km/h from depth units per second. */
export const kmh = (unitsPerSecond: number) => Math.round(unitsPerSecond * 3.6)

export function distanceText(metres: number): string {
  if (metres < 1000) return `${Math.floor(metres)} m`
  const km = metres / 1000
  return `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`
}

export function timeText(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type T = (en: string, params?: Params) => string

/**
 * Stat grid for the results screen: six cells, a tidy 3 × 2 on any screen.
 * Score and best are already in the headline, so they're not repeated here.
 */
export function summaryRows(s: DriftState, t: T): SummaryRow[] {
  return [
    { label: t('Distance'), value: distanceText(s.diedDist ?? s.dist) },
    { label: t('Time'), value: timeText(s.diedAt ?? s.tick) },
    { label: t('Top speed'), value: `${kmh(s.stats.topSpeed)} km/h` },
    { label: t('Wisps'), value: String(s.stats.wisps) },
    { label: t('Near misses'), value: String(s.stats.nearMisses), highlight: s.stats.nearMisses >= 10 },
    { label: t('Best combo'), value: String(s.stats.bestCombo), highlight: s.stats.bestCombo >= 25 },
  ]
}
