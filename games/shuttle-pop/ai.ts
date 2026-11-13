// Computer opponent: per-tick inputs for an AI seat. Pure; rng injected (the sim's seeded rng).
// The plan (where to stand, when to swing, which shot) is computed once per incoming shot, reactTicks
// after the opponent's hit, and cached in BotMemory (plain data, lives in SpPlayer → JSON-safe).
import { random } from '@forge/core/rng'
import { COURT, isIn, predictLanding, stepShuttle, type CourtDims, type Flight } from './physics'
import { findContact, REACH, WINDOW, type Grade } from './shots'
import { ABILITY, acting, actReady, leadOf, pickAbility, pickReachOf, reachOf, type Strike } from './ability'
import { CHARGE } from './charge'
import { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld } from './court'
import { COVER, coverSpot, mateOf, takerOf } from './doubles'
import { canAct, canStrike, serverPlayer, type SpInput, type SpPlayer, type SpState } from './sim'
import { racketHits, stunImmune, stunned } from './stun'

type GradeRoll = Grade | 'whiff'

/**
 * Per-level skill. Tuned vs the balance harness's scripted players (balance.harness.ts BASELINE; casual
 * wins ~all on Easy, about half on Normal, rarely on Hard): since the bot always swings (safeOffset /
 * EASY), its mistakes are the grade rolls (whiffs on hard balls, Late floaters) instead of standing still;
 * a narrower aim (tactics.wide) keeps rallies longer.
 */
