// Hazard bricks, from mid-run on: Slime may swallow a ball, Void always does,
// Water douses fire balls (and ignores lightning), Fire sets a normal ball
// burning until it burns out. An eaten ball is gone for this volley only.
import { random } from '@forge/core/rng'
import type { Ball, Brick, BrickKind, RunState } from './types'

/** Chance a ball hitting Slime is swallowed. */
export const SLIME_EAT = 0.3
/** A ball set burning by a Fire brick lasts this many seconds (random in between). */
export const BURN_MIN = 1.5
export const BURN_MAX = 3.5
/** Toughness against a plain brick: Void is fragile (a target, not a wall), Water a bit tougher. */
export const HAZARD_HP: Partial<Record<BrickKind, number>> = { water: 1.2, void: 0.5 }
/** How often a special roll picks each kind (missing = 1): hazards rarer, so good specials stay common. */
export const SPECIAL_WEIGHT: Partial<Record<BrickKind, number>> = {
  slime: 0.5,
  water: 0.5,
  fire: 0.5,
  void: 0.35,
}
/** At most this many of a kind in one new row. */
export const MAX_PER_ROW: Partial<Record<BrickKind, number>> = { void: 1 }

export type EatenBy = 'slime' | 'void' | 'burn'

/** The ball is gone for this volley (it doesn't set the next launch spot). */
export function eatBall(s: RunState, ball: Ball, by: EatenBy): void {
  ball.status = 'landed'
  delete ball.burn
  s.events.push({ type: 'eaten', x: ball.x, y: ball.y, by })
}

/**
 * A ball just hit `brick` (it bounced off, or a fire ball passed through).
 * Returns true if the ball was eaten.
 */
export function touchHazard(s: RunState, ball: Ball, brick: Brick): boolean {
  switch (brick.kind) {
    case 'void':
      eatBall(s, ball, 'void')
      return true
    case 'slime':
      if (random(s.rng) >= SLIME_EAT) return false
      eatBall(s, ball, 'slime')
      return true
    case 'fire':
      if (ball.kind === 'fire' || ball.burn !== undefined) return false
      ball.burn = BURN_MIN + random(s.rng) * (BURN_MAX - BURN_MIN)
      s.events.push({ type: 'ignite', x: ball.x, y: ball.y })
      return false
    case 'water':
      if (ball.kind === 'fire') {
        ball.kind = 'normal'
        // It is inside the water now: let it leave without hitting it again.
        ball.inside = []
        ball.lastBrick = brick.id
        s.events.push({ type: 'douse', x: ball.x, y: ball.y })
      } else if (ball.burn !== undefined) {
        delete ball.burn
        s.events.push({ type: 'douse', x: ball.x, y: ball.y })
      }
      return false
    default:
      return false
  }
}

/** A burning ball's fuse, `dt` seconds on. Returns true if it burned out. */
export function tickBurn(s: RunState, ball: Ball, dt: number): boolean {
  if (ball.burn === undefined) return false
  ball.burn -= dt
  if (ball.burn > 0) return false
  eatBall(s, ball, 'burn')
  return true
}
