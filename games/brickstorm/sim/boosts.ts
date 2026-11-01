import { random } from '@forge/core/rng'
import {
  BALL_R,
  CELL,
  COMBO_GAP,
  GUIDE_LENGTH,
  MAX_COLS,
  MAX_ROWS,
  LEVEL_POWER,
  XP_BASE,
  XP_STEP,
} from './config'
import { baseRows } from './dims'
import { HEROES, heroOf, type HeroId } from './heroes'
import type { BoostId, RunState } from './types'

export type Rarity = 'common' | 'rare' | 'epic'

export const BOOSTS: Record<BoostId, { name: string; text: string; rarity: Rarity; max: number }> = {
  damage: { name: 'Heavy Hitter', text: '+20% ball damage', rarity: 'common', max: 99 },
  balls: { name: 'Reinforcements', text: '+2 balls', rarity: 'common', max: 99 },
  coins: { name: 'Gold Rush', text: '+30% coins', rarity: 'common', max: 99 },
  speed: { name: 'Tailwind', text: '+15% ball speed', rarity: 'common', max: 5 },
  pierce: { name: 'Piercing', text: '33% of balls pass through their first brick', rarity: 'rare', max: 3 },
  crit: { name: 'Lucky Strike', text: '+5% crit chance (crits deal 3×)', rarity: 'rare', max: 3 },
  bouncy: { name: 'Rubber Walls', text: '+0.5 damage per wall bounce, stacking', rarity: 'epic', max: 2 },
  double: { name: 'Double Down', text: 'Double your balls for the next 3 volleys', rarity: 'epic', max: 99 },
  fireball: {
    name: 'Fireball',
    text: '8% of balls are fireballs that burn through bricks',
    rarity: 'rare',
    max: 3,
  },
  bombball: { name: 'Bomb Ball', text: '6% of balls explode on their first hit', rarity: 'epic', max: 3 },
  twin: { name: 'Twin Shot', text: '33% of balls split in two on their first hit', rarity: 'rare', max: 3 },
  big: { name: 'Big Balls', text: '+20% ball size', rarity: 'common', max: 3 },
  lightning: { name: 'Chain Lightning', text: '5% of hits arc to a nearby brick', rarity: 'rare', max: 3 },
  aftershock: {
    name: 'Aftershock',
    text: 'Destroyed bricks deal half damage to their 4 neighbours',
    rarity: 'rare',
    max: 3,
  },
  magnet: { name: 'Magnet', text: 'Grab pickups a whole cell away', rarity: 'common', max: 1 },
  midas: { name: 'Midas', text: '+1 coin for every brick destroyed', rarity: 'common', max: 5 },
  keeper: { name: 'Combo Keeper', text: '+1 s before your combo resets', rarity: 'common', max: 3 },
  brain: { name: 'Brain', text: '+30% XP', rarity: 'common', max: 3 },
  glass: {
    name: 'Glass Cannon',
    text: '×2 damage, but bricks drop an extra row every 10 turns',
    rarity: 'epic',
    max: 1,
  },
  eagle: { name: 'Eagle Eye', text: '+50% aim guide length', rarity: 'rare', max: 3 },
  secondWind: {
    name: 'Second Wind',
    text: 'Once per run, a brick reaching the bottom wipes its row instead',
    rarity: 'epic',
    max: 1,
  },
}

/** Boosts that play especially well together; shown as a SYNERGY ribbon. Always symmetric. */
export const SYNERGIES: Partial<Record<BoostId, BoostId[]>> = {
  fireball: ['aftershock'],
  bombball: ['aftershock'],
  aftershock: ['fireball', 'bombball'],
  lightning: ['crit'],
  crit: ['lightning'],
  twin: ['big'],
  big: ['twin'],
  midas: ['coins'],
  coins: ['midas'],
  glass: ['secondWind'],
  secondWind: ['glass'],
  keeper: ['brain'],
  brain: ['keeper'],
}

/** True if the run already owns a synergy partner of `id`. */
export function isSynergy(s: RunState, id: BoostId): boolean {
  return (SYNERGIES[id] ?? []).some((p) => (s.boosts[p] ?? 0) > 0)
}