export const LEVELS = {
  easy: {
    reactTicks: 27,
    speedMul: 0.72,
    grade: { perfect: 0.05, good: 0.25, late: 0.3, whiff: 0.4 },
    smash: 0.15,
    misjudge: 0.3,
    charge: 0.15,
    ability: 0.08,
    dive: 0.15,
    tactics: { read: 0.15, body: 0, wide: 0.45 },
  },
  normal: {
    reactTicks: 14,
    speedMul: 0.88,
    grade: { perfect: 0.245, good: 0.37, late: 0.2, whiff: 0.185 },
    smash: 0.3,
    misjudge: 0,
    charge: 0.2,
    ability: 0.25,
    dive: 0.5,
    tactics: { read: 0.5, body: 0.05, wide: 0.55 },
  },
  hard: {
    reactTicks: 9,
    speedMul: 0.93,
    grade: { perfect: 0.55, good: 0.21, late: 0.1, whiff: 0.14 },
    smash: 0.9,
    misjudge: 0,
    charge: 0.75,
    ability: 0.4,
    dive: 0.75,
    tactics: { read: 0.7, body: 0.12, wide: 0.4 },
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
    /** Chance to jump-smash (ability.ts) when the plan offers one (a smash try at a high shuttle). */
    ability: number
    /**
     * Chance to dive (the lunge save, ability.ts) for a ball the plain run can't reach in time. Never on
     * a rolled whiff: the dive's long reach would turn the intended miss into a return.
     */
    dive: number
    /**
     * Shot choice (non-smash): `read` = chance to pick the shot from where the opponents stand (readShot:
     * a drop when they're deep, a clear when they're at the net, a drive between) instead of SHOT_MIX;
     * `body` = chance to aim at them (their x) instead of away; `wide` = the widest aim away (held x, 1 = the
     * sideline aim), drawn from AIM_MIN up.
     */
    tactics: { read: number; body: number; wide: number }
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
  /** The planned swing is an ability press (jump / lunge) instead; null = a plain swing. */
  plannedAct: Strike | null
  /** This bot's own rng stream (mulberry32 seed): no draw-order coupling with the other seat. */
  rng: number
  /**
   * The ability rolls' own stream (the roll and its press timing): a bot that doesn't use the ability
   * draws exactly today's `rng` sequence. Missing (older state) = derived from `rng` on first use.
   */
  actRng?: number
  /** Doubles: this plan leaves the shot to the mate (doubles.ts takerOf) and covers the other half. */
  cover?: boolean
  /**
   * The planned plain swing's rolled offset from its contact (swingOffset): as the contact nears, the swing
   * is re-timed off the contact from where I actually stand. Missing = keep the tick (a rolled whiff / ability).
   */
  plannedOff?: number
  /** Tick of the planned swing's contact (with plannedOff); re-timing stops once it has passed. */
  plannedContact?: number
}

/** Server swings this many ticks into the serve phase (well under SERVE_TIMEOUT). */
export const BOT_SERVE_TICKS = 30
const LONG_SERVE_P = 0.35
/** Ready position depth on the Normal court, metres from the net (readyDepth scales it). */
const BASE_Z = 3.2
/** Stand this far beside the shuttle's path at the meet point (closest approach = meet tick). */
const SIDE_OFFSET = 0.4
/** Meet the falling shuttle at this height (smash attempts: SMASH_MEET_Y), leaving room for late swings. */
const MEET_Y = 1.4
/** Line calls within this distance (m) of a line can be misjudged (LEVELS.misjudge). */
export const NEAR_LINE = 0.3
/** Extra ticks on top of distance / speed to get going and settle (accel + arrive easing). */
const ARRIVE_TICKS = 12
/** A shuttle passing this close (m) to where I stand is in reach without a step (REACH.radius less a margin). */
const STAND_REACH = REACH.radius - 0.35
/** Re-time the planned swing off my actual spot within this many ticks of its contact (the run may not have settled). */
const RETIME_TICKS = 8
/** Reacting this much nearer the net than base (m), the bot keeps recovering back instead of a split step. */
const RECOVER_NET = 0.8
/** A plain swing blocked on its tick (cooldown, a teammate in the way) is pressed up to this many ticks late. */
const SWING_RETRY = 6
const SMASH_MEET_Y = 2.6
/** A jump smash meets the shuttle above the plain reach (REACH.maxY) and inside the jump box. */
const JUMP_BOX = { minY: REACH.maxY, maxY: ABILITY.jump.reach.maxY }
const JUMP_MEET_Y = 3.2
/** The narrowest aim away from the opponents (held x); LEVELS tactics.wide is the widest. */
const AIM_MIN = 0.3
/** Non-smash shot weights (held z: clear −1, drop 0, drive +1). */
const SHOT_MIX = { clear: 0.4, drop: 0.3, drive: 0.3 }
/** Charge holds (ticks): a little past the start up to a little past full. */
const CHARGE_HOLD = { min: CHARGE.full - 6, max: CHARGE.full + 6 }
/** Only start charging this close to the standing spot (m): charging slows the run. */
const CHARGE_NEAR = 0.35
/** Move input eases off within this distance of the target (no overshoot). */
const ARRIVE = 0.5
const STOP = 0.03
/** How far past the lines (m) the bot will plan to stand. */
const MOVE_PAST_LINE = 0.75

/** Ready position depth (m from the net) on `court`: BASE_Z stretched with the court's length. */
export function readyDepth(court: CourtDims): number {
  return BASE_Z * (court.halfLen / COURT.halfLen)
}

/** Doubles: the pair's waiting / cover depth (m from the net) on `court`. */
export function coverDepth(court: CourtDims): number {
  return readyDepth(court) * COVER.depth
}

/** seed: the match seed; each seat (index in players; 1v1 = side) gets its own stream. */
export const newBotMemory = (seed: number, seat: number): BotMemory => ({
  targetAt: -1,
  target: { x: 0, z: 0 },
  plannedSwingTick: -1,
  plannedHeld: { x: 0, z: 0 },
  plannedChargeTick: -1,
  plannedAct: null,
  rng: (seed ^ Math.imul(0x9e3779b9, seat + 1)) | 0,
  actRng: (seed ^ Math.imul(0x85ebca6b, seat + 1)) | 0,
})

/** The ability stream of `mem` (BotMemory.actRng) as an rng. */
function actRngOf(mem: BotMemory): () => number {
  const r = { seed: mem.actRng ?? (mem.rng ^ 0x5bd1e995) | 0 }
  return () => {
    const v = random(r)
    mem.actRng = r.seed
    return v
  }
}

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
  // Intended: pressure (sim grades 5-6 as Good) applies to the AI too, so a planned perfect can land Good.
  if (g === 'perfect') return randInt(rng, -WINDOW.perfect, WINDOW.perfect)
  if (g === 'good') return sign * randInt(rng, WINDOW.perfect + 1, WINDOW.good)
  if (g === 'late') return -randInt(rng, WINDOW.good + 1, WINDOW.late)
  return randInt(rng, WINDOW.pastGrace + 1, WINDOW.pastGrace + 3)
}

