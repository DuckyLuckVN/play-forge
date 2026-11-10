// Remote players on the guest's jitter-tolerant render clock: each id keeps a short ring of host
// samples, and `sample` shows them at clock.tick (lerp between neighbours, capped extrapolation past
// the newest, snap across a placement). Pure, no three.js; ids are free-form so any player count works.
import { TICK_RATE } from './court'
import { CLOCK, type RenderClock } from './renderclock'
import type { SpPlayer } from './sim'
import { PLAYER_SNAP } from './world'

export type PlayerSample = Pick<SpPlayer, 'id' | 'x' | 'z' | 'vx' | 'vz'>

interface Sample {
  tick: number
  x: number
  z: number
  vx: number
  vz: number
}

/** Samples kept per player (≈ 0.13 s: more than the clock's lead plus jitter). */
const RING = 8

export class RemoteTracks {
  private readonly rings = new Map<string, Sample[]>()
  private newest = -Infinity

  constructor(private readonly clock: RenderClock) {}

  /** A host state's players at `tick`. Stale ticks are ignored; ids missing from it are dropped. */
  push(tick: number, players: readonly PlayerSample[]): void {
    if (tick <= this.newest) return
    this.newest = tick
    const ids = new Set<string>()
    for (const p of players) {
      ids.add(p.id)
      let ring = this.rings.get(p.id)
      if (!ring) this.rings.set(p.id, (ring = []))
      ring.push({ tick, x: p.x, z: p.z, vx: p.vx, vz: p.vz })
      if (ring.length > RING) ring.shift()
    }
    for (const id of this.rings.keys()) if (!ids.has(id)) this.rings.delete(id)
  }

  /** Position + velocity of `id` at the clock's tick; false if unknown (caller falls back). */
  sample(id: string, out: { x: number; z: number; vx: number; vz: number }): boolean {
    const ring = this.rings.get(id)
    if (!ring || ring.length === 0) return false
    const k = this.clock.tick
    const last = ring[ring.length - 1]
    if (k >= last.tick) {
      const dt = Math.min(k - last.tick, CLOCK.maxAhead) / TICK_RATE
      out.x = last.x + last.vx * dt
      out.z = last.z + last.vz * dt
      out.vx = last.vx
      out.vz = last.vz
      return true
    }
    let b = ring.length - 1
    while (b > 0 && ring[b - 1].tick > k) b--
    if (b === 0) return this.copy(ring[0], out)
    const s0 = ring[b - 1]
    const s1 = ring[b]
    if (Math.abs(s1.x - s0.x) + Math.abs(s1.z - s0.z) > PLAYER_SNAP) return this.copy(s1, out)
    const t = (k - s0.tick) / (s1.tick - s0.tick)
    out.x = s0.x + (s1.x - s0.x) * t
    out.z = s0.z + (s1.z - s0.z) * t
    out.vx = s0.vx + (s1.vx - s0.vx) * t
    out.vz = s0.vz + (s1.vz - s0.vz) * t
    return true
  }

  reset(): void {
    this.rings.clear()
    this.newest = -Infinity
  }

  private copy(s: Sample, out: { x: number; z: number; vx: number; vz: number }): boolean {
    out.x = s.x
    out.z = s.z
    out.vx = s.vx
    out.vz = s.vz
    return true
  }
}
