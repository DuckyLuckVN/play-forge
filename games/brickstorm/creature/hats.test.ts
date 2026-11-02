import { beforeAll, describe, expect, it } from 'vitest'
import type { HeroHat } from '../sim/heroes'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { Fit, HAT_RISE, TRICORN, drawHat } from './hats'
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

type Stub = { d: string; ops: { name: string; args: unknown[] }[] }

/** Every number the hat's paths were built from (SVG strings and ellipse calls). */
const geometry = (hat: HeroHat, box: HeadBox): number[] => {
  const ctx = fakeCanvas()
  drawHat(ctx, hat, box, '#e8590c')
  const out: number[] = []
  for (const r of ctx.log) {
    for (const a of r.args) {
      const p = a as Partial<Stub> | undefined
      if (p && typeof p.d === 'string') out.push(...(p.d.match(/-?[\d.]+/g) ?? []).map(Number))
      for (const o of p?.ops ?? []) out.push(...(o.args as number[]).filter((v) => typeof v === 'number'))
    }
  }
  return out
}
const extent = (n: number[]) => Math.max(...n) - Math.min(...n)

describe('Fit', () => {
  const f = new Fit({ x: 5, y: -20, rx: 10, ry: 8 })
  const w = 10 * 1.05
  it('rewrites every x y pair into box space', () => {
    const p = f.path('M1 -1 L0 0 Q-0.5 2 1 1 Z') as unknown as Stub
    const n = (v: number) => `${v}`
    const at = (a: number, b: number) => `${n(5 + a * w)} ${n(-20 + 0.35 * -8 + b * w)}`
    expect(p.d).toBe(`M${at(1, -1)} L${at(0, 0)} Q${at(-0.5, 2)} ${at(1, 1)} Z`)
  })
  it('maps ellipse centre and radii', () => {
    const e = (f.ell(1, -1, 0.5, 0.25) as unknown as Stub).ops[0].args
    expect(e[0]).toBeCloseTo(5 + w)
    expect(e[1]).toBeCloseTo(-20 - 2.8 - w)
    expect(e[2]).toBeCloseTo(0.5 * w)
    expect(e[3]).toBeCloseTo(0.25 * w)
  })
  it('does not over-grow hats on wide short heads', () => {
    expect(new Fit({ x: 0, y: 0, rx: 15, ry: 8 }).w).toBeCloseTo(15 * 1.05)
  })
})

describe('drawHat', () => {
  it.each(HATS)('%s paints at least one built path', (hat) => {
    const ctx = fakeCanvas()
    drawHat(ctx, hat, small, '#e8590c')
    const filled = ctx.log.filter(
      (r) => (r.name === 'fill' || r.name === 'stroke') && r.args[0] instanceof Path2D,
    )
    expect(filled.length).toBeGreaterThan(0)
  })

  it('none draws nothing', () => {
    const ctx = fakeCanvas()
    drawHat(ctx, 'none', small, '#e8590c')
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(0)
  })

  it.each(HATS)('%s geometry grows with the head and follows its position', (hat) => {
    const a = geometry(hat, small)
    const b = geometry(hat, big)
    expect(a.length).toBeGreaterThan(0)
    expect(extent(b)).toBeGreaterThan(extent(a) * 1.1)
    const shifted = geometry(hat, { ...small, x: small.x + 20 })
    expect(shifted).not.toEqual(a)
  })

  it.each(HATS)('%s leaves canvas state balanced', (hat) => {
    const ctx = fakeCanvas()
    drawHat(ctx, hat, small, '#e8590c')
    const n = (s: string) => ctx.calls.filter((c) => c === s).length
    expect(n('save')).toBe(n('restore'))
  })

  it('halo is drawn in gold', () => {
    const ctx = fakeCanvas()
    drawHat(ctx, 'halo', small, '#e8590c')
    expect(ctx.strokeStyle).toBe('#ffd43b')
    expect(ctx.log.filter((r) => r.name === 'stroke')).toHaveLength(2)
  })

  it('tricorn tips sit above the front centre point', () => {
    const f = new Fit(small)
    const pts = [...(f.path(TRICORN) as unknown as Stub).d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
      +m[1],
      +m[2],
    ])
    const front = pts.reduce((a, b) => (b[1] > a[1] ? b : a))
    const left = pts[0]
    const right = pts.reduce((a, b) => (b[0] > a[0] ? b : a))
    expect(left[1]).toBeLessThan(front[1])
    expect(right[1]).toBeLessThan(front[1])
    expect(left[0]).toBeLessThan(front[0])
    expect(right[0]).toBeGreaterThan(front[0])
  })
})

describe('HAT_RISE', () => {
  /** The hat's highest point above the brim, in crown half-widths (box with w = 1 and the brim at y = 0). */
  const rise = (hat: HeroHat): number => {
    const ctx = fakeCanvas()
    drawHat(ctx, hat, { x: 0, y: 0, rx: 1 / 1.05, ry: 0 }, '#e8590c')
    let top = 0
    for (const r of ctx.log)
      for (const a of r.args) {
        const p = a as Partial<Stub> | undefined
        for (const m of p?.d?.matchAll(/(-?[\d.]+) (-?[\d.]+)/g) ?? []) top = Math.min(top, Number(m[2]))
        for (const o of p?.ops ?? []) {
          const n = o.args as number[]
          if (o.name === 'ellipse') top = Math.min(top, n[1] - n[3])
        }
      }
    return -top
  }
  it.each(HATS)('%s rise matches its drawing', (hat) => {
    expect(HAT_RISE[hat]).toBeGreaterThanOrEqual(rise(hat))
    expect(HAT_RISE[hat]).toBeLessThan(rise(hat) + 0.1)
  })
  it('none rises nothing', () => expect(HAT_RISE.none).toBe(0))
})
