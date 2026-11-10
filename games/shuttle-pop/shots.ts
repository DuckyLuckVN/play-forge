// Swing grading + shot selection/launch. Pure; rng is injected (no Math.random).
import { COURT, launchVel, predictLanding, solveLaunch, stepShuttle, type Flight, type Vec3 } from './physics'

export type Grade = 'perfect' | 'good' | 'late'
export type ShotKind = 'smash' | 'drive' | 'clear' | 'drop' | 'serveShort' | 'serveLong'

export const REACH = { radius: 1.1, minY: 0.2, maxY: 2.9, smashY: 2.0 }
/** Ticks. dt is contact tick minus swing tick (negative = swung after the ideal moment). */
export const WINDOW = { perfect: 6, good: 12, late: 18, pastGrace: 12 }

interface ShotSpec {
  elevation: number
  maxSpeed: number
  /** Target depth past the net, metres. */
  depth: number
}

const SHOTS: Record<ShotKind, ShotSpec> = {
  clear: { elevation: 47, maxSpeed: 45, depth: COURT.halfLen - 0.6 },
  drop: { elevation: 20, maxSpeed: 45, depth: 1.0 },
  drive: { elevation: 3, maxSpeed: 45, depth: 5.6 },
  smash: { elevation: -10, maxSpeed: 45, depth: 4.0 },
  serveShort: { elevation: 25, maxSpeed: 45, depth: COURT.shortLine + 0.4 },
  serveLong: { elevation: 55, maxSpeed: 45, depth: COURT.halfLen - 0.5 },
}

const JITTER: Record<Grade, number> = { perfect: 0.2, good: 0.6, late: 1.2 }

/**
 * Hold-to-charge power (charge 0..1, charge.ts), per shot kind, all scaled by charge: a smash / drive
 * comes off the racket up to `speed` share faster on a flight up to `flatten` degrees lower (steeper
 * smash); a clear / drop goes up `loft` degrees higher and its aim moves to `depth` (clear: deep to the
 * back line, drop: tight to the net). Above half charge, Good / Late aim error grows, up to `jitter`
 * share at full (big power costs a little control unless the timing is Perfect). Serves ignore it.
 */
export const POWER: {
  speed: Partial<Record<ShotKind, number>>
  flatten: Partial<Record<ShotKind, number>>
  loft: Partial<Record<ShotKind, number>>
  depth: Partial<Record<ShotKind, number>>
  jitter: number
} = {
  speed: { smash: 0.26, drive: 0.16 },
  flatten: { smash: 8, drive: 3 },
  loft: { clear: 8, drop: 6 },
  depth: { clear: COURT.halfLen - 0.25, drop: 0.7 },
  jitter: 0.4,
}
const SPEED_FACTOR: Record<Grade, number> = { perfect: 1.0, good: 0.85, late: 0.7 }

const NET_LIFT_STEP = 3
const NET_LIFT_MAX = 75

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

/**
 * Scans ticks [from..to] of the flight snapshot `f` (not mutated) and returns the in-reach tick
 * closest to the player (earliest on ties), or null. dt is relative to `f`. Ticks < 0 are not
 * scanned: for the past, the caller passes an older snapshot. Stops at a net hit or landing.
 */
export function findContact(
  f: Flight,
  player: { x: number; z: number },
  from: number,
  to: number,
): { dt: number; pos: Vec3 } | null {
  const s = scratch
  s.pos.x = f.pos.x
  s.pos.y = f.pos.y
  s.pos.z = f.pos.z
  s.vel.x = f.vel.x
  s.vel.y = f.vel.y
  s.vel.z = f.vel.z
  const start = Math.max(0, from)
  let bestD = Infinity
  let bestDt = 0
  let bx = 0
  let by = 0
  let bz = 0
  for (let t = 0; t <= to; t++) {
    if (t >= start && s.pos.y >= REACH.minY && s.pos.y <= REACH.maxY) {
      const d = Math.hypot(s.pos.x - player.x, s.pos.z - player.z)
      if (d <= REACH.radius && d < bestD) {
        bestD = d
        bestDt = t
        bx = s.pos.x
        by = s.pos.y
        bz = s.pos.z
      }
    }
    if (stepShuttle(s).netHit || s.pos.y <= 0) break
  }
  return bestD === Infinity ? null : { dt: bestDt, pos: { x: bx, y: by, z: bz } }
}

