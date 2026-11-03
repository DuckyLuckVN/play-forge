import { describe, expect, it } from 'vitest'
import { Moments } from './moments'
import { createState, type DriftEvent, type DriftState } from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const t = (en: string, p?: Record<string, string | number>) =>
  p ? en.replace(/\{(\w+)\}/g, (_, k) => String(p[k])) : en

function tickWith(s: DriftState, events: DriftEvent[], patch: Partial<DriftState> = {}) {
  s.tick++
  s.events = events
  Object.assign(s, patch)
  return s
}

const texts = (m: Moments, s: DriftState) => m.update(s).map((x) => x.text)

describe('Moments', () => {
  it('celebrates every kilometre once', () => {
    const m = new Moments(0, t)
    const s = createState(me, 1)
    expect(texts(m, tickWith(s, [], { dist: 999 }))).toEqual([])
    expect(texts(m, tickWith(s, [], { dist: 1001 }))).toEqual(['1 KM!'])
    expect(texts(m, tickWith(s, [], { dist: 1500 }))).toEqual([])
    expect(texts(m, tickWith(s, [], { dist: 2000 }))).toEqual(['2 KM!'])
  })

  it('calls a new best once, only if there was a best to beat', () => {
    const fresh = new Moments(0, t)
    const s0 = createState(me, 1)
    expect(texts(fresh, tickWith(s0, [], { score: 50 }))).toEqual([])
    const m = new Moments(100, t)
    const s = createState(me, 1)
    expect(texts(m, tickWith(s, [], { score: 99 }))).toEqual([])
    expect(texts(m, tickWith(s, [], { score: 101 }))).toEqual(['NEW BEST!'])
    expect(texts(m, tickWith(s, [], { score: 300 }))).toEqual([])
  })

  it('names near-miss streaks, reset by a hit', () => {
    const m = new Moments(0, t)
    const s = createState(me, 1)
    const nm: DriftEvent = { type: 'nearMiss', lane: 0, points: 50 }
    const seen: string[] = []
    for (let i = 0; i < 5; i++) seen.push(...texts(m, tickWith(s, [nm])))
    expect(seen).toEqual(['DAREDEVIL!'])
    m.update(tickWith(s, [{ type: 'hit' }]))
    seen.length = 0
    for (let i = 0; i < 10; i++) seen.push(...texts(m, tickWith(s, [nm])))
    expect(seen).toEqual(['DAREDEVIL!', 'UNTOUCHABLE!'])
  })

  it('announces speed tiers with km/h, max combo, the rift widening and Phantom', () => {
    const m = new Moments(0, t)
    const s = createState(me, 1)
    expect(texts(m, tickWith(s, [{ type: 'tier', tier: 1 }], { speed: 50 }))).toEqual(['SPEED UP! 180 km/h'])
    expect(texts(m, tickWith(s, [{ type: 'multiplier', mult: 3 }]))).toEqual([])
    expect(texts(m, tickWith(s, [{ type: 'multiplier', mult: 5 }]))).toEqual(['MAX COMBO ×5!'])
    expect(texts(m, tickWith(s, [{ type: 'lanes', lanes: 4 }]))).toEqual(['THE RIFT WIDENS!'])
    expect(texts(m, tickWith(s, [{ type: 'phantom' }]))).toEqual(['PHANTOM!'])
  })

  it('starts over on a new run', () => {
    const m = new Moments(0, t)
    const s = createState(me, 1)
    m.update(tickWith(s, [], { dist: 1200 }))
    const again = createState(me, 2)
    expect(texts(m, tickWith(again, [], { dist: 1100 }))).toEqual(['1 KM!'])
  })
})
