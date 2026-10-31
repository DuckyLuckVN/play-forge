import { describe, expect, it } from 'vitest'
import { BALL_R, COMBO_GAP, DANGER_ROW, SLOWMO } from './config'
import { brickRect, cellCenter } from './rows'
import { comboMultiplier, drainEvents, fire, slowMoActive, speedMultiplier, step } from './run'
import { brick, empty, runVolley } from './testing'
import type { Brick, RunState } from './types'

/** Puts the volley's only ball just under `b`, overlapping it and moving up. */
function ballUnder(s: RunState, b: Brick, gap = -1): void {
  fire(s, Math.PI / 2)
  const r = brickRect(b)
  const ball = s.balls[0]
  ball.status = 'flying'
  ball.x = r.x + r.w / 2
  ball.y = r.y + r.h + BALL_R + gap
  s.fireTimer = 1
}

describe('combo', () => {
  it('maps combo to coin multiplier tiers', () => {
    expect([0, 24, 25, 50, 99, 100].map(comboMultiplier)).toEqual([1, 1, 1.5, 2, 2, 3])
  })

  it('counts hits and resets after a gap', () => {
    const s = empty()
    s.ballCount = 10
    brick(s, 3, 0, 1e6)
    fire(s, Math.PI / 2)
    while (!s.events.some((e) => e.type === 'hit')) step(s)
    expect(s.combo).toBeGreaterThanOrEqual(1)
    expect(s.bestCombo).toBeGreaterThanOrEqual(1)
    s.sinceHit = COMBO_GAP + 0.01
    step(s)
    expect(s.combo).toBe(0)
  })

  it('triggers fever once at 100 and doubles damage', () => {
    const s = empty()
    const b = brick(s, 3, 5, 10)
    ballUnder(s, b)
    s.combo = 99
    step(s)
    expect(s.fever).toBe(true)
    expect(drainEvents(s).filter((e) => e.type === 'fever')).toHaveLength(1)
    expect(b.hp).toBe(8)
  })
})

describe('end of volley bonuses', () => {
  it('pays out a board wipe', () => {
    const s = empty()
    brick(s, 3, 5, 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    const wipe = drainEvents(s).find((e) => e.type === 'allClear')
    expect(wipe).toEqual({ type: 'allClear', coins: 1 })
  })

  it('pays out a close one', () => {
    const s = empty()
    brick(s, 3, DANGER_ROW - 1, 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(drainEvents(s).find((e) => e.type === 'closeOne')).toEqual({ type: 'closeOne', coins: 5 })
    expect(s.phase).toBe('aim')
  })
})

describe('slow-mo', () => {
  it('kicks in when a ball heads for the last brick', () => {
    const s = empty()
    const b = brick(s, 3, 2, 1)
    ballUnder(s, b, 40)
    expect(slowMoActive(s)).toBe(true)
    s.volleyTime = 0
    expect(speedMultiplier(s, false)).toBe(SLOWMO)
  })

  it('stays off with more than one brick left', () => {
    const s = empty()
    const b = brick(s, 3, 2, 1)
    brick(s, 0, 2, 1)
    ballUnder(s, b, 40)
    expect(slowMoActive(s)).toBe(false)
    expect(cellCenter(3, 2).y).toBeLessThan(s.balls[0].y)
  })
})
