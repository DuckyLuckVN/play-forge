import { random, randomInt } from '@forge/core/rng'
import { modsOf } from './boosts'
import { BRICK_INSET, CELL, TOP } from './config'
import { columnOrder, patternAt, patternLimit } from './patterns'
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
export const UNLOCK: Record<Exclude<BrickKind, 'normal' | 'boss'>, number> = {
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

/** Turns brick hp holds flat for, by the turn a stretch starts: long early (time to farm), short late. */
export function hpStepLength(start: number): number {
  return start <= 30 ? 5 : start <= 60 ? 4 : start <= 90 ? 3 : 2
}

/** First turn of the flat hp stretch that `turn` falls in. */
export function hpStepStart(turn: number): number {
  let start = 1
  while (start + hpStepLength(start) <= turn) start += hpStepLength(start)
  return start
}

const HP_CURVE = 40
/** From this turn hp also compounds, so even a snowballing run ends. */
const LATE_FROM = 60
const LATE_GROWTH = 1.025

/**
 * Typical brick hp on a turn. It holds flat for a stretch of turns and then
 * steps up, rising a little faster than the turn and compounding late in a run.
 * A stretch uses the hp of its middle turn.
 */
export function hpScale(turn: number): number {
  const start = hpStepStart(turn)
  const t = start + (hpStepLength(start) - 1) / 2
  return t * (1 + t / HP_CURVE) * LATE_GROWTH ** Math.max(0, t - LATE_FROM)
}

/** Hits' worth of damage per ball a brick may need, at most. */
const HP_PER_BALL = 1.4

/** Most hp a new brick may have: what the run's balls can deal, so a run short on balls stays playable. */
export function hpCap(state: RunState): number {
  return Math.max(1, Math.round(HP_PER_BALL * state.ballCount * modsOf(state.boosts).damageMult))
}

/** Most bricks a new row may have for a run with `balls` balls: 1 ball, 1 brick; 6 balls, 4. */
export function maxBricksFor(balls: number): number {
  return 1 + Math.floor(balls / 2)
}

/** Most extra hp a brick gets when a pattern trims its row. */
const TRIM_BOOST_MAX = 1.6

function brickHp(state: RunState, boost = 1): number {
  const { rng, turn } = state
  // Close to the turn's typical value, so the numbers read as "about this turn".
  let hp = Math.max(1, Math.round(hpScale(turn) * boost * (0.9 + 0.2 * random(rng))))
  if (turn >= 10 && random(rng) < 0.1) hp *= 2
  return Math.min(hp, hpCap(state))
}

/** Adds a new row of bricks and pickups at row 0 for `state.turn`. */
export function spawnRow(state: RunState): void {
  const { rng, turn } = state
  const free = Array.from({ length: state.cols }, (_, i) => i)
  const take = () => free.splice(randomInt(rng, free.length), 1)[0]
  /** Takes `col` if given (a pattern's pick), else a random free column. */
  const add = (kind: BrickKind, col?: number, boost = 1) => {
    const hp = brickHp(state, boost)
    const c = col === undefined ? take() : free.splice(free.indexOf(col), 1)[0]
    state.bricks.push({ id: state.nextId++, col: c, row: 0, hp, maxHp: hp, kind, split: false })
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
  // Always leave a column free, for the row's ball pickup, and no more bricks than the balls can handle.
  const wanted = Math.min(
    7,
    state.cols - 1,
    maxBricksFor(state.ballCount),
    Math.max(2, 1 + randomInt(rng, 3) + Math.floor(turn / 15) + (turn >= 20 ? 1 : 0)),
  )
  // Which columns get bricks follows the turn's pattern, so rows build shapes.
  // A pattern with fewer bricks makes each one tougher, so the row is as hard.
  const pattern = patternAt(state.seed, turn)
  const count = Math.min(wanted, patternLimit(pattern, state.cols))
  const boost = Math.min(TRIM_BOOST_MAX, wanted / count)
  const order = columnOrder(pattern, state.cols, turn, () => random(rng))
  for (let i = 0; i < count; i++) {
    let kind: BrickKind = 'normal'
    if (unlocked.length && specials < MAX_SPECIALS_PER_ROW && random(rng) < chance) {
      kind = unlocked[randomInt(rng, unlocked.length)]
      specials++
    }
    add(kind, order[i], boost)
  }
  const pickup = (kind: PickupKind, p: number) => {
    if (free.length && random(rng) < p) state.pickups.push({ id: state.nextId++, col: take(), row: 0, kind })
  }
  pickup('ball', 1)
  pickup('coin', 0.1)
  if (turn >= 4) {
    pickup('fire', 0.06)
    pickup('laser', 0.05)
  }
}
