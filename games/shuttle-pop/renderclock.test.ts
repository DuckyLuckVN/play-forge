import { describe, expect, it } from 'vitest'
import { CLOCK, RenderClock } from './renderclock'
import { swingTick } from './world'

const DT = 1 / 60

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1
  return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296
}

describe('RenderClock', () => {
  it('seenTick agrees with swingTick on a clean link', () => {
    const c = new RenderClock(60)
    let checked = 0
    for (let f = 1; f <= 120; f++) {
      c.onState(f)
      c.update(f % 7 === 0 ? DT * 0.8 : DT)
      // Legacy timeline: prev.tick + alpha, with curr = the newest state.
      const alpha = Math.min(1, Math.max(0, c.tick - (c.newest - 1)))
      if (Math.abs(alpha - 0.5) < 1e-6) continue
      expect(c.seenTick()).toBe(swingTick(c.newest, alpha))
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })

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

  it('jitter: the delay grows so the shown tick stays behind the newest state (interpolates, rarely guesses)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = seeded(seed)
      const c = new RenderClock(60)
      let next = 1
      let nextAt = 0
      let ahead = 0
      let frames = 0
      for (let f = 0; f < 600; f++) {
        const now = f * DT * 1000
        // 40–90 ms one way: ~3 ticks of jitter (Wi-Fi at ~100 ms ping).
        while (nextAt <= now) {
          c.onState(next++)
          nextAt = Math.max(nextAt, (next * 1000) / 60 + 40 + rnd() * 50)
        }
        c.update(DT)
        if (f < 180) continue
        frames++
        if (c.tick > c.newest + 0.25) ahead++
      }
      expect(ahead / frames).toBeLessThan(0.03)
      expect(c.delay).toBeLessThanOrEqual(CLOCK.maxDelay)
    }
  })

  it('a clean link keeps the minimum delay (no added latency)', () => {
    const c = new RenderClock(60)
    for (let f = 1; f <= 300; f++) {
      c.onState(f)
      c.update(DT)
    }
    expect(c.delay).toBe(CLOCK.delay)
  })

  it('the delay comes back down a while after the jitter stops', () => {
    const c = new RenderClock(60)
    let t = 1
    // Bursts: 4 states every 4 frames.
    for (let f = 1; f <= 240; f++) {
      if (f % 4 === 0) for (let k = 0; k < 4; k++) c.onState(t++)
      c.update(DT)
    }
    expect(c.delay).toBeGreaterThan(CLOCK.delay)
    for (let f = 1; f <= 600; f++) {
      c.onState(t++)
      c.update(DT)
    }
    expect(c.delay).toBe(CLOCK.delay)
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

  it('after a long stall the delay comes back to the minimum within a few seconds', () => {
    const c = new RenderClock(60)
    let t = 1
    for (let f = 1; f <= 60; f++) {
      c.onState(t++)
      c.update(DT)
    }
    for (let f = 0; f < 60; f++) c.update(DT) // 1 s with nothing
    for (let k = 0; k < 60; k++) c.onState(t++) // the backlog in one burst
    c.update(DT)
    expect(c.delay).toBe(CLOCK.maxDelay)
    for (let f = 0; f < 240; f++) {
      c.onState(t++)
      c.update(DT)
    }
    expect(c.delay).toBe(CLOCK.delay)
  })

  it('a grown delay never moves the shown tick backward', () => {
    const c = new RenderClock(60)
    let t = 1
    let prev = -Infinity
    for (let f = 1; f <= 300; f++) {
      // Clean, then bursts of 4 every 4 frames.
      if (f < 100) c.onState(t++)
      else if (f % 4 === 0) for (let k = 0; k < 4; k++) c.onState(t++)
      c.update(DT)
      expect(c.tick).toBeGreaterThanOrEqual(prev)
      prev = c.tick
    }
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
