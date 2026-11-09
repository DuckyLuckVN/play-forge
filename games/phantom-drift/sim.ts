// Phantom Drift simulation: pure, seeded, 60 ticks a second.
// The player is a ghost at depth z = 0; everything else scrolls towards it.

import { randomInt, type RngState } from '@forge/core/rng'
import { clamp01, lerp } from '@forge/fx/tween'
import type { GameDefinition, InputEvent, PlayerInfo } from '@forge/net/session'
import { ramp, tierAt, withinWindow } from '@forge/reflex'
import { pickRow, type HazardPlan } from './spawner'

export type DriftInput = 'left' | 'right' | 'phase'
const INPUTS: readonly DriftInput[] = ['left', 'right', 'phase']

export const TICK_RATE = 60
/** Depth where rows appear. */
export const SPAWN_Z = 100
/** Half-depths used for overlap with the player row. */
const PLAYER_HALF = 2.5
const OBJ_HALF = 2.5
const OVERLAP = PLAYER_HALF + OBJ_HALF
/** Lanes per tick while sliding (≈ 83 ms per lane). */
const LANE_STEP = 0.2
/** Lateral distance to a lane centre that counts as "in" it. */
const HIT_DX = 0.55
const PICK_DX = 0.6

export const TIER_TICKS = 20 * TICK_RATE
export const MAX_TIER = 9
export const INVULN_TICKS = 90
export const HEART_REGEN_TICKS = 45 * TICK_RATE
export const MAX_HEARTS = 3
export const PHANTOM_COST = 10
export const PHANTOM_TICKS = 2 * TICK_RATE
/** Leaving a lane less than this before danger arrives = near miss (150 ms). */
export const NEAR_WINDOW = 9
/** Dying phase before the results: the death plays out (2 s). */
export const DEATH_TICKS = 120
/** Per-tick speed decay while dying: the rift coasts to a stop. */
const DEATH_BRAKE = 0.94
const SLAM_TICKS = 6

const DISTANCE_POINTS = 0.2
export const WISP_POINTS = 10
const NEAR_POINTS = 50

/** Rift speed in depth units per second. */
export const speedAt = (tier: number) => ramp(tier, MAX_TIER, 45, 108)
export const laneCount = (tier: number) => (tier >= 5 ? 5 : tier >= 3 ? 4 : 3)
/** Ticks between rows; keeps shrinking slowly past the cap, never below 0.6 s. */
export function rowIntervalTicks(rawTier: number): number {
  const seconds =
    rawTier <= MAX_TIER ? ramp(rawTier, MAX_TIER, 1.1, 0.62) : 0.62 - (rawTier - MAX_TIER) * 0.01
  return Math.round(Math.max(0.6, seconds) * TICK_RATE)
}
/** Faller warning time: 0.8 s → 0.35 s. */
export const fallerTelegraph = (tier: number) => Math.round(ramp(tier, MAX_TIER, 0.8, 0.35) * TICK_RATE)
/** Combo multiplier x1..x5: +1 for every `step` combo (5 unless a perk says otherwise). */
export const multiplier = (combo: number, step = 5) => 1 + Math.min(4, Math.floor(combo / step))

/**
 * The tuning a character can bend. Lives in the state so the sim stays pure
 * and deterministic: the same seed and perks always play out the same.
 */
export interface Perks {
  /** Dodges/wisps per multiplier step. */
  comboStep: number
  phantomTicks: number
  /** Calm ticks before a lost heart grows back. */
  regenTicks: number
  /** Near-miss window in ticks. */
  nearWindow: number
  wispPoints: number
  /** Wisps needed to fill the Phantom ring. */
  phantomCost: number
}

/** The plain ghost: no perk. */
export const BASE_PERKS: Readonly<Perks> = Object.freeze({
  comboStep: 5,
  phantomTicks: PHANTOM_TICKS,
  regenTicks: HEART_REGEN_TICKS,
  nearWindow: NEAR_WINDOW,
  wispPoints: WISP_POINTS,
  phantomCost: PHANTOM_COST,
})

