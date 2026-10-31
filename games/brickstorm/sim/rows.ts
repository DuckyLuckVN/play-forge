import { random, randomInt } from '@forge/core/rng'
import { BRICK_INSET, CELL, TOP } from './config'
import type { BrickKind, PickupKind, Rect, RunState } from './types'

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

/** Turn each special brick kind starts appearing. */
export const UNLOCK: Record<Exclude<BrickKind, 'normal'>, number> = {
  gold: 3,
  bomb: 5,
  mystery: 6,
  lightning: 8,
  armored: 12,
  splitter: 15,
}

/** Chance that a brick is special on a turn: 8% from turn 3, +0.5% per turn, capped at 30%. */
export function specialChance(turn: number): number {
  return turn < 3 ? 0 : Math.min(0.3, 0.08 + 0.005 * (turn - 3))
}

const MAX_SPECIALS_PER_ROW = 2
const JACKPOT_GOLD = 4

/** Typical brick hp on a turn: grows faster than the turn so ball count can't keep up forever. */
export function hpScale(turn: number): number {
  return turn * (1 + turn / 25)
}

function brickHp(state: RunState): number {
  const { rng, turn } = state
  // Close to the turn's typical value, so the numbers read as "about this turn".
  let hp = Math.max(1, Math.round(hpScale(turn) * (0.9 + 0.2 * random(rng))))
  if (turn >= 10 && random(rng) < 0.1) hp *= 2
  return hp
}

/** Adds a new row of bricks and pickups at row 0 for `state.turn`. */
export function spawnRow(state: RunState): void {
  const { rng, turn } = state
  const free = Array.from({ length: state.cols }, (_, i) => i)
  const take = () => free.splice(randomInt(rng, free.length), 1)[0]
  const add = (kind: BrickKind) => {
    const hp = brickHp(state)
    state.bricks.push({ id: state.nextId++, col: take(), row: 0, hp, maxHp: hp, kind, split: false })
  }

  if (turn % 10 === 0) {
    // Jackpot row: all gold, plus a ball.
    for (let i = 0; i < JACKPOT_GOLD; i++) add('gold')
    state.pickups.push({ id: state.nextId++, col: take(), row: 0, kind: 'ball' })
    state.events.push({ type: 'jackpot' })
    return
  }

  const unlocked = (Object.keys(UNLOCK) as Array<keyof typeof UNLOCK>).filter((k) => turn >= UNLOCK[k])
  const chance = specialChance(turn)
  let specials = 0
  const count = Math.min(7, Math.max(2, 2 + randomInt(rng, 3) + Math.floor(turn / 12) + (turn >= 10 ? 1 : 0)))
  for (let i = 0; i < count; i++) {
    let kind: BrickKind = 'normal'
    if (unlocked.length && specials < MAX_SPECIALS_PER_ROW && random(rng) < chance) {
      kind = unlocked[randomInt(rng, unlocked.length)]
      specials++
    }
    add(kind)
  }
  const pickup = (kind: PickupKind, p: number) => {
    if (free.length && random(rng) < p) state.pickups.push({ id: state.nextId++, col: take(), row: 0, kind })
  }
  pickup('ball', 0.6)
  pickup('coin', 0.12)
  if (turn >= 4) {
    pickup('fire', 0.06)
    pickup('laser', 0.05)
  }
}
