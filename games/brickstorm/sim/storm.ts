// Storm turns: deep into a run, a special wave arrives every so often, so long
// runs keep surprising. Every wave brings a heart, so it is a chance to heal too.
import { randomInt } from '@forge/core/rng'
import type { RunState, StormKind } from './types'

/** First storm turn. */
export const STORM_FROM = 45
/** From here storms come twice as often. */
export const STORM_FAST_FROM = 150
export const STORM_KINDS: readonly StormKind[] = ['wall', 'iron', 'gold', 'bombs']

/** True on a storm turn: 45, 75, 105, 135… then every 15 turns from 150 (never on a boss or jackpot turn). */
export function isStormTurn(turn: number): boolean {
  if (turn < STORM_FROM) return false
  return turn % 30 === 15 || (turn >= STORM_FAST_FROM && turn % 30 === 5)
}

/** Turns the new row (row 0) into a storm wave. Call right after the row spawns. */
export function stormWave(s: RunState): void {
  const kind = STORM_KINDS[randomInt(s.rng, STORM_KINDS.length)]
  const row = s.bricks.filter((b) => b.row === 0 && b.kind !== 'boss')
  const hp = Math.max(1, ...row.map((b) => b.maxHp))
  if (kind === 'wall') {
    // Every column gets a brick, except one kept for the heart.
    const taken = new Set([...s.bricks.filter((b) => b.row === 0).map((b) => b.col)])
    s.pickups = s.pickups.filter((p) => p.row !== 0)
    const empty = Array.from({ length: s.cols }, (_, c) => c).filter((c) => !taken.has(c))
    for (const col of empty.slice(1))
      s.bricks.push({ id: s.nextId++, col, row: 0, hp, maxHp: hp, kind: 'normal', split: false })
  } else {
    const to = kind === 'iron' ? 'armored' : kind === 'gold' ? 'gold' : 'bomb'
    for (const b of row) {
      b.kind = to
      // Armour takes 1 damage per ball hit: cap its health so a volley can still break it.
      if (to === 'armored') b.hp = b.maxHp = Math.min(b.maxHp, Math.max(3, s.ballCount))
    }
  }
  // The heart takes a free cell, or the place of a lesser pickup (a ball pickup goes last).
  const open = Array.from({ length: s.cols }, (_, c) => c).filter(
    (c) => !s.bricks.some((b) => b.row === 0 && b.col === c),
  )
  const at = (c: number) => s.pickups.find((p) => p.row === 0 && p.col === c)
  const col = open.find((c) => !at(c)) ?? open.find((c) => at(c)?.kind !== 'ball') ?? open[0]
  if (col !== undefined) {
    s.pickups = s.pickups.filter((p) => p !== at(col))
    s.pickups.push({ id: s.nextId++, col, row: 0, kind: 'heart' })
  }
  s.events.push({ type: 'storm', kind })
}