export type ObjKind = 'shard' | 'wisp' | 'wall' | 'sweeper'
export interface Obj {
  id: number
  kind: ObjKind
  row: number
  z: number
  /** Current lane position (sweepers slide, the rest stay put). */
  lane: number
  gap?: number
  from?: number
  to?: number
  /** Tick the object reached the player row. */
  arrivedAt?: number
  /** Already hit, collected, passed through or scored. */
  done?: boolean
}

export interface Faller {
  id: number
  lane: number
  slamAt: number
  /** Warning length, for drawing the shake/shadow. */
  tele: number
}

export interface Player {
  id: string
  /** Drawn and collided position, in lanes. */
  x: number
  target: number
  leftLane: number
  leftAt: number
  hearts: number
  invulnUntil: number
  phantomUntil: number
  charge: number
  combo: number
  /** Last hit or heal; hearts regrow after a calm stretch. */
  calmSince: number
}

export type DriftEvent =
  | { type: 'move' }
  | { type: 'hit' }
  | { type: 'wisp'; lane: number; points: number }
  | { type: 'nearMiss'; lane: number; points: number }
  | { type: 'phantom' }
  | { type: 'phantomEnd' }
  | { type: 'charged' }
  | { type: 'slam'; lane: number }
  /** A faller starts warning over `lane`; it slams in `ticks`. */
  | { type: 'warn'; lane: number; ticks: number }
  | { type: 'multiplier'; mult: number }
  | { type: 'heal' }
  | { type: 'tier'; tier: number }
  | { type: 'lanes'; lanes: number }
  /** Last heart gone: the dying phase starts. */
  | { type: 'die' }
  | { type: 'over' }

/** Totals for the end-of-run summary. */
export interface RunStats {
  wisps: number
  nearMisses: number
  bestCombo: number
  phantoms: number
  /** Depth units per second. */
  topSpeed: number
}

export interface DriftState {
  tick: number
  rng: RngState
  tier: number
  lanes: number
  /** Depth units per second right now. */
  speed: number
  /** Total depth travelled, for scrolling scenery. */
  dist: number
  score: number
  player: Player
  objects: Obj[]
  fallers: Faller[]
  /** Empty slots on their way: fallers drop when one reaches the player. */
  drops: { at: number; count: number }[]
  spawnIn: number
  nextId: number
  nextRow: number
  /** Tick the ghost died (dying phase runs until `over`). */
  diedAt: number | null
  /** Distance when it died: what the run counts, not the coast to a stop. */
  diedDist: number | null
  over: boolean
  stats: RunStats
  /** The character's tuning (see {@link Perks}). */
  perks: Perks
  events: DriftEvent[]
}

export function createState(
  players: PlayerInfo[],
  seed: number,
  perks: Readonly<Perks> = BASE_PERKS,
): DriftState {
  return {
    tick: 0,
    rng: { seed },
    tier: 0,
    lanes: laneCount(0),
    speed: speedAt(0),
    dist: 0,
    score: 0,
    player: {
      id: players[0]?.id ?? 'solo',
      x: 1,
      target: 1,
      leftLane: 1,
      leftAt: -Infinity,
      hearts: MAX_HEARTS,
      invulnUntil: 0,
      phantomUntil: 0,
      charge: 0,
      combo: 0,
      calmSince: 0,
    },
    objects: [],
    fallers: [],
    drops: [],
    spawnIn: 30, // half a second to settle in
    nextId: 1,
    nextRow: 1,
    diedAt: null,
    diedDist: null,
    over: false,
    stats: { wisps: 0, nearMisses: 0, bestCombo: 0, phantoms: 0, topSpeed: speedAt(0) },
    perks: { ...perks },
    events: [],
  }
}

const phantom = (s: DriftState) => s.tick < s.player.phantomUntil

/** Lanes an object covers at the player row right now. */
export function covers(o: Obj, lanes: number): number[] {
  if (o.kind === 'wall') return Array.from({ length: lanes }, (_, l) => l).filter((l) => l !== o.gap)
  return [o.lane]
}

function touches(x: number, lanes: number[], reach: number): boolean {
  return lanes.some((l) => Math.abs(x - l) < reach)
}

