// Jump / lunge / hop. Two buttons (Jump, Dive) force the move; the legacy one-button press (older
// clients, the computer) lets the shuttle pick it. Pure rules shared by the host sim, the guest's
// prediction, the AI and the renderer (ticks at 60 Hz; `tick` may be fractional for render).
import { onHalf, findContact, REACH, WINDOW, type Grade, type Reach, type ShotKind } from './shots'
import type { Flight } from './physics'

export type AbilityKind = 'jump' | 'lunge' | 'hop'
/** The kinds that strike the shuttle (a hop never does). */
export type Strike = Exclude<AbilityKind, 'hop'>

/**
 * A press in progress: `at` = host tick of its arrival; `dx, dz` = unit world direction (a jump: to the
 * picked contact; a lunge: the dive's direction, the way it slides; 0/0 for a hop). `empty` = a forced
 * jump with nothing to strike: the body moves, no swing, the short (hop) cooldown. `free` = the Dive
 * button's dive (ABILITY.dive) or, with auto swing off, the Jump button's jump: the body moves, the
 * player swings by hand with the move's reach (freeSwing).
 */
export interface Act {
  k: AbilityKind
  at: number
  dx: number
  dz: number
  empty?: boolean
  free?: boolean
  /** A free dive the sim swings for (the player's Auto swing setting): see sim autoDiveSwings. */
  auto?: boolean
}

/** A forced move (the Jump / Dive buttons); undefined = the shuttle picks (one-button press). */
export type Want = Strike

/**
 * Starting values (tune via balance tests). jump: 1.1 m high, +0.95 m reach height (floor 2.2 = "the
 * shuttle is high"), a stronger smash, half speed in the air then a 0.4 s landing lock. lunge: the body
 * really slides `slide` m along the dive over its 0.2 s dive (sim + prediction), reaching `reach.radius`
 * from where it lands (pickReachOf = the same box seen from the press spot), then 0.7 s on the floor.
 * Shared 3 s cooldown; a hop or an empty forced move 1 s. `lead` = ticks the strike may land before the
 * press (the move's wind-up). jump.charge 0.6 → 0.8 in the balance pass (balance.test.ts 'jump / lunge
 * balance': a smart jumper must gain on a never-jumper).
 */
export const ABILITY = {
  /** Plain-swing look-ahead (ticks); a strike's own is horizonOf. */
  horizon: 36,
  jump: {
    lead: 12,
    air: 30,
    lock: 24,
    cooldown: 180,
    airMul: 0.5,
    height: 1.1,
    charge: 0.8,
    reach: { radius: 1.1, minY: 2.2, maxY: 3.85 } as Readonly<Reach>,
    /** A free jump (the Jump button, auto swing off): swings until `grace` ticks after landing reach high; one cooldown. */
    grace: 6,
    freeCooldown: 120,
  },
  lunge: {
    lead: 8,
    dive: 12,
    floor: 42,
    cooldown: 180,
    slide: 1.0,
    reach: { radius: 1.6, minY: 0.05, maxY: 1.6 } as Readonly<Reach>,
  },
  hop: { air: 18, cooldown: 60, height: 0.25 },
  /**
   * The Dive button (a `free` lunge): slides `slide` m over `glide` ticks (0.27 s), never swings by itself.
   * A swing (J) from the press until `grace` ticks after the glide reaches like a lunge (reach box at the
   * slide end, its capped clear). After the glide the run is slowed to `slow`, easing back to full over
   * `floor` ticks (a get-up, never stuck; swinging allowed). `back` = the held view z below which the
   * button does nothing (moving away from the net: no escape dives). One cooldown, hit or not (1.5 s:
   * between an empty move's 1 s and a striking one's 3 s).
   */
  dive: { glide: 16, slide: 1.8, grace: 15, floor: 30, slow: 0.3, back: -0.5, cooldown: 90 },
} as const

/** A dive's shape: ticks sliding (`dive`), metres, ticks down after. */
interface Glide {
  dive: number
  slide: number
  floor: number
}
const LUNGE_GLIDE: Glide = ABILITY.lunge
const FREE_GLIDE: Glide = { dive: ABILITY.dive.glide, slide: ABILITY.dive.slide, floor: ABILITY.dive.floor }

/** The shape of a lunge `act`: the Dive button's (free) or the auto-pick's. */
export function glideOf(act: Act | null | undefined): Glide {
  return act?.free && act.k === 'lunge' ? FREE_GLIDE : LUNGE_GLIDE
}

/** Ticks a lunge's dive eases back up at the end of its floor time. */
const RECOVER = 12

/** The reach box of a strike (none = the plain REACH), around the striking body (a lunge: its slide end). */
export function reachOf(k?: Strike): Reach {
  return k ? ABILITY[k].reach : REACH
}

const LUNGE_PICK: Readonly<Reach> = {
  ...ABILITY.lunge.reach,
  radius: ABILITY.lunge.reach.radius + ABILITY.lunge.slide,
}

