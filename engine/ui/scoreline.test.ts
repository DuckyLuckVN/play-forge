import { describe, expect, it } from 'vitest'
import { scoreLabel } from './scoreline'

const lobby = [{ id: 'a', name: 'Mai' }]

describe('scoreLabel', () => {
  it('names a lobby player from the lobby (the line name never overrides it)', () => {
    expect(scoreLabel({ id: 'a', score: 3 }, lobby)).toBe('Mai 3')
    expect(scoreLabel({ id: 'a', score: 3, name: 'Other' }, lobby)).toBe('Mai 3')
  })

  it("uses the line's own name for a seat not in the lobby (the computer)", () => {
    expect(scoreLabel({ id: 'ai', score: 11, name: 'Computer' }, lobby)).toBe('Computer 11')
  })

  it('falls back to "Gone" for a player who left', () => {
    expect(scoreLabel({ id: 'x', score: 0 }, lobby)).toBe('Gone 0')
  })
})