function applyInput(s: DriftState, input: DriftInput) {
  const p = s.player
  if (input === 'phase') {
    if (p.charge >= s.perks.phantomCost && !phantom(s)) {
      p.charge = 0
      p.phantomUntil = s.tick + s.perks.phantomTicks
      s.stats.phantoms++
      s.events.push({ type: 'phantom' })
    }
    return
  }
  const target = Math.max(0, Math.min(s.lanes - 1, p.target + (input === 'left' ? -1 : 1)))
  if (target === p.target) return
  p.leftLane = Math.round(p.x)
  p.leftAt = s.tick
  p.target = target
  s.events.push({ type: 'move' })
}

function hit(s: DriftState) {
  const p = s.player
  if (phantom(s) || s.tick < p.invulnUntil) return
  p.hearts--
  p.combo = 0
  p.invulnUntil = s.tick + INVULN_TICKS
  p.calmSince = s.tick
  s.events.push({ type: 'hit' })
}

/** The multiplier right now, with the character's combo step. */
export const comboMultiplier = (s: DriftState) => multiplier(s.player.combo, s.perks.comboStep)

function reward(s: DriftState, base: number): number {
  const before = comboMultiplier(s)
  const points = base * before
  s.score += points
  s.player.combo++
  s.stats.bestCombo = Math.max(s.stats.bestCombo, s.player.combo)
  const after = comboMultiplier(s)
  if (after > before) s.events.push({ type: 'multiplier', mult: after })
  return points
}

function nearMiss(s: DriftState, lanes: number[], arrivedAt: number) {
  const p = s.player
  if (!lanes.includes(p.leftLane) || !withinWindow(p.leftAt, arrivedAt, s.perks.nearWindow)) return
  const points = reward(s, NEAR_POINTS)
  s.stats.nearMisses++
  s.events.push({ type: 'nearMiss', lane: p.leftLane, points })
}

function spawnRow(s: DriftState) {
  const row = pickRow(s.rng, s.tier, s.lanes)
  const id = s.nextRow++
  const add = (o: Omit<Obj, 'id' | 'row' | 'z'>) =>
    s.objects.push({ id: s.nextId++, row: id, z: SPAWN_Z, ...o })
  for (const h of row.hazards) add(fromPlan(h))
  for (const lane of row.wisps) add({ kind: 'wisp', lane })
  if (row.drop) s.drops.push({ at: s.tick + Math.ceil((SPAWN_Z / s.speed) * TICK_RATE), count: row.drop })
}

function fromPlan(h: HazardPlan): Omit<Obj, 'id' | 'row' | 'z'> {
  if (h.kind === 'shard') return { kind: 'shard', lane: h.lane }
  if (h.kind === 'wall') return { kind: 'wall', lane: h.gap, gap: h.gap }
  return { kind: 'sweeper', lane: h.from, from: h.from, to: h.to }
}

function updateDifficulty(s: DriftState) {
  const tier = tierAt(s.tick, TIER_TICKS, MAX_TIER)
  if (tier !== s.tier) {
    s.tier = tier
    s.speed = speedAt(tier)
    s.stats.topSpeed = Math.max(s.stats.topSpeed, s.speed)
    s.events.push({ type: 'tier', tier })
    const lanes = laneCount(tier)
    if (lanes !== s.lanes) {
      s.lanes = lanes
      s.events.push({ type: 'lanes', lanes })
    }
  }
}

function updateObjects(s: DriftState) {
  const p = s.player
  const dz = s.speed / TICK_RATE
  for (const o of s.objects) {
    o.z -= dz
    if (o.kind === 'sweeper')
      o.lane = lerp(o.from!, o.to!, clamp01(1 - (o.z - OVERLAP) / (SPAWN_Z - OVERLAP)))
    if (o.done) continue
    const overlapping = Math.abs(o.z) < OVERLAP
    if (overlapping && o.arrivedAt === undefined) o.arrivedAt = s.tick
    if (o.kind === 'wisp') {
      if (overlapping && Math.abs(p.x - o.lane) < PICK_DX) {
        o.done = true
        const points = reward(s, s.perks.wispPoints)
        s.stats.wisps++
        const was = p.charge
        const cost = s.perks.phantomCost
        p.charge = Math.min(cost, p.charge + 1)
        s.events.push({ type: 'wisp', lane: o.lane, points })
        if (was < cost && p.charge === cost) s.events.push({ type: 'charged' })
      }
      continue
    }
    const lanes = covers(o, s.lanes)
    if (overlapping) {
      if (phantom(s)) o.done = true
      else if (touches(p.x, lanes, HIT_DX)) {
        o.done = true
        hit(s)
      }
    } else if (o.z <= -OVERLAP) {
      o.done = true
      nearMiss(s, lanes, o.arrivedAt ?? s.tick)
    }
  }
  s.objects = s.objects.filter((o) => o.z > -20 && !(o.kind === 'wisp' && o.done))
}

