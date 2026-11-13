import { describe, expect, it } from 'vitest'
import { createPerfProbe, perfProbe, quantile } from './perfprobe'

/** A probe on a hand-driven clock. */
function probeAt() {
  let t = 0
  const p = createPerfProbe(() => t)
  return { p, at: (ms: number) => (t = ms) }
}

describe('perf probe', () => {
  it('quantile reads a 1 ms histogram (bin upper edge); empty = 0', () => {
    const h = new Uint32Array(201)
    expect(quantile(h, 0.5)).toBe(0)
    h[16] = 90
    h[40] = 10
    expect(quantile(h, 0.5)).toBe(17)
    expect(quantile(h, 0.95)).toBe(41)
  })

  it('frames: percentiles, stutter counts at 20 / 33 / 50 ms, render work kept apart from the interval', () => {
    const { p, at } = probeAt()
    for (let i = 0; i < 97; i++) p.frame(16.7, 3)
    p.frame(25, 3)
    p.frame(40, 4)
    p.frame(80, 30)
    at(500)
    const r = p.report()
    expect(r.frame.count).toBe(100)
    expect(r.frame.p50).toBe(17)
    expect(r.frame.jank).toEqual([3, 2, 1])
    expect(r.frame.max).toBe(80)
    expect(r.render.p50).toBe(4)
    expect(r.render.max).toBe(30)
  })

  it('per-second summaries roll over with the clock (the open second included in the report)', () => {
    const { p, at } = probeAt()
    p.frame(16, 2)
    p.frame(50, 10)
    at(1200)
    p.frame(16, 4)
    p.ticks(3, 1)
    p.ticks(40, 3)
    const r = p.report()
    expect(r.perSecond).toHaveLength(2)
    expect(r.perSecond[0]).toMatchObject({
      t: 0,
      frames: 2,
      frameMax: 50,
      jank: [1, 1, 1],
      renderAvg: 6,
      renderMax: 10,
    })
    expect(r.perSecond[1]).toMatchObject({ t: 1, frames: 1, ticks: 4, bursts: 1, tickLateMax: 40 })
    expect(r.tick).toMatchObject({ count: 2, bursts: 1, lateMax: 40 })
  })

  it('long tasks and notes land in events with their time', () => {
    const { p, at } = probeAt()
    at(2500)
    p.longTask(120)
    p.note('quality', { level: 1 })
    const r = p.report({ cores: 8 })
    expect(r.longTasks).toEqual({ count: 1, totalMs: 120, max: 120 })
    expect(r.events).toEqual([
      { t: 2.5, k: 'longtask', data: { ms: 120 } },
      { t: 2.5, k: 'quality', data: { level: 1 } },
    ])
    expect(r.meta).toEqual({ cores: 8 })
  })

  it('off without ?perf (and outside a browser): no probe', () => {
    expect(perfProbe()).toBeNull()
  })
})