/** Chance a new card is each tier; the rest is common. Rolled per card, before the boost. */
export const TIER_CHANCE = { rare: 0.17, epic: 0.03 } as const
/** Epic chance added for each pick screen in a row without an epic (bad-luck protection). */
export const EPIC_PITY = 0.01
/** When a rolled tier has nothing left: try these, in order. */
const FALLBACK: Record<Rarity, Rarity[]> = {
  epic: ['epic', 'rare', 'common'],
  rare: ['rare', 'common', 'epic'],
  common: ['common', 'rare', 'epic'],
}

/** A card's tier: epic (more likely the longer since the last epic), rare, or common. */
function rollTier(s: RunState): Rarity {
  const roll = random(s.rng)
  const epic = (TIER_CHANCE.epic + EPIC_PITY * (s.epicDry ?? 0)) * (heroOf(s).epicLuck ?? 1)
  return roll < epic ? 'epic' : roll < epic + TIER_CHANCE.rare ? 'rare' : 'common'
}

export type Mods = ReturnType<typeof modsOf>

/** The run's stats: its skills and its hero. */
export function runMods(s: Pick<RunState, 'boosts'> & { hero?: HeroId }): Mods {
  return modsOf(s.boosts, s.hero)
}

/**
 * Ball and run stats from the skills owned, plus the hero's: its free skill
 * levels stack with picked ones, and its multipliers apply on top.
 */
export function modsOf(boosts: Partial<Record<BoostId, number>>, heroId?: HeroId) {
  const hero = heroId ? HEROES[heroId] : undefined
  const n = (id: BoostId) => (boosts[id] ?? 0) + (hero?.innate?.[id] ?? 0)
  return {
    damageMult: (1 + 0.2 * n('damage')) * (n('glass') ? 2 : 1) * (hero?.damage ?? 1),
    coinMult: (1 + 0.3 * n('coins')) * (hero?.coins ?? 1),
    speedMult: (1 + 0.15 * n('speed')) * (hero?.speed ?? 1),
    // Skills start weak and grow with each level, so a build is worth investing in.
    /** Chance each ball pierces / splits (0 = never; 1 = every ball). Rolled per ball, so volleys vary. */
    pierceChance: [0, 0.33, 0.5, 1][n('pierce')] ?? 1,
    twinChance: [0, 0.33, 0.5, 1][n('twin')] ?? 1,
    critChance: 0.05 * n('crit') + (hero?.crit ?? 0),
    /** Damage a ball gains per wall bounce. */
    bounceStep: 0.5 * n('bouncy'),
    /** Chance each ball is a fireball / bomb (0 = never): the old every-12th/8th/5th and 16th/11th/7th on average. */
    fireChance: [0, 0.08, 0.125, 0.2][n('fireball')] ?? 0.2,
    bombChance: [0, 0.06, 0.09, 0.14][n('bombball')] ?? 0.14,
    radius: BALL_R * (1 + 0.2 * n('big')),
    zapChance: [0, 0.05, 0.09, 0.14][n('lightning')] ?? 0.14,
    /** Bricks each lightning arc jumps to. */
    zapArcs: Math.min(3, n('lightning')),
    /** Neighbour damage from a broken brick, × ball damage (0 = no Aftershock). */
    aftershock: 0.5 * n('aftershock'),
    pickupReach: n('magnet') ? CELL : 0,
    midas: n('midas'),
    comboGap: COMBO_GAP + n('keeper') + (hero?.comboGap ?? 0),
    xpMult: (1 + 0.3 * n('brain')) * (hero?.xp ?? 1),
    glass: n('glass') > 0,
    secondWind: n('secondWind') > 0,
    guideLength: GUIDE_LENGTH * (1 + 0.5 * n('eagle')),
  }
}

/** Ball damage multiplier from levels reached (LEVEL_POWER each). */
export function levelPower(level: number): number {
  return 1 + LEVEL_POWER * level
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return XP_BASE + XP_STEP * level
}

/** All XP earned in a run: every finished level plus `xp` into the current one. */
export function xpTotal(level: number, xp: number): number {
  return XP_BASE * level + (XP_STEP * level * (level - 1)) / 2 + xp
}

