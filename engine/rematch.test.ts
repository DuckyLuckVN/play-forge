import { describe, expect, it } from 'vitest'
import { closedResults, shouldAutoRematch } from './rematch'

const all = { isHost: true, phase: 'finished', onResults: true, selfReady: true, canStart: true }

describe('shouldAutoRematch', () => {
  it('starts when the host is on the results, ready, and everyone else is ready', () => {
    expect(shouldAutoRematch(all)).toBe(true)
  })

  it.each([
    ['a guest client', { isHost: false }],
    ['already playing', { phase: 'playing' }],
    ['the host closed the results (lobby view)', { onResults: false }],
    ['the host is not ready', { selfReady: false }],
    ['a guest is not ready, or someone is reconnecting', { canStart: false }],
  ])('waits: %s', (_, change) => {
    expect(shouldAutoRematch({ ...all, ...change })).toBe(false)
  })
})

describe('closedResults', () => {
  const a = {}
  const b = {}
  it('only the room and round the player closed', () => {
    const closed = { session: a, round: 1 }
    expect(closedResults(closed, a, 1)).toBe(true)
    expect(closedResults(closed, a, 2)).toBe(false)
    // A new room starts again at round 1: its results still show.
    expect(closedResults(closed, b, 1)).toBe(false)
    expect(closedResults(null, a, 1)).toBe(false)
  })
})
