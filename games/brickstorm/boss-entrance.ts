// A boss's entrance: the arena eases open to its wider, taller size, then the
// boss drops in and lands with a quake; after the fight it eases back. Pure
// timing, so the renderer and the juice agree on when things happen.
import { clamp01, ease, lerp } from '@forge/fx/tween'

/** Seconds the boss takes to fall in, once the arena has opened. */
export const BOSS_DROP = 0.9
/** Seconds after landing before the boss card may open (the dust settles). */
export const BOSS_SETTLE = 0.6

/** An arena size change in progress (the juice's `arenaFx`). */
export interface ArenaChange {
  grow: boolean
  age: number
  /** A shrink waiting for the player to be back on the board. */
  held: boolean
  /** Columns gained (grow) or lost (shrink) on each side, and rows at the bottom. */
  cols: number
  rows: number
}

/**
 * How far (0..1) the board has eased from its old size to its new one. A
 * boss arena holds through the rumble (to `open`), then opens by `land`; a
 * shrink closes over `squeeze` once released.
 */
export function arenaProgress(a: ArenaChange, open: number, land: number, squeeze: number): number {
  if (a.grow) return ease.inOutCubic(clamp01((a.age - open) / (land - open)))
  return a.held ? 0 : ease.inOutCubic(clamp01(a.age / squeeze))
}

/** The board size to show `k` of the way from the old size to the real one (columns and rows may be fractional). */
export function shownBoard(
  real: { cols: number; rows: number },
  a: Pick<ArenaChange, 'grow' | 'cols' | 'rows'>,
  k: number,
): { cols: number; rows: number } {
  const sign = a.grow ? -1 : 1
  return {
    cols: lerp(real.cols + sign * 2 * a.cols, real.cols, k),
    rows: lerp(real.rows + sign * a.rows, real.rows, k),
  }
}

/** Where the falling boss is, `age` seconds after it was announced (the arena lands at `land`). */
export function bossDrop(
  age: number,
  land: number,
): { visible: boolean; fall: number; scale: number; landed: boolean; done: boolean } {
  const t = (age - land) / BOSS_DROP + 1e-9 // so landing on the exact frame counts
  if (t < 0) return { visible: false, fall: 1, scale: 1.25, landed: false, done: false }
  const k = clamp01(t)
  return {
    visible: true,
    // Accelerates like a drop: `fall` is the share of the drop still to go.
    fall: 1 - k * k,
    scale: lerp(1.25, 1, k),
    landed: t >= 1,
    done: age >= land + BOSS_DROP + BOSS_SETTLE,
  }
}
