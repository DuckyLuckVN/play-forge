// Jump / lunge / hop: one button, the shuttle picks the move. Pure rules shared by the host sim, the
// guest's prediction, the AI and the renderer (ticks at 60 Hz; `tick` may be fractional for render).
import { onHalf, findContact, REACH, type Grade, type Reach, type ShotKind } from './shots'
import type { Flight } from './physics'

export type AbilityKind = 'jump' | 'lunge' | 'hop'
/** The kinds that strike the shuttle (a hop never does). */
export type Strike = Exclude<AbilityKind, 'hop'>

/** A press in progress: `at` = host tick of its arrival; `dx, dz` = unit world direction to the picked contact (0/0 for a hop). */
export interface Act {
  k: AbilityKind
  at: number
  dx: number
  dz: number
}

/**
 * Starting values (tune via balance tests). jump: +0.8 m reach height (floor 2.2 = "the shuttle is high"),
 * a stronger smash, half speed in the air then a 0.4 s landing lock. lunge: +1.2 m reach out, a weak
 * lift, 0.2 s dive then 0.7 s on the floor. Shared 3 s cooldown; a hop (no target) 1 s. `lead` = ticks
 * the strike may land before the press (the move's wind-up).
 */
export const ABILITY = {
  horizon: 36,
  jump: {
    lead: 12,
    air: 30,
    lock: 24,
    cooldown: 180,
    airMul: 0.5,
    height: 0.75,
    charge: 0.6,
    reach: { radius: 1.1, minY: 2.2, maxY: 3.7 } as Readonly<Reach>,
  },
  lunge: {
    lead: 8,
    dive: 12,
    floor: 42,
    cooldown: 180,
    slide: 0.5,
    reach: { radius: 2.3, minY: 0.05, maxY: 1.6 } as Readonly<Reach>,
  },
  hop: { air: 18, cooldown: 60, height: 0.25 },
} as const

/** Ticks a lunge's dive eases back up at the end of its floor time. */
const RECOVER = 12

/** The reach box of a strike (none = the plain REACH). */
export function reachOf(k?: Strike): Reach {
  return k ? ABILITY[k].reach : REACH
}

/** The strike's lead ticks (none = 0). */
export function leadOf(k?: Strike): number {
  return k ? ABILITY[k].lead : 0
}

/**
 * The move a press makes from `at`: a jump when the shuttle passes high in the jump box on my half within
 * ABILITY.horizon, else a lunge when it passes in the lunge box, else (or when it is not mine to hit) a hop.
 * Direction = unit (contact − at), 0/0 when on top of it. `f` is not mutated.
 */
export function pickAbility(
  f: Flight,
  at: { x: number; z: number },
  side: 0 | 1,
  lastHitter: -1 | 0 | 1,
  canHit: boolean,
): { k: AbilityKind; dx: number; dz: number } {
  if (canHit && lastHitter !== side) {
    for (const k of ['jump', 'lunge'] as const) {
      const c = findContact(f, at, 0, ABILITY.horizon, reachOf(k))
      if (!c || !onHalf(c.pos.z, side, lastHitter)) continue
      const x = c.pos.x - at.x
      const z = c.pos.z - at.z
      const d = Math.hypot(x, z)
      return d < 1e-6 ? { k, dx: 0, dz: 0 } : { k, dx: x / d, dz: z / d }
    }
  }
  return { k: 'hop', dx: 0, dz: 0 }
}

/**
 * The shot a strike plays (overrides chooseShot). Jump: a charged smash, unless held back or Late (a plain
 * clear). Lunge: always a clear, capped at Good (a stretched save, never a winner). `held` is view-relative.
 */
export function abilityShot(
  k: Strike,
  held: { x: number; z: number },
  grade: Grade,
): { kind: ShotKind; grade: Grade; charge: number } {
  if (k === 'lunge') return { kind: 'clear', grade: grade === 'perfect' ? 'good' : grade, charge: 0 }
  if (grade === 'late' || held.z < -0.5) return { kind: 'clear', grade, charge: 0 }
  return { kind: 'smash', grade, charge: ABILITY.jump.charge }
}

/** Tick the feet are back on the floor (jump / hop: end of air; lunge: end of the dive). */
export function landTick(act: Act): number {
  return act.at + (act.k === 'lunge' ? ABILITY.lunge.dive : ABILITY[act.k].air)
}

/** Ticks from `at` the move holds the player (jump: air + lock; lunge: dive + floor; hop: 0). */
function busyTicks(k: AbilityKind): number {
  if (k === 'jump') return ABILITY.jump.air + ABILITY.jump.lock
  if (k === 'lunge') return ABILITY.lunge.dive + ABILITY.lunge.floor
  return 0
}

/** True while the move commits the player (no swing; see actMoveMul for movement). A hop never does. */
export function acting(act: Act | null, tick: number): boolean {
  if (!act) return false
  const e = tick - act.at
  return e >= 0 && e < busyTicks(act.k)
}

/** Movement speed multiplier: jump air ABILITY.jump.airMul, jump landing lock 0, lunge 0, else 1. */
export function actMoveMul(act: Act | null, tick: number): number {
  if (!acting(act, tick)) return 1
  if (act!.k === 'jump' && tick - act!.at < ABILITY.jump.air) return ABILITY.jump.airMul
  return 0
}

/** True when a new press may start (the cooldown counts from the press's `at`). */
export function actReady(act: Act | null, tick: number): boolean {
  return !act || tick >= act.at + ABILITY[act.k].cooldown
}

/** Remaining cooldown share, 1 (just pressed) .. 0 (ready). */
export function cooldownLeft(act: Act | null, tick: number): number {
  if (!act) return 0
  const cd = ABILITY[act.k].cooldown
  return Math.min(1, Math.max(0, (act.at + cd - tick) / cd))
}

/**
 * Body offsets for the renderer: `lift` (m) = a jump / hop parabola peaking at its height mid-air;
 * `dive` (0..1) = a lunge ramping in over its dive, held on the floor, easing back over the last 12 ticks.
 */
export function actArc(act: Act | null, tick: number): { lift: number; dive: number } {
  if (!act) return { lift: 0, dive: 0 }
  const e = tick - act.at
  if (act.k === 'lunge') {
    const { dive, floor } = ABILITY.lunge
    const end = dive + floor
    if (e <= 0 || e >= end) return { lift: 0, dive: 0 }
    if (e < dive) return { lift: 0, dive: e / dive }
    if (e < end - RECOVER) return { lift: 0, dive: 1 }
    const u = (end - e) / RECOVER
    return { lift: 0, dive: u * u * (3 - 2 * u) }
  }
  const { air, height } = ABILITY[act.k]
  const u = e / air
  if (u <= 0 || u >= 1) return { lift: 0, dive: 0 }
  return { lift: height * 4 * u * (1 - u), dive: 0 }
}
