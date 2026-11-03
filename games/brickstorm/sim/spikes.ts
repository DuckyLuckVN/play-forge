// Spiked bricks (a boss's thorns and spikes) carry spikes on only some faces:
// a ball hitting a bare face is safe, so aiming around them is a skill.
import { randomInt } from '@forge/core/rng'
import type { Brick, Face, RunState } from './types'

/** How many faces a thorn brick spikes. */
export const THORN_FACES = 2
/** How many faces a spike brick (pops the ball) spikes. */
export const SPIKE_FACES = 2

const FACES: readonly Face[] = ['top', 'bottom', 'left', 'right']

/** True when a hit on `face` meets spikes. Bricks without a list (older saves) are spiked all round. */
export function isSpiked(brick: Pick<Brick, 'spikes'>, face: Face | undefined): boolean {
  if (!brick.spikes) return true
  return face !== undefined && brick.spikes.includes(face)
}

/**
 * `n` distinct random faces, never only the top (balls rarely come down on a
 * brick, so a top-only thorn would be no threat).
 */
export function rollSpikes(s: RunState, n: number): Face[] {
  const pool: Face[] = [...FACES]
  const out: Face[] = []
  while (out.length < Math.min(n, FACES.length)) out.push(pool.splice(randomInt(s.rng, pool.length), 1)[0])
  if (!out.some((f) => f !== 'top')) out[0] = 'bottom'
  return out
}

/** Gives each brick its own random spiked faces; returns them for chaining. */
export function armSpikes(s: RunState, bricks: Brick[], n: number): Brick[] {
  for (const b of bricks) b.spikes = rollSpikes(s, n)
  return bricks
}
