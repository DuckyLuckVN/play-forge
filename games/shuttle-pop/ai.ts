// Computer opponent: per-tick inputs for an AI seat. Pure; rng injected (the sim's seeded rng).
// The plan (where to stand, when to swing, which shot) is computed once per incoming shot, reactTicks
// after the opponent's hit, and cached in BotMemory (plain data, lives in SpPlayer → JSON-safe).
import { COURT, isIn, predictLanding, stepShuttle, type Flight } from './physics'
import { findContact, REACH, WINDOW, type Grade } from './shots'
import { CHARGE } from './charge'
import { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld } from './court'
import type { SpInput, SpState } from './sim'

type GradeRoll = Grade | 'whiff'

export const LEVELS = {
  easy: {
    reactTicks: 22,
    speedMul: 0.72,
    grade: { perfect: 0.1, good: 0.55, late: 0.22, whiff: 0.13 },
    smash: 0.15,
    misjudge: 0.3,
    charge: 0.15,
  },
  normal: {
    reactTicks: 14,
    speedMul: 0.88,
    grade: { perfect: 0.34, good: 0.5, late: 0.1, whiff: 0.06 },
    smash: 0.4,
    misjudge: 0,
    charge: 0.25,
  },
  hard: {
    reactTicks: 10,
    speedMul: 0.93,
    grade: { perfect: 0.52, good: 0.31, late: 0.08, whiff: 0.09 },
    smash: 0.85,
    misjudge: 0,
    charge: 0.7,
  },
} satisfies Record<
  string,
  {
    reactTicks: number
    speedMul: number
    grade: Record<GradeRoll, number>
    smash: number
    /** Chance to get in/out wrong for a shuttle landing within NEAR_LINE of a line. */
    misjudge: number
    /** Chance to hold-to-charge a smash / clear / drive (drops are never charged). */
    charge: number
  }
>

export type BotLevel = keyof typeof LEVELS

export interface BotMemory {
  /** Tick the current plan was made (opponent's shot tick + reactTicks); -1 = none. */
  targetAt: number
  /** World-space spot to stand on. */
  target: { x: number; z: number }
  /** Tick to press swing; -1 = don't swing (shot is going out / into the net). */
  plannedSwingTick: number
  /** View-relative held direction for the planned swing. */
  plannedHeld: { x: number; z: number }
  /** Tick to start charging the planned swing (once in place); -1 = a tap / already pressed. */
  plannedChargeTick: number
  /** This bot's own rng stream (mulberry32 seed): no draw-order coupling with the other seat. */
  rng: number
}

/** Server swings this many ticks into the serve phase (well under SERVE_TIMEOUT). */
export const BOT_SERVE_TICKS = 30
const LONG_SERVE_P = 0.35
/** Ready position depth, metres from the net. */
const BASE_Z = 3.2
/** Stand this far beside the shuttle's path at the meet point (closest approach = meet tick). */
const SIDE_OFFSET = 0.4
/** Meet the falling shuttle at this height (smash attempts: SMASH_MEET_Y), leaving room for late swings. */
const MEET_Y = 1.4
/** Line calls within this distance (m) of a line can be misjudged (LEVELS.misjudge). */
export const NEAR_LINE = 0.3
/** Extra ticks on top of distance / speed to get going and settle (accel + arrive easing). */
const ARRIVE_TICKS = 12
const SMASH_MEET_Y = 2.6
/** Non-smash shot weights (held z: clear −1, drop 0, drive +1). */
const SHOT_MIX = { clear: 0.4, drop: 0.3, drive: 0.3 }
/** Charge holds (ticks): a little past the start up to a little past full. */
const CHARGE_HOLD = { min: CHARGE.full - 6, max: CHARGE.full + 6 }
/** Only start charging this close to the standing spot (m): charging slows the run. */
const CHARGE_NEAR = 0.35
/** Move input eases off within this distance of the target (no overshoot). */
const ARRIVE = 0.5
const STOP = 0.03
const MOVE_LIMIT_X = COURT.halfWidth + 0.75
const MOVE_LIMIT_Z = COURT.halfLen + 0.75

/** seed: the match seed; each side gets its own stream. */
export const newBotMemory = (seed: number, side: 0 | 1): BotMemory => ({
  targetAt: -1,
  target: { x: 0, z: 0 },
  plannedSwingTick: -1,
  plannedHeld: { x: 0, z: 0 },
  plannedChargeTick: -1,
  rng: (seed ^ Math.imul(0x9e3779b9, side + 1)) | 0,
})

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

const randInt = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

function rollGrade(level: BotLevel, rng: () => number): GradeRoll {
  const w = LEVELS[level].grade
  let r = rng() * (w.perfect + w.good + w.late + w.whiff)
  for (const g of ['perfect', 'good', 'late'] as const) {
    if (r < w[g]) return g
    r -= w[g]
  }
  return 'whiff'
}

