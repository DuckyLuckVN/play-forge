// Guest-side shuttle view: shows the host's flight on a smooth clock. Between host states the flight
// is re-simulated locally with the sim's own rule (deterministic), so a late packet never freezes or
// lurches the shuttle. A hit / serve event starts a new flight, so a sample is never run past one.
import { settleOnFloor, stepShuttle, type Flight, type Vec3 } from './physics'
import { RenderClock } from './renderclock'
import type { SpState } from './sim'
import { interpShuttle } from './world'

export type ShuttleSample = Pick<SpState, 'tick' | 'phase' | 'shuttle' | 'events'>

const RING = 8

export const RECONCILE = {
  /** Seconds for a late-hit correction to halve. */
  halfLife: 0.06,
  /** Metres: a correction this big (or a clock jump / placement) snaps instead of bending. */
  snap: 1.5,
} as const

/** Clock jump (ticks) between frames that counts as a resync, not a normal frame. */
const CLOCK_JUMP = 4

interface Stored {
  tick: number
  phase: SpState['phase']
  pos: Vec3
  vel: Vec3
  /** Ticks of the events that start a new flight (a net hit is not one: stepShuttle reproduces it). */
  breaks: number[]
}

/** What an online guest's render loop owns beyond the interpolated state (grows: Task 7 adds remotes). */
export interface GuestView {
  clock: RenderClock
  shuttle: GuestShuttle
}

const isFlight = (p: SpState['phase']) => p === 'rally' || p === 'point'

export class GuestShuttle {
  readonly pos: Vec3 = { x: 0, y: 0, z: 0 }
  snapped = false
  /** Visual offset added to the flight; absorbs late-hit corrections and decays to 0. One place for all corrections. */
  private readonly err: Vec3 = { x: 0, y: 0, z: 0 }
  private shown = NaN
  private placed = false
  private ring: Stored[] = []
  private readonly a: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
  private readonly b: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
  private readonly old: Vec3 = { x: 0, y: 0, z: 0 }
  private readonly fresh: Vec3 = { x: 0, y: 0, z: 0 }

  constructor(private readonly clock: RenderClock) {}

  push(s: ShuttleSample): void {
    const last = this.ring[this.ring.length - 1]
    if (last && s.tick <= last.tick) return
    const known = !Number.isNaN(this.shown)
    const before = known ? this.flightAt(this.shown, this.old).pos : null
    this.ring.push({
      tick: s.tick,
      phase: s.phase,
      pos: { ...s.shuttle.pos },
      vel: { ...s.shuttle.vel },
      breaks: s.events.filter((e) => e.k === 'hit' || e.k === 'serve').map((e) => e.tick),
    })
    if (this.ring.length > RING) this.ring.shift()
    if (!known) return
    // A serve placed after the tick on screen teleports the shuttle: snap, never bend.
    if (s.events.some((e) => e.k === 'serve' && e.tick > this.shown)) this.placed = true
    // The new path differs from what was drawn for the same tick (late hit): bend from old to new.
    const after = this.flightAt(this.shown, this.fresh).pos
    this.err.x += before!.x - after.x
    this.err.y += before!.y - after.y
    this.err.z += before!.z - after.z
  }

  update(dt: number): void {
    const newest = this.ring[this.ring.length - 1]
    if (!newest) return
    const k = this.clock.tick
    const jumped = Number.isNaN(this.shown) || Math.abs(k - this.shown) > CLOCK_JUMP
    this.shown = k
    if (!isFlight(newest.phase)) {
      Object.assign(this.pos, newest.pos)
      this.clearErr(true)
      return
    }
    const { snap } = this.flightAt(k, this.pos)
    const f = 0.5 ** (dt / RECONCILE.halfLife)
    this.err.x *= f
    this.err.y *= f
    this.err.z *= f
    const e = Math.hypot(this.err.x, this.err.y, this.err.z)
    if (jumped || this.placed || e >= RECONCILE.snap) {
      this.clearErr(true)
    } else {
      this.snapped = snap
    }
    this.pos.x += this.err.x
    this.pos.y += this.err.y
    this.pos.z += this.err.z
  }

  reset(): void {
    this.ring.length = 0
    this.pos.x = this.pos.y = this.pos.z = 0
    this.clearErr(false)
    this.shown = NaN
  }

  private clearErr(snapped: boolean): void {
    this.err.x = this.err.y = this.err.z = 0
    this.placed = false
    this.snapped = snapped
  }

  /** The host flight at fractional tick k (interpolated between whole ticks), written to `out`. */
  private flightAt(k: number, out: Vec3): { pos: Vec3; snap: boolean } {
    const i = Math.floor(k)
    this.at(i, this.a)
    this.at(i + 1, this.b)
    return interpShuttle(this.a.pos, this.b.pos, k - i, out)
  }

  /** Where the host's flight is at tick k, written to `out`. */
  private at(k: number, out: Flight): void {
    let base: Stored | undefined
    for (let n = this.ring.length - 1; n >= 0; n--) {
      const s = this.ring[n]
      if (s.tick <= k && !this.brokenBetween(s.tick, k)) {
        base = s
        break
      }
    }
    if (!base) {
      // A break newer than every sample up to k leaves nothing to extrapolate from: show the nearest post-break sample as is.
      // Also covers k before the ring: oldest sample at/after k.
      const s = this.ring.find((r) => r.tick >= k) ?? this.ring[this.ring.length - 1]
      Object.assign(out.pos, s.pos)
      Object.assign(out.vel, s.vel)
      return
    }
    Object.assign(out.pos, base.pos)
    Object.assign(out.vel, base.vel)
    let settle = base.phase === 'rally'
    for (let t = base.tick; t < k && out.pos.y > 0; t++) {
      const { x, y, z } = out.pos
      if (stepShuttle(out).netHit) settle = false
      else if (out.pos.y <= 0) {
        if (settle) settleOnFloor(out.pos, x, y, z)
        else out.pos.y = 0
        out.vel.x = out.vel.y = out.vel.z = 0
      }
    }
  }

  private brokenBetween(from: number, to: number): boolean {
    for (const s of this.ring) for (const b of s.breaks) if (b > from && b <= to) return true
    return false
  }
}