/** A strike's box seen from the press spot (a lunge's grows by its slide, in any direction). */
export function pickReachOf(k?: Strike): Reach {
  return k === 'lunge' ? LUNGE_PICK : reachOf(k)
}

/** The Dive button's box seen from the press spot (grows by its longer slide). */
const DIVE_PICK: Readonly<Reach> = {
  ...ABILITY.lunge.reach,
  radius: ABILITY.lunge.reach.radius + ABILITY.dive.slide,
}

/** Metres a lunge has slid `e` ticks after its press (0 at the press, `slide` once the dive is done). */
export function slideOf(e: number, g: Glide = LUNGE_GLIDE): number {
  const { dive, slide } = g
  if (!(e > 0)) return 0
  if (e >= dive) return slide
  const u = e / dive
  return slide * u * (2 - u) // ease-out: a burst that settles
}

/**
 * The slide step (world metres, into `out`) a press makes on the step `e` ticks after it (sim tick
 * act.at + e; the press tick itself runs free): along (dx, dz) for a lunge's dive, else 0.
 */
export function slideStep(
  act: Act | null,
  e: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  out.x = 0
  out.z = 0
  const g = glideOf(act)
  if (!act || act.k !== 'lunge' || e < 1 || e > g.dive) return out
  const d = slideOf(e, g) - slideOf(e - 1, g)
  out.x = act.dx * d
  out.z = act.dz * d
  return out
}

/**
 * Where a lunge's reach is measured from at sim tick `tick`, for a body now at `p`: the slide's end (the
 * slide still ahead added on), so a contact due mid-dive is judged where it was picked. Else `p`.
 */
export function strikeFrom(
  p: { x: number; z: number },
  act: Act | null,
  tick: number,
): { x: number; z: number } {
  if (!act || act.k !== 'lunge') return p
  const g = glideOf(act)
  const left = g.slide - slideOf(tick - act.at, g)
  return left > 0 ? { x: p.x + act.dx * left, z: p.z + act.dz * left } : p
}

/** Where a lunge pressed at `at` along unit (dx, dz) ends its slide. */
export function slideEnd(at: { x: number; z: number }, dx: number, dz: number): { x: number; z: number } {
  return { x: at.x + dx * ABILITY.lunge.slide, z: at.z + dz * ABILITY.lunge.slide }
}

/** The strike's lead ticks (none = 0). */
export function leadOf(k?: Strike): number {
  return k ? ABILITY[k].lead : 0
}

/**
 * How far ahead (ticks) a press of `k` can still grade: its lead + WINDOW.late. A contact further out is
 * a certain whiff (committed lock + cooldown for nothing), so the pick never chooses it.
 */
export function horizonOf(k: Strike): number {
  return ABILITY[k].lead + WINDOW.late
}

/**
 * The move a press makes from `at`: a jump when the shuttle passes in the jump box on my half within
 * horizonOf('jump') and a plain swing can't reach it (or the jump contact is above REACH.maxY), else a lunge
 * (within horizonOf('lunge')) when it passes in the lunge box and a plain swing can't reach it, else (or when not mine to hit) a hop.
 * Never an always-correct button: anything a plain swing reaches hops.
 * Direction = unit (contact − at), 0/0 when on top of it. `f` is not mutated.
 */
