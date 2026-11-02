import { describe, expect, it } from 'vitest'
import { drawCrashBadges, drawHealthLoss, lossLabel } from './crash-badges'
import { dims } from './sim/dims'
import { crashForecast } from './sim/forecast'
import { brick, empty } from './sim/testing'
import { fakeCanvas } from './test-canvas'

const texts = (ctx: ReturnType<typeof fakeCanvas>) =>
  ctx.log.filter((c) => c.name === 'fillText').map((c) => c.args[0])

describe('crash badges', () => {
  it('label is a minus with at least 1', () => {
    expect(lossLabel(0.2)).toBe('−1')
    expect(lossLabel(12.4)).toBe('−12')
  })
  it('draws one badge per brick near the line, none for safe bricks', () => {
    const s = empty()
    s.turn = 20
    const { dangerRow } = dims(s)
    brick(s, 0, dangerRow - 1, 10)
    brick(s, 1, dangerRow - 2, 10)
    brick(s, 2, 1, 10)
    const ctx = fakeCanvas()
    drawCrashBadges(ctx, s, crashForecast(s), 0, true)
    expect(texts(ctx)).toHaveLength(2)
  })
  it('draws nothing when the board is safe', () => {
    const s = empty()
    brick(s, 0, 1, 10)
    const ctx = fakeCanvas()
    drawCrashBadges(ctx, s, crashForecast(s), 0, true)
    expect(ctx.calls).toHaveLength(0)
  })
})

describe('health bar loss preview', () => {
  const bar = { x: 0, y: 0, w: 100, h: 10 }
  it('covers the lost share at the end of the bar', () => {
    const ctx = fakeCanvas()
    drawHealthLoss(ctx, bar, 0.8, 20, 100, 0, true)
    const rect = ctx.log.find((c) => c.name === 'rect')!.args as number[]
    expect(rect[0]).toBeCloseTo(60)
    expect(rect[2]).toBeCloseTo(20)
  })
  it('never runs past the empty end', () => {
    const ctx = fakeCanvas()
    drawHealthLoss(ctx, bar, 0.1, 50, 100, 0, true)
    const rect = ctx.log.find((c) => c.name === 'rect')!.args as number[]
    expect(rect[0]).toBeCloseTo(0)
    expect(rect[2]).toBeCloseTo(10)
  })
  it('draws nothing with no loss', () => {
    const ctx = fakeCanvas()
    drawHealthLoss(ctx, bar, 0.8, 0, 100, 0, true)
    expect(ctx.calls).toHaveLength(0)
  })
})
