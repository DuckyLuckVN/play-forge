// Numbers shown to the player: survival time and the run summary.
import type { SummaryRow } from '@forge/app'
import type { Params } from '@forge/core/i18n'
import { TICK_RATE, type GuardState } from './sim'

export function timeText(ticks: number): string {
  const total = Math.floor(ticks / TICK_RATE)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Share of blocks that were perfect, 0..100. */
export const perfectRate = (s: GuardState) =>
  s.stats.blocks ? Math.round((s.stats.perfects / s.stats.blocks) * 100) : 0

type T = (en: string, params?: Params) => string

/** Six cells for the results screen (score and best are in the headline). */
export function summaryRows(s: GuardState, t: T): SummaryRow[] {
  return [
    { label: t('Time'), value: timeText(s.diedAt ?? s.tick) },
    { label: t('Blocks'), value: String(s.stats.blocks) },
    { label: t('Perfect parries'), value: String(s.stats.perfects), highlight: s.stats.perfects >= 30 },
    { label: t('Perfect rate'), value: `${perfectRate(s)}%`, highlight: perfectRate(s) >= 50 },
    { label: t('Sparks'), value: String(s.stats.sparks) },
    { label: t('Best combo'), value: String(s.vitals.bestCombo), highlight: s.vitals.bestCombo >= 40 },
  ]
}
