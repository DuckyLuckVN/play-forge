import { random, randomInt } from '@forge/core/rng'
import { BRICK_INSET, CELL, COLS, TOP } from './config'
import type { Rect, RunState } from './types'

export function brickRect(b: { col: number; row: number }): Rect {
  return {
    x: b.col * CELL + BRICK_INSET,
    y: TOP + b.row * CELL + BRICK_INSET,
    w: CELL - 2 * BRICK_INSET,
    h: CELL - 2 * BRICK_INSET,
  }
}

export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: (col + 0.5) * CELL, y: TOP + (row + 0.5) * CELL }
}

/** Adds a new row of bricks and pickups at row 0 for `state.turn`. */
export function spawnRow(state: RunState): void {
  const { rng, turn } = state
  const free = Array.from({ length: COLS }, (_, i) => i)
  const take = () => free.splice(randomInt(rng, free.length), 1)[0]

  const count = Math.min(6, Math.max(2, 2 + randomInt(rng, 3) + Math.floor(turn / 15)))
  for (let i = 0; i < count; i++) {
    let hp = Math.max(1, Math.round(turn * (0.8 + 0.4 * random(rng))))
    if (random(rng) < 1 / 6) hp *= 2
    state.bricks.push({ id: state.nextId++, col: take(), row: 0, hp, maxHp: hp })
  }
  if (free.length && random(rng) < 0.9) {
    state.pickups.push({ id: state.nextId++, col: take(), row: 0, kind: 'ball' })
  }
  if (free.length && random(rng) < 0.25) {
    state.pickups.push({ id: state.nextId++, col: take(), row: 0, kind: 'coin' })
  }
}
