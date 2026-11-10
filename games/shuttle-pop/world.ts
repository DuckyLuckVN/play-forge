// Pure render mapping (no three.js): sim world → the local player's view.
// The view always puts the local player at the near end (render z < 0), looking toward +z.
import { COURT, type Vec3 } from './physics'
import type { SpEvent } from './sim'

/** Side 0 is drawn as is; side 1 is mirrored in x and z (a half turn), so either side is near. */
export function viewOf(side: 0 | 1): { flip: 1 | -1 } {
  return { flip: side === 0 ? 1 : -1 }
}

/** a → b by t, written into `out` (render loops reuse one vector). */
export function lerpV(a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 {
  out.x = a.x + (b.x - a.x) * t
  out.y = a.y + (b.y - a.y) * t
  out.z = a.z + (b.z - a.z) * t
  return out
}

/** Shuttle moves <= 0.75 m a tick in flight; more is a reset into the server's hand. */
export const SHUTTLE_SNAP = 2
/** A player jumping further than this (m, |dx| + |dz|) between two ticks was placed (new serve): snap, don't glide. */
export const PLAYER_SNAP = 1.5

/** Shuttle draw position between two states; a jump over SHUTTLE_SNAP (a placement) snaps to `curr`. */
export function interpShuttle(
  prev: Vec3,
  curr: Vec3,
  alpha: number,
  out: Vec3,
): { pos: Vec3; snap: boolean } {
  const snap =
    Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y) + Math.abs(curr.z - prev.z) > SHUTTLE_SNAP
  return { pos: lerpV(prev, curr, snap ? 1 : alpha, out), snap }
}

/**
 * Camera behind the near baseline, looking toward the net. Metres / degrees. Pulled back and a touch
 * wide so a Perfect clear (apex ~8.5 m) stays on screen with the look-at rising with the shuttle,
 * while all four court corners stay in view (world.test.ts checks 16:9, 19.5:9 and a short canvas).
 * This is the roomy framing for tall-ish canvases (16:9 and narrower); see CAMERA_TIGHT.
 * A player's own height / tilt tweak (CameraTweak) rides on top of this, clamped by clampCameraTweak.
 */
export const CAMERA = {
  fov: 55,
  height: 6,
  /** Behind the near baseline. */
  back: 7.5,
  /** Look-at point on the floor at rest (the net line). */
  lookZ: 0,
  /** Look-at height gained per metre the (damped) shuttle is above `riseFrom`. */
  rise: 0.4,
  riseFrom: 1.5,
  /**
   * Field of view gained (deg) per metre the (damped) shuttle is above `riseFrom`. 0 here: the roomy
   * framing already fits a clear's apex at 55°; only CAMERA_TIGHT needs to widen.
   */
  zoom: 0,
  /** Focus easing toward the shuttle height, per second (smooth: no jerks on hits). */
  focusRate: 5,
  /** How much the camera slides with the local player's x (0 = fixed). */
  followX: 0.3,
} as const

/**
 * Framing for wide or short canvases (phone landscape under the shell bar). Height, not width, is
 * what limits the view there, so the camera sits lower, looks a bit past the net and zooms in at rest
 * (players ~1.7× taller on screen), then widens with the shuttle's height (`zoom`) so high clears
 * and long serves stay in frame.
 */
export const CAMERA_TIGHT = { fov: 34, height: 4.5, back: 8.5, lookZ: 2, zoom: 2 } as const

/** Never wider than this, however high the shuttle goes (past ~60° the edges stretch visibly). */
const FOV_MAX = 58

/** Canvas aspect / CSS height where the tight framing is fully on (it blends in from 16:9 / 560 px). */
export const TIGHT_AT = { aspect: 2.1, height: 380 } as const

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** 0 = roomy CAMERA framing, 1 = CAMERA_TIGHT: on as the canvas gets wider than 16:9 or shorter than 560 px. */
export function framingTightness(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0
  const wide = (width / height - 16 / 9) / (TIGHT_AT.aspect - 16 / 9)
  const short = (560 - height) / (560 - TIGHT_AT.height)
  return clamp01(Math.max(wide, short))
}

