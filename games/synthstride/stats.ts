// Numbers shown to the player: survival time and the run summary.
import type { SummaryRow } from '@forge/app'
import type { Params } from '@forge/core/i18n'
import { TICK_RATE, type StrideState } from './sim'

export function timeText(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

type T = (en: string, params?: Params) => string

/** Six cells for the results screen (score and best are in the headline). */
export function summaryRows(s: StrideState, t: T): SummaryRow[] {
  return [
    { label: t('Time'), value: timeText(s.diedAt ?? s.tick) },
    { label: t('Top tempo'), value: `${s.stats.topBpm} BPM` },
    { label: t('Perfect steps'), value: String(s.stats.perfects), highlight: s.stats.perfects >= 100 },
    { label: t('Notes'), value: String(s.stats.notes) },
    { label: t('Dodges'), value: String(s.stats.dodges), highlight: s.stats.dodges >= 30 },
    { label: t('Best groove'), value: String(s.vitals.bestCombo), highlight: s.vitals.bestCombo >= 32 },
  ]
}