/**
 * An easy ball (plenty of time, a comfortable height, not fast): a rolled whiff becomes a Late floater
 * instead. The bot never looks dumb on a ball nobody would miss; its misses are timing errors on hard
 * balls. `slack` = spare ticks after the run, `y` = contact height (m), `speed` = at contact (m/s).
 */
const EASY = { slack: 20, minY: 0.8, maxY: 2.6, speed: 12 }

/** A swing this many ticks before the landing (or later) is too late to strike. */
const LAND_MARGIN = 2
/** A swing `off` ticks after a contact `dt` ticks ahead still comes before the landing `landDt` ticks ahead. */
const beforeLanding = (off: number, dt: number, landDt: number): boolean => dt + off < landDt - LAND_MARGIN

/**
 * `off` (swingOffset) made safe for a contact `dt` ticks ahead whose shuttle lands `landDt` ticks ahead: a
 * late-side swing (after the contact) that would come with the landing is mirrored to the early side
 * (|offset| kept: the same grade). No silent miss on a low shuttle: the bot always swings.
 */
export function safeOffset(off: number, dt: number, landDt: number): number {
  return off <= 0 || beforeLanding(off, dt, landDt) ? off : -off
}

/** Doubles: share of rolled whiffs on hard balls that become a floater (a partner-covered scramble). */
const DOUBLES_SAVE = 0.2

/** A too-early whiff swings at least this many ticks before the contact (the run may not have settled). */
const EARLY_WHIFF = WINDOW.late + 8

/**
 * When (ticks ahead) a rolled whiff swings, from the right spot, to miss on timing a contact `dt` ahead
 * of a shuttle landing `landDt` ahead; `off` = its rolled too-late offset (swingOffset). Too late when
 * that comes before the landing; else just before the landing if that is past the grace; else too early
 * (EARLY_WHIFF); null: no room to miss (the caller plays a Late floater instead).
 */
export function whiffTick(off: number, dt: number, landDt: number): number | null {
  if (beforeLanding(off, dt, landDt)) return dt + off
  const lastCall = landDt - LAND_MARGIN - 1
  if (lastCall - dt > WINDOW.pastGrace) return lastCall
  if (dt >= EARLY_WHIFF) return dt - EARLY_WHIFF - (off - WINDOW.pastGrace - 1)
  return null
}

/**
 * A ball nobody would miss (EASY): I get to `target` with EASY.slack ticks to spare, meet it at a
 * comfortable height, and it isn't fast at the contact (`dt` ticks ahead).
 */
function easyBall(
  s: SpState,
  me: SpPlayer,
  target: { x: number; z: number },
  dt: number,
  y: number,
  level: BotLevel,
): boolean {
  if (y < EASY.minY || y > EASY.maxY) return false
  const speed = (MOVE_SPEED * LEVELS[level].speedMul) / TICK_RATE
  if (dt - (Math.hypot(target.x - me.x, target.z - me.z) / speed + ARRIVE_TICKS) < EASY.slack) return false
  const f = scratch
  Object.assign(f.pos, s.shuttle.pos)
  Object.assign(f.vel, s.shuttle.vel)
  for (let t = 0; t < dt; t++) stepShuttle(f)
  return Math.hypot(f.vel.x, f.vel.y, f.vel.z) < EASY.speed
}

/** Opponent depth (share of the half's length from the net) at / above which a read plays a drop. */
const READ_DEEP = 0.6
/** At / below this share a read plays a clear over them. */
const READ_NEAR = 0.4

/**
 * The held z a read picks (clear −1, drop 0, drive +1) from the opponents' mean distance to the net
 * (`depth`, m): deep → a drop (make them run in), at the net → a clear over them, between → a drive.
 */
export function readShot(depth: number, court: CourtDims): -1 | 0 | 1 {
  const u = depth / court.halfLen
  return u >= READ_DEEP ? 0 : u <= READ_NEAR ? -1 : 1
}

/** Within NEAR_LINE of one of `court`'s side or back lines. */
const nearLine = (p: { x: number; z: number }, court: CourtDims) =>
  Math.abs(Math.abs(p.x) - court.halfWidth) <= NEAR_LINE ||
  Math.abs(Math.abs(p.z) - court.halfLen) <= NEAR_LINE

const clampX = (x: number) => Math.max(-1, Math.min(1, x))

