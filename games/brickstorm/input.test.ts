import { describe, expect, it } from 'vitest'
import { BOARD_H, BOARD_W } from './sim/config'
import { hoverCursor, inRect, moved, onBoss, toBoard } from './input'
import { spawnBoss } from './sim/boss'
import { brickRect } from './sim/rows'
import { brick, empty } from './sim/testing'

describe('toBoard', () => {
  const rect = { left: 100, top: 50, width: 196, height: 400 }

  it('maps a point on the canvas to board units', () => {
    expect(toBoard(rect, 100 + 98, 50 + 200)).toEqual([BOARD_W / 2, BOARD_H / 2])
  })

  it('maps points outside the canvas without clamping', () => {
    const [x, y] = toBoard(rect, 50, 450)
    expect(x).toBeCloseTo((-50 / 196) * BOARD_W)
    expect(y).toBeCloseTo(BOARD_H)
  })
})

describe('boss card shortcuts', () => {
  it('a point inside a rect hits it', () => {
    const r = { x: 10, y: 10, w: 20, h: 10 }
    expect(inRect(15, 15, r)).toBe(true)
    expect(inRect(31, 15, r)).toBe(false)
    expect(inRect(15, 15, null)).toBe(false)
  })

  it('a long press is a still hold on the boss', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, [], 'block')
    const part = brickRect(s.bricks.find((b) => b.kind === 'boss')!)
    const x = part.x + part.w / 2
    const y = part.y + part.h / 2
    expect(onBoss(s, x, y)).toBe(true)
    expect(onBoss(s, x, y + 400)).toBe(false)
    expect(moved([x, y], [x + 4, y + 3])).toBe(false)
    expect(moved([x, y], [x + 20, y])).toBe(true)
  })

  it('no boss, nothing to press', () => {
    const s = empty()
    expect(onBoss(s, 100, 100)).toBe(false)
  })
})

describe('hover cursor', () => {
  const chips = { boss: { x: 0, y: 0, w: 40, h: 20 }, points: { x: 300, y: 0, w: 40, h: 20 } }
  it('crosshair to aim, pointer on chips, help on what can be held to read', () => {
    const s = empty()
    s.phase = 'aim'
    const slime = brick(s, 1, 3, 9)
    slime.kind = 'slime'
    const plain = brick(s, 4, 3, 9)
    const at = (b: { col: number; row: number }) => {
      const r = brickRect(b)
      return [r.x + r.w / 2, r.y + r.h / 2] as const
    }
    expect(hoverCursor(s, 200, 500, chips, true)).toBe('crosshair')
    expect(hoverCursor(s, 10, 10, chips, true)).toBe('pointer')
    expect(hoverCursor(s, 310, 10, chips, true)).toBe('pointer')
    expect(hoverCursor(s, ...at(slime), chips, true)).toBe('help')
    expect(hoverCursor(s, ...at(plain), chips, true)).toBe('crosshair')
  })
  it('a plain arrow while the balls fly or a menu is open', () => {
    const s = empty()
    expect(hoverCursor(s, 200, 500, { boss: null, points: null }, false)).toBe('default')
  })
})
