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
 * the strike may land before the press (the move's wind-up). jump.charge 0.6 → 0.8 in the balance pass
 * (balance.test.ts 'jump / lunge balance': a smart jumper must gain on a never-jumper).
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
    charge: 0.8,
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
 * The move a press makes from `at`: a jump when the shuttle passes in the jump box on my half within
 * ABILITY.horizon and a plain swing can't reach it (or the jump contact is above REACH.maxY), else a lunge
 * when it passes in the lunge box and a plain swing can't reach it, else (or when not mine to hit) a hop.
 * Never an always-correct button: anything a plain swing reaches hops.
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
    const mine = (c: { pos: { z: number } } | null): boolean => !!c && onHalf(c.pos.z, side, lastHitter)
    // A plain swing reaches it: the button only jumps for what is above the plain box, never lunges.
    const plain = mine(findContact(f, at, 0, ABILITY.horizon))
    for (const k of ['jump', 'lunge'] as const) {
      const c = findContact(f, at, 0, ABILITY.horizon, reachOf(k))
      if (!c || !mine(c)) continue
      if (plain && (k === 'lunge' || c.pos.y <= REACH.maxY)) continue
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
  if (!act || !acting(act, tick)) return 1
  if (act.k === 'jump' && tick - act.at < ABILITY.jump.air) return ABILITY.jump.airMul
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

/** A body offset for the renderer (actArc). */
export interface ActArc {
  lift: number
  dive: number
}

/**
 * Body offsets for the renderer: `lift` (m) = a jump / hop parabola peaking at its height mid-air;
 * `dive` (0..1) = a lunge ramping in over its dive, held on the floor, easing back over the last 12 ticks.
 * A fresh object: the per-frame render path uses actArcInto.
 */
export function actArc(act: Act | null, tick: number): ActArc {
  return actArcInto(act, tick, { lift: 0, dive: 0 })
}

/** actArc written into `out` (returned): allocates nothing. */
export function actArcInto(act: Act | null, tick: number, out: ActArc): ActArc {
  out.lift = 0
  out.dive = 0
  if (!act) return out
  const e = tick - act.at
  if (act.k === 'lunge') {
    const { dive, floor } = ABILITY.lunge
    const end = dive + floor
    if (e <= 0 || e >= end) return out
    if (e < dive) out.dive = e / dive
    else if (e < end - RECOVER) out.dive = 1
    else {
      const u = (end - e) / RECOVER
      out.dive = u * u * (3 - 2 * u)
    }
    return out
  }
  const { air, height } = ABILITY[act.k]
  const u = e / air
  if (u > 0 && u < 1) out.lift = height * 4 * u * (1 - u)
  return out
}

/**
 * The seat (index into `players`) whose press made an `act` / `actLand` event: same side and kind, with
 * its press at the event tick (act) or landing on it (actLand); else the first player on that side
 * (the state moved on to a newer press); −1 = none. Any number of players (2v2: two per side).
 */
export function actorIndex(
  players: readonly { side: 0 | 1; act: Act | null }[],
  e: { k: 'act' | 'actLand'; side: 0 | 1; act: AbilityKind; tick: number },
): number {
  let first = -1
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    if (p.side !== e.side) continue
    if (first < 0) first = i
    const a = p.act
    if (a && a.k === e.act && (e.k === 'act' ? a.at : landTick(a)) === e.tick) return i
  }
  return first
}
