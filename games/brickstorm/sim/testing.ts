// Helpers shared by the simulation tests.
import { createRun, step } from './run'
import type { Brick, RunState } from './types'

/** A fresh run with no bricks or pickups on the board. */
export function empty(seed = 1): RunState {
  const s = createRun(seed)
  s.bricks = []
  s.pickups = []
  return s
}

export function brick(s: RunState, col: number, row: number, hp: number): Brick {
  const b: Brick = { id: s.nextId++, col, row, hp, maxHp: hp, kind: 'normal', split: false }
  s.bricks.push(b)
  return b
}

/** Steps until the volley ends, calling `each` after every step. */
export function runVolley(s: RunState, each?: (s: RunState) => void, max = 120 * 60): void {
  for (let i = 0; s.phase === 'volley'; i++) {
    if (i >= max) throw new Error('volley never ended')
    step(s)
    each?.(s)
  }
}
