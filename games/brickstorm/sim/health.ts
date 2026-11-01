// Hero health: bricks that crash into the danger line hurt the hero instead of
// ending the run at once, and the run ends when health runs out. Hearts,
// beaten bosses and some heroes heal.
import { bossHeroHurt, liftBoss } from './boss'
import { dims } from './dims'
import { heroOf } from './heroes'
import { cellCenter } from './rows'
import type { Brick, HealSource, RunState } from './types'

/** Damage one full-health brick deals when it crashes, early in a run. */
export const BREACH_BASE = 8
/** Crash damage doubles by this turn, then keeps climbing faster (early runs forgive, late ones don't). */
export const BREACH_DOUBLE_AT = 40
const BREACH_CURVE = 2
/** A brick worn down to nothing deals this share of a full brick's crash damage. */
const BREACH_FLOOR = 0.5
/** A boss crashing hurts like this many full bricks, then rises back to the top. */
/** At tier 3; one less per tier below. */
export const BOSS_BREACH = 6
/** A boss missile crashing hurts this many times a brick. */
export const MISSILE_BREACH = 2
/** Share of max health a heart pickup heals. */
export const HEART_HEAL = 0.2
/** Share of max health regained when a boss falls (unless the hero says otherwise). */
export const BOSS_HEAL = 0.25
/** A revive brings health back up to at least this share. */
export const REVIVE_HEALTH = 0.5
/** Share of max health the Potion helper heals. */
export const POTION_HEAL = 0.5

/** Crash damage of one full brick on `turn`, before the hero's resistance. */
export function breachUnit(turn: number): number {
  return BREACH_BASE * (1 + (Math.max(0, turn) / BREACH_DOUBLE_AT) ** BREACH_CURVE)
}

/** What one brick crashing would cost the hero: worn-down bricks hurt less. */
export function brickBreach(s: RunState, b: Brick): number {
  const left = Math.max(0, Math.min(1, b.hp / b.maxHp))
  const missile = b.role === 'missile' ? MISSILE_BREACH : 1
  return breachUnit(s.turn) * (BREACH_FLOOR + (1 - BREACH_FLOOR) * left) * missile * (heroOf(s).breach ?? 1)
}

/** Health the given bricks would take if they crashed now (a boss counts once). */
export function breachDamage(s: RunState, bricks: readonly Brick[]): number {
  const plain = bricks.filter((b) => b.kind !== 'boss')
  const boss = bricks.some((b) => b.kind === 'boss')
  // Later bosses crash harder: 4 bricks' worth for the first, 5, then 6.
  const tier = s.boss?.tier ?? 1
  const bossHit = boss ? breachUnit(s.turn) * (BOSS_BREACH - 3 + tier) * (heroOf(s).breach ?? 1) : 0
  return Math.round(plain.reduce((sum, b) => sum + brickBreach(s, b), 0) + bossHit)
}

/**
 * Bricks at or past the danger line crash: they are gone (no coins, no XP),
 * the hero loses health, and a boss is pushed back to the top. Returns true
 * when that health loss ends the run.
 */
export function resolveBreaches(s: RunState): boolean {
  const { dangerRow } = dims(s)
  const crashed = s.bricks.filter((b) => b.row >= dangerRow)
  if (!crashed.length) return false
  const damage = breachDamage(s, crashed)
  const boss = crashed.some((b) => b.kind === 'boss')
  const at = crashed
    .filter((b) => b.kind !== 'boss')
    .map((b) => cellCenter(b.col, Math.min(b.row, dangerRow)))
  s.bricks = s.bricks.filter((b) => b.kind === 'boss' || b.row < dangerRow)
  if (boss) {
    at.push(cellCenter(Math.floor(s.cols / 2), dangerRow))
    liftBoss(s)
  }
  s.hp = Math.max(0, s.hp - damage)
  s.events.push({ type: 'breach', damage, at, boss })
  bossHeroHurt(s, damage)
  return s.hp <= 0
}

/**
 * A boss attack hits the hero directly (thorns, a slam). The hero's crash
 * resistance applies. A Drain boss heals from it.
 */
export function hurtHero(
  s: RunState,
  amount: number,
  at: { x: number; y: number },
  source: 'thorn' | 'slam',
): void {
  const damage = amount * (heroOf(s).breach ?? 1)
  if (damage <= 0 || s.hp <= 0) return
  s.hp = Math.max(0, s.hp - damage)
  s.events.push({ type: 'heroHit', damage: Math.max(1, Math.round(damage)), x: at.x, y: at.y, source })
  bossHeroHurt(s, damage)
}

/**
 * Heals the hero (never past max). The hero's healing multiplier applies to
 * hearts, bosses and potions. Returns the health actually gained.
 */
export function heal(s: RunState, amount: number, source: HealSource): number {
  // The hero's own traits (lifesteal, regen) and revives are exact; pickups, bosses and potions scale.
  const mult = source === 'life' || source === 'revive' || source === 'regen' ? 1 : (heroOf(s).heal ?? 1)
  const gained = Math.min(s.maxHp - s.hp, amount * mult)
  if (gained <= 0) return 0
  s.hp += gained
  // Lifesteal ticks on every kill; it would flood the screen, so it stays silent.
  if (source !== 'life') s.events.push({ type: 'heal', amount: Math.round(gained), source })
  return gained
}

/** Share of max health still missing (0 full, 1 empty). */
export function missingHealth(s: Pick<RunState, 'hp' | 'maxHp'>): number {
  return s.maxHp > 0 ? 1 - s.hp / s.maxHp : 0
}

/** Start of a turn: regenerating heroes heal. */
export function heroTurnStart(s: RunState): void {
  const regen = heroOf(s).regen
  if (regen) heal(s, regen, 'regen')
}

/** A brick was destroyed: lifesteal and the Necromancer's souls. */
export function heroOnKill(s: RunState, brick: Brick): void {
  const hero = heroOf(s)
  s.kills = (s.kills ?? 0) + 1
  if (hero.lifesteal) heal(s, hero.lifesteal, 'life')
  if (hero.soul && s.kills % hero.soul === 0) {
    s.pendingBalls++
    const { x, y } = cellCenter(brick.col, brick.row)
    s.events.push({ type: 'heroSkill', hero: hero.id, x, y })
  }
}

/** Damage multiplier from the hero on a hit: Berserker rage, Paladin vs bosses. */
export function heroHitMult(s: RunState, boss: boolean): number {
  const hero = heroOf(s)
  const rage = hero.rage ? 1 + hero.rage * missingHealth(s) : 1
  return rage * (boss ? (hero.bossDamage ?? 1) : 1)
}

/** The Frost Witch holds the bricks in place every few turns. */
export function heroFreezes(s: RunState): boolean {
  const every = heroOf(s).frostEvery
  return !!every && s.turn % every === 0
}
