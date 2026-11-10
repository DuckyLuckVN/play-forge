// Results text (pure): the final score, stat rows, the end-of-match headline and the top-bar chips.
import type { Outcome, Scoreline, SummaryRow } from '@forge'
import { teamName } from './doubles'
import { t } from './i18n'
import { winner } from './rules'
import { shownName, type SpState } from './sim'

/** The final score from `selfId`'s side (side 0 first for spectators), e.g. "11–7". */
export function scoreText(s: SpState, selfId: string): string {
  const me = s.players.find((p) => p.id === selfId)
  const [a, b] = me?.side === 1 ? [s.score[1], s.score[0]] : s.score
  return `${a}–${b}`
}

/** Final score, longest rally, Perfect hits (yours / your team's; both sides' for a spectator). */
export function summaryRows(s: SpState, selfId: string): SummaryRow[] {
  const me = s.players.find((p) => p.id === selfId)
  const { longest, perfect } = s.stats
  const doubles = s.players.length > 2
  return [
    { label: t('Final score'), value: scoreText(s, selfId) },
    {
      label: t('Longest rally'),
      value: longest === 1 ? t('{n} shot', { n: longest }) : t('{n} shots', { n: longest }),
    },
    me
      ? {
          label: doubles ? t("Your team's Perfect hits") : t('Your Perfect hits'),
          value: String(perfect[me.side]),
        }
      : { label: t('Perfect hits'), value: `${perfect[0]}–${perfect[1]}` },
  ]
}

/** The results headline from `selfId`'s view (a spectator: the winner's name). */
export function outcomeOf(s: SpState, selfId: string): Outcome {
  const score = scoreText(s, selfId)
  const me = s.players.find((p) => p.id === selfId)
  const side = s.winner === 1 ? 1 : 0
  if (s.players.length > 2) {
    // 2v2 never ends early (the computer takes a leaver's seat).
    const team = s.players.filter((p) => p.side === side)
    const names = teamName(team, shownName)
    // One name or "the computer" reads singular, not "Computer win".
    const allAi = team.every((p) => p.kind === 'ai')
    if (!me)
      return {
        headline: allAi ? t('{name} wins!', { name: names }) : t('{names} win!', { names }),
        result: 'done',
      }
    if (me.side === side) return { headline: t('Your team wins {score}!', { score }), result: 'win' }
    if (allAi) return { headline: t('The computer wins {score}. Rematch?', { score }), result: 'lose' }
    return { headline: t('{names} win {score}.', { names, score }), result: 'lose' }
  }
  const won = s.players[side]
  if (!me) return { headline: t('{name} wins!', { name: shownName(won) }), result: 'done' }
  if (won === me) {
    // Over without a winning score: removePlayer ended it because the other side left.
    if (winner(s.score) === null) return { headline: t('Your opponent left. You win!'), result: 'win' }
    return { headline: t('You win {score}!', { score }), result: 'win' }
  }
  if (won.kind === 'ai')
    return { headline: t('The computer wins {score}. Rematch?', { score }), result: 'lose' }
  return { headline: t('{name} wins {score}.', { name: shownName(won), score }), result: 'lose' }
}

/**
 * Top-bar chips, side 0 first. Every human gets one (lobby name, their side's score). A computer gets
 * one only on a side with no human (one chip for the pair in 2v2), so a 2v2 bar reads "Ann 3 · Computer 5"
 * instead of three "Computer" chips. Its colour slot is its seat (1v1: 1) and its avatar the robot.
 */
export function scoreChips(s: SpState): Scoreline[] {
  const chips: Scoreline[] = []
  for (const side of [0, 1] as const) {
    const team = s.players.filter((p) => p.side === side)
    const humans = team.filter((p) => p.kind === 'human')
    for (const p of humans) chips.push({ id: p.id, score: s.score[side], name: p.name })
    if (humans.length > 0 || team.length === 0) continue
    const ai = team[0]
    chips.push({
      id: ai.id,
      score: s.score[side],
      name: shownName(ai),
      slot: s.players.indexOf(ai),
      avatar: 'robot',
    })
  }
  return chips
}
