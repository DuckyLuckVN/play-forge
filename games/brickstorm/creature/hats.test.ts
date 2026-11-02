import { beforeAll, describe, expect, it } from 'vitest'
import type { HeroHat } from '../sim/heroes'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { drawHat } from './hats'
import type { HeadBox } from './types'

beforeAll(installPath2D)

const HATS: HeroHat[] = [
  'cap',
  'helmet',
  'horns',
  'hood',
  'wizard',
  'crown',
  'halo',
  'tophat',
  'bandana',
  'mask',
  'tricorn',
  'spikes',
  'goggles',
]
const small: HeadBox = { x: 0, y: -40, rx: 10, ry: 10 }
const big: HeadBox = { x: 3, y: -44, rx: 16, ry: 14 }

const firstPoint = (hat: HeroHat, box: HeadBox) => {
  const ctx = fakeCanvas()
  drawHat(ctx, hat, box, '#e8590c')
  return ctx.log.find((r) => r.name === 'ellipse' || r.name === 'moveTo')?.args
}

describe('drawHat', () => {
  it.each(HATS)('%s fills at least once', (hat) => {
    const ctx = fakeCanvas()
    drawHat(ctx, hat, small, '#e8590c')
    expect(ctx.calls).toContain('fill')
  })

  it('none draws nothing', () => {
    const ctx = fakeCanvas()
    drawHat(ctx, 'none', small, '#e8590c')
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(0)
  })

  it.each(HATS)('%s scales with the head', (hat) => {
    expect(firstPoint(hat, small)).not.toEqual(firstPoint(hat, big))
  })

  it.each(HATS)('%s leaves canvas state balanced', (hat) => {
    const ctx = fakeCanvas()
    drawHat(ctx, hat, small, '#e8590c')
    const n = (s: string) => ctx.calls.filter((c) => c === s).length
    expect(n('save')).toBe(n('restore'))
  })
})