const onMyHalf = (z: number, side: 0 | 1) => (side === 0 ? z < 0 : z > 0)

function clampTarget(t: { x: number; z: number }, side: 0 | 1, court: CourtDims) {
  const limX = court.halfWidth + MOVE_PAST_LINE
  t.x = Math.max(-limX, Math.min(limX, t.x))
  const a = Math.max(NET_MARGIN + 0.05, Math.min(court.halfLen + MOVE_PAST_LINE, Math.abs(t.z)))
  t.z = side === 0 ? -a : a
}

/**
 * Pick where to meet the shuttle: scan its flight (ticks on my half, in reach height) for spots I can
 * reach in time at my speed, preferring a contact height near `prefY`. If none is reachable, the one I
 * miss by the least (still try). Stand SIDE_OFFSET beside the path (my side) so the closest approach is
 * that tick. Returns the standing spot + the meet height + whether I'd be late (no spot reachable in
 * time), or null if the shuttle never comes in reach. `box` = the meet heights (default the plain REACH).
 */
function meetSpot(
  s: SpState,
  idx: number,
  level: BotLevel,
  prefY: number,
  maxTicks: number,
  box: { minY: number; maxY: number } = REACH,
) {
  const me = s.players[idx]
  const side = me.side
  const speed = (MOVE_SPEED * LEVELS[level].speedMul) / TICK_RATE // m per tick
  const f = scratch
  Object.assign(f.pos, s.shuttle.pos)
  Object.assign(f.vel, s.shuttle.vel)
  let best: { x: number; z: number; y: number } | null = null
  let bestScore = Infinity
  for (let t = 0; t <= maxTicks; t++) {
    const { pos, vel } = f
    if (onMyHalf(pos.z, side) && pos.y >= box.minY + 0.1 && pos.y <= box.maxY - 0.1) {
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
      // Passing within reach of where I stand (overhead, at my feet, just behind me): no run needed.
      const here = Math.abs(pos.y - prefY)
      if (Math.hypot(pos.x - me.x, pos.z - me.z) <= STAND_REACH && here < bestScore) {
        bestScore = here
        best = { x: me.x, z: me.z, y: pos.y }
      }
    }
    if (stepShuttle(f).netHit || pos.y <= 0) break
  }
  return best && { ...best, late: bestScore >= 100 }
}

