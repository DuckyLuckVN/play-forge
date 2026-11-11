// The shuttle's predicted flight as a dotted path (personal setting, visuals only): sampled once per shot
// with the sim's own flight step (stepShuttle), so the dots follow exactly what the shuttle will draw.
import { stepShuttle, type Flight } from './physics'

/** One dot every `spacing` m of flight, at most `max` dots, looking ahead at most `maxTicks`. */
export const PATH = { spacing: 0.38, max: 48, maxTicks: 600 }

/** Dots in flight order: render-space positions are set by the caller; `tick` = when the shuttle passes. */
export interface FlightPath {
  x: Float32Array
  y: Float32Array
  z: Float32Array
  tick: Float64Array
  n: number
}

export function createPath(max: number = PATH.max): FlightPath {
  return {
    x: new Float32Array(max),
    y: new Float32Array(max),
    z: new Float32Array(max),
    tick: new Float64Array(max),
    n: 0,
  }
}

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } } as Flight

/**
 * Fills `out` with dots along `f`'s flight (f is not changed) from host tick `tick0`, ending on the floor
 * (that point is always a dot) or at the net (a net hit ends it there). Returns the dot count.
 */
export function samplePath(f: Flight, tick0: number, out: FlightPath): number {
  const g = scratch
  Object.assign(g.pos, f.pos)
  Object.assign(g.vel, f.vel)
  const max = out.x.length
  let n = 0
  let run = 0
  for (let t = 1; t <= PATH.maxTicks && n < max; t++) {
    const { x, y, z } = g.pos
    if (stepShuttle(g).netHit) break
    run += Math.hypot(g.pos.x - x, g.pos.y - y, g.pos.z - z)
    const floor = g.pos.y <= 0
    if (run >= PATH.spacing || floor) {
      out.x[n] = g.pos.x
      out.y[n] = Math.max(0, g.pos.y)
      out.z[n] = g.pos.z
      out.tick[n] = tick0 + t
      n++
      run = 0
    }
    if (floor) break
  }
  out.n = n
  return n
}

/** Index of the first dot still ahead of the shuttle at `shownTick` (n = none left). */
export function firstAhead(path: FlightPath, shownTick: number): number {
  let i = 0
  while (i < path.n && path.tick[i] <= shownTick) i++
  return i
}
