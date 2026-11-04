import { describe, expect, it } from 'vitest'
import { createState, type StrideEvent } from './sim'
import { beatSound, chordAt, delayed, eventSound, type BeatMix } from './sounds'
import { BUILD_BEATS, INTRO_BEATS, VERSE_BEATS } from './song'

const player = (i: number) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })
const tones = (x: unknown) => (Array.isArray(x) ? x : [x])
const mix = (over: Partial<BeatMix> = {}): BeatMix => ({
  bpm: 100,
  tier: 0,
  overdrive: false,
  strikeNext: false,
  ...over,
})
const verse = INTRO_BEATS + 1
const build = INTRO_BEATS + VERSE_BEATS + 1
const drop = INTRO_BEATS + VERSE_BEATS + BUILD_BEATS + 1

describe('Synthstride soundtrack', () => {
  it('changes chord every bar and loops after four', () => {
    expect(chordAt(0)).toEqual(chordAt(3))
    expect(chordAt(4)).not.toEqual(chordAt(0))
    expect(chordAt(16)).toEqual(chordAt(0))
  })

  it('every tone of a beat fits inside that beat (no pile-up at high tempo)', () => {
    for (const [tier, bpm] of [
      [0, 100],
      [5, 130],
      [9, 175],
    ])
      for (let b = 0; b < 60; b++)
        for (const t of tones(beatSound(b, mix({ tier, bpm, strikeNext: true }))))
          expect(t.at ?? 0).toBeLessThan(60 / bpm)
  })

  it('builds up: later tiers add layers; build-ups rise and drops add a lead', () => {
    const calm = tones(beatSound(verse, mix())).length
    expect(tones(beatSound(verse, mix({ tier: 6 }))).length).toBeGreaterThan(calm)
    expect(tones(beatSound(build, mix())).length).toBeGreaterThan(calm)
    expect(tones(beatSound(drop, mix())).length).toBeGreaterThan(calm)
  })

  it('delays a sound by shifting every tone', () => {
    expect(
      delayed(
        [
          { freq: 1, dur: 1 },
          { freq: 2, dur: 1, at: 0.1 },
        ],
        0.5,
      ).map((t) => t.at),
    ).toEqual([0.5, 0.6])
  })

  it("you hear your own events and your board's, not other players'", () => {
    const s = createState([player(0), player(1)], 1, { mode: 'race' })
    const hit = (p: string): StrideEvent => ({ type: 'hit', p })
    expect(eventSound(hit('p0'), s, 'p0')).not.toBeNull()
    expect(eventSound(hit('p1'), s, 'p0')).toBeNull()
    expect(eventSound({ type: 'warn', b: 0, id: 1, lead: 2 }, s, 'p0')).not.toBeNull()
    expect(eventSound({ type: 'warn', b: 1, id: 1, lead: 2 }, s, 'p0')).toBeNull()
    expect(eventSound({ type: 'beat', beat: 3 }, s, 'p0')).toBeNull() // scheduled separately
  })
})
