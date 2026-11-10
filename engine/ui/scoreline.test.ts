import { describe, expect, it } from 'vitest'
import { chipLook, scoreLabel } from './scoreline'

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

describe('chipLook', () => {
  const players = [{ id: 'a', name: 'Mai', slot: 0, avatar: 'cat' }]

  it("a lobby player's chip uses their slot colour and avatar (the line can't override them)", () => {
    expect(chipLook({ id: 'a', slot: 3, avatar: 'robot' }, players)).toEqual({ slot: 0, avatar: 'cat' })
  })

  it("a seat not in the lobby uses the line's own slot and avatar (the computer)", () => {
    expect(chipLook({ id: 'ai', slot: 1, avatar: 'robot' }, players)).toEqual({
      slot: 1,
      avatar: 'robot',
    })
  })

  it('no slot / unknown avatar → slot 0 and no avatar (as before)', () => {
    expect(chipLook({ id: 'x', avatar: 'nope' }, players)).toEqual({ slot: 0, avatar: null })
  })
})
