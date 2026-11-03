// Halo Guard simulation: pure, seeded, 60 ticks a second.
// A core sits at the centre; projectiles fly in along 4 lanes (0 up, 1 right,
// 2 down, 3 left) and land at the shield radius. Face the lane to block.
// Arrivals are planned ahead (see `planNext`), so every pattern is fair.

import { random, randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, InputEvent, PlayerInfo } from '@forge/net/session'
import { ramp, tierAt } from '@forge/reflex'
import { addCombo, comboMultiplier, createVitals, damage, regen, type Vitals } from '@forge/reflex/vitals'

export type Dir = 0 | 1 | 2 | 3
export type GuardInput = 'up' | 'right' | 'down' | 'left' | 'nova'
const DIR_OF: Record<string, Dir> = { up: 0, right: 1, down: 2, left: 3 }

export const TICK_RATE = 60
/** Distance where projectiles appear, and where they land (the shield). */
export const SPAWN_D = 100
export const SHIELD_D = 22
const TRAVEL = SPAWN_D - SHIELD_D

/** A press this recent before impact is a perfect parry (≈ 167 ms). */
export const PERFECT_WINDOW = 10
/** Pressing the lane you already face re-arms the parry only after this (no mashing). */
export const REPARRY_TICKS = 24
/** Shortest gap between two arrivals on the same lane. */
export const SAME_GAP = 9

export const TIER_TICKS = 20 * TICK_RATE
export const MAX_TIER = 9
export const MAX_HEARTS = 3
export const INVULN_TICKS = 90
export const REGEN_TICKS = 40 * TICK_RATE
export const NOVA_COST = 8
export const NOVA_TICKS = 90
export const DEATH_TICKS = 120
export const COMBO_PER = 8
export const MAX_MULT = 5
/** First arrival after this many ticks: a moment to get your bearings. */
const OPENING = 120

export const POINTS = { block: 10, perfect: 25, spark: 15, nova: 5 }

export type Kind = 'bolt' | 'heavy' | 'feint' | 'spark'
export const isThreat = (k: Kind) => k !== 'spark'

/** Bolt speed in distance units per second: 55 → 120. */
export const speedAt = (tier: number) => ramp(tier, MAX_TIER, 55, 120)
export const kindSpeed = (kind: Kind, tier: number) =>
  speedAt(tier) * (kind === 'heavy' ? 0.62 : kind === 'spark' ? 0.8 : 1)
export const travelTicks = (kind: Kind, tier: number) =>
  Math.ceil((TRAVEL / kindSpeed(kind, tier)) * TICK_RATE)
/** Typical time between arrivals: 1.0 s → 0.36 s. */
export const gapTicks = (tier: number) => Math.round(ramp(tier, MAX_TIER, 1.0, 0.36) * TICK_RATE)
/** Time always given to turn from one lane to another: 0.45 s → 0.25 s. */
export const switchTicks = (tier: number) => Math.round(ramp(tier, MAX_TIER, 0.45, 0.25) * TICK_RATE)

export interface Proj {
  id: number
  kind: Kind
  /** Lane now (a feint changes it once). */
  dir: Dir
  /** Lane it was launched on. */
  from: Dir
  /** Lane it lands on (differs from `from` for feints). */
  to: Dir
  /** Distance from the centre. */
  d: number
  speed: number
  arriveAt: number
  /** Feints: tick they hop to `dir`. */
  hopAt?: number
}

interface Planned {
  spawnAt: number
  arriveAt: number
  kind: Kind
  dir: Dir
  from: Dir
  hopAt?: number
}

export type GuardEvent =
  | { type: 'turn'; dir: Dir }
  | { type: 'launch'; kind: Kind; dir: Dir }
  | { type: 'hop'; id: number; from: Dir; dir: Dir }
  | { type: 'block'; dir: Dir; kind: Kind; perfect: boolean; points: number }
  | { type: 'spark'; dir: Dir; points: number }
  | { type: 'fizzle'; dir: Dir }
  | { type: 'hit'; dir: Dir; kind: Kind }
  | { type: 'charged' }
  | { type: 'nova'; popped: number; points: number }
  | { type: 'novaEnd' }
  | { type: 'multiplier'; mult: number }
  | { type: 'heal' }
  | { type: 'tier'; tier: number }
  | { type: 'die' }
  | { type: 'over' }

export interface GuardStats {
  blocks: number
  perfects: number
  sparks: number
  novas: number
}