function updateFallers(s: DriftState) {
  const p = s.player
  const tele = fallerTelegraph(s.tier)
  for (const d of s.drops) {
    if (s.tick < d.at - tele) continue
    // Aim at where the player is heading; extra fallers take other lanes.
    const lanes = [p.target]
    while (lanes.length < Math.min(d.count, s.lanes - 1)) {
      const l = randomInt(s.rng, s.lanes)
      if (!lanes.includes(l)) lanes.push(l)
    }
    for (const lane of lanes) {
      s.fallers.push({ id: s.nextId++, lane, slamAt: d.at, tele: d.at - s.tick })
      s.events.push({ type: 'warn', lane, ticks: d.at - s.tick })
    }
  }
  s.drops = s.drops.filter((d) => s.tick < d.at - tele)

  for (const f of s.fallers) {
    if (s.tick === f.slamAt) s.events.push({ type: 'slam', lane: f.lane })
    if (s.tick < f.slamAt || s.tick >= f.slamAt + SLAM_TICKS) continue
    if (phantom(s)) continue
    if (touches(p.x, [f.lane], HIT_DX)) {
      f.slamAt = -Infinity // spent
      hit(s)
    } else if (s.tick === f.slamAt) nearMiss(s, [f.lane], f.slamAt)
  }
  s.fallers = s.fallers.filter((f) => s.tick < f.slamAt + SLAM_TICKS)
}

/** The death playing out: no input, no hits, no score; the world brakes to a stop. */
function stepDying(s: DriftState) {
  s.speed *= DEATH_BRAKE
  const dz = s.speed / TICK_RATE
  s.dist += dz
  for (const o of s.objects) o.z -= dz
  s.fallers = []
  s.drops = []
  if (s.tick - s.diedAt! >= DEATH_TICKS - 1) {
    s.over = true
    s.events.push({ type: 'over' })
  }
  s.tick++
}

export function step(s: DriftState, inputs: InputEvent<DriftInput>[]): DriftState {
  if (s.over) return s
  s.events = []
  if (s.diedAt !== null) {
    stepDying(s)
    return s
  }
  const p = s.player
  for (const { input } of inputs) if (INPUTS.includes(input)) applyInput(s, input)

  // Slide towards the target lane.
  const dx = p.target - p.x
  p.x = Math.abs(dx) <= LANE_STEP ? p.target : p.x + Math.sign(dx) * LANE_STEP

  updateDifficulty(s)
  if (--s.spawnIn <= 0) {
    spawnRow(s)
    s.spawnIn += rowIntervalTicks(Math.floor(s.tick / TIER_TICKS))
  }
  s.dist += s.speed / TICK_RATE
  updateObjects(s)
  updateFallers(s)

  if (s.tick === p.phantomUntil - 1) s.events.push({ type: 'phantomEnd' })
  s.score += (s.speed / TICK_RATE) * DISTANCE_POINTS * comboMultiplier(s)

  if (p.hearts >= MAX_HEARTS) p.calmSince = s.tick
  else if (s.tick - p.calmSince >= s.perks.regenTicks) {
    p.hearts++
    p.calmSince = s.tick
    s.events.push({ type: 'heal' })
  }

  if (p.hearts <= 0) {
    s.diedAt = s.tick
    s.diedDist = s.dist
    s.events.push({ type: 'die' })
  }
  s.tick++
  return s
}

export const phantomDrift: GameDefinition<DriftState, DriftInput> = {
  id: 'phantom-drift',
  tickRate: TICK_RATE,
  minPlayers: 1,
  maxPlayers: 1,
  setup: (players, seed) => createState(players, seed),
  tick: step,
  isFinished: (s) => s.over,
  removePlayer: () => {},
}

/** Whole points, for display. */
export const displayScore = (s: DriftState) => Math.floor(s.score)