/** Plan seat `idx`'s reply to the shuttle now in flight toward its side. */
function plan(
  s: SpState,
  idx: number,
  level: BotLevel,
  mem: BotMemory,
  rng: () => number,
  injected?: () => number,
) {
  const L = LEVELS[level]
  // Made here (once per shot), not per tick: an AI seat that isn't planning allocates nothing.
  const actRng = injected ?? actRngOf(mem)
  const land = predictLanding(s.shuttle)
  const me = s.players[idx]
  const side = me.side
  const mate = mateOf(s.players, me)
  mem.plannedSwingTick = -1
  mem.plannedChargeTick = -1
  mem.plannedAct = null
  mem.plannedOff = mem.plannedContact = undefined
  if (mate) mem.cover = false
  // Leave shots that go into the net or out (near-line calls can be misjudged on low levels).
  let callIn = isIn(land.pos, side, s.court)
  if (nearLine(land.pos, s.court) && rng() < L.misjudge) callIn = !callIn
  if (land.netHit || !callIn) {
    mem.target = homeSpot(s, me, mate)
    return
  }
  // Doubles: the teammate nearest the landing takes it (a human by where they stand); the other covers.
  if (mate) {
    const busy = (p: SpPlayer) => stunned(p.stunAt, s.tick) || acting(p.act, s.tick)
    const taker = takerOf(s.players, side, land.pos, busy)
    if (taker && taker !== me) {
      mem.cover = true
      const takerX = toWorld(side, land.pos.x, land.pos.z).x
      mem.target = coverSpot(s.court, side, takerX, toWorld(side, me.x, me.z).x, coverDepth(s.court))
      return
    }
  }
  let grade = rollGrade(level, rng)
  const smashTry = rng() < L.smash
  // A rolled whiff meets the shuttle as usual: an easy ball turns it into a floater, a hard one misses on
  // timing (whiffTick).
  const meetY = smashTry ? SMASH_MEET_Y : MEET_Y
  const meet = meetSpot(s, idx, level, meetY, land.ticks)
  const high = smashTry && grade !== 'whiff' && meet !== null && meet.y >= REACH.smashY
  const back = side === 0 ? -1 : 1 // world z sign of "away from the net"
  const target = meet ? { x: meet.x, z: meet.z } : { x: land.pos.x, z: land.pos.z + back * SIDE_OFFSET }
  clampTarget(target, side, s.court)
  mem.target = target
  const c = findContact(s.shuttle, target, 0, land.ticks)
  if (!c) return
  if (grade === 'whiff' && easyBall(s, me, target, c.dt, c.pos.y, level)) grade = 'late'
  // Doubles: two on the court make some hard balls a scramble-save (a floater) instead of a miss, so
  // rallies run longer than 1v1 (the rng draw only in doubles: 1v1 streams unchanged).
  else if (grade === 'whiff' && mate && rng() < DOUBLES_SAVE) grade = 'late'
  const off = swingOffset(grade, rng)
  // A whiff (a hard ball): from the right spot, a timing error (whiffTick); no room for one: a Late
  // floater after all (never a parked bot, never a silent miss). Doubles too: no run off the spot, so no
  // swing into the teammate.
  const miss = grade === 'whiff' ? whiffTick(off, c.dt, land.ticks) : null
  if (grade === 'whiff' && miss === null) grade = 'late'
  if (miss !== null) mem.plannedSwingTick = s.tick + miss
  else {
    mem.plannedSwingTick = Math.max(s.tick, s.tick + c.dt + safeOffset(off, c.dt, land.ticks))
    if (grade !== 'whiff') {
      mem.plannedOff = off
      mem.plannedContact = s.tick + c.dt
    }
  }
  // Where the opponents stand (their mean), in my view frame (held x = screen right; shotTarget mirrors
  // it per side) and as a distance from the net.
  let oppSum = 0
  let depthSum = 0
  let opps = 0
  for (const q of s.players)
    if (q.side !== side) {
      oppSum += toWorld(side, q.x, q.z).x
      depthSum += Math.abs(q.z)
      opps++
    }
  const oppView = oppSum / opps
  const T = L.tactics
  // Aim away from them, or now and then at them (their x: a body shot).
  const away = Math.abs(oppView) > 0.3 ? -Math.sign(oppView) : rng() < 0.5 ? -1 : 1
  const heldX =
    rng() < T.body
      ? clampX(oppView / (s.court.halfWidth - 0.4))
      : away * (AIM_MIN + (T.wide - AIM_MIN) * rng())
  let heldZ: number
  if (high) heldZ = 1
  else if (rng() < T.read) heldZ = readShot(depthSum / opps, s.court)
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
  // The ability (its own stream: the plain plan above draws today's sequence). One roll: under `ability`
  // a jump smash is on, under `dive` a dive save. A rolled whiff never uses either (it stays a miss).
  const roll = actRng()
  if (grade === 'whiff') return
  if (smashTry && roll < L.ability) {
    // A jump smash: stand under the shuttle where it passes above the plain reach (ability.ts picks a
    // jump there), if I can get there in time.
    const jm = meetSpot(s, idx, level, JUMP_MEET_Y, land.ticks, JUMP_BOX)
    if (jm && !jm.late) {
      const spot = { x: jm.x, z: jm.z }
      clampTarget(spot, side, s.court)
      const jc = findContact(s.shuttle, spot, 0, land.ticks, reachOf('jump'))
      if (jc && jc.pos.y > REACH.maxY && planAct(s, idx, mem, 'jump', spot, jc.dt, land.ticks, grade, actRng))
        return
    }
  }
  // A lunge save: the plain meet is out of time, but the dive reaches it from the spot I'm heading to.
  if (meet?.late && roll < L.dive) {
    const lc = findContact(s.shuttle, target, 0, land.ticks, pickReachOf('lunge'))
    if (lc) planAct(s, idx, mem, 'lunge', target, lc.dt, land.ticks, grade, actRng)
  }
}

/**
 * Switch the plan to an ability press at `spot` whose contact is `dt` ticks ahead (pressed `lead` early;
 * the shuttle lands `landDt` ticks ahead: safeOffset),
 * unless the button will still be cooling then (false: the plain plan stands).
 */
