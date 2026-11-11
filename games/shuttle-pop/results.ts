// Results text (pure): the final score, the end-of-match headline, the top-bar chips and the leaderboard.
import type { Leaderboard, Outcome, Scoreline } from '@forge'
import { teamName } from './doubles'
import { t } from './i18n'
import { PRESETS } from './presets'
import { winner } from './rules'
import { tintCss } from './scoreboard'
import { tallyOf, tallyScore } from './tally'
import { shownName, type SpState } from './sim'

/** The final score from `selfId`'s side (side 0 first for spectators), e.g. "11–7". */
export function scoreText(s: SpState, selfId: string): string {
  const me = s.players.find((p) => p.id === selfId)
  const [a, b] = me?.side === 1 ? [s.score[1], s.score[0]] : s.score
  return `${a}–${b}`
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

/** "Longest rally: 9 shots" (singular for 1). */
const longestText = (n: number): string =>
  `${t('Longest rally')}: ${n === 1 ? t('{n} shot', { n }) : t('{n} shots', { n })}`

/**
 * The results leaderboard: the winning side first, each side by its players' tally (tally.ts tallyScore),
 * stat columns, MVP on the best tally (none when nobody scored anything), you marked, the longest rally
 * under it.
 */
export function leaderboardOf(s: SpState, selfId: string): Leaderboard {
  const won = s.winner === 1 ? 1 : 0
  const ranked = s.players
    .map((p) => ({ p, tally: tallyOf(s.stats, p.id) }))
    .sort(
      (a, b) =>
        Number(b.p.side === won) - Number(a.p.side === won) || tallyScore(b.tally) - tallyScore(a.tally),
    )
  const best = Math.max(0, ...ranked.map((r) => tallyScore(r.tally)))
  const mvp = best > 0 ? ranked.find((r) => tallyScore(r.tally) === best)?.p.id : undefined
  return {
    columns: [t('Points'), t('Perfect'), t('Smashes'), t('Dive saves'), t('Bonks')],
    rows: ranked.map(({ p, tally }) => ({
      id: p.id,
      name: shownName(p),
      values: [tally.winners, tally.perfect, tally.smashes, tally.saves, tally.bonks].map(String),
      color: tintCss(PRESETS[p.preset]?.tint ?? PRESETS[p.side].tint),
      ...(p.id === mvp ? { badge: t('MVP') } : {}),
      ...(p.id === selfId ? { self: true } : {}),
    })),
    note: longestText(s.stats.longest),
  }
}
