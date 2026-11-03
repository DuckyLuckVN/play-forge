import { describe, expect, it } from 'vitest'
import { createState } from './sim'
import { beatSound, chordAt } from './sounds'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const tones = (x: unknown) => (Array.isArray(x) ? x : [x])

describe('Synthstride soundtrack', () => {
  it('changes chord every bar and loops after four', () => {
    expect(chordAt(0)).toEqual(chordAt(3))
    expect(chordAt(4)).not.toEqual(chordAt(0))
    expect(chordAt(16)).toEqual(chordAt(0))
  })

  it('every tone of a beat fits inside that beat (no pile-up at high tempo)', () => {
    const s = createState(me, 1)
    for (const tier of [0, 5, 9]) {
      s.tier = tier
      s.bpm = 100 + tier * 5.5
      for (let b = 0; b < 8; b++)
        for (const t of tones(beatSound(b, s, true))) expect(t.at ?? 0).toBeLessThan(60 / s.bpm)
    }
  })

  it('builds up: later tiers add layers', () => {
    const s = createState(me, 1)
    const calm = tones(beatSound(1, s, false)).length
    s.tier = 6
    expect(tones(beatSound(1, s, false)).length).toBeGreaterThan(calm)
  })
})
