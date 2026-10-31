import { describe, expect, it } from 'vitest'
import { AIM_MIN, BALL_R, BOARD_W, FLOOR_Y, MIN_VY_RATIO } from './config'
import { aimFromPointer, antiStall, circleRect, reflect, traceGuide } from './physics'

const rect = { x: 0, y: 15, w: 100, h: 20 }

describe('circleRect', () => {
  it('detects edge overlap', () => {
    const hit = circleRect(50, 10, 7, rect)!
    expect(hit.ny).toBeCloseTo(-1)
    expect(hit.nx).toBeCloseTo(0)
    expect(hit.depth).toBeCloseTo(2)
    expect(circleRect(50, 0, 7, rect)).toBeNull()
  })

  it('uses the axis of least penetration when the centre is inside', () => {
    const hit = circleRect(1, 25, 7, rect)!
    expect(hit.nx).toBeCloseTo(-1)
    expect(hit.ny).toBeCloseTo(0)
  })
})

describe('reflect', () => {
  it('bounces off a normal and ignores separating velocity', () => {
    expect(reflect(3, 4, 0, -1)).toEqual([3, -4])
    expect(reflect(3, -4, 0, -1)).toEqual([3, -4])
  })
})

describe('antiStall', () => {
  it('lifts a flat velocity and keeps the speed', () => {
    const [vx, vy] = antiStall(620, 1)
    expect(Math.hypot(vx, vy)).toBeCloseTo(Math.hypot(620, 1))
    expect(vy).toBeCloseTo(MIN_VY_RATIO * Math.hypot(620, 1))
  })

  it('pushes a perfectly flat ball downward', () => {
    expect(antiStall(620, 0)[1]).toBeGreaterThan(0)
  })

  it('leaves steep velocities alone', () => {
    expect(antiStall(0, 620)).toEqual([0, 620])
  })
})

describe('aimFromPointer', () => {
  const x = BOARD_W / 2
  it('clamps flat and downward aims', () => {
    expect(aimFromPointer(x, x + 100, FLOOR_Y + 50)).toBeCloseTo(AIM_MIN)
    expect(aimFromPointer(x, x - 100, FLOOR_Y + 50)).toBeCloseTo(Math.PI - AIM_MIN)
    expect(aimFromPointer(x, x + 100, FLOOR_Y)).toBeCloseTo(AIM_MIN)
    expect(aimFromPointer(x, x + 300, FLOOR_Y - 1)).toBeCloseTo(AIM_MIN)
  })

  it('points straight up at a pointer above', () => {
    expect(aimFromPointer(x, x, 100)).toBeCloseTo(Math.PI / 2)
  })
})

describe('traceGuide', () => {
  it('bounces off a side wall', () => {
    const pts = traceGuide(BOARD_W / 2, FLOOR_Y - BALL_R, AIM_MIN, 600, [])
    expect(pts[0]).toEqual([BOARD_W / 2, FLOOR_Y - BALL_R])
    expect(pts[1][0]).toBeCloseTo(BOARD_W - BALL_R, 0)
    expect(pts.length).toBeGreaterThanOrEqual(3)
  })

  it('turns at a brick in its path', () => {
    const wall = { x: 0, y: 300, w: BOARD_W, h: 20 }
    const pts = traceGuide(BOARD_W / 2, FLOOR_Y - BALL_R, Math.PI / 2, 2000, [wall])
    expect(pts[1][1]).toBeCloseTo(320 + BALL_R, 0)
  })
})
