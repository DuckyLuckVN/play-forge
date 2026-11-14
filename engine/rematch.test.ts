import { describe, expect, it } from 'vitest'
import { shouldAutoRematch } from './rematch'

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