function planAct(
  s: SpState,
  idx: number,
  mem: BotMemory,
  act: Strike,
  spot: { x: number; z: number },
  dt: number,
  landDt: number,
  grade: GradeRoll,
  rng: () => number,
): boolean {
  const at = Math.max(s.tick, s.tick + dt - leadOf(act) + safeOffset(swingOffset(grade, rng), dt, landDt))
  if (!actReady(s.players[idx].act, at)) return false
  mem.plannedAct = act
  mem.plannedOff = mem.plannedContact = undefined
  mem.target = spot
  if (act === 'jump') mem.plannedHeld = { x: mem.plannedHeld.x, z: 1 }
  mem.plannedSwingTick = at
  mem.plannedChargeTick = -1
  return true
}

/**
 * Press the planned ability now: the button is ready (sim.ts canAct) and the shuttle still makes it the
 * planned move from where I stand (else it would be a hop: swing instead).
 */
function actNow(s: SpState, me: SpPlayer, act: Strike): boolean {
  if (!canAct(s, me) || !canStrike(s, me)) return false
  return pickAbility(s.shuttle, me, me.side, s.shuttle.lastHitter, true).k === act
}

/** Move input (view-relative, length = speedMul when far) toward a world-space point. */
function moveToward(p: SpPlayer, level: BotLevel, to: { x: number; z: number }): SpInput {
  const dx = to.x - p.x
  const dz = to.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < STOP) return { t: 'move', x: 0, z: 0 }
  const k = (LEVELS[level].speedMul * Math.min(1, d / ARRIVE)) / d
  const v = toWorld(p.side, dx * k, dz * k) // toWorld is its own inverse
  return { t: 'move', x: v.x, z: v.z }
}

/**
 * In the last RETIME_TICKS before the planned contact: move the contact (and the swing with it) to the
 * closest approach from where I actually stand (the run may be short of, or past, the planned spot),
 * keeping the rolled offset (same grade). Stops once the contact is here (a passed closest approach would
 * otherwise read as "now" every tick and drag a late-side swing along).
 */
function retime(s: SpState, me: SpPlayer, mem: BotMemory) {
  const left = (mem.plannedContact ?? -1) - s.tick
  // Not once the swing is due or done (an early-side swing: the contact is still ahead; moving the tick
  // then would re-arm the blocked-swing retry and press again).
  if (left <= 0 || left > RETIME_TICKS || mem.plannedSwingTick <= s.tick) return
  const land = predictLanding(s.shuttle)
  if (land.netHit) return
  const c = findContact(s.shuttle, me, 0, land.ticks)
  if (!c) return
  mem.plannedContact = s.tick + c.dt
  mem.plannedSwingTick = Math.max(s.tick, s.tick + c.dt + safeOffset(mem.plannedOff!, c.dt, land.ticks))
}

/** Standing more than RECOVER_NET (m) nearer the net than base. */
const nearerNet = (p: SpPlayer, home: { z: number }) => Math.abs(p.z) < Math.abs(home.z) - RECOVER_NET

/** Tick of the opponent's latest hit/serve still in the event log, or -1. */
function lastShotTick(s: SpState, opp: 0 | 1): number {
  let at = -1
  for (const e of s.events)
    if ((e.k === 'hit' || e.k === 'serve') && e.side === opp && e.tick > at) at = e.tick
  return at
}

/**
 * Where to wait (own team hit last / still reacting / a shot left alone): the centre of my half; with a
 * mate, side by side at ready depth: the half away from the mate (view x), mate centred → slot 0 left,
 * slot 1 right.
 */
export function homeSpot(s: SpState, me: SpPlayer, mate: SpPlayer | undefined): { x: number; z: number } {
  if (!mate) return { x: 0, z: (me.side === 0 ? -1 : 1) * readyDepth(s.court) }
  const depth = coverDepth(s.court)
  const mateX = toWorld(me.side, mate.x, mate.z).x
  const lane = Math.abs(mateX) < COVER.centre ? (me.slot === 0 ? -1 : 1) : mateX > 0 ? -1 : 1
  return toWorld(me.side, lane * s.court.halfWidth * COVER.splitX, -depth)
}

/** Doubles: a teammate in racket reach (not immune) — a swing now would bonk them (stun.ts): hold it. */
function partnerInSwing(s: SpState, me: SpPlayer): boolean {
  const mate = mateOf(s.players, me)
  return !!mate && racketHits(me, mate) && !stunImmune(mate.stunAt, s.tick)
}

