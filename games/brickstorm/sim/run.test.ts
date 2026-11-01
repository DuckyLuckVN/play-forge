import { describe, expect, it } from 'vitest'
import { AIM_MIN, BALL_R, BOARD_W, COLS, DANGER_ROW, MIN_VY_RATIO, RECALL_AFTER } from './config'
import { brickRect } from './rows'
import { canRecall, createRun, drainEvents, fire, recall, restingBall, speedMultiplier, step } from './run'
import { dims } from './dims'
import { brick, empty, runVolley } from './testing'
import type { RunState } from './types'

const count = (s: RunState, type: string) => drainEvents(s).filter((e) => e.type === type).length

describe('turn loop', () => {
  it('createRun is deterministic', () => {
    expect(createRun(9)).toEqual(createRun(9))
    expect(createRun(9).bricks.length).toBeGreaterThan(0)
  })

  it('fires every ball and returns them', () => {
    const s = empty()
    s.ballCount = 5
    fire(s, Math.PI / 3)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.turn).toBe(2)
    expect(s.balls).toHaveLength(0)
    const events = drainEvents(s)
    expect(events.filter((e) => e.type === 'fire')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'land')).toHaveLength(5)
  })

  it('moves the launch point to where the first ball landed', () => {
    const s = empty()
    fire(s, Math.PI / 3)
    runVolley(s)
    expect(s.launchX).not.toBe(BOARD_W / 2)
    expect(s.launchX).toBeGreaterThanOrEqual(BALL_R)
    expect(s.launchX).toBeLessThanOrEqual(BOARD_W - BALL_R)
  })

  it('ignores fire outside the aim phase', () => {
    const s = empty()
    fire(s, Math.PI / 2)
    const queued = s.balls.length
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(queued)
  })

  it('damages and kills bricks', () => {
    const s = empty()
    s.ballCount = 3
    brick(s, 3, 5, 2)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.bricks).toHaveLength(s.bricks.filter((b) => b.row === 0).length) // only the new row
    expect(s.xp).toBeGreaterThanOrEqual(1)
    expect(count(s, 'kill')).toBe(1)
  })

  it('adds a picked-up ball when the volley ends', () => {
    const s = empty()
    s.pickups.push({ id: s.nextId++, col: 3, row: 5, kind: 'ball' })
    fire(s, Math.PI / 2)
    let during = 0
    runVolley(s, (x) => {
      if (x.phase === 'volley') during = x.ballCount
    })
    expect(during).toBe(1)
    expect(s.ballCount).toBe(2)
  })

  it('moves bricks down and ends the run at the danger row', () => {
    const s = empty()
    brick(s, 0, DANGER_ROW - 1, 999)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('over')
    expect(count(s, 'over')).toBe(1)
  })

  it('lets game over win over a pending boost pick', () => {
    const s = empty()
    s.pendingPicks = 1
    brick(s, 0, DANGER_ROW - 1, 999)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('over')
  })

  it('only allows recall after a while, and recall ends the volley', () => {
    const s = empty()
    s.ballCount = 3
    fire(s, Math.PI / 3)
    step(s)
    expect(canRecall(s)).toBe(false)
    s.volleyTime = RECALL_AFTER
    expect(canRecall(s)).toBe(true)
    recall(s)
    expect(s.phase).toBe('aim')
    expect(s.balls).toHaveLength(0)
    expect(s.turn).toBe(2)
  })

  it('ramps the speed multiplier', () => {
    const s = empty()
    fire(s, Math.PI / 2)
    s.volleyTime = 1
    expect(speedMultiplier(s, false)).toBe(1)
    s.volleyTime = 5.9
    expect(speedMultiplier(s, false)).toBe(1)
    s.volleyTime = 6.1
    expect(speedMultiplier(s, false)).toBe(2)
    s.volleyTime = 12.1
    expect(speedMultiplier(s, false)).toBe(3)
    s.volleyTime = 0
    expect(speedMultiplier(s, true)).toBe(3)
  })

  it('never lets a ball fly near-horizontally', () => {
    const s = empty()
    s.ballCount = 4
    fire(s, AIM_MIN)
    runVolley(s, (x) => {
      for (const b of x.balls) {
        if (b.status !== 'flying') continue
        expect(Math.abs(b.vy)).toBeGreaterThanOrEqual(MIN_VY_RATIO * Math.hypot(b.vx, b.vy) - 1e-6)
      }
    })
  })

  it('never lets a fast ball pass through or sit inside a brick', () => {
    const top = brickRect({ col: 0, row: 4 }).y
    for (const angle of [Math.PI / 2 - 0.6, Math.PI / 2, Math.PI / 2 + 0.6]) {
      const s = empty()
      s.ballCount = 20
      s.boosts = { speed: 5, big: 3 } // 1.75× ball speed, 1.6× ball size
      for (let c = 0; c < COLS; c++) brick(s, c, 4, 1e9)
      const rects = s.bricks.map(brickRect)
      fire(s, angle)
      for (let i = 0; s.phase === 'volley'; i++) {
        if (i > 120 * 60) throw new Error('volley never ended')
        step(s)
        step(s)
        step(s) // 3× speed
        for (const b of s.balls) {
          if (b.status !== 'flying') continue
          expect(b.y).toBeGreaterThan(top)
          for (const r of rects) {
            const inside = b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h
            expect(inside).toBe(false)
          }
        }
      }
    }
  })

  it('pays a milestone bonus on reaching turn 25', () => {
    const s = empty()
    s.turn = 24
    brick(s, 0, 0, 1e6) // not a board wipe
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.turn).toBe(25)
    expect(s.coins).toBe(50)
    expect(drainEvents(s).find((e) => e.type === 'milestone')).toEqual({
      type: 'milestone',
      turn: 25,
      coins: 50,
    })
  })
})

describe('waiting ball', () => {
  it('sits on the floor at the size the run fires', () => {
    const s = empty()
    expect(restingBall(s)).toEqual({ y: dims(s).floorY - BALL_R, r: BALL_R })
    s.boosts = { big: 2 }
    const r = BALL_R * 1.4
    expect(restingBall(s).r).toBeCloseTo(r)
    expect(restingBall(s).y).toBeCloseTo(dims(s).floorY - r)
    fire(s, Math.PI / 2)
    expect(s.balls[0].r).toBeCloseTo(restingBall(s).r)
  })
})
