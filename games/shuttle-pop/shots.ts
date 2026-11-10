// Swing grading + shot selection/launch. Pure; rng is injected (no Math.random).
import { COURT, predictLanding, solveLaunch, stepShuttle, type Flight, type Vec3 } from './physics'

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
 * Hold-to-charge power (charge 0..1, charge.ts), per shot kind: the aim goes up to `depth` share deeper
 * (never past `maxDepth`) and the flight flattens by up to `flatten` degrees. The solver then needs more
 * speed: a smash / clear gets there much sooner, a drive / drop comes off the racket faster (a drop
 * pushes deeper). Above half charge, Good / Late aim error grows, up to `jitter` share at full (big
 * power costs a little control unless the timing is Perfect). Serves ignore it.
 */
export const POWER = {
  depth: { smash: 0, drive: 0, clear: 0.05, drop: 0, serveShort: 0, serveLong: 0 } as Record<
    ShotKind,
    number
  >,
  flatten: { smash: 8, drive: 3, clear: 16, drop: 8, serveShort: 0, serveLong: 0 } as Record<
    ShotKind,
    number
  >,
  maxDepth: COURT.halfLen - 0.35,
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

const scaled = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k })

/**
 * Launch velocity toward `target` (jittered by grade). maxSpeed is a cap: the speed is solved to hit
 * the aim, then scaled by the grade factor (worse grade = shorter, floatier). Guarantee: clears the
 * net and lands >= MIN_DEPTH past it; if the grade scale breaks that, elevation is lifted (+3 deg
 * steps, up to +75), then the full-power shot is used (worse grades never exceed its speed).
 * `charge` (0..1, default 0 = a tap) adds power (POWER), with the same guarantees.
 */
export function launchFor(
  kind: ShotKind,
  grade: Grade,
  from: Vec3,
  target: { x: number; z: number },
  rng: () => number,
  charge = 0,
): Vec3 {
  const spec = SHOTS[kind]
  const c = kind === 'serveShort' || kind === 'serveLong' ? 0 : Math.min(1, Math.max(0, charge || 0))
  const dir = target.z >= 0 ? 1 : -1
  const depth = Math.abs(target.z)
  const tz =
    c > 0 ? dir * Math.max(depth, Math.min(POWER.maxDepth, depth * (1 + POWER.depth[kind] * c))) : target.z
  const ang = rng() * Math.PI * 2
  const spray = grade === 'perfect' ? 0 : POWER.jitter * Math.max(0, 2 * c - 1)
  const r = JITTER[grade] * (1 + spray) * Math.sqrt(rng())
  // Jitter in the hitter's frame (rotated 180° for side 1) so both ends play exactly mirrored.
  const aim = { x: target.x + dir * Math.cos(ang) * r, z: tz + dir * Math.sin(ang) * r }
  if (aim.z * dir < MIN_DEPTH + AIM_MARGIN) aim.z = dir * (MIN_DEPTH + AIM_MARGIN)
  const ok = (v: Vec3): boolean => {
    const p = predictLanding({ pos: from, vel: v })
    return !p.netHit && p.pos.y <= 0 && p.pos.z * dir >= MIN_DEPTH
  }
  const search = (elevation: number, factor: number, maxV: number): Vec3 | null => {
    for (let lift = 0; lift <= NET_LIFT_MAX && elevation + lift <= 80; lift += NET_LIFT_STEP) {
      const v = scaled(solveLaunch(from, aim, elevation + lift, spec.maxSpeed), factor)
      if (Math.hypot(v.x, v.y, v.z) <= maxV && ok(v)) return v
    }
    return null
  }
  // reference = the full-power (Perfect-style) shot for this aim; worse grades never exceed its speed.
  // Charged: the flattest flight down to POWER.flatten below the plain one that clears the net (1°
  // steps, so more charge is never a loftier shot); none → the plain shot.
  let elevation = spec.elevation
  let ref: Vec3 | null = null
  for (let e = spec.elevation - POWER.flatten[kind] * c; c > 0 && !ref && e < spec.elevation; e += 1) {
    const v = solveLaunch(from, aim, e, spec.maxSpeed)
    if (ok(v)) {
      ref = v
      elevation = e
    }
  }
  ref ??= search(elevation, 1, Infinity) ?? solveLaunch(from, aim, elevation, spec.maxSpeed)
  const k = SPEED_FACTOR[grade]
  if (k === 1) return ref
  return search(elevation, k, Math.hypot(ref.x, ref.y, ref.z)) ?? ref
}
