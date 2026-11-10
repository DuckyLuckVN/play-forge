// Guest-side shuttle view: shows the host's flight on a smooth clock. Between host states the flight
// is re-simulated locally with the sim's own rule (deterministic), so a late packet never freezes or
// lurches the shuttle. A hit / serve / net event starts a new flight, so a sample is never run past one.
import { settleOnFloor, stepShuttle, type Flight, type Vec3 } from './physics'
import type { RenderClock } from './renderclock'
import type { SpState } from './sim'
import { interpShuttle } from './world'

export type ShuttleSample = Pick<SpState, 'tick' | 'phase' | 'shuttle' | 'events'>

const RING = 8

interface Stored {
  tick: number
  phase: SpState['phase']
  pos: Vec3
  vel: Vec3
  /** Ticks of the events that start a new flight. */
  breaks: number[]
}

const isFlight = (p: SpState['phase']) => p === 'rally' || p === 'point'

export class GuestShuttle {
  readonly pos: Vec3 = { x: 0, y: 0, z: 0 }
  snapped = false
  private ring: Stored[] = []
  private readonly a: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
  private readonly b: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

  constructor(private readonly clock: RenderClock) {}

  push(s: ShuttleSample): void {
    const last = this.ring[this.ring.length - 1]
    if (last && s.tick <= last.tick) return
    this.ring.push({
      tick: s.tick,
      phase: s.phase,
      pos: { ...s.shuttle.pos },
      vel: { ...s.shuttle.vel },
      breaks: s.events.filter((e) => e.k === 'hit' || e.k === 'serve' || e.k === 'net').map((e) => e.tick),
    })
    if (this.ring.length > RING) this.ring.shift()
  }

  update(_dt: number): void {
    const newest = this.ring[this.ring.length - 1]
    if (!newest) return
    if (!isFlight(newest.phase)) {
      Object.assign(this.pos, newest.pos)
      this.snapped = true
      return
    }
    const k = this.clock.tick
    const i = Math.floor(k)
    const frac = k - i
    this.at(i, this.a)
    this.at(i + 1, this.b)
    this.snapped = interpShuttle(this.a.pos, this.b.pos, frac, this.pos).snap
  }

  reset(): void {
    this.ring.length = 0
    this.snapped = false
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
      // Before the ring, or a hit newer than every sample up to k: oldest sample at/after k, as is.
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
