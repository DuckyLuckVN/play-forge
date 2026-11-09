import { describe, expect, it } from 'vitest'
import { createState } from './sim'
import {
  DRIFT_SOUNDS,
  eventSound,
  MORE_SOUNDS,
  multiplierSound,
  nearMissSound,
  warnBeeps,
  wispSound,
} from './sounds'

const tones = (s: unknown) => (Array.isArray(s) ? s : [s]) as { freq: number; at?: number }[]

describe('Phantom Drift sounds', () => {
  it('warning beeps speed up and all land before the slam', () => {
    for (const seconds of [0.35, 0.5, 0.8]) {
      const beeps = tones(warnBeeps(seconds))
      expect(beeps.length).toBeGreaterThanOrEqual(3)
      const at = beeps.map((b) => b.at ?? 0)
      expect(Math.max(...at)).toBeLessThan(seconds)
      const gaps = at.slice(1).map((a, i) => a - at[i])
      for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1])
      const freqs = beeps.map((b) => b.freq)
      expect([...freqs].sort((a, b) => a - b)).toEqual(freqs)
    }
  })

  it('climbs in pitch with combo, capped', () => {
    expect(tones(wispSound(5))[0].freq).toBeGreaterThan(tones(wispSound(0))[0].freq)
    expect(tones(wispSound(40))[0].freq).toBe(tones(wispSound(12))[0].freq)
    expect(tones(nearMissSound(8))[1].freq).toBeGreaterThan(tones(nearMissSound(0))[1].freq)
  })

  it('plays a longer arpeggio for higher multipliers', () => {
    expect(tones(multiplierSound(3)).length).toBeGreaterThan(tones(multiplierSound(2)).length)
  })
})

describe('eventSound', () => {
  const s = createState([{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }], 1)
  it('maps every audible event and keeps others silent', () => {
    expect(eventSound({ type: 'hit' }, s)).toBe(MORE_SOUNDS.crack)
    expect(eventSound({ type: 'warn', lane: 1, ticks: 30 }, s)).toEqual(warnBeeps(0.5))
    expect(eventSound({ type: 'move' }, s)).not.toBeNull()
    expect(eventSound({ type: 'over' }, s)).toBeNull()
    // A heart pickup: the heal chime and more.
    const heart = tones(eventSound({ type: 'heart', lane: 0 }, s))
    expect(heart.length).toBeGreaterThan(DRIFT_SOUNDS.heal.length)
  })
})
