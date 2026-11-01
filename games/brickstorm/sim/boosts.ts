import { random } from '@forge/core/rng'
import { BALL_R, CELL, COMBO_GAP, GUIDE_LENGTH, MAX_COLS, MAX_ROWS } from './config'
import type { BoostId, RunState } from './types'

export type Rarity = 'common' | 'rare' | 'epic'

export const BOOSTS: Record<BoostId, { name: string; text: string; rarity: Rarity; max: number }> = {
  damage: { name: 'Heavy Hitter', text: '+25% ball damage', rarity: 'common', max: 99 },
  balls: { name: 'Reinforcements', text: '+2 balls', rarity: 'common', max: 99 },
  coins: { name: 'Gold Rush', text: '+30% coins', rarity: 'common', max: 99 },
  speed: { name: 'Tailwind', text: '+15% ball speed', rarity: 'common', max: 5 },
  pierce: { name: 'Piercing', text: 'Balls pass through their first brick', rarity: 'rare', max: 1 },
  crit: { name: 'Lucky Strike', text: '+10% crit chance (crits deal 3×)', rarity: 'rare', max: 3 },
  bouncy: { name: 'Rubber Walls', text: '+1 damage per wall bounce, stacking', rarity: 'epic', max: 1 },
  double: { name: 'Double Down', text: 'Double your balls for the next 3 volleys', rarity: 'epic', max: 99 },
  fireball: {
    name: 'Fireball',
    text: 'Every 8th ball is a fireball that burns through bricks',
    rarity: 'rare',
    max: 3,
  },
  bombball: { name: 'Bomb Ball', text: 'Every 12th ball explodes on its first hit', rarity: 'epic', max: 2 },
  twin: { name: 'Twin Shot', text: 'Balls split in two on their first hit', rarity: 'rare', max: 1 },
  big: { name: 'Big Balls', text: '+20% ball size', rarity: 'common', max: 3 },
  lightning: { name: 'Chain Lightning', text: '15% of hits arc to 2 nearby bricks', rarity: 'rare', max: 3 },
  aftershock: {
    name: 'Aftershock',
    text: 'Destroyed bricks damage their 4 neighbours',
    rarity: 'rare',
    max: 1,
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

const WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 }

export type Mods = ReturnType<typeof modsOf>

export function modsOf(boosts: Partial<Record<BoostId, number>>) {
  const n = (id: BoostId) => boosts[id] ?? 0
  return {
    damageMult: (1 + 0.25 * n('damage')) * (n('glass') ? 2 : 1),
    coinMult: 1 + 0.3 * n('coins'),
    speedMult: 1 + 0.15 * n('speed'),
    pierce: n('pierce') ? 1 : 0,
    critChance: 0.1 * n('crit'),
    bouncy: n('bouncy') > 0,
    /** Every Nth ball is a fireball / bomb (0 = never). */
    fireEvery: [0, 8, 6, 4][n('fireball')] ?? 4,
    bombEvery: [0, 12, 8][n('bombball')] ?? 8,
    twin: n('twin') > 0,
    radius: BALL_R * (1 + 0.2 * n('big')),
    zapChance: 0.15 * n('lightning'),
    aftershock: n('aftershock') > 0,
    pickupReach: n('magnet') ? CELL : 0,
    midas: n('midas'),
    comboGap: COMBO_GAP + n('keeper'),
    xpMult: 1 + 0.3 * n('brain'),
    glass: n('glass') > 0,
    secondWind: n('secondWind') > 0,
    guideLength: GUIDE_LENGTH * (1 + 0.5 * n('eagle')),
  }
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return 8 + 6 * level
}

/** All XP earned in a run: every finished level plus `xp` into the current one. */
export function xpTotal(level: number, xp: number): number {
  return 8 * level + 3 * level * (level - 1) + xp
}

/** Lasting boosts the player can hold this many of; each boss beaten adds one. */
export const BASE_SLOTS = 3
/** Share of offers drawn from owned boosts once every slot is taken. */
const OWNED_LEAN = 0.3
/** Boosts that pay out once when picked (+2 balls, Double Down), so they take no slot. */
const INSTANT: readonly BoostId[] = ['balls', 'double']

export function boostSlots(s: Pick<RunState, 'bossesBeaten'>): number {
  return BASE_SLOTS + (s.bossesBeaten ?? 0)
}

/** The boosts that fill slots, in the order they were first picked. */
export function slottedBoosts(boosts: RunState['boosts']): BoostId[] {
  return (Object.keys(boosts) as BoostId[]).filter((id) => (boosts[id] ?? 0) > 0 && !INSTANT.includes(id))
}

/** Taking `id` would need a free slot and there is none: the player must drop a boost for it. */
export function needsReplace(s: Pick<RunState, 'boosts' | 'bossesBeaten'>, id: BoostId): boolean {
  if (INSTANT.includes(id) || (s.boosts[id] ?? 0) > 0) return false
  return slottedBoosts(s.boosts).length >= boostSlots(s)
}

/**
 * Up to 3 distinct boosts that aren't maxed out, weighted by rarity (plus a
 * held one, if any). Once every
 * slot is full, about OWNED_LEAN of them are boosts the player already has, so
 * most level-ups can still be taken without dropping anything.
 */
export function rollChoices(s: RunState): BoostId[] {
  const open = (id: BoostId) => (s.boosts[id] ?? 0) < BOOSTS[id].max
  const full = slottedBoosts(s.boosts).length >= boostSlots(s)
  // A held boost is kept out of the draw and added as an extra card at the end.
  const held = s.held && open(s.held) ? s.held : null
  const owned = full ? slottedBoosts(s.boosts).filter((id) => open(id) && id !== held) : []
  const pool = (Object.keys(BOOSTS) as BoostId[]).filter(
    (id) => open(id) && !owned.includes(id) && id !== held,
  )
  const picked: BoostId[] = []
  while (picked.length < 3 && (pool.length || owned.length)) {
    if (owned.length && (!pool.length || random(s.rng) < OWNED_LEAN)) {
      picked.push(...owned.splice(Math.floor(random(s.rng) * owned.length), 1))
      continue
    }
    const total = pool.reduce((sum, id) => sum + WEIGHT[BOOSTS[id].rarity], 0)
    let roll = random(s.rng) * total
    const i = pool.findIndex((id) => (roll -= WEIGHT[BOOSTS[id].rarity]) < 0)
    picked.push(...pool.splice(i, 1))
  }
  // A held boost comes back as an extra card.
  if (held) picked.push(held)
  return picked
}

/** Coins per level-up past the first: picks get pricier as the run goes on. */
const PICK_STEP = 12
/** Each level a boost already has adds this share to its upgrade price. */
const UPGRADE_STEP = 0.5
const HOLD_BASE = 30

/** What taking `id` now costs: free for the run's first level-up and for boss rewards; upgrades cost more. */
export function pickCost(s: RunState, id: BoostId): number {
  if ((s.freePicks ?? 0) > 0) return 0
  const base = PICK_STEP * Math.max(0, s.level - 2)
  return Math.round(base * (1 + UPGRADE_STEP * (s.boosts[id] ?? 0)))
}

/** What holding a boost for the next level-up costs: 30, 60, 120… per run. */
export function holdCost(s: RunState): number {
  return HOLD_BASE * 2 ** (s.holdsUsed ?? 0)
}

/** Sets an offered boost aside to come back at the next level-up (one at a time). The caller has paid. */
export function holdBoost(s: RunState, id: BoostId): void {
  if (s.phase !== 'pick' || !s.choices.includes(id) || s.held) return
  s.held = id
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
  if ((s.freePicks ?? 0) > 0) s.freePicks = (s.freePicks ?? 0) - 1
  s.pendingPicks--
  if (s.pendingPicks > 0) {
    s.choices = rollChoices(s)
  } else {
    s.choices = []
    // A board growth due this turn comes right after the pick.
    const canGrow = s.cols < MAX_COLS || s.rows < MAX_ROWS
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
