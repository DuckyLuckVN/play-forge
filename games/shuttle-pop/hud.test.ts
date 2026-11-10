import { describe, expect, it } from 'vitest'
import { matchPoint, newEvents, newestShotId, trackerAction } from './hud'
import type { SpEvent } from './sim'

const ev = (id: number): SpEvent => ({ id, tick: id, k: 'net' })

describe('newEvents', () => {
  it('returns only the events after lastSeen, in order', () => {
    const events = [ev(3), ev(4), ev(5), ev(6)]
    expect(newEvents(events, 4).map((e) => e.id)).toEqual([5, 6])
  })

  it('nothing new → empty; everything new from 0', () => {
    const events = [ev(1), ev(2)]
    expect(newEvents(events, 2)).toEqual([])
    expect(newEvents(events, 0).map((e) => e.id)).toEqual([1, 2])
    expect(newEvents([], 7)).toEqual([])
  })

  it('a snapshot that skipped one still yields every unseen event once (no loss, no repeat)', () => {
    // Saw up to 2; the next snapshot we get already holds 3..5 (the one with only 3 was dropped).
    expect(newEvents([ev(1), ev(2), ev(3), ev(4), ev(5)], 2).map((e) => e.id)).toEqual([3, 4, 5])
  })

  it('fills and returns the given array (render loops reuse one)', () => {
    const out: SpEvent[] = [ev(99)]
    const got = newEvents([ev(1), ev(2)], 1, out)
    expect(got).toBe(out)
    expect(out.map((e) => e.id)).toEqual([2])
  })
})

describe('matchPoint', () => {
  it('the side one point from winning the match', () => {
    expect(matchPoint([10, 5], 0)).toBe(true)
    expect(matchPoint([10, 5], 1)).toBe(false)
    expect(matchPoint([3, 10], 1)).toBe(true)
  })

  it('needs a 2-point lead past 10-all', () => {
    expect(matchPoint([10, 10], 0)).toBe(false)
    expect(matchPoint([11, 10], 0)).toBe(true)
    expect(matchPoint([11, 10], 1)).toBe(false)
  })

  it('14-all: both sides are a point from the cap', () => {
    expect(matchPoint([14, 14], 0)).toBe(true)
    expect(matchPoint([14, 14], 1)).toBe(true)
  })

  it('no match point once the match is won', () => {
    expect(matchPoint([11, 5], 0)).toBe(false)
  })
})

describe('trackerAction (event replay on attach / rematch)', () => {
  it('first state after attach → seed (old events are not replayed)', () => {
    expect(trackerAction(false, 40, 0, 900, -1)).toBe('seed')
  })
  it('a new match started while hidden (event ids restarted) → seed', () => {
    expect(trackerAction(true, 5, 30, 1200, 1000)).toBe('seed')
  })
  it('a rematch seen live (ticks went back) → reset', () => {
    expect(trackerAction(true, 3, 2, 10, 900)).toBe('reset')
  })
  it('normal play → keep', () => {
    expect(trackerAction(true, 41, 40, 901, 900)).toBe('keep')
  })
})

describe('newestShotId', () => {
  it('the newest hit/serve id, 0 when none', () => {
    const hit = (id: number): SpEvent => ({ id, tick: id, k: 'hit', side: 0, grade: 'good', shot: 'drop' })
    const serve = (id: number): SpEvent => ({ id, tick: id, k: 'serve', side: 0 })
    expect(newestShotId([serve(2), hit(4), ev(7)])).toBe(4)
    expect(newestShotId([ev(1)])).toBe(0)
  })
})
