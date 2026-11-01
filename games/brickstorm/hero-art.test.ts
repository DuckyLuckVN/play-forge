import { describe, expect, it } from 'vitest'
import { heroEmblem, heroPortrait } from './hero-art'
import { HEROES, HERO_IDS, type HeroEmblem, type HeroHat } from './sim/heroes'

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
  'none',
]
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

/** Drops the per-call gradient ids so markup compares by look only. */
const norm = (svg: string) => svg.replace(/bs-hero-[\w-]+/g, 'ID')

describe('heroPortrait', () => {
  it('draws an SVG in the hero colour for every hero', () => {
    for (const id of HERO_IDS) {
      const svg = heroPortrait(HEROES[id])
      expect(svg, id).toMatch(/^<svg[^>]*viewBox="0 0 64 64"/)
      expect(svg, id).toContain(HEROES[id].color)
    }
  })

  it('gives every hero a distinct portrait', () => {
    const all = HERO_IDS.map((id) => norm(heroPortrait(HEROES[id])))
    expect(new Set(all).size).toBe(all.length)
  })

  it('uses unique gradient ids per call', () => {
    const def = HEROES[HERO_IDS[0]]
    expect(heroPortrait(def)).not.toBe(heroPortrait(def))
  })

  it('respects size', () => {
    expect(heroPortrait(HEROES[HERO_IDS[0]], 40)).toMatch(/width="40" height="40"/)
  })

  it('draws every hat distinctly', () => {
    const base = HEROES[HERO_IDS[0]]
    const all = HATS.map((hat) => norm(heroPortrait({ ...base, hat })))
    expect(new Set(all).size).toBe(HATS.length)
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
