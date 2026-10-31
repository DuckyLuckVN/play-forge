import { random } from '@forge/core/rng'
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
}

const WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 }

export type Mods = ReturnType<typeof modsOf>

export function modsOf(boosts: Partial<Record<BoostId, number>>) {
  const n = (id: BoostId) => boosts[id] ?? 0
  return {
    damageMult: 1 + 0.25 * n('damage'),
    coinMult: 1 + 0.3 * n('coins'),
    speedMult: 1 + 0.15 * n('speed'),
    pierce: n('pierce') ? 1 : 0,
    critChance: 0.1 * n('crit'),
    bouncy: n('bouncy') > 0,
  }
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return 8 + 6 * level
}

/** Up to 3 distinct boosts that aren't maxed out, weighted by rarity. */
export function rollChoices(s: RunState): BoostId[] {
  const pool = (Object.keys(BOOSTS) as BoostId[]).filter((id) => (s.boosts[id] ?? 0) < BOOSTS[id].max)
  const picked: BoostId[] = []
  while (picked.length < 3 && pool.length) {
    const total = pool.reduce((sum, id) => sum + WEIGHT[BOOSTS[id].rarity], 0)
    let roll = random(s.rng) * total
    const i = pool.findIndex((id) => (roll -= WEIGHT[BOOSTS[id].rarity]) < 0)
    picked.push(...pool.splice(i, 1))
  }
  return picked
}

export function pickBoost(s: RunState, id: BoostId): void {
  if (s.phase !== 'pick' || !s.choices.includes(id)) return
  s.boosts[id] = (s.boosts[id] ?? 0) + 1
  if (id === 'balls') s.ballCount += 2
  if (id === 'double') s.doubleVolleys += 3
  s.pendingPicks--
  if (s.pendingPicks > 0) {
    s.choices = rollChoices(s)
  } else {
    s.choices = []
    s.phase = 'aim'
  }
}

export function reroll(s: RunState): void {
  if (s.phase !== 'pick' || s.rerolls <= 0) return
  s.rerolls--
  s.choices = rollChoices(s)
}
