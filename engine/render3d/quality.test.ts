import { describe, expect, it } from 'vitest'
import { PIXEL_BUDGET, pickDpr, QUALITY_LEVELS, QualityGovernor } from './quality'

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

describe('QualityGovernor', () => {
  it('stays at full quality on a steady 60 Hz screen', () => {
    const g = new QualityGovernor()
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
    feed(
      g,
      repeat(600, (i) => (i % 30 === 0 ? 1 / 30 : 1 / 120)),
    )
    expect(g.level).toBe(0)
  })

  it('steps down when 120 Hz frames judder between 8 and 17 ms', () => {
    // The measured case: 66 fps on 120 Hz was judged "fine" by the old probe.
    const g = new QualityGovernor()
    expect(
      feed(
        g,
        repeat(60, (i) => (i % 2 ? 1 / 60 : 1 / 120)),
      ),
    ).toBe(true)
    expect(g.level).toBe(1)
  })

  it('steps down when steadily slow (40 fps, no judder)', () => {
    const g = new QualityGovernor()
    feed(
      g,
      repeat(60, () => 1 / 40),
    )
    expect(g.level).toBe(1)
  })

  it('walks down to the floor and stops there', () => {
    const g = new QualityGovernor()
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
    feed(
      g,
      repeat(600, (i) => (i % 5 === 0 ? 0.1 : 1 / 60)),
    )
    expect(g.level).toBe(0)
  })

  it('restart drops a half-filled window', () => {
    const g = new QualityGovernor()
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
})