export interface GuardState {
  tick: number
  rng: RngState
  tier: number
  score: number
  playerId: string
  shield: Dir
  /** Last parry press (a turn, or a re-press after REPARRY_TICKS). */
  parryAt: number
  vitals: Vitals
  charge: number
  novaUntil: number
  projs: Proj[]
  plan: Planned[]
  /** Planner memory: the next free arrival tick and what came last. */
  nextArrive: number
  lastThreat: { dir: Dir; at: number } | null
  lastSpark: { dir: Dir; at: number } | null
  lastArrive: number
  nextId: number
  stats: GuardStats
  events: GuardEvent[]
  diedAt: number | null
  over: boolean
}

export function createState(players: PlayerInfo[], seed: number): GuardState {
  return {
    tick: 0,
    rng: { seed },
    tier: 0,
    score: 0,
    playerId: players[0]?.id ?? 'p0',
    shield: 0,
    parryAt: -Infinity,
    vitals: createVitals(MAX_HEARTS),
    charge: 0,
    novaUntil: 0,
    projs: [],
    plan: [],
    nextArrive: OPENING,
    lastThreat: null,
    lastSpark: null,
    lastArrive: -Infinity,
    nextId: 1,
    stats: { blocks: 0, perfects: 0, sparks: 0, novas: 0 },
    events: [],
    diedAt: null,
    over: false,
  }
}

export const novaActive = (s: GuardState) => s.tick < s.novaUntil
export const mult = (s: GuardState) => comboMultiplier(s.vitals.combo, COMBO_PER, MAX_MULT)

/** Pick what arrives next and when, keeping every lane change reachable. */
export function planNext(s: GuardState): void {
  const tier = s.tier
  const r = random(s.rng)
  let kind: Kind = 'bolt'
  let volley = false
  if (tier >= 1 && r < 0.13) kind = 'spark'
  else if (tier >= 1 && r < 0.28) kind = 'heavy'
  else if (tier >= 3 && r < 0.43) kind = 'feint'
  else if (tier >= 2 && r < 0.55) volley = true

  const prev = s.lastThreat?.dir ?? 0
  // Lanes repeat sometimes (volleys of the same lane feel good to parry).
  let dir: Dir = random(s.rng) < 0.3 ? prev : (randomInt(s.rng, 4) as Dir)
  const sw = switchTicks(tier)
  const base = Math.round(gapTicks(tier) * (0.8 + random(s.rng) * 0.6))

  let at = Math.max(s.nextArrive, s.lastArrive + base)
  if (isThreat(kind)) {
    if (s.lastThreat && s.lastThreat.dir !== dir) at = Math.max(at, s.lastThreat.at + sw)
    if (s.lastSpark && s.lastSpark.dir === dir) at = Math.max(at, s.lastSpark.at + sw)
  } else if (s.lastThreat && s.lastThreat.dir === dir) {
    // A spark on the lane you guard: you need time to turn away.
    at = Math.max(at, s.lastThreat.at + sw)
  }
  at = Math.max(at, s.lastArrive + SAME_GAP, s.tick + travelTicks(kind, tier))

  let from = dir
  let hopAt: number | undefined
  if (kind === 'feint') {
    from = dir
    dir = ((dir + (random(s.rng) < 0.5 ? 1 : 3)) % 4) as Dir
    // The hop always leaves time to turn: a threat on the new lane needs it.
    if (s.lastThreat && s.lastThreat.dir !== dir) at = Math.max(at, s.lastThreat.at + sw)
    if (s.lastSpark && s.lastSpark.dir === dir) at = Math.max(at, s.lastSpark.at + sw)
    hopAt = at - (sw + 10)
  }

  const count = volley ? 3 : 1
  for (let i = 0; i < count; i++) {
    const arriveAt = at + i * (SAME_GAP + 3)
    s.plan.push({ spawnAt: arriveAt - travelTicks(kind, tier), arriveAt, kind, dir, from, hopAt })
    s.lastArrive = arriveAt
    if (isThreat(kind)) s.lastThreat = { dir, at: arriveAt }
    else s.lastSpark = { dir, at: arriveAt }
  }
  s.nextArrive = s.lastArrive + SAME_GAP
}

function launch(s: GuardState, p: Planned) {
  const speed = kindSpeed(p.kind, s.tier)
  const remaining = Math.max(0, p.arriveAt - s.tick)
  const dir = p.hopAt !== undefined && s.tick < p.hopAt ? p.from : p.dir
  s.projs.push({
    id: s.nextId++,
    kind: p.kind,
    dir,
    from: p.from,
    to: p.dir,
    d: SHIELD_D + (speed * remaining) / TICK_RATE,
    speed,
    arriveAt: p.arriveAt,
    hopAt: p.hopAt,
  })
  s.events.push({ type: 'launch', kind: p.kind, dir })
}

