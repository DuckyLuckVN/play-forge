import { beforeAll, describe, expect, it, vi } from 'vitest'
import { drawEmblem, heroEmblem, heroPortraitUrl, portraitFrame } from './hero-art'
import { HeroAvatar } from './hero-avatar'
import { HERO_IDS, type HeroEmblem } from './sim/heroes'
import { fakeCanvas, installPath2D, type FakeCanvas } from './test-canvas'

const EMBLEMS: HeroEmblem[] = [
  'ball',
  'shield',
  'axe',
  'bow',
  'flame',
  'bomb',
  'bolt',
  'coin',
  'book',
  'heart',
  'fang',
  'twin',
  'fist',
  'wing',
  'dice',
  'skull',
  'gear',
  'lotus',
  'gem',
  'sun',
  'anchor',
  'snow',
  'star',
  'rock',
  'dragon',
]

interface FakeEl {
  width: number
  height: number
  getContext: () => FakeCanvas
  toDataURL: () => string
  ctx: FakeCanvas
}

/** A canvas stand-in whose data URL names the hero and size it was drawn for. */
function fakeEl(id: string): FakeEl {
  const ctx = fakeCanvas()
  const el: FakeEl = {
    width: 0,
    height: 0,
    ctx,
    getContext: () => ctx,
    toDataURL: () => `data:fake/${id}@${el.width}x${el.height}`,
  }
  return el
}

describe('heroPortraitUrl', () => {
  beforeAll(installPath2D)

  it('gives every hero a distinct image', () => {
    const all = HERO_IDS.map((id) => heroPortraitUrl(id, 31, () => fakeEl(id)))
    expect(new Set(all).size).toBe(HERO_IDS.length)
  })

  it('caches by hero and size', () => {
    const make = vi.fn(() => fakeEl('rookie'))
    const a = heroPortraitUrl('rookie', 33, make)
    const b = heroPortraitUrl('rookie', 33, make)
    expect(b).toBe(a)
    expect(make).toHaveBeenCalledTimes(1)
    heroPortraitUrl('rookie', 34, make)
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('draws at the given size, on the card in the hero colour, with the creature', () => {
    const el = fakeEl('knight')
    expect(heroPortraitUrl('knight', 96, () => el)).toBe('data:fake/knight@96x96')
    expect(el.width).toBe(96)
    expect(el.height).toBe(96)
    // The card, the creature and the badge all draw.
    expect(el.ctx.calls.length).toBeGreaterThan(50)
    expect(el.ctx.calls).toContain('createLinearGradient')
  })

  it('rounds a fractional pixel size', () => {
    const el = fakeEl('rookie')
    heroPortraitUrl('rookie', 48 * 2.625, () => el)
    expect(el.width).toBe(126)
  })
})

describe('portraitFrame', () => {
  it('keeps every head (and room for its hat) inside the card, centred', () => {
    for (const id of HERO_IDS) {
      const m = new HeroAvatar(id).bodyMetrics
      const { at, floorY, scale } = portraitFrame(m)
      const h = m.head
      const left = at + (h.x - h.rx) * scale
      const right = at + (h.x + h.rx) * scale
      const top = floorY + Math.min(m.headTop, h.y - h.ry) * scale
      const bottom = floorY + (h.y + h.ry) * scale
      expect(left, id).toBeGreaterThanOrEqual(2)
      expect(right, id).toBeLessThanOrEqual(62)
      expect(top, id).toBeGreaterThanOrEqual(2)
      expect(bottom, id).toBeLessThanOrEqual(56)
      expect(Math.abs((left + right) / 2 - 32), id).toBeLessThan(1)
      // Big enough to read at 48px.
      expect(right - left, id).toBeGreaterThan(24)
    }
  })
})

describe('heroEmblem', () => {
  it('draws every emblem distinctly', () => {
    const all = EMBLEMS.map((e) => heroEmblem(e, '#ff0000'))
    for (const svg of all) {
      expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
      expect(svg.length).toBeGreaterThan(120)
    }
    expect(new Set(all).size).toBe(EMBLEMS.length)
  })

  it('uses the given colour and size', () => {
    const svg = heroEmblem('heart', '#123456', 18)
    expect(svg).toContain('#123456')
    expect(svg).toMatch(/width="18" height="18"/)
  })
})

describe('drawEmblem', () => {
  beforeAll(installPath2D)

  it('draws every emblem on a canvas', () => {
    for (const e of EMBLEMS) {
      const ctx = fakeCanvas()
      const paints: unknown[] = []
      for (const k of ['fillStyle', 'strokeStyle'])
        Object.defineProperty(ctx, k, { set: (v) => paints.push(v), get: () => '' })
      drawEmblem(ctx, e, '#123456', 12, 12, 24)
      expect(ctx.calls, e).toContain('save')
      expect(ctx.calls.filter((c) => c === 'fill' || c === 'stroke').length, e).toBeGreaterThan(0)
      expect(paints, e).toContain('#123456')
    }
  })
})
