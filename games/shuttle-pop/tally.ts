// Per-player match stats for the results leaderboard (results.ts leaderboardOf): pure counters kept in
// SpState.stats.by, keyed by player id (optional: states from before it count from zero).
import type { Grade, ShotKind } from './shots'
import type { Strike } from './ability'

export interface Tally {
  /** Points won by this player's shot (the last hit before the rally ended in their side's favour). */
  winners: number
  perfect: number
  smashes: number
  /** Hits made from a dive. */
  saves: number
  bonks: number
}

export interface TallyStats {
  by?: Record<string, Tally>
  /** Id of the player who served or hit last this rally. */
  lastBy?: string
}

const zero = (): Tally => ({ winners: 0, perfect: 0, smashes: 0, saves: 0, bonks: 0 })

/** `id`'s tally (zeros when none yet; never stored by a read). */
export function tallyOf(stats: TallyStats, id: string): Tally {
  return stats.by?.[id] ?? zero()
}

function mine(stats: TallyStats, id: string): Tally {
  stats.by ??= {}
  return (stats.by[id] ??= zero())
}

/** A serve: only who last struck the shuttle. */
export function noteServe(stats: TallyStats, id: string): void {
  stats.lastBy = id
}

/** A hit by `id`. */
export function noteHit(stats: TallyStats, id: string, grade: Grade, kind: ShotKind, act?: Strike): void {
  const t = mine(stats, id)
  if (grade === 'perfect') t.perfect++
  if (kind === 'smash') t.smashes++
  if (act === 'lunge') t.saves++
  stats.lastBy = id
}

/** A point to `side`: a winner for the last striker when it was theirs. */
export function notePoint(
  stats: TallyStats,
  players: readonly { id: string; side: 0 | 1 }[],
  side: 0 | 1,
): void {
  const by = stats.lastBy
  if (by && players.find((p) => p.id === by)?.side === side) mine(stats, by).winners++
  delete stats.lastBy
}

/** A racket bonk by `id`. */
export function noteBonk(stats: TallyStats, id: string): void {
  mine(stats, id).bonks++
}

/** One number to rank teammates / pick the MVP: winners count most, then saves, then the rest. */
export function tallyScore(t: Tally): number {
  return t.winners * 3 + t.saves * 2 + t.perfect + t.smashes
}
