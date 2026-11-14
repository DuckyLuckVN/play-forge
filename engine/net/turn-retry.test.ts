import { describe, expect, it } from 'vitest'
import { TURN_RETRY, TurnRetry, turnRetryCandidate } from './turn-retry'
import type { PeerLink } from './status'

const noJitter = () => 0

describe('TurnRetry', () => {
  it('first retry once a link has been on TURN for firstMs, the second gapMs later, then never', () => {
    const r = new TurnRetry(noJitter)
    expect(r.tick(0, true, true)).toBe(false)
    expect(r.tick(TURN_RETRY.firstMs - 1, true, true)).toBe(false)
    expect(r.tick(TURN_RETRY.firstMs, true, true)).toBe(true)
    const second = TURN_RETRY.firstMs + TURN_RETRY.gapMs
    expect(r.tick(second - 1, true, true)).toBe(false)
    expect(r.tick(second, true, true)).toBe(true)
    expect(r.tick(second * 10, true, true)).toBe(false)
  })

  it('waits for a quiet moment (between matches) when a retry is due mid-match', () => {
    const r = new TurnRetry(noJitter)
    r.tick(0, true, false)
    expect(r.tick(TURN_RETRY.firstMs + 5000, true, false)).toBe(false)
    expect(r.tick(TURN_RETRY.firstMs + 9000, true, true)).toBe(true)
  })

  it('a link that goes direct starts the wait over, but retries spent stay spent', () => {
    const r = new TurnRetry(noJitter)
    r.tick(0, true, true)
    expect(r.tick(TURN_RETRY.firstMs, true, true)).toBe(true)
    // The retry moves the peer to the relay for a moment: not eligible.
    expect(r.tick(TURN_RETRY.firstMs + 1000, false, true)).toBe(false)
    // Back on TURN: the wait restarts from here, not from the first sighting.
    const back = TURN_RETRY.firstMs + 2000
    expect(r.tick(back, true, true)).toBe(false)
    expect(r.tick(back + TURN_RETRY.gapMs - 1, true, true)).toBe(false)
    expect(r.tick(back + TURN_RETRY.gapMs, true, true)).toBe(true)
    expect(r.tick(back + TURN_RETRY.gapMs * 5, true, true)).toBe(false)
  })
})

describe('turnRetryCandidate', () => {
  const link = (p: Partial<PeerLink>): PeerLink => ({
    id: 'mmm',
    state: 'connected',
    route: 'direct',
    turn: true,
    why: 'unknown',
    ...p,
  })

  it('only a TURN link whose cause is unknown, and only from the lower id of the pair', () => {
    expect(turnRetryCandidate('aaa', [link({})])).toBe(true)
    expect(turnRetryCandidate('zzz', [link({})])).toBe(false)
    expect(turnRetryCandidate('aaa', [link({ turn: false })])).toBe(false)
    expect(turnRetryCandidate('aaa', [link({ route: 'relay' })])).toBe(false)
    for (const why of ['same-network', 'strict-self', 'strict-peer', 'no-public-self'] as const)
      expect(turnRetryCandidate('aaa', [link({ why })])).toBe(false)
    expect(turnRetryCandidate('aaa', [link({ why: undefined })])).toBe(false)
  })
})