export interface CameraPose {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
  /** Vertical field of view, degrees. */
  fov: number
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** The court measures the camera needs (`COURT` satisfies it; a court-size setting can pass its own). */
export interface CourtDims {
  halfLen: number
  halfWidth: number
  netH: number
}

/** A player's personal camera offset: each −1..1, 0 = the default framing. +height raises, +tilt looks up. */
export interface CameraTweak {
  height: number
  tilt: number
}

export const NO_TWEAK: Readonly<CameraTweak> = { height: 0, tilt: 0 }

export const CAMERA_TWEAK = {
  /** Metres of camera height per tweak unit. */
  height: 2,
  /** Degrees of look-at pitch per tweak unit. */
  tilt: 4,
  /** Share of the half-frame the key court points must stay within (a margin off the very edge). */
  edge: 0.94,
  /** Focus height (m) of a high shot, checked on top of the resting focus. */
  focusHigh: 7,
} as const

/**
 * Camera position + look-at + fov for a (damped) camera x and focus height, at framing tightness
 * `tight` (framingTightness; 0 = the roomy CAMERA framing), with the player's `tweak` on top.
 * Writes into `out`.
 */
export function cameraPose(
  camX: number,
  focusY: number,
  out: CameraPose,
  tight = 0,
  tweak: CameraTweak = NO_TWEAK,
  court: CourtDims = COURT,
): CameraPose {
  const t = clamp01(tight)
  const T = CAMERA_TIGHT
  const above = Math.max(0, focusY - CAMERA.riseFrom)
  out.x = camX
  out.y = mix(CAMERA.height, T.height, t) + tweak.height * CAMERA_TWEAK.height
  out.z = -(court.halfLen + mix(CAMERA.back, T.back, t))
  out.lookX = camX * 0.5
  out.lookZ = mix(CAMERA.lookZ, T.lookZ, t)
  out.lookY =
    CAMERA.rise * above + Math.tan((tweak.tilt * CAMERA_TWEAK.tilt * Math.PI) / 180) * (out.lookZ - out.z)
  out.fov = Math.min(FOV_MAX, mix(CAMERA.fov, T.fov, t) + mix(CAMERA.zoom, T.zoom, t) * above)
  return out
}

/**
 * Is world point `p` inside the pose's view, within `edge` of the half-frame (1 = the very edge)?
 * Pure look-at projection (world up +y), same answer as a three.js frustum's side planes.
 */
export function inView(pose: CameraPose, aspect: number, p: Vec3, edge = 1): boolean {
  let fx = pose.lookX - pose.x
  let fy = pose.lookY - pose.y
  let fz = pose.lookZ - pose.z
  const fl = Math.hypot(fx, fy, fz)
  fx /= fl
  fy /= fl
  fz /= fl
  // right = f × up(0,1,0) = (−fz, 0, fx); camera up = right × f
  let rx = -fz
  let rz = fx
  const rl = Math.hypot(rx, rz)
  rx /= rl
  rz /= rl
  const ux = -rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy
  const dx = p.x - pose.x
  const dy = p.y - pose.y
  const dz = p.z - pose.z
  const depth = dx * fx + dy * fy + dz * fz
  if (depth <= 0) return false
  const th = Math.tan((pose.fov * Math.PI) / 360) * edge
  return (
    Math.abs(dx * rx + dz * rz) <= depth * th * aspect && Math.abs(dx * ux + dy * uy + dz * uz) <= depth * th
  )
}

const scratchPose: CameraPose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0, fov: 0 }
const scratchPoint: Vec3 = { x: 0, y: 0, z: 0 }

/** The tweak the player asked for, shrunk (toward 0) until both baselines and the net stay in view. */
export function clampCameraTweak(
  want: CameraTweak,
  frame: { aspect: number; tight: number; court?: CourtDims },
): CameraTweak {
  const court = frame.court ?? COURT
  const sane = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0)
  const w: CameraTweak = { height: sane(want.height), tilt: sane(want.tilt) }
  const m = court.halfWidth * CAMERA.followX
  const fits = (tw: CameraTweak): boolean => {
    for (const camX of [-m, 0, m])
      for (const focus of [1, CAMERA_TWEAK.focusHigh]) {
        cameraPose(camX, focus, scratchPose, frame.tight, tw, court)
        for (const s of [-1, 1])
          for (const [y, z] of [
            [0, -court.halfLen],
            [0, court.halfLen],
            [court.netH, 0],
          ]) {
            scratchPoint.x = s * court.halfWidth
            scratchPoint.y = y
            scratchPoint.z = z
            if (!inView(scratchPose, frame.aspect, scratchPoint, CAMERA_TWEAK.edge)) return false
          }
      }
    return true
  }
  if (!fits(NO_TWEAK)) return { ...NO_TWEAK }
  if (fits(w)) return w
  const out: CameraTweak = { height: 0, tilt: 0 }
  for (const k of ['height', 'tilt'] as const) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (fits({ ...out, [k]: mid * w[k] })) lo = mid
      else hi = mid
    }
    out[k] = lo * w[k]
  }
  return out
}