/** Lasting boosts the player can hold this many of; each boss beaten adds one. */
export const BASE_SLOTS = 3
/** Share of offers drawn from owned boosts once every slot is taken. */
const OWNED_LEAN = 0.3
/** Boosts that pay out once when picked (+2 balls, Double Down), so they take no slot. */
const INSTANT: readonly BoostId[] = ['balls', 'double']

export function boostSlots(s: Pick<RunState, 'bossesBeaten'> & { hero?: HeroId }): number {
  return BASE_SLOTS + (s.bossesBeaten ?? 0) + (heroOf(s).slots ?? 0)
}

/** The boosts that fill slots, in the order they were first picked. */
/** A bonus skill (+2 balls, Double Down): it pays out when picked and takes no slot. */
export function isInstant(id: BoostId): boolean {
  return INSTANT.includes(id)
}

export function slottedBoosts(boosts: RunState['boosts']): BoostId[] {
  return (Object.keys(boosts) as BoostId[]).filter((id) => (boosts[id] ?? 0) > 0 && !INSTANT.includes(id))
}

/** Taking `id` would need a free slot and there is none: the player must drop a boost for it. */
export function needsReplace(
  s: Pick<RunState, 'boosts' | 'bossesBeaten'> & { hero?: HeroId },
  id: BoostId,
): boolean {
  if (INSTANT.includes(id) || (s.boosts[id] ?? 0) > 0) return false
  return slottedBoosts(s.boosts).length >= boostSlots(s)
}

/**
 * Up to 3 distinct boosts that aren't maxed out, weighted by rarity. A held
 * boost takes the first card and new ones fill the rest. Once every
 * slot is full, about OWNED_LEAN of them are boosts the player already has, so
 * most level-ups can still be taken without dropping anything.
 */
export function rollChoices(s: RunState): BoostId[] {
  const open = (id: BoostId) => (s.boosts[id] ?? 0) < BOOSTS[id].max
  const full = slottedBoosts(s.boosts).length >= boostSlots(s)
  // A held boost is kept out of the draw and comes back as the first card, but
  // not on the screen it was held on (a reroll there): it waits for the next level-up.
  const held = s.held && open(s.held) ? s.held : null
  const comesBack = held && !s.heldNow ? held : null
  const owned = full ? slottedBoosts(s.boosts).filter((id) => open(id) && id !== held) : []
  const pool = (Object.keys(BOOSTS) as BoostId[]).filter(
    (id) => open(id) && !owned.includes(id) && id !== held,
  )
  const picked: BoostId[] = comesBack ? [comesBack] : []
  // A card held on this screen still takes its spot there, so a reroll draws one fewer.
  const cards = held && s.heldNow ? 2 : 3
  while (picked.length < cards && (pool.length || owned.length)) {
    if (owned.length && (!pool.length || random(s.rng) < OWNED_LEAN)) {
      picked.push(...owned.splice(Math.floor(random(s.rng) * owned.length), 1))
      continue
    }
    // Tier first, then an even pick inside it, so the odds don't depend on how
    // many boosts each tier has left.
    const tier = FALLBACK[rollTier(s)].find((r) => pool.some((id) => BOOSTS[id].rarity === r))!
    const inTier = pool.filter((id) => BOOSTS[id].rarity === tier)
    const id = inTier[Math.floor(random(s.rng) * inTier.length)]
    picked.push(...pool.splice(pool.indexOf(id), 1))
  }
  s.epicDry = picked.some((id) => BOOSTS[id].rarity === 'epic') ? 0 : (s.epicDry ?? 0) + 1
  return picked
}

/** Base price of a pick at the second level-up, by rarity. */
export const RARITY_PRICE: Record<Rarity, number> = { common: 7, rare: 12, epic: 20 }
/** Price weight for boosts stronger or weaker than their rarity suggests (default 1). */
export const PRICE_WEIGHT: Partial<Record<BoostId, number>> = {
  damage: 1.2,
  balls: 1.2,
  glass: 1.3,
  speed: 0.8,
  magnet: 0.7,
  eagle: 0.7,
}
/** Each level-up past the second adds this share to every price. */
const LEVEL_STEP = 0.15
/** Each level a boost already has adds this share to its upgrade price. */
const UPGRADE_STEP = 0.5
/** A hold costs this share of the boost's price (at least HOLD_MIN), doubling per hold. */
const HOLD_SHARE = 0.75
const HOLD_MIN = 5

