import { random, randomInt } from '@forge/core/rng'
import { modsOf } from './boosts'
import { BRICK_INSET, CELL, TOP } from './config'
import { columnOrder, patternAt, patternLimit } from './patterns'
import type { HitShape } from './physics'
import type { Brick, BrickKind, BrickShape, PickupKind, Rect, RunState } from './types'

export function brickRect(b: { col: number; row: number }): Rect {
  return {
    x: b.col * CELL + BRICK_INSET,
    y: TOP + b.row * CELL + BRICK_INSET,
    w: CELL - 2 * BRICK_INSET,
    h: CELL - 2 * BRICK_INSET,
  }
}

/** One rect around all of the boss's parts, so it is solid with no seams; null without a boss. */
export function bossBody(bricks: readonly { col: number; row: number; kind: string }[]): Rect | null {
  const rects = bricks.filter((b) => b.kind === 'boss').map(brickRect)
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  }
}

/**
 * The rect each brick collides with. A boss part reaches all the way to any
 * neighbouring part, so the body is solid with no seams but keeps its shape.
 */
export function hitRects(bricks: readonly { col: number; row: number; kind: string }[]): Rect[] {
  const boss = new Set(bricks.filter((b) => b.kind === 'boss').map((b) => `${b.col},${b.row}`))
  return bricks.map((b) => {
    if (b.kind !== 'boss') return brickRect(b)
    const gap = (dc: number, dr: number) => (boss.has(`${b.col + dc},${b.row + dr}`) ? 0 : BRICK_INSET)
    const l = gap(-1, 0)
    const t = gap(0, -1)
    return {
      x: b.col * CELL + l,
      y: TOP + b.row * CELL + t,
      w: CELL - l - gap(1, 0),
      h: CELL - t - gap(0, 1),
    }
  })
}

/** A shaped brick's outline: a triangle's 3 corners, or an orb's circle; a square is its rect. */
export function brickShape(b: Pick<Brick, 'col' | 'row' | 'shape'>): HitShape {
  const r = brickRect(b)
  if (!b.shape) return r
  if (b.shape === 'orb') return { circle: { x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w / 2 } }
  const tl = [r.x, r.y] as const
  const tr = [r.x + r.w, r.y] as const
  const bl = [r.x, r.y + r.h] as const
  const br = [r.x + r.w, r.y + r.h] as const
  const poly = {
    'tri-tl': [tl, tr, bl],
    'tri-tr': [tl, tr, br],
    'tri-bl': [tl, bl, br],
    'tri-br': [tr, br, bl],
  }[b.shape]
  return { poly }
}

/** What each brick collides with: its shape, or for the boss its seamless rect. */
export function hitShapes(bricks: readonly Brick[]): HitShape[] {
  const rects = hitRects(bricks)
  // A shaped boss part (a horn, a fist) collides as its shape; square parts join seamlessly.
  return bricks.map((b, i) => (b.shape ? brickShape(b) : rects[i]))
}

/** Shapes a new brick may take, and each one's share of a square brick's health (it is smaller). */
export const SHAPE_HP: Record<BrickShape, number> = {
  'tri-tl': 0.6,
  'tri-tr': 0.6,
  'tri-bl': 0.6,
  'tri-br': 0.6,
  orb: 0.8,
}
const SHAPES = Object.keys(SHAPE_HP) as BrickShape[]
/** First turn shaped bricks appear. */
export const SHAPES_FROM = 8

