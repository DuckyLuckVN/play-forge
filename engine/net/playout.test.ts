import { describe, expect, it } from 'vitest'
import { PLAYOUT, PlayoutBuffer } from './playout'

/** Push `stamp` arriving before host tick `next`, then return the tick it comes out at. */
function dueTick(b: PlayoutBuffer<number>, stamp: number, next: number): number {
  b.push(stamp, stamp, next)
  const out: number[] = []
  for (let t = next; t <= next + 50; t++) {
    b.take(t, out)
    if (out.length) return t
  }
  return -1
}

describe('PlayoutBuffer', () => {
  it('a steady link applies each input at a fixed offset from its stamp (no added hold)', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 40; s++) expect(dueTick(b, s * 3, s * 3 + 10) - s * 3).toBe(10)
    expect(b.offset).toBe(10)
  })

  it('jitter: inputs keep their spacing (applied at stamp + offset), so the host path matches the sender', () => {
    const b = new PlayoutBuffer<number>()
    // Warm up with transit 10..12 (2 ticks of jitter).
    for (let s = 0; s < 30; s++) dueTick(b, s * 5, s * 5 + 10 + (s % 3))
    const off = b.offset
    expect(off).toBe(12)
    // Now each input applies at exactly stamp + 12, whatever its own transit.
    for (let s = 30; s < 60; s++) expect(dueTick(b, s * 5, s * 5 + 10 + ((s * 7) % 3)) - s * 5).toBe(off)
  })

  it('a late input (beyond the margin) applies at once, never in the past, and keeps the order', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 20; s++) dueTick(b, s * 4, s * 4 + 10)
    b.push(100, 1, 120) // 20 ticks of transit: late
    b.push(101, 2, 120) // same burst
    const out: number[] = []
    b.take(119, out)
    expect(out).toEqual([])
    b.take(120, out)
    expect(out).toEqual([1, 2])
  })

  it('a bad / tampered stamp never holds an input long', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 20; s++) dueTick(b, s * 4, s * 4 + 10)
    // Far in the "future": the buffer starts over (applied at once).
    expect(dueTick(b, 1000, 90)).toBe(90)
    const c = new PlayoutBuffer<number>()
    for (let s = 0; s < 20; s++) dueTick(c, s * 4, s * 4 + 10)
    // Just inside the restart range: held at most maxWait.
    expect(dueTick(c, 90 + PLAYOUT.reset - 12, 90)).toBeLessThanOrEqual(90 + PLAYOUT.maxWait)
  })

  it('jitter beyond maxHold is capped: the offset never holds more than maxHold over the fastest', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 40; s++) dueTick(b, s * 4, s * 4 + 10 + (s % 2) * 20)
    expect(b.offset).toBe(10 + PLAYOUT.maxHold)
  })

  it('a restarted sender clock (stamps jump) starts over instead of holding forever', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 20; s++) dueTick(b, s * 4, s * 4 + 10)
    // Stamps restart near 0 while the host is at tick 500.
    expect(dueTick(b, 2, 500)).toBe(500)
    expect(b.offset).toBe(498)
  })

  it('a calmer link lowers the offset one tick at a time (no sudden jump)', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 10; s++) dueTick(b, s * 4, s * 4 + 10 + (s % 2) * 3)
    expect(b.offset).toBe(13)
    // Then a steady 10 for long enough to push the jittery samples out of the window.
    let s = 10
    for (; s < 10 + PLAYOUT.window; s++) dueTick(b, s * 4, s * 4 + 10)
    const seen = new Set<number>()
    for (; s < 10 + PLAYOUT.window + 200; s++) {
      const before = b.offset
      dueTick(b, s * 4, s * 4 + 10)
      expect(before - b.offset).toBeLessThanOrEqual(1)
      seen.add(b.offset)
    }
    expect(b.offset).toBe(10)
    expect(seen.has(11)).toBe(true)
  })

  it('late(): ticks an input came out after its scheduled stamp + offset', () => {
    const b = new PlayoutBuffer<number>()
    for (let s = 0; s < 10; s++) dueTick(b, s * 4, s * 4 + 10)
    b.push(100, 7, 125)
    const out: number[] = []
    const late: number[] = []
    b.take(125, out, late)
    expect(out).toEqual([7])
    expect(late).toEqual([125 - (100 + 10)])
  })

  it('a burst (stall, then several inputs at once) keeps their spacing: no early lowering', () => {
    const b = new PlayoutBuffer<number>()
    const out: number[] = []
    b.push(1000, 1, 10)
    b.push(1005, 2, 10)
    b.push(1010, 3, 11)
    const ticks: number[] = []
    for (let t = 10; t < 40; t++) {
      out.length = 0
      b.take(t, out)
      for (const _ of out) ticks.push(t)
    }
    expect(ticks).toEqual([10, 15, 20])
  })

  it('clear() forgets everything', () => {
    const b = new PlayoutBuffer<number>()
    dueTick(b, 0, 10)
    b.push(5, 5, 11)
    b.clear()
    const out: number[] = []
    b.take(1000, out)
    expect(out).toEqual([])
    expect(Number.isNaN(b.offset)).toBe(true)
  })
})
