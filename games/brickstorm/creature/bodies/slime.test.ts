import { describe, expect, it, vi } from 'vitest'
import type { Mood } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import type { CreatureLook } from '../types'
import {
  DRAW_CASES,
  HOLD,
  MOODS,
  caseFrame,
  drawLog,
  frame,
  handsOf,
  held,
  kitFor,
  toBox,
  worstHold,
} from './body-fixtures'
import { BODIES } from './index'
import { faceBoxOf, slime, slimeJellies } from './slime'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const look = CREATURE_LOOKS.baron!
const CAST: Array<[HeroId, string, string]> = [
  ['baron', 'gold', 'coinflip'],
  ['frost', 'snow', 'flurry'],
  ['juggler', 'twins', 'juggle'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]!] as const)
const twins = CREATURE_LOOKS.juggler!
const snow = CREATURE_LOOKS.frost!
/** Gold-only paint: coin flecks, the belt, the coin. */
const COIN_PAINT = ['#fff1a8', '#7a4a06', '#ffd43b']
/** Every fill colour a draw sets. */
function fillsOf(l: CreatureLook, f = frame()): string[] {
  const fills: string[] = []
  const c = new Proxy(fakeCanvas(), {
    set: (t, k, v) => {
      if (k === 'fillStyle') fills.push(String(v))
      return Reflect.set(t, k, v)
    },
  })
  slime.draw(c, l, f, kitFor(slime, l, f).kit)
  return fills
}

