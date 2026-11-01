// Bosses: every BOSS_EVERY turns a boss takes the place of the row. Its parts
// are ordinary cells (so balls, bombs, lightning and lasers just work) that
// share one hp pool. While it lives no rows spawn, but it still drops a row
// each turn like any brick. Later bosses are bigger and have more skills.
import { random, randomInt } from '@forge/core/rng'
import { levelPower, modsOf, runMods, xpToNext } from './boosts'
import { BOSS_HEAL, heal } from './health'
import { heroOf } from './heroes'
import { bossParts, crushUnderBoss, moveBoss } from './boss-kit'
import { BOSS_SHAPES, shapeOf, shapeSize } from './boss-shapes'
import { BOSS_SKILLS, type BossHit, type BossSkill, type Face, SKILL_IDS } from './boss-skills'
import { BOSS_XP_PER_TURN } from './config'
import { cellCenter, hpCap, hpScale } from './rows'
import type { Ball, Boss, BossSkillId, BossTier, Brick, RunState } from './types'
import { gainXp, type DamageSource } from './damage'

export { bossParts } from './boss-kit'

export const BOSS_EVERY = 30
/** @deprecated The original five skills; see SKILL_IDS for all of them. */
export const BOSS_TRAITS: BossSkillId[] = ['shield', 'minions', 'drifter', 'armored', 'enrage']
export const BOSS_NOUNS = ['Golem', 'Titan', 'Colossus', 'Warden', 'Behemoth', 'Hydra'] as const
/** How many face styles boss-ui can draw. */
export const BOSS_FACES = 6
/** Boss hp: about this many of the run's ball hits, kept between 3 and 12 bricks' worth (the body is solid, so balls can't rattle around inside it). */
/** …by tier: the first boss is a warm-up, later ones hit hard. */
const HITS_PER_BALL: Record<BossTier, number> = { 1: 7, 2: 9, 3: 11 }
/** Row Bomb (or anything that would delete a part) takes this share of max hp instead. */
const BIG_HIT = 0.2
/** The reward: this many coins per turn, with coin boosts counting at most MAX_COIN_MULT. */
const COINS_PER_TURN = 4
const MAX_COIN_MULT = 2

/** 1 for the first boss, 2 for the second, 3 from the third on. */
export function bossTier(turn: number): BossTier {
  return Math.max(1, Math.min(3, Math.floor(turn / BOSS_EVERY))) as BossTier
}

/** XP for killing a boss on `turn`: more the later it is, but at most the one level you're on. */
export function bossXp(turn: number, level: number): number {
  return Math.min(BOSS_XP_PER_TURN * turn, xpToNext(level))
}

export function bossHp(s: RunState): number {
  // A typical brick as you meet it: brick hp is capped by your firepower, so
  // the boss is too (late in a run the raw curve runs into the millions).
  const typical = Math.min(hpScale(s.turn), hpCap(s))
  // Real firepower: balls × boost damage × the bonus from levels reached.
  const firepower =
    s.ballCount * modsOf(s.boosts).damageMult * levelPower(s.level) * HITS_PER_BALL[bossTier(s.turn)]
  return Math.round(Math.max(typical * 4, Math.min(typical * 18, firepower)))
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
  // The first boss is a warm-up (2 skills, one an attack); later ones bring 4 and 5.
  const n = Math.min(pool.length, tier === 1 ? 2 : tier + 2)
  const picked: BossSkillId[] = []
  while (picked.length < n && pool.length) {
    const own = pool.filter((id) => BOSS_SKILLS[id].tier === tier)
    const from = picked.length === 0 && own.length ? own : pool
    const id = from[randomInt(s.rng, from.length)]
    picked.push(id)
    const out = new Set([id, ...EXCLUSIVE.filter((g) => g.includes(id)).flat()])
    pool = pool.filter((x) => !out.has(x))
  }
  // Every boss can hurt the hero: if none of its skills is an attack, the last becomes one.
  if (!picked.some((id) => ATTACKS.includes(id))) {
    const attacks = ATTACKS.filter((id) => BOSS_SKILLS[id].tier <= tier)
    picked[picked.length - 1] = attacks[randomInt(s.rng, attacks.length)]
  }
  return picked
}

