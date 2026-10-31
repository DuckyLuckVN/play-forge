// The one damage pipeline: every way a brick can lose hp goes through here, so
// kills, coins, XP and on-death effects are counted exactly once.
import { modsOf, xpToNext } from './boosts'
import { CELL, COMBO_TIERS } from './config'
import { cellCenter } from './rows'
import type { Brick, RunState } from './types'

export type DamageSource = 'ball' | 'fire' | 'bomb' | 'blast' | 'zap' | 'laser'

export function comboMultiplier(combo: number): number {
  return COMBO_TIERS.find(([min]) => combo >= min)![1]
}

export function damageBrick(
  s: RunState,
  brick: Brick,
  amount: number,
  _source: DamageSource,
  depth = 0,
): void {
  if (!s.bricks.includes(brick)) return // already destroyed earlier in this chain
  brick.hp -= amount
  if (brick.hp <= 0) killBrick(s, brick, depth)
}

export function gainXp(s: RunState, amount: number): void {
  s.xp += amount
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level)
    s.level++
    s.pendingPicks++
    s.events.push({ type: 'levelUp' })
  }
}

export function killBrick(s: RunState, brick: Brick, _depth: number): void {
  const i = s.bricks.indexOf(brick)
  if (i < 0) return
  s.bricks.splice(i, 1)
  const mods = modsOf(s.boosts)
  s.coins += Math.max(1, Math.round(comboMultiplier(s.combo) * mods.coinMult))
  gainXp(s, 1)
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'kill', x, y, maxHp: brick.maxHp })
}

/** Damages every brick in the 3×3 around a cell. */
export function explode(
  s: RunState,
  col: number,
  row: number,
  amount: number,
  depth: number,
  source: DamageSource = 'blast',
): void {
  const { x, y } = cellCenter(col, row)
  s.events.push({ type: 'explode', x, y, depth })
  const hit = s.bricks.filter((b) => Math.abs(b.col - col) <= 1 && Math.abs(b.row - row) <= 1)
  for (const b of hit) damageBrick(s, b, amount, source, depth + 1)
}

/** Arcs from a cell to the `count` nearest other bricks. */
export function zap(
  s: RunState,
  from: { col: number; row: number },
  count: number,
  amount: number,
  depth: number,
): void {
  const c = cellCenter(from.col, from.row)
  const targets = s.bricks
    .filter((b) => b.col !== from.col || b.row !== from.row)
    .map((b) => ({ b, d: Math.hypot(b.col - from.col, b.row - from.row) }))
    .filter(({ d }) => d * CELL <= 3 * CELL)
    .sort((a, b) => a.d - b.d || a.b.id - b.b.id)
    .slice(0, count)
  for (const { b } of targets) {
    const t = cellCenter(b.col, b.row)
    s.events.push({ type: 'zap', x1: c.x, y1: c.y, x2: t.x, y2: t.y, depth })
    damageBrick(s, b, amount, 'zap', depth + 1)
  }
}