/** |dt| <= 6 perfect, <= 12 good, <= 18 late, else null (whiff). dt < -pastGrace (12) is a whiff. */
export function gradeOf(dtTicks: number): Grade | null {
  if (dtTicks < -WINDOW.pastGrace) return null
  const a = Math.abs(dtTicks)
  if (a <= WINDOW.perfect) return 'perfect'
  if (a <= WINDOW.good) return 'good'
  if (a <= WINDOW.late) return 'late'
  return null
}

/** The half a shuttle position belongs to for `side` hitting it (z = 0 goes to the non-last-hitter). */
export function onHalf(z: number, side: 0 | 1, lastHitter: -1 | 0 | 1): boolean {
  if (z === 0) return lastHitter !== side
  return side === 0 ? z < 0 : z > 0
}

/** A past shuttle position (`tick`) and where the swinger stood beside it on its own screen. */
export interface ContactCandidate {
  tick: number
  pos: Vec3
  at: { x: number; z: number }
}

/**
 * The contact a swing at `swingTick` makes (the sim's rules; shared with the guest's own-hit prediction),
 * or null = a whiff. Candidates: in-reach `past` positions on the swinger's half before `nowTick`
 * (reach from `at`), and the forward scan of `future` (the flight at `futureTick`, from `player`) up to
 * WINDOW.late after the swing. The closest wins (the past only when strictly closer); graded by gradeOf
 * (contact tick − swingTick). `pos` = the shuttle at the contact.
 */
export function pickContact(
  past: readonly ContactCandidate[],
  future: Flight,
  futureTick: number,
  player: { x: number; z: number },
  side: 0 | 1,
  lastHitter: -1 | 0 | 1,
  swingTick: number,
  nowTick: number,
): { tick: number; pos: Vec3; y: number; grade: Grade } | null {
  let bestD = Infinity
  let bestTick = 0
  let best: Vec3 = future.pos
  for (const h of past) {
    // Every in-reach past position competes (no pastGrace pre-filter): the grade is anchored on the
    // closest approach, so a swing well after it whiffs even if the shuttle still hovers in reach.
    if (h.tick >= nowTick || h.pos.y < REACH.minY || h.pos.y > REACH.maxY) continue
    if (!onHalf(h.pos.z, side, lastHitter)) continue
    const d = Math.hypot(h.pos.x - h.at.x, h.pos.z - h.at.z)
    if (d <= REACH.radius && d < bestD) {
      bestD = d
      bestTick = h.tick
      best = h.pos
    }
  }
  const c = findContact(future, player, 0, Math.max(0, swingTick + WINDOW.late - futureTick))
  if (c && onHalf(c.pos.z, side, lastHitter)) {
    const d = Math.hypot(c.pos.x - player.x, c.pos.z - player.z)
    if (d <= bestD) {
      bestD = d
      bestTick = futureTick + c.dt
      best = c.pos
    }
  }
  const grade = bestD === Infinity ? null : gradeOf(bestTick - swingTick)
  return grade ? { tick: bestTick, pos: { ...best }, y: best.y, grade } : null
}

/** Held direction is view-relative (z > 0 = toward the net). Late swings are always floaty clears. */
export function chooseShot(held: { x: number; z: number }, contactY: number, grade: Grade): ShotKind {
  if (grade === 'late') return 'clear'
  if (held.z > 0.5) return contactY >= REACH.smashY && grade === 'perfect' ? 'smash' : 'drive'
  if (held.z < -0.5) return 'clear'
  return 'drop'
}

