import { describe, expect, it } from 'vitest'
import { bottle, BOARD_H, chainFreq, comboWord, layout, popStagger } from './look'

describe('look', () => {
  it('the bottle wraps the jar, neck above it', () => {
    const l = layout()
    const b = bottle(l)
    expect(b.left).toBeLessThan(l.bx)
    expect(b.bottom).toBeGreaterThan(l.by + BOARD_H)
    expect(b.neckY).toBeGreaterThanOrEqual(0)
    expect(b.neckY).toBeLessThan(b.neckBase)
    expect(b.neckBase).toBeLessThan(l.by)
  })

  it('pops stagger but always finish within 0.3 s', () => {
    expect(popStagger(4)).toBe(0.05)
    expect(popStagger(12) * 12).toBeCloseTo(0.3)
  })

  it('combo words fire once, for the biggest step passed', () => {
    expect(comboWord(0, 1)).toBeNull()
    expect(comboWord(1, 2)).toBe('double')
    expect(comboWord(0, 4)).toBe('triple')
    expect(comboWord(2, 6)).toBe('mega')
    expect(comboWord(3, 4)).toBeNull()
  })

  it('chains climb in pitch', () => {
    expect(chainFreq(2)).toBeGreaterThan(chainFreq(1))
  })
})
