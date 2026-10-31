// The one damage pipeline: every way a brick can lose hp goes through here, so
// kills, coins, XP and on-death effects are counted exactly once.
import { modsOf, xpToNext } from './boosts'
import { randomInt } from '@forge/core/rng'
import { CELL, COLS, COMBO_TIERS, DANGER_ROW } from './config'
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
  source: DamageSource,
  depth = 0,
): void {
  if (!s.bricks.includes(brick)) return // already destroyed earlier in this chain
  // Armour shrugs off plain ball hits; fire, explosions, lightning and lasers get through.
  brick.hp -= brick.kind === 'armored' && source === 'ball' ? Math.min(amount, 1) : amount
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

export function killBrick(s: RunState, brick: Brick, depth: number): void {
  const i = s.bricks.indexOf(brick)
  if (i < 0) return
  s.bricks.splice(i, 1)
  const mods = modsOf(s.boosts)
  const coins = Math.max(1, Math.round(comboMultiplier(s.combo) * mods.coinMult)) + mods.midas
  s.coins += brick.kind === 'gold' ? coins * 5 : coins
  gainXp(s, mods.xpMult)
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'kill', id: brick.id, x, y, maxHp: brick.maxHp, kind: brick.kind })
  onDeath(s, brick, depth)
  if (mods.aftershock) {
    const near = s.bricks.filter((b) => Math.abs(b.col - brick.col) + Math.abs(b.row - brick.row) === 1)
    for (const b of near) damageBrick(s, b, 1 * mods.damageMult, 'blast', depth + 1)
  }
}

const MYSTERY_REWARDS = ['balls', 'pick', 'coins', 'fire'] as const

/** What special bricks do when destroyed. */
function onDeath(s: RunState, brick: Brick, depth: number): void {
  const { x, y } = cellCenter(brick.col, brick.row)
  switch (brick.kind) {
    case 'bomb':
      explode(s, brick.col, brick.row, 0.5 * brick.maxHp, depth)
      return
    case 'lightning': {
      const row = s.bricks.filter((b) => b.row === brick.row)
      for (const b of row) {
        const t = cellCenter(b.col, b.row)
        s.events.push({ type: 'zap', x1: x, y1: y, x2: t.x, y2: t.y, depth })
        damageBrick(s, b, 0.25 * s.turn, 'zap', depth + 1)
      }
      return
    }
    case 'mystery': {
      const reward = MYSTERY_REWARDS[randomInt(s.rng, MYSTERY_REWARDS.length)]
      if (reward === 'balls') s.pendingBalls += 3
      else if (reward === 'pick') s.pendingPicks++
      else if (reward === 'coins') s.coins += 50
      else s.fireCharges += 3
      s.events.push({ type: 'mystery', x, y, reward })
      return
    }
    case 'splitter': {
      if (brick.split) return
      const hp = Math.ceil(brick.maxHp / 2)
      const cells = [
        [brick.col - 1, brick.row],
        [brick.col + 1, brick.row],
        [brick.col, brick.row - 1],
        [brick.col, brick.row + 1],
      ].filter(
        ([c, r]) =>
          c >= 0 && c < COLS && r >= 0 && r < DANGER_ROW && !s.bricks.some((b) => b.col === c && b.row === r),
      )
      for (const [col, row] of cells.slice(0, 2)) {
        s.bricks.push({ id: s.nextId++, col, row, hp, maxHp: hp, kind: 'normal', split: true })
      }
      return
    }
  }
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
