import { describe, expect, it } from 'vitest'
import { fitCenter, pickSlot, slotAngle, slotOffset } from './radial'

describe('radial geometry', () => {
  it('slot 0 is straight up, clockwise', () => {
    expect(slotAngle(0, 8)).toBeCloseTo(-Math.PI / 2)
    expect(slotOffset(0, 8, 84)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(-84) })
    expect(slotOffset(2, 8, 84).x).toBeCloseTo(84) // right
    expect(slotOffset(4, 8, 84).y).toBeCloseTo(84) // down
  })

  it('picks by direction', () => {
    expect(pickSlot(0, -50, 8, 28)).toBe(0)
    expect(pickSlot(50, 0, 8, 28)).toBe(2)
    expect(pickSlot(0, 50, 8, 28)).toBe(4)
    expect(pickSlot(-50, -50, 8, 28)).toBe(7)
    expect(pickSlot(500, 1, 8, 28)).toBe(2) // far out still picks
  })

  it('sector edges: 22° right of up is slot 0, 23° is slot 1', () => {
    const at = (deg: number) =>
      pickSlot(Math.sin((deg * Math.PI) / 180) * 60, -Math.cos((deg * Math.PI) / 180) * 60, 8, 28)
    expect(at(22)).toBe(0)
    expect(at(23)).toBe(1)
    expect(at(-22)).toBe(0)
    expect(at(-23)).toBe(7)
  })

  it('dead zone cancels', () => {
    expect(pickSlot(0, 0, 8, 28)).toBe(-1)
    expect(pickSlot(19, 19, 8, 28)).toBe(-1) // 26.9 px
  })

  it('fitCenter keeps the wheel inside', () => {
    expect(fitCenter({ x: 5, y: 5 }, { w: 800, h: 400 }, 120)).toEqual({ x: 120, y: 120 })
    expect(fitCenter({ x: 790, y: 300 }, { w: 800, h: 400 }, 120)).toEqual({ x: 680, y: 280 })
    expect(fitCenter({ x: 10, y: 10 }, { w: 200, h: 400 }, 120)).toEqual({ x: 100, y: 120 })
  })
})
