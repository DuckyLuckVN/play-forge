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
 */
export function launchFor(
  kind: ShotKind,
  grade: Grade,
  from: Vec3,
  target: { x: number; z: number },
  rng: () => number,
): Vec3 {
  const spec = SHOTS[kind]
  const dir = target.z >= 0 ? 1 : -1
  const ang = rng() * Math.PI * 2
  const r = JITTER[grade] * Math.sqrt(rng())
  // Jitter in the hitter's frame (rotated 180° for side 1) so both ends play exactly mirrored.
  const aim = { x: target.x + dir * Math.cos(ang) * r, z: target.z + dir * Math.sin(ang) * r }
  if (aim.z * dir < MIN_DEPTH + AIM_MARGIN) aim.z = dir * (MIN_DEPTH + AIM_MARGIN)
  const ok = (v: Vec3): boolean => {
    const p = predictLanding({ pos: from, vel: v })
    return !p.netHit && p.pos.y <= 0 && p.pos.z * dir >= MIN_DEPTH
  }
  const search = (factor: number, maxV: number): Vec3 | null => {
    for (let lift = 0; lift <= NET_LIFT_MAX && spec.elevation + lift <= 80; lift += NET_LIFT_STEP) {
      const v = scaled(solveLaunch(from, aim, spec.elevation + lift, spec.maxSpeed), factor)
      if (Math.hypot(v.x, v.y, v.z) <= maxV && ok(v)) return v
    }
    return null
  }
  // reference = the full-power (Perfect-style) shot for this aim; worse grades never exceed its speed
  const ref = search(1, Infinity) ?? solveLaunch(from, aim, spec.elevation, spec.maxSpeed)
  const k = SPEED_FACTOR[grade]
  if (k === 1) return ref
  return search(k, Math.hypot(ref.x, ref.y, ref.z)) ?? ref
}