const STILL: SpInput = { t: 'move', x: 0, z: 0 }
const CHARGE_IN: SpInput = { t: 'charge' }
const UNCHARGE: SpInput = { t: 'charge', cancel: true }

/**
 * The inputs this tick of the AI seat `idx` (index in s.players; 1v1: = its side). Mutates `mem` (the
 * plan cache). `actRng` = the ability rolls (default: mem's own ability stream, made when a plan is;
 * tests inject it).
 */
export function botStep(
  s: SpState,
  idx: number,
  level: BotLevel,
  mem: BotMemory,
  rng: () => number,
  actRng?: () => number,
): SpInput[] {
  // A charge left over (the rally ended before the planned swing) would slow the next rally: drop it.
  const me = s.players[idx]
  const side = me.side
  const charging = me.chargeAt >= 0
  if (s.phase === 'serve') {
    mem.targetAt = -1
    if (serverPlayer(s) === me && s.phaseT === BOT_SERVE_TICKS) {
      const z = rng() < LONG_SERVE_P ? -1 : 0
      return [STILL, { t: 'swing', x: 0, z, tick: s.tick }]
    }
    return charging ? [STILL, UNCHARGE] : [STILL]
  }
  if (s.phase !== 'rally') return charging ? [STILL, UNCHARGE] : [STILL]
  if (stunned(me.stunAt, s.tick)) {
    // Bonked (stun.ts): no move, swing, charge or ability. The plan is dropped and re-made from the
    // state on the first free tick. A charge the bonk dropped (TAPPED) is let go so its button-up
    // doesn't eat the next planned swing.
    mem.targetAt = -1
    return me.chargeAt === -1 ? [STILL] : [STILL, UNCHARGE]
  }
  const opp: 0 | 1 = side === 0 ? 1 : 0
  const home = homeSpot(s, me, mateOf(s.players, me))
  if (s.shuttle.lastHitter !== opp) {
    mem.targetAt = -1
    const toHome = moveToward(me, level, home)
    return charging ? [toHome, UNCHARGE] : [toHome]
  }
  // The shot's event outlives reactTicks; once it scrolls out of the log the cached plan still holds.
  const shot = lastShotTick(s, opp)
  const planAt = shot + LEVELS[level].reactTicks
  // A stun cleared the plan after the shot's event scrolled out: plan now from where things stand.
  const replan = shot < 0 && mem.targetAt < 0
  if (replan || (shot >= 0 && s.tick >= planAt && mem.targetAt !== planAt)) {
    mem.targetAt = replan ? s.tick : planAt
    plan(s, idx, level, mem, rng, actRng)
  }
  const planned = mem.targetAt >= 0 && (shot < 0 || mem.targetAt === planAt)
  // Still reacting: hold my ground (a split step) until the plan is made, not drift off toward base; caught
  // up near the net, keep recovering back (a net rusher shouldn't find me parked in racket reach).
  const wait = nearerNet(me, home) ? moveToward(me, level, home) : STILL
  const out: SpInput[] = [planned ? moveToward(me, level, mem.target) : wait]
  if (planned && mem.plannedOff !== undefined) retime(s, me, mem)
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
  if (planned && s.tick === mem.plannedSwingTick && mem.plannedAct && !actNow(s, me, mem.plannedAct)) {
    // The button would hop here (not where planned in time): swing at the plain contact instead.
    mem.plannedAct = null
    const c = findContact(s.shuttle, me, 0, 2 * ABILITY.horizon)
    if (c) mem.plannedSwingTick = s.tick + c.dt
  }
  // A plain swing blocked on its tick (cooldown, a teammate in the way) is pressed on the next free tick.
  const swingDue = mem.plannedAct
    ? s.tick === mem.plannedSwingTick
    : s.tick >= mem.plannedSwingTick &&
      s.tick <= mem.plannedSwingTick + SWING_RETRY &&
      me.swingAt < mem.plannedSwingTick
  if (planned && mem.plannedSwingTick >= 0 && swingDue && !partnerInSwing(s, me)) {
    const { x, z } = mem.plannedHeld
    out.push(mem.plannedAct ? { t: 'ability', x, z, tick: s.tick } : { t: 'swing', x, z, tick: s.tick })
  } else if (charging && !(planned && s.tick < mem.plannedSwingTick)) out.push(UNCHARGE)
  return out
}