describe('slime body (Goldie)', () => {
  it('is registered, and baron is a gold slime that flips a coin', () => {
    expect(BODIES.slime).toBe(slime)
    expect(look).toEqual({
      body: 'slime',
      variant: 'gold',
      main: '#fcc419',
      second: '#c77d0a',
      hand: '#ffe08a',
      eye: '#141a2e',
      signature: 'coinflip',
    })
  })

  it('is armless, stands within ±20% of the old figure, with sockets at the blob sides', () => {
    const m = slime.metrics(look, frame({ still: true }))
    expect(m.armed).toBe(false)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.socketF.x).toBeCloseTo(16, 6)
    expect(m.socketF.y).toBeCloseTo(-22, 6)
    expect(m.socketB.x).toBeCloseTo(-16, 6)
    expect(m.socketB.y).toBeCloseTo(-22, 6)
    expect(Math.hypot(HOLD.x - m.socketF.x, HOLD.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
  })

  it('draws each variant in every mood, eye style, still and fidget case, back hand first, with its hat', () => {
    for (const [, l] of LOOKS)
      for (const c of DRAW_CASES) {
        const f = caseFrame(c)
        const { kit, calls } = kitFor(slime, l, f)
        expect(() => slime.draw(fakeCanvas(), l, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('floating hands stay near the blob (within two hand widths) in every free pose', () => {
    for (const mood of MOODS) {
      if (mood === 'throw' || mood === 'ko') continue
      for (const t of [0, 0.7, 1.9]) {
        const f = frame({ mood, t, moodAge: 0.5 })
        const m = slime.metrics(look, f)
        const h = handsOf(slime, look, f)
        for (const hand of [h.front, h.back]) expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
      }
    }
  })

  it('raises both hands on cheer, pump and cast', () => {
    for (const mood of ['cheer', 'pump', 'cast'] as Mood[]) {
      const f = frame({ mood })
      const m = slime.metrics(look, f)
      const h = handsOf(slime, look, f)
      expect(h.front.y).toBeLessThan(m.socketF.y)
      expect(h.back.y).toBeLessThan(m.socketB.y)
    }
  })

  it('melts to a puddle as pose.fall goes 0 → 1 (KO), hands flopped by its sides', () => {
    const up = slime.metrics(look, frame())
    const half = slime.metrics(look, frame({ mood: 'ko', pose: { fall: 0.5 } }))
    const down = slime.metrics(look, frame({ mood: 'ko', pose: { fall: 1 } }))
    expect(half.headTop).toBeGreaterThan(up.headTop)
    expect(down.headTop).toBeGreaterThan(half.headTop)
    expect(down.headTop).toBeGreaterThan(-20)
    expect(down.bodyBox.w).toBeGreaterThan(up.bodyBox.w * 1.2)
    const f = frame({ mood: 'ko', pose: { fall: 1 } })
    const h = handsOf(slime, look, f)
    for (const hand of [h.front, h.back]) expect(hand.y).toBeGreaterThan(-8)
  })

  it('the jelly lags hops: the top trails the body when it hops', () => {
    const rest = slime.metrics(look, frame())
    const hop = slime.metrics(look, frame({ hop: -10 }))
    expect(hop.headTop).toBeGreaterThan(rest.headTop)
    // The top squashes more than the base (the extra 0.5× on the top).
    const sq = slime.metrics(look, frame({ squash: -4 }))
    expect(sq.headTop).toBeGreaterThan(rest.headTop)
  })

  it('splats on hurt (wider and flatter)', () => {
    const rest = slime.metrics(look, frame())
    const hurt = slime.metrics(look, frame({ mood: 'hurt', moodAge: 0.05 }))
    expect(hurt.bodyBox.w).toBeGreaterThan(rest.bodyBox.w)
    expect(hurt.headTop).toBeGreaterThan(rest.headTop)
  })

  it('freezes its idle loops under reduced motion (same drawing at any time)', () => {
    for (const [, l] of LOOKS) {
      const drawAt = (t: number, fidget = 0) => drawLog(slime, l, frame({ t, still: true, fidget }))
      expect(drawAt(1)).toBe(drawAt(5.5))
      expect(drawAt(1, 0.5)).toBe(drawAt(1))
    }
  })

  it('wobbles each bulge on its own phase when moving', () => {
    for (const [, l] of LOOKS)
      expect(drawLog(slime, l, frame({ t: 1 }))).not.toBe(drawLog(slime, l, frame({ t: 1.4 })))
  })
  it('frost and the juggler are slimes with their own variant and signature', () => {
    for (const [id, variant, signature] of CAST) {
      const l = CREATURE_LOOKS[id]!
      expect(l).toMatchObject({ body: 'slime', variant, signature })
      for (const c of [l.main, l.second, l.hand, l.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('every variant stands within ±20% of the old figure, the ball in reach of the front hand', () => {
    for (const [, l] of LOOKS) {
      const m = slime.metrics(l, held({ still: true }))
      expect(m.armed).toBe(false)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      for (const b of [HOLD, { x: 12, y: -14 }])
        expect(Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    }
  })

  it('only the gold slime has coins, a coin buckle and the belt', () => {
    const paintOf = (l: CreatureLook) => fillsOf(l, frame({ fidget: 0.5 }))
    for (const c of COIN_PAINT) expect(paintOf(look)).toContain(c)
    for (const l of [snow, twins]) for (const c of COIN_PAINT) expect(paintOf(l)).not.toContain(c)
  })

  it('the twins stand side by side: the front hand on the front twin, the back hand on the back twin, one hat', () => {
    const m = slime.metrics(twins, held({ still: true }))
    expect(m.socketF.x - m.socketB.x).toBeGreaterThan(20)
    // The pair keeps one slime's footprint: centred, within ±26 (one slime is ±24); a hurt splat spreads a little more.
    for (const t of [0, 0.5, 1.3, 2.1])
      for (const [mood, w] of [
        ['idle', 26],
        ['watch', 26],
        ['cheer', 26],
        ['hurt', 28],
      ] as Array<[Mood, number]>) {
        const b = slime.metrics(twins, frame({ t, mood, moodAge: 0.2 })).bodyBox
        expect(b.x).toBeGreaterThanOrEqual(-w)
        expect(b.x + b.w).toBeLessThanOrEqual(w)
      }
    const { calls, kit } = kitFor(slime, twins, held())
    slime.draw(fakeCanvas(), twins, held(), kit)
    // One hat, on the back twin (the front twin's would cover its face); the front twin has a jelly curl.
    expect(calls.filter((c) => c === 'hat').length).toBe(1)
  })

  it('the back twin waves now and then while the front twin holds the ball; hands never enter a face', () => {
    const ts = Array.from({ length: 40 }, (_, i) => i * 0.25)
    const backs = ts.map((t) => {
      const f = held({ t })
      const m = slime.metrics(twins, f)
      const h = handsOf(slime, twins, f)
      expect(h.front.x).toBeCloseTo(HOLD.x, 6)
      expect(h.front.y).toBeCloseTo(HOLD.y, 6)
      return h.back.y - m.socketB.y
    })
    expect(Math.min(...backs)).toBeLessThan(-4)
    expect(Math.max(...backs)).toBeGreaterThan(4)
    // Reduced motion: no wave.
    for (const t of ts) {
      const f = held({ t, still: true })
      expect(handsOf(slime, twins, f).back.y).toBeGreaterThan(slime.metrics(twins, f).socketB.y)
    }
    for (const mood of MOODS) {
      if (mood === 'throw' || mood === 'ko') continue
      for (const t of [0, 0.7, 1.9]) {
        const f = frame({ mood, t, moodAge: 0.5 })
        const m = slime.metrics(twins, f)
        const h = handsOf(slime, twins, f)
        // Out of each twin's own face (and the solver's box round both).
        const faces = [m.head, ...slimeJellies(twins, f).map(faceBoxOf)]
        for (const hand of [h.front, h.back]) {
          for (const e of faces)
            expect(Math.hypot((hand.x - e.x) / e.rx, (hand.y - e.y) / e.ry)).toBeGreaterThan(1)
          expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
        }
      }
    }
  })

  it('cheers with its own flourish per variant, plays its signature, and has its own KO', () => {
    const cheer = LOOKS.map(([, l]) =>
      drawLog(slime, l, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' })),
    )
    expect(new Set(cheer).size).toBe(LOOKS.length)
    for (const [, l] of LOOKS)
      expect(drawLog(slime, l, held({ fidget: 0.5 }))).not.toBe(drawLog(slime, l, held()))
    // Same colours on the gold body: the snow pile and the twins' flop draw their own KO.
    const ko = frame({ mood: 'ko', moodAge: 2, eyes: 'xx', pose: { fall: 1 } })
    for (const l of [snow, twins]) {
      expect(drawLog(slime, l, ko)).not.toBe(
        drawLog(slime, { ...look, main: l.main, second: l.second, hand: l.hand }, ko),
      )
      expect(slime.metrics(l, ko).headTop).toBeGreaterThan(-24)
    }
  })

  it('every variant holds the ball exactly in the front hand, mirrored and bigger too', () => {
    for (const [id] of CAST) {
      const worst = worstHold(id)
      expect(worst).not.toBeNull()
      expect(worst!).toBeLessThan(0.01)
    }
  })
})
