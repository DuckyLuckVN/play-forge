import { describe, expect, it } from 'vitest'
import { bush, flowers, grass, rocks, slab, tree, vary, type TreeKind } from './flora'
import { rng, topOf, type Prop } from './kit'

const build = (f: (out: Prop[]) => void) => {
  const out: Prop[] = []
  f(out)
  return out
}
const KINDS: TreeKind[] = ['round', 'blossom', 'autumn', 'pine', 'small']

describe('flora', () => {
  it('every tree kind is a trunk plus canopy, deterministic per seed, standing on the ground', () => {
    for (const kind of KINDS) {
      const a = build((o) => tree(o, rng(3), kind, 1, 2, 1))
      expect(build((o) => tree(o, rng(3), kind, 1, 2, 1))).toEqual(a)
      expect(a[0].shape).toBe('post')
      expect(a.slice(1).every((p) => p.shape === (kind === 'pine' ? 'cone' : 'leaf'))).toBe(true)
      expect(a[0].y - a[0].sy / 2).toBeCloseTo(0)
    }
  })

  it('trees vary: no two seeds give the same round tree; pines are the tallest kind', () => {
    const t = (seed: number, kind: TreeKind) => build((o) => tree(o, rng(seed), kind, 0, 0, 1))
    expect(t(1, 'round')).not.toEqual(t(2, 'round'))
    const top = (kind: TreeKind) => Math.max(...t(5, kind).map(topOf))
    expect(top('pine')).toBeGreaterThan(top('small'))
  })

  it('tags detail and shadow on every prop of a plant', () => {
    const out = build((o) => tree(o, rng(1), 'round', 0, 0, 1, { detail: 2, shadow: false }))
    expect(out.every((p) => p.detail === 2 && p.shadow === false)).toBe(true)
  })

  it('ground cover stays low (under knee height) and near its spot', () => {
    const r = rng(9)
    const out = build((o) => {
      bush(o, r, 'flowering', 0, 0, 1)
      flowers(o, r, 0, 0, 10, ['daisy', 'pink'], 0.6, { mound: true })
      grass(o, r, 0, 0, 6, 0.5)
      rocks(o, r, 0, 0, 0.4, true)
      slab(o, r, 0, 0, 0.6)
    })
    for (const p of out) {
      expect(topOf(p)).toBeLessThan(1)
      expect(Math.hypot(p.x, p.z)).toBeLessThan(1)
    }
  })

  it('vary keeps a colour close to its base', () => {
    const r = rng(1)
    const n = (h: string) => parseInt(h.slice(1), 16)
    for (let i = 0; i < 20; i++) {
      const v = n(vary('#78b84a', r))
      const g = (v >> 8) & 255
      expect(Math.abs(g - 0xb8)).toBeLessThan(30)
    }
  })
})
