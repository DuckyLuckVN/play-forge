// Results screen text (pure): the final score and stat rows, from one player's side.
import type { SummaryRow } from '@forge'
import { t } from './i18n'
import type { SpState } from './sim'

/** The final score from `selfId`'s side (side 0 first for spectators), e.g. "11–7". */
export function scoreText(s: SpState, selfId: string): string {
  const me = s.players.find((p) => p.id === selfId)
  const [a, b] = me?.side === 1 ? [s.score[1], s.score[0]] : s.score
  return `${a}–${b}`
}

/** Final score, longest rally, Perfect hits (yours; both sides' for a spectator). */
export function summaryRows(s: SpState, selfId: string): SummaryRow[] {
  const me = s.players.find((p) => p.id === selfId)
  const { longest, perfect } = s.stats
  return [
    { label: t('Final score'), value: scoreText(s, selfId) },
    {
      label: t('Longest rally'),
      value: longest === 1 ? t('{n} shot', { n: longest }) : t('{n} shots', { n: longest }),
    },
    me
      ? { label: t('Your Perfect hits'), value: String(perfect[me.side]) }
      : { label: t('Perfect hits'), value: `${perfect[0]}–${perfect[1]}` },
  ]
}
