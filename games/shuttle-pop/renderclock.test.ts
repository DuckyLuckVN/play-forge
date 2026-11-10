import { describe, expect, it } from 'vitest'
import { CLOCK, RenderClock } from './renderclock'

const DT = 1 / 60

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296
}

describe('RenderClock', () => {
  it('tracks newest - 1 on a clean 60 Hz link', () => {
    const c = new RenderClock(60)
    for (let f = 1; f <= 30; f++) {
      c.onState(f)
      c.update(DT)
    }
    // Each state arrives at the frame start, so `since` is one frame after the last update.
    expect(Math.abs(c.tick - c.newest /* newest - delay(1) + 1 tick of age */)).toBeLessThan(0.05)
  })

  it('rate stays within ±10% under jitter', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = seeded(seed)
      const c = new RenderClock(60)
      let next = 1
      let nextAt = 0
      for (let f = 0; f < 300; f++) {
        const now = f * DT * 1000
        // Host tick n is sent at n/60 s, arrives with 40-65 ms latency; deliveries stay in order.
        while (nextAt <= now) {
          c.onState(next++)
          nextAt = Math.max(nextAt, (next * 1000) / 60 + 40 + rnd() * 25)
        }
        const before = c.tick
        c.update(DT)
        if (f > 2) {
          const ratio = (c.tick - before) / (DT * 60)
          expect(ratio).toBeGreaterThanOrEqual(1 - CLOCK.maxSkew - 1e-9)
          expect(ratio).toBeLessThanOrEqual(1 + CLOCK.maxSkew + 1e-9)
        }
      }
    }
  })

  it('resyncs after a long stall', () => {
    const c = new RenderClock(60)
    for (let f = 1; f <= 10; f++) {
      c.onState(f)
      c.update(DT)
    }
    for (let f = 0; f < 120; f++) c.update(DT)
    c.onState(140)
    c.update(DT)
    expect(Math.abs(c.tick - (140 - 1))).toBeLessThanOrEqual(1)
  })

  it('never runs past maxAhead', () => {
    const c = new RenderClock(60)
    c.onState(5)
    for (let f = 0; f < 30; f++) c.update(DT)
    expect(c.tick).toBeLessThanOrEqual(c.newest + CLOCK.maxAhead)
  })

  it('ignores stale ticks and does nothing before the first state', () => {
    const c = new RenderClock(60)
    c.update(DT)
    expect(c.tick).toBe(0)
    c.onState(10)
    c.onState(9)
    expect(c.newest).toBe(10)
    c.reset()
    expect(c.newest).toBe(0)
  })
})