/**
 * Swing tick offset from the contact tick (swing = contact + offset) that lands in the grade's window.
 * sim grades dt = contact − swing: |dt| ≤ perfect, ≤ good, late only early (dt in (good, late]);
 * whiff = swung after −pastGrace.
 */
function swingOffset(g: GradeRoll, rng: () => number): number {
  const sign = rng() < 0.5 ? -1 : 1
  if (g === 'perfect') return randInt(rng, -WINDOW.perfect, WINDOW.perfect)
  if (g === 'good') return sign * randInt(rng, WINDOW.perfect + 1, WINDOW.good)
  if (g === 'late') return -randInt(rng, WINDOW.good + 1, WINDOW.late)
  return randInt(rng, WINDOW.pastGrace + 1, WINDOW.pastGrace + 3)
}

/** Within NEAR_LINE of a side or back line. */
const nearLine = (p: { x: number; z: number }) =>
  Math.abs(Math.abs(p.x) - COURT.halfWidth) <= NEAR_LINE ||
  Math.abs(Math.abs(p.z) - COURT.halfLen) <= NEAR_LINE

const onMyHalf = (z: number, side: 0 | 1) => (side === 0 ? z < 0 : z > 0)

function clampTarget(t: { x: number; z: number }, side: 0 | 1) {
  t.x = Math.max(-MOVE_LIMIT_X, Math.min(MOVE_LIMIT_X, t.x))
  const a = Math.max(NET_MARGIN + 0.05, Math.min(MOVE_LIMIT_Z, Math.abs(t.z)))
  t.z = side === 0 ? -a : a
}

/**
 * Pick where to meet the shuttle: scan its flight (ticks on my half, in reach height) for spots I can
 * reach in time at my speed, preferring a contact height near `prefY`. If none is reachable, the one I
 * miss by the least (still try). Stand SIDE_OFFSET beside the path (my side) so the closest approach is
 * that tick. Returns the standing spot + the meet height, or null if the shuttle never comes in reach.
 */
function meetSpot(s: SpState, side: 0 | 1, level: BotLevel, prefY: number, maxTicks: number) {
  const me = s.players[side]
  const speed = (MOVE_SPEED * LEVELS[level].speedMul) / TICK_RATE // m per tick
  const f = scratch
  Object.assign(f.pos, s.shuttle.pos)
  Object.assign(f.vel, s.shuttle.vel)
  let best: { x: number; z: number; y: number } | null = null
  let bestScore = Infinity
  for (let t = 0; t <= maxTicks; t++) {
    const { pos, vel } = f
    if (onMyHalf(pos.z, side) && pos.y >= REACH.minY + 0.1 && pos.y <= REACH.maxY - 0.1) {
      const h = Math.hypot(vel.x, vel.z) || 1
      let px = -vel.z / h
      let pz = vel.x / h
      if (px * (me.x - pos.x) + pz * (me.z - pos.z) < 0) {
        px = -px
        pz = -pz
      }
      const x = pos.x + px * SIDE_OFFSET
      const z = pos.z + pz * SIDE_OFFSET
      const need = Math.hypot(x - me.x, z - me.z) / speed + ARRIVE_TICKS
      const lateBy = need - t
      // Reachable spots compete on height; unreachable ones (score ≥ 100) on how late I'd be.
      const score = lateBy <= 0 ? Math.abs(pos.y - prefY) : 100 + lateBy
      if (score < bestScore) {
        bestScore = score
        best = { x, z, y: pos.y }
      }
    }
    if (stepShuttle(f).netHit || pos.y <= 0) break
  }
  return best
}

/** Plan the reply to the shuttle now in flight toward `side`. */
function plan(s: SpState, side: 0 | 1, level: BotLevel, mem: BotMemory, rng: () => number) {
  const L = LEVELS[level]
  const land = predictLanding(s.shuttle)
  const back = side === 0 ? -1 : 1 // world z sign of "away from the net"
  mem.plannedSwingTick = -1
  mem.plannedChargeTick = -1
  // Leave shots that go into the net or out (near-line calls can be misjudged on low levels).
  let callIn = isIn(land.pos, side)
  if (nearLine(land.pos) && rng() < L.misjudge) callIn = !callIn
  if (land.netHit || !callIn) {
    mem.target = { x: 0, z: back * BASE_Z }
    return
  }
  const grade = rollGrade(level, rng)
  const smashTry = rng() < L.smash
  // A rolled whiff meets the shuttle high so the too-late swing still happens in the air (visible whiff).
  const meetY = smashTry || grade === 'whiff' ? SMASH_MEET_Y : MEET_Y
  const meet = meetSpot(s, side, level, meetY, land.ticks)
  const high = smashTry && grade !== 'whiff' && meet !== null && meet.y >= REACH.smashY
  const target = meet ? { x: meet.x, z: meet.z } : { x: land.pos.x, z: land.pos.z + back * SIDE_OFFSET }
  clampTarget(target, side)
  mem.target = target
  const c = findContact(s.shuttle, target, 0, land.ticks)
  if (!c) return
  mem.plannedSwingTick = Math.max(s.tick, s.tick + c.dt + swingOffset(grade, rng))
  // Aim away from the opponent, in my view frame (held x = screen right; shotTarget mirrors it per side).
  const opp = s.players[side === 0 ? 1 : 0]
  const oppView = toWorld(side, opp.x, opp.z).x
  const away = Math.abs(oppView) > 0.3 ? -Math.sign(oppView) : rng() < 0.5 ? -1 : 1
  const heldX = away * (0.3 + 0.5 * rng())
  let heldZ: number
  if (high) heldZ = 1
  else {
    const r = rng() * (SHOT_MIX.clear + SHOT_MIX.drop + SHOT_MIX.drive)
    heldZ = r < SHOT_MIX.clear ? -1 : r < SHOT_MIX.clear + SHOT_MIX.drop ? 0 : 1
  }
  mem.plannedHeld = { x: heldX, z: heldZ }
  // Power: hold the swing button through the set-up (drawn last: the other rolls keep their order).
  const hold = randInt(rng, CHARGE_HOLD.min, CHARGE_HOLD.max)
  // Only on a clean (Perfect) roll: a charged Good / Late sprays (shots.ts POWER.jitter).
  if (heldZ !== 0 && grade === 'perfect' && rng() < L.charge)
    mem.plannedChargeTick = mem.plannedSwingTick - hold
}