/** Skills that hurt the hero directly; every boss gets at least one. */
export const ATTACKS: BossSkillId[] = ['thorns', 'barrage', 'slam', 'hex']
/** Rows the board grows by while a boss is on it. */
export const BOSS_ROOM = 2

/** A boss arrives: the board grows taller, so there is room for it, its summons and its attacks. */
function growArena(s: RunState): void {
  s.rows += BOSS_ROOM
  s.bossRoom = (s.bossRoom ?? 0) + BOSS_ROOM
  s.events.push({ type: 'arena', grow: true })
}

/**
 * After a boss: the extra rows go, one per turn, but only once nothing sits
 * where the new line would be (shrinking never makes a brick crash).
 */
export function shrinkArena(s: RunState): void {
  if (!s.bossRoom) return
  const newLine = s.rows - 2
  if (s.bricks.some((b) => b.row >= newLine) || s.pickups.some((p) => p.row >= newLine)) return
  s.rows--
  s.bossRoom--
  s.events.push({ type: 'arena', grow: false })
}

/** The hero just lost health: skills that feed on it (Drain) react. */
export function bossHeroHurt(s: RunState, amount: number): void {
  const boss = s.boss
  if (!boss) return
  for (const skill of skillsOf(boss)) skill.heroHurt?.(s, boss, amount)
}

/** A body shape for the tier, from the run's rng. */
export function rollShape(s: RunState, tier = bossTier(s.turn)): string {
  const ids = Object.keys(BOSS_SHAPES).filter(
    (id) => BOSS_SHAPES[id].tier === tier && !BOSS_SHAPES[id].legacy,
  )
  // A board too narrow for every body (it can't happen with today's sizes, but stay safe).
  const fits = ids.filter((id) => shapeSize(BOSS_SHAPES[id]).w <= s.cols)
  const from = fits.length ? fits : ids
  return from[randomInt(s.rng, from.length)]
}

export function spawnBoss(s: RunState, traits = rollTraits(s), shape = rollShape(s)): void {
  growArena(s)
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
    const part: Brick = { id: s.nextId++, col: left + c, row: r, hp, maxHp: hp, kind: 'boss', split: false }
    const shape = body.shaped?.[`${c},${r}`]
    if (shape) part.shape = shape
    s.bricks.push(part)
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
  if (hit.at) {
    if (dealt > 0)
      s.events.push({
        type: 'bossHit',
        ...hit.at,
        life: Math.max(0, (boss.hp - dealt) / boss.maxHp),
        skill: boss.traits[0],
      })
    else if (amount > 0) s.events.push({ type: 'bossBlock', ...hit.at })
  }
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
  const ghost = { boss: structuredClone(boss), parts: parts.map((p) => ({ ...p })) }
  // Its machinery goes with it; its minions stay as plain bricks.
  s.bricks = s.bricks.filter((b) => b.kind !== 'boss' && (!b.role || b.role === 'minion'))
  for (const b of s.bricks) delete b.role
  s.boss = null
  const coins = Math.round(COINS_PER_TURN * s.turn * Math.min(MAX_COIN_MULT, runMods(s).coinMult))
  s.coins += coins
  s.pendingPicks++
  s.freePicks = (s.freePicks ?? 0) + 1
  // No XP per hit on a boss: it all comes now, more the later the boss.
  gainXp(s, bossXp(s.turn, s.level))
  s.bossesBeaten = (s.bossesBeaten ?? 0) + 1
  for (const skill of skillsOf(boss)) skill.defeated?.(s, boss, { x, y })
  s.events.push({ type: 'bossDown', x, y, coins, ghost })
  heal(s, s.maxHp * (heroOf(s).bossHeal ?? BOSS_HEAL), 'boss')
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