/**
 * What taking `id` now costs: free for the run's first level-up and for boss
 * and mystery rewards; otherwise by rarity and strength, rising each level, and
 * more for an upgrade of a boost you own.
 */
export function pickCost(s: RunState, id: BoostId): number {
  if ((s.freePicks ?? 0) > 0 || s.level <= 1) return 0
  return listPrice(s, id)
}

/** A boost's price before any free pick: rarity × strength, rising each level, more for an upgrade. */
function listPrice(s: RunState, id: BoostId): number {
  const base = RARITY_PRICE[BOOSTS[id].rarity] * (PRICE_WEIGHT[id] ?? 1)
  const growth = 1 + LEVEL_STEP * Math.max(0, s.level - 2)
  return Math.round(base * growth * (1 + UPGRADE_STEP * (s.boosts[id] ?? 0)))
}

/**
 * What holding `id` for the next level-up costs: a share of its price (so rarer
 * boosts cost more to hold), doubling with each hold this run.
 */
export function holdCost(s: RunState, id: BoostId): number {
  return Math.max(HOLD_MIN, Math.round(HOLD_SHARE * listPrice(s, id))) * 2 ** (s.holdsUsed ?? 0)
}

/** Sets an offered boost aside to come back at the next level-up (one at a time). The caller has paid. */
export function holdBoost(s: RunState, id: BoostId): void {
  // A bonus pays out when taken; holding one makes no sense.
  if (s.phase !== 'pick' || !s.choices.includes(id) || s.held || isInstant(id)) return
  s.held = id
  s.heldNow = true
  s.holdsUsed = (s.holdsUsed ?? 0) + 1
  s.choices = s.choices.filter((x) => x !== id)
}

/** Passes on this pick: no boost, on to what's next. */
export function skipPick(s: RunState): void {
  if (s.phase !== 'pick') return
  finishPick(s)
}

/**
 * Takes one of the offered boosts. With every slot full, a new boost needs
 * `replace`: an owned boost that is dropped for it; without one nothing happens.
 */
export function pickBoost(s: RunState, id: BoostId, replace?: BoostId): void {
  if (s.phase !== 'pick' || !s.choices.includes(id)) return
  if (needsReplace(s, id)) {
    if (!replace || !slottedBoosts(s.boosts).includes(replace)) return
    delete s.boosts[replace]
  }
  s.boosts[id] = (s.boosts[id] ?? 0) + 1
  if (id === 'balls') s.ballCount += 2
  if (id === 'double') s.doubleVolleys += 3
  finishPick(s)
}

/** One pick is done (taken or skipped): the next pick, a board growth, or aiming. */
function finishPick(s: RunState): void {
  // A held boost lasts for the level-up it came back in.
  if (s.held && s.choices.includes(s.held)) s.held = null
  s.heldNow = false
  if ((s.freePicks ?? 0) > 0) s.freePicks = (s.freePicks ?? 0) - 1
  s.pendingPicks--
  if (s.pendingPicks > 0) {
    s.choices = rollChoices(s)
  } else {
    s.choices = []
    // A board growth due this turn comes right after the pick.
    const canGrow = s.cols < MAX_COLS || baseRows(s) < MAX_ROWS
    if (!canGrow) s.growPending = false
    s.phase = s.growPending ? 'grow' : 'aim'
  }
}

/** Coins for the next reroll this run: 25, 50, 100… */
export function rerollCost(s: RunState): number {
  return 25 * 2 ** s.rerollsUsed
}

/** Rerolls the offered boosts. The caller has already paid (coins or a token). */
export function reroll(s: RunState): void {
  if (s.phase !== 'pick') return
  s.rerollsUsed++
  s.choices = rollChoices(s)
}