/** Chance a new brick is shaped: 12% from turn 8, slowly rising to 25%. */
export function shapeChance(turn: number): number {
  return turn < SHAPES_FROM ? 0 : Math.min(0.25, 0.12 + 0.001 * (turn - SHAPES_FROM))
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
/** After the first boss bricks get tougher: up to this much above the base curve (the difficulty dial). */
export const HP_MULT = 1.2
/** The extra toughness ramps in from the first boss's turn to this one, then stays. */
const HARD_FROM = 30
const HARD_FULL = 60

/** 0 before the first boss, rising to 1 by HARD_FULL: how much of the late-game toughness applies. */
export function lateHardness(turn: number): number {
  return Math.max(0, Math.min(1, (turn - HARD_FROM) / (HARD_FULL - HARD_FROM)))
}
/** From this turn hp also compounds, so even a snowballing run ends. */
const LATE_FROM = 60
const LATE_GROWTH = 1.035

/**
 * Typical brick hp on a turn. It holds flat for a stretch of turns and then
 * steps up, rising a little faster than the turn and compounding late in a run.
 * A stretch uses the hp of its middle turn.
 */
export function hpScale(turn: number): number {
  const start = hpStepStart(turn)
  const t = start + (hpStepLength(start) - 1) / 2
  const tougher = 1 + (HP_MULT - 1) * lateHardness(t)
  return tougher * t * (1 + t / HP_CURVE) * LATE_GROWTH ** Math.max(0, t - LATE_FROM)
}

/** Hits' worth of damage per ball a brick may need, at most. */
const HP_PER_BALL = 1.4
/** ...rising to this many once the late-game toughness is fully in. */
const HP_PER_BALL_LATE = 1.7

/** From LATE_FROM the cap also compounds by this much a turn: a strong build buys time, not forever. */
export const CAP_GROWTH = 1.024
/**
 * Firepower (balls × skill damage) where the cap stops tracking your build one
 * for one: about a typical turn-100 build. Below it nothing changes; above it
 * the cap grows as firepower^CAP_EXP, so damage and ball skills still pay off.
 */
export const CAP_KNEE = 150
const CAP_EXP = 0.7

/** Firepower as the cap counts it: in full up to the knee, then growing slower. */
function capPower(power: number): number {
  return power <= CAP_KNEE ? power : CAP_KNEE * (power / CAP_KNEE) ** CAP_EXP
}

/**
 * Most hp a new brick may have: what the run's balls can deal, so a run short
 * on balls stays playable. A strong build's skills aren't cancelled out by it
 * (see CAP_KNEE); late in a run it still compounds every turn.
 */
export function hpCap(state: RunState): number {
  const perBall =
    (HP_PER_BALL + (HP_PER_BALL_LATE - HP_PER_BALL) * lateHardness(state.turn)) *
    CAP_GROWTH ** Math.max(0, state.turn - LATE_FROM)
  const power = state.ballCount * modsOf(state.boosts).damageMult
  return Math.max(1, Math.round(perBall * capPower(power)))
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

/** Rows before this turn always offer a ball, so a run can get going. */
export const BALL_SURE_UNTIL = 8
/** After that, the share of rows that offer a ball (jackpot rows always do). */
export const BALL_PICKUP_CHANCE = 0.7

/** Adds a new row of bricks and pickups at row 0 for `state.turn`. */
export function spawnRow(state: RunState): void {
  const { rng, turn } = state
  const free = Array.from({ length: state.cols }, (_, i) => i)
  const take = () => free.splice(randomInt(rng, free.length), 1)[0]
  /** Takes `col` if given (a pattern's pick), else a random free column. */
  const add = (kind: BrickKind, col?: number, boost = 1) => {
    // Some bricks are triangles or orbs: odd angles to bounce off, a little less health.
    const shape = random(rng) < shapeChance(turn) ? SHAPES[randomInt(rng, SHAPES.length)] : undefined
    const hp = Math.max(1, Math.round(brickHp(state, boost) * (shape ? SHAPE_HP[shape] : 1)))
    const c = col === undefined ? take() : free.splice(free.indexOf(col), 1)[0]
    const brick: Brick = { id: state.nextId++, col: c, row: 0, hp, maxHp: hp, kind, split: false }
    if (shape) brick.shape = shape
    state.bricks.push(brick)
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
  // Always leave a column free, for the row's pickups, and no more bricks than the balls can handle.
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
  pickup('ball', turn < BALL_SURE_UNTIL ? 1 : BALL_PICKUP_CHANCE)
  pickup('coin', 0.1)
  if (turn >= 4) {
    pickup('fire', 0.06)
    pickup('laser', 0.05)
  }
  if (turn >= HEART_FROM) pickup('heart', heartChance(state))
}

/** First turn a heart pickup may appear. */
export const HEART_FROM = 6
/**
 * Chance a row offers a heart: none at full health, more the more is missing,
 * so a hurt hero gets a way back without the run going soft.
 */
export function heartChance(s: Pick<RunState, 'hp' | 'maxHp'>): number {
  const missing = s.maxHp > 0 ? 1 - s.hp / s.maxHp : 0
  return missing <= 0 ? 0 : 0.03 + 0.12 * missing
}
