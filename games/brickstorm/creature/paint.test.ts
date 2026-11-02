import { beforeAll, describe, expect, it } from 'vitest'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { darkOf, group, idleOffset, lightOf, mix, paint, type Part } from './paint'

beforeAll(installPath2D)

const part = (): Part => ({ p: new Path2D(), c: '#4a8cf0' })

describe('paint kit', () => {
  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })

  it('darkOf and lightOf change the colour', () => {
    expect(darkOf('#4a8cf0')).not.toBe('#4a8cf0')
    expect(lightOf('#4a8cf0')).not.toBe('#4a8cf0')
  })

  it('idleOffset is 0 when still', () => {
    expect(idleOffset(1.3, true, 0, 5)).toBe(0)
    expect(idleOffset(2.7, true, 0, 5)).toBe(0)
    expect(idleOffset(1.3, false, 0, 5)).not.toBe(0)
  })

  it('group strokes every silhouette before the first fill', () => {
    const c = fakeCanvas()
    group(c, [part(), part()])
    const firstFill = c.calls.indexOf('fill')
    expect(firstFill).toBeGreaterThan(0)
    expect(c.calls.slice(0, firstFill).filter((n) => n === 'stroke')).toHaveLength(2)
  })

  it('paint with k 0 records no clip', () => {
    const c = fakeCanvas()
    paint(c, { ...part(), k: 0 })
    expect(c.calls).not.toContain('clip')
    expect(c.calls).toContain('fill')
  })

  it('paint with shading clips and shifts the part twice', () => {
    const c = fakeCanvas()
    paint(c, part())
    expect(c.calls.filter((n) => n === 'clip')).toHaveLength(2)
    const shifts = c.log.filter((r) => r.name === 'translate').map((r) => r.args)
    expect(shifts).toEqual([
      [-4, -3.2],
      [4, 3.2],
      [1.6, 1.8],
    ])
  })
})
