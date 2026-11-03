import { describe, expect, it } from 'vitest'
import { compactNumber, fitScale } from './text'

describe('compactNumber', () => {
  it('keeps small numbers whole', () => {
    expect(compactNumber(0)).toBe('0')
    expect(compactNumber(999)).toBe('999')
    expect(compactNumber(9999)).toBe('9999')
  })

  it('shortens big numbers to at most 4 characters plus a suffix', () => {
    expect(compactNumber(12345)).toBe('12.3k')
    expect(compactNumber(123456)).toBe('123k')
    expect(compactNumber(1_234_567)).toBe('1.2M')
    expect(compactNumber(45_600_000_000)).toBe('45.6B')
  })

  it('never rounds up into a bigger unit badly or shows trailing .0', () => {
    expect(compactNumber(20000)).toBe('20k')
    expect(compactNumber(999_999)).toBe('1M')
  })
})

describe('fitScale', () => {
  it('is 1 when the text fits, and shrinks it to fit otherwise', () => {
    expect(fitScale(80, 100)).toBe(1)
    expect(fitScale(200, 100)).toBe(0.5)
  })

  it('handles empty text and zero room', () => {
    expect(fitScale(0, 100)).toBe(1)
    expect(fitScale(50, 0)).toBe(0)
  })
})