/** The focus height eased toward the shuttle's height over `dt` seconds. */
export function dampFocus(focus: number, shuttleY: number, dt: number): number {
  return focus + (shuttleY - focus) * (1 - Math.exp(-CAMERA.focusRate * dt))
}

/**
 * A player's mood: during the point pause the side that won it (`pointSide`, −1 = none) celebrates
 * and the other slumps; at 'over' the match `winner` does. Idle otherwise.
 */
export function moodOf(
  phase: 'serve' | 'rally' | 'point' | 'over',
  winner: number,
  pointSide: number,
  side: 0 | 1,
): 'idle' | 'happy' | 'sad' {
  const won = phase === 'over' ? winner : phase === 'point' ? pointSide : -1
  return won === -1 ? 'idle' : won === side ? 'happy' : 'sad'
}

/** Same preset on both sides: the far player (`i` ≠ the near `localIdx`) is drawn as the tinted twin. */
export function isTwinAlt(preset0: number, preset1: number, i: number, localIdx: number): boolean {
  return preset0 === preset1 && i !== localIdx
}

/** Crowd tuning: cheers from a rally of `rally` hits, and for `pointTime` s after every point. */
export const CHEER = {
  rally: 8,
  /** Level when a long rally starts cheering; each further hit adds `perHit`. */
  base: 0.45,
  perHit: 0.06,
  /** Level for a point after a short rally (a long one gets the full 1). */
  point: 0.55,
  pointTime: 1.8,
} as const

/** Hits in the current rally after an event of kind `k`: a serve or a point starts over. */
export function rallyHits(hits: number, k: SpEvent['k']): number {
  return k === 'hit' ? hits + 1 : k === 'serve' || k === 'point' ? 0 : hits
}

/**
 * Crowd excitement 0..1. `hits` = the rally so far, `pointAge` = seconds since the latest point
 * (Infinity = none), `pointHits` = how long that point's rally was.
 */
export function cheerLevel(hits: number, pointAge: number, pointHits: number): number {
  if (pointAge < CHEER.pointTime) return pointHits >= CHEER.rally ? 1 : CHEER.point
  if (hits < CHEER.rally) return 0
  return Math.min(1, CHEER.base + (hits - CHEER.rally) * CHEER.perHit)
}

/**
 * The swing's tick in host history terms. The screen shows prev → curr by `alpha`, and the state of
 * tick T holds the shuttle that history records at T + 1 (the swings of tick T + 1 see it), so the
 * shuttle on screen is history tick curr + alpha, rounded.
 */
export function swingTick(currTick: number, alpha: number): number {
  return currTick + (alpha > 0.5 ? 1 : 0)
}

/** Guest prediction correction: metres, and the share of the error closed per 60 Hz frame. */
export const CORRECT = { keep: 0.05, snap: 1.0, blend: 0.15 } as const

/**
 * Pulls a predicted position toward the authoritative one (writes `out`, which may be `pred`): under
 * `keep` it stays, under `snap` it closes `blend` of the error per 60 Hz frame (dt-based), else it snaps.
 */
export function correct(
  pred: { x: number; z: number },
  auth: { x: number; z: number },
  out: { x: number; z: number },
  dt = 1 / 60,
): void {
  const ex = auth.x - pred.x
  const ez = auth.z - pred.z
  const err = Math.hypot(ex, ez)
  const k = err < CORRECT.keep ? 0 : err < CORRECT.snap ? 1 - Math.pow(1 - CORRECT.blend, dt * 60) : 1
  out.x = k === 1 ? auth.x : pred.x + ex * k
  out.z = k === 1 ? auth.z : pred.z + ez * k
}
