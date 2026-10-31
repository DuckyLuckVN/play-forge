import { boardSize } from './config'
import type { RunState } from './types'

export type Dims = ReturnType<typeof boardSize>

/** The run's current board geometry. */
export function dims(s: Pick<RunState, 'cols' | 'rows'>): Dims {
  return boardSize(s.cols, s.rows)
}