function applyInput(s: GuardState, input: GuardInput) {
  if (input === 'nova') {
    if (s.charge < NOVA_COST || novaActive(s)) return
    s.charge = 0
    s.novaUntil = s.tick + NOVA_TICKS
    const popped = s.projs.length
    const points = popped * POINTS.nova * mult(s)
    s.score += points
    s.projs = []
    s.stats.novas++
    s.events.push({ type: 'nova', popped, points })
    return
  }
  const dir = DIR_OF[input]
  if (dir === undefined) return
  if (dir !== s.shield) {
    s.shield = dir
    s.parryAt = s.tick
    s.events.push({ type: 'turn', dir })
  } else if (s.tick - s.parryAt >= REPARRY_TICKS) {
    s.parryAt = s.tick
    s.events.push({ type: 'turn', dir })
  }
}

function gainCharge(s: GuardState) {
  if (s.charge >= NOVA_COST) return
  s.charge++
  if (s.charge === NOVA_COST) s.events.push({ type: 'charged' })
}

function combo(s: GuardState) {
  const up = addCombo(s.vitals, COMBO_PER, MAX_MULT)
  if (up) s.events.push({ type: 'multiplier', mult: up })
}

function arrive(s: GuardState, p: Proj) {
  if (novaActive(s)) {
    s.score += POINTS.nova * mult(s)
    return
  }
  const facing = s.shield === p.dir
  if (p.kind === 'spark') {
    if (facing) {
      s.events.push({ type: 'fizzle', dir: p.dir })
      return
    }
    const points = POINTS.spark * mult(s)
    s.score += points
    s.stats.sparks++
    gainCharge(s)
    combo(s)
    s.events.push({ type: 'spark', dir: p.dir, points })
    return
  }
  if (facing) {
    const perfect = s.tick - s.parryAt <= PERFECT_WINDOW
    const points = (perfect ? POINTS.perfect : POINTS.block) * (p.kind === 'heavy' ? 2 : 1) * mult(s)
    s.score += points
    s.stats.blocks++
    if (perfect) {
      s.stats.perfects++
      gainCharge(s)
    }
    combo(s)
    s.events.push({ type: 'block', dir: p.dir, kind: p.kind, perfect, points })
    return
  }
  if (damage(s.vitals, s.tick, INVULN_TICKS)) s.events.push({ type: 'hit', dir: p.dir, kind: p.kind })
}

function stepDying(s: GuardState) {
  if (s.tick - s.diedAt! >= DEATH_TICKS - 1) {
    s.over = true
    s.events.push({ type: 'over' })
  }
  s.tick++
}

export function step(s: GuardState, inputs: InputEvent<GuardInput>[]): GuardState {
  if (s.over) return s
  s.events = []
  if (s.diedAt !== null) {
    stepDying(s)
    return s
  }
  for (const { input } of inputs) applyInput(s, input)

  const tier = tierAt(s.tick, TIER_TICKS, MAX_TIER)
  if (tier > s.tier) {
    s.tier = tier
    s.events.push({ type: 'tier', tier })
  }

  // Plan far enough ahead that the slowest projectile can still be launched on time.
  const lead = travelTicks('heavy', s.tier) + 2
  while (s.nextArrive - lead <= s.tick) planNext(s)
  const due = s.plan.filter((p) => p.spawnAt <= s.tick)
  if (due.length) {
    s.plan = s.plan.filter((p) => p.spawnAt > s.tick)
    for (const p of due) launch(s, p)
  }

  for (const p of s.projs) {
    p.d = SHIELD_D + (p.speed * Math.max(0, p.arriveAt - s.tick)) / TICK_RATE
    if (p.hopAt === s.tick && p.to !== p.dir) {
      s.events.push({ type: 'hop', id: p.id, from: p.dir, dir: p.to })
      p.dir = p.to
    }
  }
  const landing = s.projs.filter((p) => p.arriveAt <= s.tick)
  if (landing.length) {
    s.projs = s.projs.filter((p) => p.arriveAt > s.tick)
    for (const p of landing) arrive(s, p)
  }

  if (s.tick === s.novaUntil - 1) s.events.push({ type: 'novaEnd' })
  if (regen(s.vitals, s.tick, REGEN_TICKS)) s.events.push({ type: 'heal' })

  if (s.vitals.hearts <= 0) {
    s.diedAt = s.tick
    s.events.push({ type: 'die' })
  }
  s.tick++
  return s
}

export const haloGuard: GameDefinition<GuardState, GuardInput> = {
  id: 'halo-guard',
  tickRate: TICK_RATE,
  minPlayers: 1,
  maxPlayers: 1,
  setup: (players, seed) => createState(players, seed),
  tick: step,
  isFinished: (s) => s.over,
  removePlayer: () => {},
}

export const displayScore = (s: GuardState) => Math.floor(s.score)