/**
 * World-space aim point. heldX is view-relative (screen right), so it is mirrored for side 1.
 * Serves: lateral comes from heldX too; the caller overrides x with the diagonal box centre.
 */
export function shotTarget(kind: ShotKind, hitterSide: 0 | 1, heldX: number): { x: number; z: number } {
  const dir = hitterSide === 0 ? 1 : -1
  return { x: -dir * heldX * (COURT.halfWidth - 0.4), z: dir * SHOTS[kind].depth }
}

/** Every shot lands at least this far past the net (before jitter) and never hits the net. */
export const MIN_DEPTH = 1.0
const AIM_MARGIN = 0.05
/** A charged clear's aim stays this far inside the back line (before jitter). */
const BACK_MARGIN = 0.05
/** Smash / drive boost steps tried (share of the full-charge speed), most first. */
const BOOST_STEPS = [1, 0.75, 0.5, 0.25]
/** A charged lofted shot counts as reaching its aim within this (m). */
const REACH_TOLERANCE = 0.05

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const scaled = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k })
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z)

/** Guaranteed landing depth past the net at `charge`: a charged drop may land tighter (POWER.depth.drop). */
export function minDepthOf(kind: ShotKind, charge: number): number {
  return kind === 'drop' ? lerp(MIN_DEPTH, POWER.depth.drop ?? MIN_DEPTH, charge) : MIN_DEPTH
}

/**
 * Launch velocity toward `target` (jittered by grade). maxSpeed is a cap: the speed is solved to hit
 * the aim, then scaled by the grade factor (worse grade = shorter, floatier). Guarantee: clears the
 * net and lands >= minDepthOf(kind, charge) past it; if the grade scale breaks that, elevation is
 * lifted (+3 deg steps, up to +75), then the full-power shot is used (worse grades never exceed its
 * speed). `charge` (0..1, default 0 = a tap) adds power (POWER), with the same guarantees.
 * `gain` (0..charge) = the share of the full-charge effect applied (smash / drive: the boost step that
 * still lands in; clear / drop: charge; a tap: 0).
 */
