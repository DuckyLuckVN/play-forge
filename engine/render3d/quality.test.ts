import { describe, expect, it } from 'vitest'
import {
  LOCKED_BAD_WINDOWS,
  PIXEL_BUDGET,
  RECOVER_WINDOWS,
  pickDpr,
  QUALITY_LEVELS,
  QualityGovernor,
} from './quality'

describe('pickDpr', () => {
  it('keeps full density on small views', () => {
    expect(pickDpr(2, 2, 600, 400)).toBe(2)
  })

  it('caps big retina views to the pixel budget', () => {
    // 1913×1436 at DPR 2 was ~10 MP; now the canvas stays near the budget.
    const dpr = pickDpr(2, 2, 1600, 1000)
    expect(dpr).toBeLessThan(2)
    expect(1600 * dpr * 1000 * dpr).toBeLessThanOrEqual(PIXEL_BUDGET + 1)
  })

  it('never drops below 1 for budget alone', () => {
    expect(pickDpr(2, 2, 2560, 1440)).toBe(1)
  })

  it('never exceeds device or max ratio', () => {
    expect(pickDpr(3, 2, 300, 300)).toBe(2)
    expect(pickDpr(1, 2, 300, 300)).toBe(1)
    expect(pickDpr(0.8, 2, 3000, 2000)).toBe(0.8)
  })
})

const feed = (g: QualityGovernor, dts: number[]) =>
  dts.reduce((dropped, dt) => g.sample(dt) || dropped, false)
const repeat = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i))
// 2 s of clean frames: only burns the post-attach settle time.
const settled = (g: QualityGovernor) =>
  feed(
    g,
    repeat(120, () => 1 / 60),
  )

