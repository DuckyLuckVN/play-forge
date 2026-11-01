import { boardSize } from './config'
import type { RunState } from './types'

export type Dims = ReturnType<typeof boardSize>

/** Rows the player chose (the board without the extra boss-fight rows). */
export function baseRows(s: Pick<RunState, 'rows' | 'bossRoom'>): number {
  return s.rows - (s.bossRoom ?? 0)
}

/** The run's current board geometry. */
export function dims(s: Pick<RunState, 'cols' | 'rows'>): Dims {
  return boardSize(s.cols, s.rows)
}
