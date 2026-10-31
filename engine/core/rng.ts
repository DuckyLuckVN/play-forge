/**
 * Seeded PRNG (mulberry32). The seed lives in plain data so it can be stored
 * inside serialisable game state and replayed deterministically.
 */
export interface RngState {
  seed: number
}

/** Returns a float in [0, 1) and advances `rng.seed`. */
export function random(rng: RngState): number {
  let t = (rng.seed = (rng.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Integer in [0, max). */
export function randomInt(rng: RngState, max: number): number {
  return Math.floor(random(rng) * max)
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) | 0
}
