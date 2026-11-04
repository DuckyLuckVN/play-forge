// Numbers shown to the player: survival time and the run summary.
import type { SummaryRow } from '@forge/app'
import type { Params } from '@forge/core/i18n'
import { dancerOf, TICK_RATE, type StrideState } from './sim'

export function timeText(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type T = (en: string, params?: Params) => string

/** Six cells for one player's results (score and rank are in the headline). Empty for spectators. */
export function summaryRows(s: StrideState, t: T, id: string): SummaryRow[] {
  const d = dancerOf(s, id)
  if (!d) return []
  return [
    { label: t('Time'), value: timeText(d.diedAt ?? s.tick) },
    { label: t('Top tempo'), value: `${d.stats.topBpm} BPM` },
    { label: t('Perfect steps'), value: String(d.stats.perfects), highlight: d.stats.perfects >= 100 },
    { label: t('Chains'), value: String(d.stats.chains), highlight: d.stats.chains >= 5 },
    { label: t('Dodges'), value: String(d.stats.dodges), highlight: d.stats.dodges >= 30 },
    { label: t('Best groove'), value: String(d.vitals.bestCombo), highlight: d.vitals.bestCombo >= 32 },
  ]
}