export function pickAbility(
  f: Flight,
  at: { x: number; z: number },
  side: 0 | 1,
  lastHitter: -1 | 0 | 1,
  canHit: boolean,
  want?: Want,
  dir?: { x: number; z: number },
  auto = false,
): { k: AbilityKind; dx: number; dz: number; empty?: boolean; free?: boolean } {
  if (want) return forcedPick(f, at, side, lastHitter, canHit, want, dir, auto)
  if (canHit && lastHitter !== side) {
    const mine = (c: { pos: { z: number } } | null): boolean => !!c && onHalf(c.pos.z, side, lastHitter)
    // A plain swing reaches it: the button only jumps for what is above the plain box, never lunges.
    const plain = mine(findContact(f, at, 0, ABILITY.horizon))
    for (const k of ['jump', 'lunge'] as const) {
      const c = findContact(f, at, 0, horizonOf(k), pickReachOf(k))
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

const unit = (x: number, z: number): { x: number; z: number } | null => {
  const d = Math.hypot(x, z)
  return d < 1e-6 ? null : { x: x / d, z: z / d }
}

/**
 * The Jump / Dive buttons: the move is the player's, never a hop. A dive is always `free` (ABILITY.dive:
 * slides; the sim swings for it only with `auto`) along `dir` (unit world, the held stick; none = toward
 * the contact it could reach, else toward the net). A jump without `auto` is `free` too (leaps; the
 * player swings in the air). With `auto` (the player's Auto swing setting) a jump strikes when the
 * shuttle passes in its box on my half within its horizon; nothing to strike (or `canHit` false):
 * `empty` (moves, no swing).
 */
function forcedPick(
  f: Flight,
  at: { x: number; z: number },
  side: 0 | 1,
  lastHitter: -1 | 0 | 1,
  canHit: boolean,
  want: Want,
  dir: { x: number; z: number } | undefined,
  auto: boolean,
): { k: AbilityKind; dx: number; dz: number; empty?: boolean; free?: boolean } {
  const hit = canHit && lastHitter !== side
  const mine = (c: { pos: { z: number } } | null): c is { dt: number; pos: Flight['pos'] } =>
    !!c && onHalf(c.pos.z, side, lastHitter)
  if (want === 'jump' && !auto) return { k: 'jump', dx: 0, dz: 0, free: true }
  if (want === 'jump') {
    const c = hit ? findContact(f, at, 0, horizonOf('jump'), reachOf('jump')) : null
    if (!mine(c)) return { k: 'jump', dx: 0, dz: 0, empty: true }
    const u = unit(c.pos.x - at.x, c.pos.z - at.z)
    return { k: 'jump', dx: u?.x ?? 0, dz: u?.z ?? 0 }
  }
  let d = dir ? unit(dir.x, dir.z) : null
  if (!d && hit) {
    const c = findContact(f, at, 0, diveWindow(), DIVE_PICK)
    if (mine(c)) d = unit(c.pos.x - at.x, c.pos.z - at.z)
  }
  d ??= { x: 0, z: side === 0 ? 1 : -1 }
  return { k: 'lunge', dx: d.x, dz: d.z, free: true }
}

/** May the Dive button dive with view-relative `held` (z = toward the net): not while moving backward. */
export function diveAllowed(held: { x: number; z: number }): boolean {
  return !(held.z < ABILITY.dive.back)
}

/** Ticks from a Dive press its swings still reach like a lunge (the glide + its grace). */
const diveWindow = (): number => ABILITY.dive.glide + ABILITY.dive.grace

/**
 * The strike a plain swing at `tick` makes inside a free move's window (a dive: its glide + grace; a jump:
 * its air + grace), else undefined (a plain swing).
 */
export function freeSwing(act: Act | null | undefined, tick: number): Strike | undefined {
  if (!act?.free || act.k === 'hop') return undefined
  const e = tick - act.at
  const end = act.k === 'lunge' ? diveWindow() : ABILITY.jump.air + ABILITY.jump.grace
  return e >= 0 && e <= end ? act.k : undefined
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
  return act.at + (act.k === 'lunge' ? glideOf(act).dive : ABILITY[act.k].air)
}

/** Ticks from `at` the move holds the player (jump: air + lock; lunge: dive + floor; hop: 0). */
function busyTicks(act: Act): number {
  if (act.k === 'jump') return ABILITY.jump.air + ABILITY.jump.lock
  if (act.k === 'lunge') return glideOf(act).dive + glideOf(act).floor
  return 0
}

/** True while the move commits the player (no new move; see actMoveMul for movement). A hop never does. */
export function acting(act: Act | null, tick: number): boolean {
  if (!act) return false
  const e = tick - act.at
  return e >= 0 && e < busyTicks(act)
}

/** True while the move also locks the racket (no charge / swing): any acting move but a free dive. */
export function holdsRacket(act: Act | null, tick: number): boolean {
  return acting(act, tick) && !act?.free
}

/**
 * Movement speed multiplier: jump air ABILITY.jump.airMul, jump landing lock 0, lunge 0, a free dive 0
 * while sliding then ABILITY.dive.slow easing (smoothstep) back to 1 over its floor, else 1.
 */
export function actMoveMul(act: Act | null, tick: number): number {
  if (!act || !acting(act, tick)) return 1
  const e = tick - act.at
  if (act.free && act.k === 'lunge') {
    const { glide, floor, slow } = ABILITY.dive
    if (e < glide) return 0
    const u = (e - glide) / floor
    return slow + (1 - slow) * u * u * (3 - 2 * u)
  }
  if (act.k === 'jump' && e < ABILITY.jump.air) return ABILITY.jump.airMul
  return 0
}

/** A press's cooldown (ticks from `at`): its kind's, the short hop one for an empty forced move, the Dive button's own. */
export function cooldownOf(act: Act): number {
  if (act.free) return act.k === 'jump' ? ABILITY.jump.freeCooldown : ABILITY.dive.cooldown
  return act.empty ? ABILITY.hop.cooldown : ABILITY[act.k].cooldown
}

/** True when a new press may start (the cooldown counts from the press's `at`). */
export function actReady(act: Act | null, tick: number): boolean {
  return !act || tick >= act.at + cooldownOf(act)
}

/** Remaining cooldown share, 1 (just pressed) .. 0 (ready). */
export function cooldownLeft(act: Act | null, tick: number): number {
  if (!act) return 0
  const cd = cooldownOf(act)
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
    const { dive, floor } = glideOf(act)
    const end = dive + floor
    if (e <= 0 || e >= end) return out
    if (e < dive) out.dive = e / dive
    else if (act.free && act.k === 'lunge') {
      // A free dive gets up over its whole floor (the run is coming back: ABILITY.dive.slow).
      const u = (end - e) / floor
      out.dive = u * u * (3 - 2 * u)
    } else if (e < end - RECOVER) out.dive = 1
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
