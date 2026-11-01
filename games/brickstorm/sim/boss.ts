// Bosses: every BOSS_EVERY turns a 3×2 boss takes the place of the row. Its
// parts are ordinary cells (so balls, bombs, lightning and lasers just work)
// that share one hp pool. While it lives no rows spawn, but it still drops a
// row each turn like any brick, and its traits make each fight different.
import { random, randomInt } from '@forge/core/rng'
import { modsOf } from './boosts'
import { cellCenter, hpCap, hpScale } from './rows'
import type { Boss, BossTrait, Brick, RunState } from './types'
import type { DamageSource } from './damage'

export const BOSS_EVERY = 30
const WIDTH = 3
const HEIGHT = 2
export const BOSS_TRAITS: BossTrait[] = ['shield', 'minions', 'drifter', 'armored', 'enrage']
export const BOSS_NOUNS = ['Golem', 'Titan', 'Colossus', 'Warden', 'Behemoth', 'Hydra'] as const
/** Boss hp: about this many of the run's ball hits, kept between 5 and 12 bricks' worth. */
const HITS_PER_BALL = 10
/** Shield heals this share of max hp each turn. */
const SHIELD_HEAL = 0.08
/** Row Bomb (or anything that would delete a part) takes this share of max hp instead. */
const BIG_HIT = 0.2

export function bossParts(s: RunState): Brick[] {
  return s.bricks.filter((b) => b.kind === 'boss')
}

export function bossHp(s: RunState): number {
  const typical = hpScale(s.turn)
  const firepower = s.ballCount * modsOf(s.boosts).damageMult * HITS_PER_BALL
  return Math.round(Math.max(typical * 5, Math.min(typical * 12, firepower)))
}

/** One or two different traits, from the run's rng. */
export function rollTraits(s: RunState): BossTrait[] {
  const pool = [...BOSS_TRAITS]
  const n = random(s.rng) < 0.5 ? 1 : 2
  return Array.from({ length: n }, () => pool.splice(randomInt(s.rng, pool.length), 1)[0])
}

export function spawnBoss(s: RunState, traits = rollTraits(s)): void {
  const hp = bossHp(s)
  const noun = BOSS_NOUNS[randomInt(s.rng, BOSS_NOUNS.length)]
  const boss: Boss = { hp, maxHp: hp, traits, noun, turn: s.turn, dir: 1 }
  s.boss = boss
  const left = Math.floor((s.cols - WIDTH) / 2)
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      s.bricks.push({ id: s.nextId++, col: left + c, row: r, hp, maxHp: hp, kind: 'boss', split: false })
    }
  }
  s.events.push({ type: 'boss', noun, traits })
}

function center(parts: Brick[]): { x: number; y: number } {
  const a = cellCenter(Math.min(...parts.map((b) => b.col)), Math.min(...parts.map((b) => b.row)))
  const b = cellCenter(Math.max(...parts.map((b) => b.col)), Math.max(...parts.map((b) => b.row)))
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Damage to any part comes off the shared pool; at 0 the boss falls and pays out. */
export function damageBoss(s: RunState, amount: number, source: DamageSource): void {
  const boss = s.boss
  if (!boss) return
  boss.hp -= boss.traits.includes('armored') && source === 'ball' ? amount / 2 : amount
  const parts = bossParts(s)
  if (boss.hp > 0) {
    for (const p of parts) p.hp = boss.hp
    return
  }
  const { x, y } = center(parts)
  s.bricks = s.bricks.filter((b) => b.kind !== 'boss')
  s.boss = null
  const coins = Math.round(10 * s.turn * modsOf(s.boosts).coinMult)
  s.coins += coins
  s.pendingPicks++
  s.events.push({ type: 'bossDown', x, y, coins })
}

/** Something that would delete a part (Row Bomb) hits the whole boss hard instead. */
export function bigHit(s: RunState): void {
  if (s.boss) damageBoss(s, s.boss.maxHp * BIG_HIT, 'blast')
}

/** Moves the boss back to the top rows (revive, Second Wind), crushing what is in the way. */
export function liftBoss(s: RunState): void {
  const parts = bossParts(s)
  if (!parts.length) return
  const top = Math.min(...parts.map((b) => b.row))
  for (const p of parts) p.row -= top
  const cells = new Set(parts.map((p) => `${p.col},${p.row}`))
  s.bricks = s.bricks.filter((b) => b.kind === 'boss' || !cells.has(`${b.col},${b.row}`))
}

/** The boss's turn, at the start of each turn after it arrived. */
export function bossTurn(s: RunState): void {
  const boss = s.boss
  if (!boss) return
  const parts = bossParts(s)
  if (!parts.length) {
    s.boss = null // pushed off the board some other way
    return
  }
  if (boss.traits.includes('shield')) {
    boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * SHIELD_HEAL)
    for (const p of parts) p.hp = boss.hp
  }
  if (boss.traits.includes('enrage') && boss.hp < boss.maxHp / 2) {
    for (const p of parts) p.row++
  }
  if (boss.traits.includes('drifter')) {
    const left = Math.min(...parts.map((b) => b.col))
    const right = Math.max(...parts.map((b) => b.col))
    if ((boss.dir > 0 && right + 1 >= s.cols) || (boss.dir < 0 && left - 1 < 0))
      boss.dir = boss.dir === 1 ? -1 : 1
    for (const p of parts) p.col += boss.dir
    const cells = new Set(parts.map((p) => `${p.col},${p.row}`))
    s.bricks = s.bricks.filter((b) => b.kind === 'boss' || !cells.has(`${b.col},${b.row}`))
  }
  if (boss.traits.includes('minions')) {
    const taken = new Set(s.bricks.filter((b) => b.row === 0).map((b) => b.col))
    const free = [...Array(s.cols).keys()].filter((c) => !taken.has(c))
    const hp = Math.max(1, Math.min(Math.round(hpScale(s.turn) * 0.6), hpCap(s)))
    for (let i = 0; i < 2 && free.length; i++) {
      const col = free.splice(randomInt(s.rng, free.length), 1)[0]
      s.bricks.push({ id: s.nextId++, col, row: 0, hp, maxHp: hp, kind: 'normal', split: false })
    }
  }
}
