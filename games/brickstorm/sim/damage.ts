// The one damage pipeline: every way a brick can lose hp goes through here, so
// kills, coins, XP and on-death effects are counted exactly once.
import { runMods, xpToNext, type Mods } from './boosts'
import { random, randomInt } from '@forge/core/rng'
import { CELL, COMBO_TIERS, KILL_XP, XP_COMBO_TIERS, XP_PER_BRICK } from './config'
import { dims } from './dims'
import { bigHit, bossRoleHit, bossRoleKill, damageBoss } from './boss'
import type { BossHit } from './boss-skills'
import { heroOnKill } from './health'
import { cellCenter } from './rows'
import type { Brick, RunState } from './types'

export type DamageSource = 'ball' | 'fire' | 'bomb' | 'blast' | 'zap' | 'laser'

/** Up to this many balls a combo counts in full; past it, milestones slowly need more hits. */
export const COMBO_BALLS = 30

/**
 * The combo as it counts for rewards and fever. With a huge late volley,
 * milestones need more hits, but gently (square root): 2× the hits at 120
 * balls, 3× at 270. So combos stay easy to get and fun, without every late
 * volley sitting at the top tier.
 */
export function comboPower(s: Pick<RunState, 'combo' | 'ballCount'>): number {
  return s.combo / Math.sqrt(Math.max(1, s.ballCount / COMBO_BALLS))
}

export function comboMultiplier(combo: number): number {
  return COMBO_TIERS.find(([min]) => combo >= min)![1]
}

export function xpComboMultiplier(combo: number): number {
  return XP_COMBO_TIERS.find(([min]) => combo >= min)![1]
}

/** XP for `base` points of work, scaled by the combo and Brain. */
function earnXp(s: RunState, base: number): void {
  if (base > 0) gainXp(s, base * xpComboMultiplier(comboPower(s)) * runMods(s).xpMult)
}

export function damageBrick(
  s: RunState,
  brick: Brick,
  amount: number,
  source: DamageSource,
  depth = 0,
  hit: Omit<BossHit, 'source'> = {},
): void {
  if (!s.bricks.includes(brick)) return // already destroyed earlier in this chain
  if (brick.kind === 'boss') {
    // A boss pays no XP per hit, only when it falls (see damageBoss).
    return damageBoss(s, amount, source, { ...hit, col: brick.col, at: cellCenter(brick.col, brick.row) })
  }
  if (brick.role === 'ice') return // a boss's ice wall melts on its own
  if (brick.kind === 'water' && source === 'zap') return // water shrugs off lightning
  // Armour shrugs off plain ball hits; fire, explosions, lightning and lasers get through.
  const before = brick.hp
  brick.hp -= brick.kind === 'armored' && source === 'ball' ? Math.min(amount, 1) : amount
  // XP for the share of the brick knocked off; overkill earns nothing. A bonus round's ghost pays none.
  if (!brick.ghost) earnXp(s, (XP_PER_BRICK * (before - Math.max(0, brick.hp))) / brick.maxHp)
  if (brick.role) bossRoleHit(s, brick, amount, source, hit.face)
  if (brick.hp <= 0) killBrick(s, brick, depth)
}

export function gainXp(s: RunState, amount: number): void {
  s.xp += amount
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level)
    s.level++
    // The skill point comes with its orb, once a ball collects it (see scatterOrbs).
    s.orbsDue = (s.orbsDue ?? 0) + 1
    s.events.push({ type: 'levelUp' })
  }
}