export function launchShot(
  kind: ShotKind,
  grade: Grade,
  from: Vec3,
  target: { x: number; z: number },
  rng: () => number,
  charge = 0,
): { vel: Vec3; gain: number } {
  const spec = SHOTS[kind]
  const c = kind === 'serveShort' || kind === 'serveLong' ? 0 : Math.min(1, Math.max(0, charge || 0))
  const dir = target.z >= 0 ? 1 : -1
  const depth = Math.abs(target.z)
  let tz = target.z
  if (c > 0) {
    let d = lerp(depth, POWER.depth[kind] ?? depth, c)
    if (kind === 'clear') d = Math.min(d, COURT.halfLen - BACK_MARGIN)
    tz = dir * d
  }
  const minDepth = minDepthOf(kind, c)
  const ang = rng() * Math.PI * 2
  const spray = grade === 'perfect' ? 0 : POWER.jitter * Math.max(0, 2 * c - 1)
  const r = JITTER[grade] * (1 + spray) * Math.sqrt(rng())
  // Jitter in the hitter's frame (rotated 180° for side 1) so both ends play exactly mirrored.
  const aim = { x: target.x + dir * Math.cos(ang) * r, z: tz + dir * Math.sin(ang) * r }
  if (aim.z * dir < minDepth + AIM_MARGIN) aim.z = dir * (minDepth + AIM_MARGIN)
  const ok = (v: Vec3): boolean => {
    const p = predictLanding({ pos: from, vel: v })
    return !p.netHit && p.pos.y <= 0 && p.pos.z * dir >= minDepth
  }
  const search = (elevation: number, factor: number, maxV: number): Vec3 | null => {
    for (let lift = 0; lift <= NET_LIFT_MAX && elevation + lift <= 80; lift += NET_LIFT_STEP) {
      const v = scaled(solveLaunch(from, aim, elevation + lift, spec.maxSpeed), factor)
      if (len(v) <= maxV && ok(v)) return v
    }
    return null
  }
  const plain = (elevation: number): Vec3 =>
    search(elevation, 1, Infinity) ?? solveLaunch(from, aim, elevation, spec.maxSpeed)
  // reference = the full-power (Perfect-style) shot for this aim; worse grades never exceed its speed.
  // Charged flatten kinds: the flattest flight down to POWER.flatten below the plain one that clears
  // the net (1° steps, so more charge is never a loftier shot). Charged loft kinds: the loftiest up
  // to POWER.loft above it that still reaches the aim (a lofted shot from deep may fall short at
  // maxSpeed; never shorter than the plain one). None → the plain shot.
  const flatten = (POWER.flatten[kind] ?? 0) * c
  const loft = (POWER.loft[kind] ?? 0) * c
  const want = Math.hypot(aim.x - from.x, aim.z - from.z)
  let elevation = spec.elevation
  let ref: Vec3 | null = null
  for (let e = spec.elevation - flatten; flatten > 0 && !ref && e < spec.elevation; e += 1) {
    const v = solveLaunch(from, aim, e, spec.maxSpeed)
    if (ok(v)) {
      ref = v
      elevation = e
    }
  }
  for (let e = spec.elevation + loft; loft > 0 && !ref && e > spec.elevation; e -= 1) {
    const v = solveLaunch(from, aim, e, spec.maxSpeed)
    const p = predictLanding({ pos: from, vel: v }).pos
    if (ok(v) && Math.hypot(p.x - from.x, p.z - from.z) >= want - REACH_TOLERANCE) {
      ref = v
      elevation = e
    }
  }
  ref ??= plain(elevation)
  let gain = kind === 'clear' || kind === 'drop' ? c : 0
  const boost = (POWER.speed[kind] ?? 0) * c
  if (boost > 0) {
    // Smash / drive: real extra speed. The biggest boost step that still clears the net, lands in (or
    // no further out than the charged plain shot) and no later than the tap, on the flattest flight
    // that does.
    const base = len(ref)
    const { pos: baseLand, ticks: baseTicks } = predictLanding({ pos: from, vel: ref })
    // Never a slower-to-land shot than the tap (a boost the net forces into a lob is no boost).
    const tapTicks =
      elevation === spec.elevation
        ? baseTicks
        : predictLanding({ pos: from, vel: plain(spec.elevation) }).ticks
    const maxX = Math.max(COURT.halfWidth, Math.abs(baseLand.x))
    const maxZ = Math.max(COURT.halfLen, Math.abs(baseLand.z))
    const cap = spec.maxSpeed * (1 + (POWER.speed[kind] ?? 0))
    boosted: for (const f of BOOST_STEPS) {
      const sp = Math.min(cap, base * (1 + boost * f))
      for (let e = spec.elevation - flatten; e <= spec.elevation + NET_LIFT_MAX; e += 1) {
        const v = launchVel(from, aim, e, sp)
        const p = predictLanding({ pos: from, vel: v })
        if (p.netHit || p.pos.y > 0 || p.pos.z * dir < minDepth) continue
        if (Math.abs(p.pos.x) > maxX || Math.abs(p.pos.z) > maxZ || p.ticks > tapTicks) continue
        ref = v
        elevation = e
        gain = c * f
        break boosted
      }
    }
  }
  const k = SPEED_FACTOR[grade]
  if (k === 1) return { vel: ref, gain }
  if (gain > 0 && boost > 0) {
    const v = scaled(ref, k)
    if (ok(v)) return { vel: v, gain }
  }
  return { vel: search(elevation, k, len(ref)) ?? ref, gain }
}

/** launchShot's velocity (the sim / guest prediction entry point). */
export function launchFor(
  kind: ShotKind,
  grade: Grade,
  from: Vec3,
  target: { x: number; z: number },
  rng: () => number,
  charge = 0,
): Vec3 {
  return launchShot(kind, grade, from, target, rng, charge).vel
}
