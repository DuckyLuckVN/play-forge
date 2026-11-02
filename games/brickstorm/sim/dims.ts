import { boardSize } from './config'
import type { RunState } from './types'

export type Dims = ReturnType<typeof boardSize>

/** Rows the player chose (the board without the extra boss-fight rows). */
export function baseRows(s: Pick<RunState, 'rows' | 'bossRoom'>): number {
  return s.rows - (s.bossRoom ?? 0)
}

/** Columns the player chose (the board without the extra boss-fight side columns). */
export function baseCols(s: Pick<RunState, 'cols' | 'bossLeft' | 'bossRight'>): number {
  return s.cols - (s.bossLeft ?? 0) - (s.bossRight ?? 0)
}

/** Moves every brick and pickup at or right of `from` over by `by` columns. */
export function shiftCols(s: Pick<RunState, 'bricks' | 'pickups'>, from: number, by: number): void {
  for (const b of s.bricks) if (b.col >= from) b.col += by
  for (const p of s.pickups) if (p.col >= from) p.col += by
}

/** The run's current board geometry. */
export function dims(s: Pick<RunState, 'cols' | 'rows'>): Dims {
  return boardSize(s.cols, s.rows)
}