describe('QualityGovernor', () => {
  it('stays at full quality on a steady 60 Hz screen', () => {
    const g = new QualityGovernor()
    settled(g)
    expect(
      feed(
        g,
        repeat(600, () => 1 / 60),
      ),
    ).toBe(false)
    expect(g.level).toBe(0)
  })

  it('stays put on a steady 120 Hz screen with rare hiccups', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(600, (i) => (i % 30 === 0 ? 1 / 30 : 1 / 120)),
    )
    expect(g.level).toBe(0)
  })

  it('steps down when 120 Hz frames judder between 8 and 17 ms', () => {
    // The measured case: 66 fps on 120 Hz was judged "fine" by the old probe.
    const g = new QualityGovernor()
    settled(g)
    expect(
      feed(
        g,
        repeat(120, (i) => (i % 2 ? 1 / 60 : 1 / 120)),
      ),
    ).toBe(true)
    expect(g.level).toBe(1)
  })

  it('steps down when steadily slow (40 fps, no judder)', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(120, () => 1 / 40),
    )
    expect(g.level).toBe(1)
  })

  it('walks down to the floor and stops there', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(1200, (i) => (i % 2 ? 1 / 30 : 1 / 60)),
    )
    expect(g.level).toBe(QUALITY_LEVELS.length - 1)
    expect(g.current.bloom).toBe(false)
  })

  it('stepDown drops one level and stops at the floor', () => {
    const g = new QualityGovernor()
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      expect(g.stepDown()).toBe(true)
      expect(g.level).toBe(i)
    }
    expect(g.stepDown()).toBe(false)
    expect(g.level).toBe(QUALITY_LEVELS.length - 1)
  })

  it('ignores tab-switch gaps', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(600, (i) => (i % 5 === 0 ? 0.1 : 1 / 60)),
    )
    expect(g.level).toBe(0)
  })

  it('restart drops a half-filled window', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(59, () => 1 / 10.5),
    )
    g.restart()
    feed(
      g,
      repeat(59, () => 1 / 60),
    )
    expect(g.level).toBe(0)
  })

  it('ignores a hitchy start (attach) and stays sharp', () => {
    const g = new QualityGovernor()
    feed(
      g,
      repeat(30, () => 0.05),
    ) // 1.5 s of hitches right after attach
    feed(
      g,
      repeat(600, () => 1 / 60),
    )
    expect(g.level).toBe(0)
  })

  it('one slow window is not sustained', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(60, () => 1 / 40),
    )
    feed(
      g,
      repeat(600, () => 1 / 60),
    )
    expect(g.level).toBe(0)
  })

  it('two slow windows in a row drop one level', () => {
    const g = new QualityGovernor()
    settled(g)
    expect(
      feed(
        g,
        repeat(120, () => 1 / 40),
      ),
    ).toBe(true)
    expect(g.level).toBe(1)
  })

  it('recovers one level after RECOVER_WINDOWS clean windows (+ settle)', () => {
    const g = new QualityGovernor()
    settled(g)
    feed(
      g,
      repeat(120, () => 1 / 40),
    )
    g.restart() // scene refits on a change
    feed(
      g,
      repeat(120 + 60 * RECOVER_WINDOWS, () => 1 / 60),
    )
    expect(g.level).toBe(0)
  })

  it('can start lower (clamped to the ladder) and still probes back up on a clean device', () => {
    expect(new QualityGovernor(QUALITY_LEVELS, 99).level).toBe(QUALITY_LEVELS.length - 1)
    expect(new QualityGovernor(QUALITY_LEVELS, -3).level).toBe(0)
    const g = new QualityGovernor(QUALITY_LEVELS, 1)
    expect(g.current).toBe(QUALITY_LEVELS[1])
    feed(
      g,
      repeat(120 + 60 * RECOVER_WINDOWS, () => 1 / 60),
    )
    expect(g.level).toBe(0)
  })

  it('a failed probe locks the ceiling: no flapping', () => {
    const g = new QualityGovernor()
    settled(g)
    let changes = 0
    // Level 0 is too heavy for this device (40 fps); level 1+ runs at 60 fps.
    for (let i = 0; i < 6000; i++) {
      if (g.sample(g.level === 0 ? 1 / 40 : 1 / 60)) {
        changes++
        g.restart() // the scene refits on a change
      }
    }
    expect(g.level).toBe(1)
    expect(changes).toBeLessThanOrEqual(3) // down, probe up, down - then never again
  })

  it('a probe that fails after surviving its clean windows still locks: one flip-up per page', () => {
    const g = new QualityGovernor()
    settled(g)
    let ups = 0
    let last = g.level
    // Borderline: level 0 looks fine for ~4 windows (past PROBE_WINDOWS), then stutters.
    let sinceUp = 0
    for (let i = 0; i < 40000; i++) {
      sinceUp++
      const slow = g.level === 0 && sinceUp > 60 * 4 + 120 + 30
      if (g.sample(slow ? 1 / 40 : 1 / 60)) {
        g.restart()
        sinceUp = 0
      }
      if (g.level < last) ups++
      last = g.level
    }
    expect(ups).toBeLessThanOrEqual(1)
  })

  it('rejects an empty ladder', () => {
    expect(() => new QualityGovernor([])).toThrow(/at least one/)
  })

  it('never probes above a context-loss stepDown', () => {
    const g = new QualityGovernor()
    g.stepDown()
    settled(g)
    feed(
      g,
      repeat(1200, () => 1 / 60),
    )
    expect(g.level).toBe(1)
  })

  it('follows a custom ladder and its floor', () => {
    const ladder = [
      { dpr: Infinity, bloom: false, shadows: true },
      { dpr: 1, bloom: false, shadows: false },
    ]
    const g = new QualityGovernor(ladder)
    settled(g)
    feed(
      g,
      repeat(1200, () => 1 / 25),
    )
    expect(g.level).toBe(1)
    expect(g.current).toBe(ladder[1])
    expect(g.stepDown()).toBe(false)
  })

  it('lock(): never probes up again, however clean', () => {
    const g = new QualityGovernor(QUALITY_LEVELS, 1)
    settled(g)
    g.lock()
    feed(
      g,
      repeat(60 * RECOVER_WINDOWS * 4, () => 1 / 60),
    )
    expect(g.level).toBe(1)
  })

  it('lock(): a short slow patch no longer drops; sustained slowness still does', () => {
    const g = new QualityGovernor()
    settled(g)
    g.lock()
    expect(
      feed(
        g,
        repeat(60 * (LOCKED_BAD_WINDOWS - 1), () => 1 / 40),
      ),
    ).toBe(false)
    expect(g.level).toBe(0)
    feed(
      g,
      repeat(60, () => 1 / 40),
    )
    expect(g.level).toBe(1)
  })
})
