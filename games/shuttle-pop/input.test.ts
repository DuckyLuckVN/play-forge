import { describe, expect, it } from 'vitest'
import { heldDir } from './input'

const dir = (...codes: string[]) => heldDir(new Set(codes))

describe('keyboard direction', () => {
  it('maps WASD and arrows view-relative (x = right, z = toward the net)', () => {
    expect(dir('KeyW')).toEqual({ x: 0, z: 1 })
    expect(dir('ArrowDown')).toEqual({ x: 0, z: -1 })
    expect(dir('KeyA')).toEqual({ x: -1, z: 0 })
    expect(dir('ArrowRight')).toEqual({ x: 1, z: 0 })
    expect(dir()).toEqual({ x: 0, z: 0 })
  })

  it('normalises diagonals to length 1 (no faster diagonals)', () => {
    const d = dir('KeyW', 'KeyD')
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1)
    expect(d.x).toBeCloseTo(Math.SQRT1_2)
  })

  it('cancels opposite keys, and a key plus its arrow twin counts once', () => {
    expect(dir('KeyA', 'KeyD')).toEqual({ x: 0, z: 0 })
    expect(dir('KeyW', 'ArrowUp')).toEqual({ x: 0, z: 1 })
  })
})
