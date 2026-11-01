// Bosses: every BOSS_EVERY turns a boss takes the place of the row. Its parts
// are ordinary cells (so balls, bombs, lightning and lasers just work) that
// share one hp pool. While it lives no rows spawn, but it still drops a row
// each turn like any brick. Later bosses are bigger and have more skills.
import { random, randomInt } from '@forge/core/rng'
import { modsOf } from './boosts'
import { bossParts, crushUnderBoss, moveBoss } from './boss-kit'
import { BOSS_SHAPES, shapeOf, shapeSize } from './boss-shapes'
import { BOSS_SKILLS, type BossHit, type BossSkill, type Face, SKILL_IDS } from './boss-skills'
import { cellCenter, hpScale } from './rows'
import type { Ball, Boss, BossSkillId, BossTier, Brick, RunState } from './types'
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

/** Skills that would stack too hard or look the same: a boss gets at most one of each group. */
const EXCLUSIVE: BossSkillId[][] = [
  ['shell', 'bulwark', 'underplate', 'heart'],
  ['drifter', 'weaver', 'blink', 'evasive'],
  ['armored', 'icebound', 'stoneSkin', 'powerCells', 'guards'],
  ['gravity', 'repulse', 'mire'],
  ['hover', 'lunge', 'charge'],
  ['shield', 'totem', 'glutton'],
]

/**
 * Its skills, from the run's rng: 2 for the first boss, 3 for the second, 4
 * after that. The first (which names it) is one of its own tier's skills.
 */
export function rollTraits(s: RunState, tier = bossTier(s.turn)): BossSkillId[] {
  let pool = SKILL_IDS.filter((id) => BOSS_SKILLS[id].tier <= tier)
  const n = Math.min(pool.length, tier + 1)
  const picked: BossSkillId[] = []
  while (picked.length < n && pool.length) {
    const own = pool.filter((id) => BOSS_SKILLS[id].tier === tier)
    const from = picked.length === 0 && own.length ? own : pool
    const id = from[randomInt(s.rng, from.length)]
    picked.push(id)
    const out = new Set([id, ...EXCLUSIVE.filter((g) => g.includes(id)).flat()])
    pool = pool.filter((x) => !out.has(x))
  }
  return picked
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
  const boss: Boss = {
    hp,
    maxHp: hp,
    traits,
    noun,
    turn: s.turn,
    dir: 1,
    shape,
    face,
    tier: bossTier(s.turn),
  }
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

/** The boss's skills with their hooks (ids this build doesn't know are skipped). */
function skillsOf(boss: Boss): BossSkill[] {
  return boss.traits.map((id) => BOSS_SKILLS[id]).filter((k): k is BossSkill => !!k)
}

/** Damage to any part comes off the shared pool (after its skills have their say); at 0 it falls and pays out. */
export function damageBoss(
  s: RunState,
  amount: number,
  source: DamageSource,
  hit: Omit<BossHit, 'source'> = {},
): void {
  const boss = s.boss
  if (!boss) return
  let dealt = amount
  for (const skill of skillsOf(boss)) {
    if (skill.damage) dealt = skill.damage(s, boss, dealt, { ...hit, source })
  }
  dealt = Math.max(0, dealt)
  const before = boss.hp
  boss.hp -= dealt
  boss.mem = { ...boss.mem, volley: (boss.mem?.volley ?? 0) + dealt }
  for (const skill of skillsOf(boss)) skill.hurt?.(s, boss, before, { ...hit, source })
  const parts = bossParts(s)
  if (boss.hp <= 0 && skillsOf(boss).some((k) => k.death?.(s, boss))) boss.hp = Math.max(boss.hp, 1)
  if (boss.hp > 0) {
    for (const p of parts) p.hp = boss.hp
    return
  }
  const { x, y } = center(parts)
  // Its machinery goes with it; its minions stay as plain bricks.
  s.bricks = s.bricks.filter((b) => b.kind !== 'boss' && (!b.role || b.role === 'minion'))
  for (const b of s.bricks) delete b.role
  s.boss = null
  const coins = Math.round(10 * s.turn * modsOf(s.boosts).coinMult)
  s.coins += coins
  s.pendingPicks++
  s.bossesBeaten = (s.bossesBeaten ?? 0) + 1
  for (const skill of skillsOf(boss)) skill.defeated?.(s, boss, { x, y })
  s.events.push({ type: 'bossDown', x, y, coins })
}

/** A volley starts: per-volley counters reset, then skills react (Barrier, Leech…). */
export function bossLaunch(s: RunState): void {
  const boss = s.boss
  if (!boss) return
  boss.mem = { ...boss.mem, volley: 0 }
  for (const skill of skillsOf(boss)) skill.launch?.(s, boss)
}

/** A volley ended, before the board drops. */
export function bossVolleyEnd(s: RunState): void {
  const boss = s.boss
  if (!boss) return
  for (const skill of skillsOf(boss)) skill.volleyEnd?.(s, boss)
}

/** Rows the boss moves after the board drops (Lunge, Hover, Retreat…), never above the top. */
export function bossDrop(s: RunState): void {
  const boss = s.boss
  if (!boss || !bossParts(s).length) return
  let rows = 0
  for (const skill of skillsOf(boss)) rows += skill.drop?.(s, boss) ?? 0
  const top = Math.min(...bossParts(s).map((b) => b.row))
  rows = Math.max(rows, -top)
  if (rows) moveBoss(s, 0, rows)
}

/** What a ball does on touching the boss: the first skill that says other than 'hit' wins. */
export function bossContact(s: RunState, ball: Ball, face: Face): 'hit' | 'block' | 'pass' {
  const boss = s.boss
  if (!boss) return 'hit'
  for (const skill of skillsOf(boss)) {
    const r = skill.contact?.(s, boss, ball, face)
    if (r && r !== 'hit') return r
  }
  return 'hit'
}

/** Pulls and pushes on a flying ball; returns how fast it may move (1 = full speed). */
export function bossForce(s: RunState, ball: Ball, dt: number): number {
  const boss = s.boss
  if (!boss) return 1
  let speed = 1
  for (const skill of skillsOf(boss)) {
    skill.force?.(s, boss, ball, dt)
    speed *= skill.slow?.(s, boss, ball) ?? 1
  }
  return speed
}

/** A brick a skill summoned took damage. */
export function bossRoleHit(s: RunState, brick: Brick, amount: number, source: DamageSource): void {
  const boss = s.boss
  if (!boss) return
  for (const skill of skillsOf(boss)) skill.roleHit?.(s, boss, brick, amount, source)
}

/** A brick a skill summoned was destroyed. */
export function bossRoleKill(s: RunState, brick: Brick): void {
  const boss = s.boss
  if (!boss) return
  for (const skill of skillsOf(boss)) skill.roleKill?.(s, boss, brick)
}

/** Shroud: the aim guide stops at its first bounce. */
export function bossHidesGuide(s: Pick<RunState, 'boss'>): boolean {
  return !!s.boss?.traits.includes('shroud')
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