export function killBrick(s: RunState, brick: Brick, depth: number): void {
  const i = s.bricks.indexOf(brick)
  if (i < 0) return
  if (brick.kind === 'boss') return bigHit(s)
  s.bricks.splice(i, 1)
  if (brick.role) bossRoleKill(s, brick)
  const mods = runMods(s)
  if (brick.ghost) {
    // A bonus round's ghost: it just breaks (Aftershock still spreads), no coins, XP or kill.
    const { x, y } = cellCenter(brick.col, brick.row)
    s.events.push({ type: 'kill', id: brick.id, x, y, maxHp: brick.maxHp, kind: brick.kind, coins: 0 })
    return aftershock(s, brick, depth, mods)
  }
  // Only some bricks drop a coin; gold always pays, triple.
  const base = Math.max(1, Math.round(comboMultiplier(comboPower(s)) * mods.coinMult))
  let coins = mods.midas
  if (brick.kind === 'gold') coins += base * 2
  else if (random(s.rng) < COIN_DROP) coins += base
  s.coins += coins
  earnXp(s, KILL_XP)
  heroOnKill(s, brick)
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'kill', id: brick.id, x, y, maxHp: brick.maxHp, kind: brick.kind, coins })
  onDeath(s, brick, depth)
  aftershock(s, brick, depth, mods)
}

/** Aftershock: a destroyed brick hurts its 4 neighbours. */
function aftershock(s: RunState, brick: Brick, depth: number, mods: Mods): void {
  if (!mods.aftershock) return
  const near = oncePerBoss(
    s.bricks.filter((b) => Math.abs(b.col - brick.col) + Math.abs(b.row - brick.row) === 1),
  )
  for (const b of near) damageBrick(s, b, mods.aftershock * mods.damageMult, 'blast', depth + 1)
}

/** Share of ordinary bricks that drop a coin. */
const COIN_DROP = 0.22

const MYSTERY_REWARDS = ['balls', 'pick', 'coins', 'fire'] as const

/** What special bricks do when destroyed. */
function onDeath(s: RunState, brick: Brick, depth: number): void {
  const { x, y } = cellCenter(brick.col, brick.row)
  switch (brick.kind) {
    case 'bomb':
      s.events.push({ type: 'special', kind: 'bomb', x, y, trigger: true })
      explode(s, brick.col, brick.row, 0.5 * brick.maxHp, depth)
      return
    case 'lightning': {
      s.events.push({ type: 'special', kind: 'lightning', x, y, trigger: true })
      const row = oncePerBoss(s.bricks.filter((b) => b.row === brick.row && b.kind !== 'water'))
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
      else if (reward === 'pick')
        s.pendingPicks++ // the ball already touched it: no orb
      else if (reward === 'coins') s.coins += 50
      else s.fireCharges += 3
      s.events.push({ type: 'mystery', x, y, reward })
      return
    }
    case 'splitter': {
      if (brick.split) return
      s.events.push({ type: 'special', kind: 'splitter', x, y, trigger: true })
      const hp = Math.ceil(brick.maxHp / 2)
      const cells = [
        [brick.col - 1, brick.row],
        [brick.col + 1, brick.row],
        [brick.col, brick.row - 1],
        [brick.col, brick.row + 1],
      ].filter(
        ([c, r]) =>
          c >= 0 &&
          c < s.cols &&
          r >= 0 &&
          r < dims(s).dangerRow &&
          !s.bricks.some((b) => b.col === c && b.row === r),
      )
      for (const [col, row] of cells.slice(0, 2)) {
        s.bricks.push({ id: s.nextId++, col, row, hp, maxHp: hp, kind: 'normal', split: true })
      }
      return
    }
  }
}

/**
 * The bricks an area effect hits, with the boss counted once: its parts share
 * one health pool, so a blast over several parts must not hit it several times.
 */
export function oncePerBoss<T extends Brick>(bricks: readonly T[]): T[] {
  let boss = false
  return bricks.filter((b) => b.kind !== 'boss' || (!boss && (boss = true)))
}

/** Damages every brick in the 3×3 around a cell (the boss once). */
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
  const hit = oncePerBoss(s.bricks.filter((b) => Math.abs(b.col - col) <= 1 && Math.abs(b.row - row) <= 1))
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
    .filter((b) => (b.col !== from.col || b.row !== from.row) && b.kind !== 'water')
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
