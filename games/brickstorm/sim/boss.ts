// Bosses: every BOSS_EVERY turns a boss takes the place of the row. Its parts
// are ordinary cells (so balls, bombs, lightning and lasers just work) that
// share one hp pool. While it lives no rows spawn, but it still drops a row
// each turn like any brick. Later bosses are bigger and have more skills.
import { random, randomInt } from '@forge/core/rng'
import { modsOf } from './boosts'
import { bossParts, crushUnderBoss } from './boss-kit'
import { BOSS_SHAPES, shapeOf, shapeSize } from './boss-shapes'
import { BOSS_SKILLS, type BossHit, SKILL_IDS } from './boss-skills'
import { cellCenter, hpScale } from './rows'
import type { Boss, BossSkillId, BossTier, Brick, RunState } from './types'
import type { DamageSource } from './damage'

export { bossParts } from './boss-kit'

export const BOSS_EVERY = 30
/** @deprecated The original five skills; see SKILL_IDS for all of them. */
export const BOSS_TRAITS: BossSkillId[] = ['shield', 'minions', 'drifter', 'armored', 'enrage']
export const BOSS_NOUNS = ['Golem', 'Titan', 'Colossus', 'Warden', 'Behemoth', 'Hydra'] as const
/** How many face styles boss-ui can draw. */
export const BOSS_FACES = 6
/** Boss hp: about this many of the run's ball hits, kept between 3 and 12 bricks' worth (the body is solid, so balls can't rattle around inside it). */
const HITS_PER_BALL = 6
/** Row Bomb (or anything that would delete a part) takes this share of max hp instead. */
const BIG_HIT = 0.2

/** 1 for the first boss, 2 for the second, 3 from the third on. */
export function bossTier(turn: number): BossTier {
  return Math.max(1, Math.min(3, Math.floor(turn / BOSS_EVERY))) as BossTier
}

export function bossHp(s: RunState): number {
  const typical = hpScale(s.turn)
  const firepower = s.ballCount * modsOf(s.boosts).damageMult * HITS_PER_BALL
  return Math.round(Math.max(typical * 3, Math.min(typical * 12, firepower)))
}

/** Its skills, from the run's rng: 2 for the first boss, 3 for the second, 4 after that. */
export function rollTraits(s: RunState, tier = bossTier(s.turn)): BossSkillId[] {
  const pool = SKILL_IDS.filter((id) => BOSS_SKILLS[id].tier <= tier)
  const n = Math.min(pool.length, tier + 1)
  return Array.from({ length: n }, () => pool.splice(randomInt(s.rng, pool.length), 1)[0])
}

/** A body shape for the tier, from the run's rng. */
export function rollShape(s: RunState, tier = bossTier(s.turn)): string {
  const ids = Object.keys(BOSS_SHAPES).filter((id) => BOSS_SHAPES[id].tier === tier)
  return ids[randomInt(s.rng, ids.length)]
}

export function spawnBoss(s: RunState, traits = rollTraits(s), shape = rollShape(s)): void {
  const hp = bossHp(s)
  const noun = BOSS_NOUNS[randomInt(s.rng, BOSS_NOUNS.length)]
  const face = Math.floor(random(s.rng) * BOSS_FACES)
  const boss: Boss = { hp, maxHp: hp, traits, noun, turn: s.turn, dir: 1, shape, face, tier: bossTier(s.turn) }
  s.boss = boss
  const body = shapeOf(shape)
  const left = Math.floor((s.cols - shapeSize(body).w) / 2)
  for (const [c, r] of body.cells) {
    s.bricks.push({ id: s.nextId++, col: left + c, row: r, hp, maxHp: hp, kind: 'boss', split: false })
  }
  crushUnderBoss(s)
  for (const id of traits) BOSS_SKILLS[id]?.spawn?.(s, boss)
  s.events.push({ type: 'boss', noun, traits })
}

function center(parts: Brick[]): { x: number; y: number } {
  const a = cellCenter(Math.min(...parts.map((b) => b.col)), Math.min(...parts.map((b) => b.row)))
  const b = cellCenter(Math.max(...parts.map((b) => b.col)), Math.max(...parts.map((b) => b.row)))
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Damage to any part comes off the shared pool (after its skills have their say); at 0 it falls and pays out. */
export function damageBoss(s: RunState, amount: number, source: DamageSource, hit: Omit<BossHit, 'source'> = {}): void {
  const boss = s.boss
  if (!boss) return
  let dealt = amount
  for (const id of boss.traits) {
    const skill = BOSS_SKILLS[id]
    if (skill?.damage) dealt = skill.damage(s, boss, dealt, { ...hit, source })
  }
  boss.hp -= Math.max(0, dealt)
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
  s.bossesBeaten = (s.bossesBeaten ?? 0) + 1
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
  crushUnderBoss(s)
}

/** The boss's turn, at the start of each turn after it arrived: each skill acts in order. */
export function bossTurn(s: RunState): void {
  const boss = s.boss
  if (!boss) return
  if (!bossParts(s).length) {
    s.boss = null // pushed off the board some other way
    return
  }
  for (const id of boss.traits) BOSS_SKILLS[id]?.turn?.(s, boss)
}
