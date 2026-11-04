import { describe, expect, it } from 'vitest'
import { timeText } from './stats'

describe('stats text', () => {
  it('formats survival time', () => {
    expect(timeText(0)).toBe('0:00')
    expect(timeText(60 * 75)).toBe('1:15')
  })
})