/** Move input (view-relative, length = speedMul when far) toward a world-space point. */
function moveToward(s: SpState, side: 0 | 1, level: BotLevel, to: { x: number; z: number }): SpInput {
  const p = s.players[side]
  const dx = to.x - p.x
  const dz = to.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < STOP) return { t: 'move', x: 0, z: 0 }
  const k = (LEVELS[level].speedMul * Math.min(1, d / ARRIVE)) / d
  const v = toWorld(side, dx * k, dz * k) // toWorld is its own inverse
  return { t: 'move', x: v.x, z: v.z }
}

/** Tick of the opponent's latest hit/serve still in the event log, or -1. */
function lastShotTick(s: SpState, opp: 0 | 1): number {
  let at = -1
  for (const e of s.events)
    if ((e.k === 'hit' || e.k === 'serve') && e.side === opp && e.tick > at) at = e.tick
  return at
}

const STILL: SpInput = { t: 'move', x: 0, z: 0 }
const CHARGE_IN: SpInput = { t: 'charge' }
const UNCHARGE: SpInput = { t: 'charge', cancel: true }

/** The AI seat's inputs for this tick. Mutates `mem` (the plan cache). */
export function botStep(
  s: SpState,
  side: 0 | 1,
  level: BotLevel,
  mem: BotMemory,
  rng: () => number,
): SpInput[] {
  // A charge left over (the rally ended before the planned swing) would slow the next rally: drop it.
  const charging = s.players[side].chargeAt >= 0
  if (s.phase === 'serve') {
    mem.targetAt = -1
    if (s.server === side && s.phaseT === BOT_SERVE_TICKS) {
      const z = rng() < LONG_SERVE_P ? -1 : 0
      return [STILL, { t: 'swing', x: 0, z, tick: s.tick }]
    }
    return charging ? [STILL, UNCHARGE] : [STILL]
  }
  if (s.phase !== 'rally') return charging ? [STILL, UNCHARGE] : [STILL]
  const opp: 0 | 1 = side === 0 ? 1 : 0
  const back = side === 0 ? -1 : 1
  if (s.shuttle.lastHitter !== opp) {
    mem.targetAt = -1
    const home = moveToward(s, side, level, { x: 0, z: back * BASE_Z })
    return charging ? [home, UNCHARGE] : [home]
  }
  // The shot's event outlives reactTicks; once it scrolls out of the log the cached plan still holds.
  const shot = lastShotTick(s, opp)
  const planAt = shot + LEVELS[level].reactTicks
  if (shot >= 0 && s.tick >= planAt && mem.targetAt !== planAt) {
    mem.targetAt = planAt
    plan(s, side, level, mem, rng)
  }
  const planned = mem.targetAt >= 0 && (shot < 0 || mem.targetAt === planAt)
  // Still reacting: drift back toward base until the plan is made.
  const to = planned ? mem.target : { x: 0, z: back * BASE_Z }
  const out: SpInput[] = [moveToward(s, side, level, to)]
  const me = s.players[side]
  if (
    planned &&
    mem.plannedChargeTick >= 0 &&
    s.tick >= mem.plannedChargeTick &&
    s.tick < mem.plannedSwingTick &&
    Math.hypot(mem.target.x - me.x, mem.target.z - me.z) <= CHARGE_NEAR
  ) {
    mem.plannedChargeTick = -1
    out.push(CHARGE_IN)
  }
  if (planned && s.tick === mem.plannedSwingTick) {
    out.push({ t: 'swing', x: mem.plannedHeld.x, z: mem.plannedHeld.z, tick: s.tick })
  } else if (charging && !(planned && s.tick < mem.plannedSwingTick)) out.push(UNCHARGE)
  return out
}
