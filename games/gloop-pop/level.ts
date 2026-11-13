// Levels, speed and points: the numbers that make Gloop Pop easy to start and hard to put down.
import { random, randomInt, type RngState } from '@forge/core/rng'
import { COLORS, H, idx, makeCell, MATCH, W, emptyJar, colorOf, type Cells } from './grid'

/** Levels shown to players count from 1; inside the sim they count from 0. */
export const MAX_LEVEL = 20
export const MAX_GLOOPS = 84

/** 4 gloops on the first jar, 4 more each level (84 at most). */
export const gloopCount = (level: number) => Math.min(MAX_GLOOPS, 4 * (Math.max(0, level) + 1))

/** Gloops live in the bottom rows; later levels reach higher, leaving less room. */
export const gloopRows = (level: number) => (level < 14 ? 10 : level < 16 ? 11 : level < 18 ? 12 : 13)

/** Same-coloured cells in a straight line through (x, y) if `color` were placed there. */
function lineLength(cells: Cells, x: number, y: number, color: number, dx: number, dy: number): number {
  let n = 1
  for (const s of [1, -1]) {
    for (let k = 1; ; k++) {
      const cx = x + dx * k * s
      const cy = y + dy * k * s
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) break
      const v = cells[idx(cx, cy)]
      if (!v || colorOf(v) !== color) break
      n++
    }
  }
  return n
}

/** Longest same-coloured line `color` would make at (x, y). */
export const runAt = (cells: Cells, x: number, y: number, color: number) =>
  Math.max(lineLength(cells, x, y, color, 1, 0), lineLength(cells, x, y, color, 0, 1))

/**
 * A fresh jar for `level`, the same for everyone with the same seed. Colours are
 * shared out evenly, and gloops never start in a line of 3 (nothing pops by itself,
 * and no colour comes pre-solved).
 */
export function makeJar(level: number, seed: number): Cells {
  const rng: RngState = { seed: (seed ^ Math.imul(level + 1, 0x9e3779b1)) | 0 }
  const cells = emptyJar()
  const top = H - gloopRows(level)
  const count = gloopCount(level)
  const free: number[] = []
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) free.push(idx(x, y))
  for (let n = 0; n < count && free.length; n++) {
    const want = n % COLORS
    let placed = false
    // Prefer no line of 3, then settle for no line of MATCH (never pre-popped).
    for (const limit of [3, MATCH]) {
      for (let tries = 0; tries < 40 && !placed; tries++) {
        const k = randomInt(rng, free.length)
        const i = free[k]
        for (let c = 0; c < COLORS && !placed; c++) {
          const color = (want + c) % COLORS
          if (runAt(cells, i % W, Math.floor(i / W), color) < limit) {
            cells[i] = makeCell(color, true)
            free.splice(k, 1)
            placed = true
          }
        }
      }
      if (placed) break
    }
  }
  return cells
}

/** A random capsule: two colours, each picked on its own (so a third are one colour). */
export const randomPair = (rng: RngState): [number, number] => [
  Math.floor(random(rng) * COLORS),
  Math.floor(random(rng) * COLORS),
]

// ---------- Speed ----------

export type Speed = 'slow' | 'medium' | 'fast'
export const SPEEDS: readonly Speed[] = ['slow', 'medium', 'fast']

/** Ticks per row at the start of a jar (30 ticks a second): 1 s, 0.67 s, 0.4 s. */
export const FALL_TICKS: Record<Speed, number> = { slow: 30, medium: 20, fast: 12 }
export const MIN_FALL_TICKS = 5
/** Soft drop: a row every 2 ticks (15 rows a second). */
export const SOFT_TICKS = 2

/**
 * Ticks per row: a little faster every 4 levels, and every 15 capsules within a jar
 * (that ramp resets each jar, so a new level is a breather).
 */
export function fallTicks(speed: Speed, level: number, pieces: number): number {
  const ramp = Math.floor(level / 4) + Math.min(3, Math.floor(pieces / 15))
  return Math.max(MIN_FALL_TICKS, FALL_TICKS[speed] - ramp)
}

// ---------- Points ----------

export const SPEED_BONUS: Record<Speed, number> = { slow: 1, medium: 2, fast: 3 }
/** Points for the `n`th gloop popped by one capsule (chains included): 100, 200, 400 … 3200. */
export const gloopPoints = (n: number, speed: Speed) =>
  100 * 2 ** Math.min(5, Math.max(0, n - 1)) * SPEED_BONUS[speed]
/** Capsule halves are worth a little, more deep in a chain. */
export const PILL_POINTS = 10
/** Clearing a jar. */
export const clearBonus = (level: number, speed: Speed) => 500 * (level + 1) * SPEED_BONUS[speed]

/** Versus: lines popped by one capsule that send junk to the rivals (2+ lines send 2–4 halves). */
export const ATTACK_LINES = 2
export const MAX_ATTACK = 4
export const attackSize = (lines: number) => (lines >= ATTACK_LINES ? Math.min(MAX_ATTACK, lines) : 0)
