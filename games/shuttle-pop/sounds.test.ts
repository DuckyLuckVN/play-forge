import { describe, expect, it } from 'vitest'
import type { Sound, Tone } from '@forge/audio/sound'
import { chargeSound, eventSound, SHUTTLE_SOUNDS, swingSound } from './sounds'
import type { SpEvent } from './sim'

const at = { id: 1, tick: 1 }

describe('eventSound', () => {
  it('hits sound by grade; a smash cracks', () => {
    expect(eventSound({ ...at, k: 'hit', side: 0, grade: 'perfect', shot: 'clear' }, 0)?.sound).toBe(
      SHUTTLE_SOUNDS.perfect,
    )
    expect(eventSound({ ...at, k: 'hit', side: 0, grade: 'good', shot: 'clear' }, 0)?.sound).toBe(
      SHUTTLE_SOUNDS.good,
    )
    expect(eventSound({ ...at, k: 'hit', side: 0, grade: 'late', shot: 'drop' }, 0)?.sound).toBe(
      SHUTTLE_SOUNDS.late,
    )
    expect(eventSound({ ...at, k: 'hit', side: 0, grade: 'good', shot: 'smash' }, 0)?.sound).toBe(
      SHUTTLE_SOUNDS.smash,
    )
  })

  it("the opponent's hits are quieter than ours", () => {
    const e: SpEvent = { ...at, k: 'hit', side: 1, grade: 'good', shot: 'drive' }
    expect(eventSound(e, 1)!.vol).toBeGreaterThan(eventSound(e, 0)!.vol)
  })

  it('a point is a win jingle for its side, a lose jingle for the other', () => {
    const e: SpEvent = { ...at, k: 'point', side: 1 }
    expect(eventSound(e, 1)?.sound).toBe(SHUTTLE_SOUNDS.pointWin)
    expect(eventSound(e, 0)?.sound).toBe(SHUTTLE_SOUNDS.pointLose)
  })

  it('net thud, landing tick, serve pop; whiffs are silent (the swing already whooshed)', () => {
    expect(eventSound({ ...at, k: 'net' }, 0)?.sound).toBe(SHUTTLE_SOUNDS.net)
    expect(eventSound({ ...at, k: 'land', x: 0, z: 1, in: true }, 0)?.sound).toBe(SHUTTLE_SOUNDS.land)
    expect(eventSound({ ...at, k: 'serve', side: 0 }, 0)?.sound).toBe(SHUTTLE_SOUNDS.serve)
    expect(eventSound({ ...at, k: 'whiff', side: 0 }, 0)).toBeNull()
  })
})

describe('power sounds (hold-to-charge)', () => {
  const hit = (grade: 'perfect' | 'good' | 'late', shot: 'smash' | 'drive', power?: number): SpEvent => ({
    ...at,
    k: 'hit',
    side: 0,
    grade,
    shot,
    charge: 1,
    ...(power === undefined ? {} : { power }),
  })

  it('an uncharged hit sounds exactly as before (old events without charge too)', () => {
    expect(eventSound(hit('good', 'drive'), 0)).toEqual(eventSound(hit('good', 'drive', 0), 0))
    expect(eventSound(hit('good', 'drive', 0), 0)?.sound).toBe(SHUTTLE_SOUNDS.good)
  })

  it('a charged hit adds a thwack and is louder the more it was charged', () => {
    const tap = eventSound(hit('good', 'drive', 0), 0)!
    const half = eventSound(hit('good', 'drive', 0.5), 0)!
    const full = eventSound(hit('good', 'drive', 1), 0)!
    expect(half.sound).not.toBe(tap.sound)
    expect(half.vol).toBeGreaterThan(tap.vol)
    expect(full.vol).toBeGreaterThan(half.vol)
  })

  it('a power smash (power >= popFrom) booms (with the crowd); a lesser smash cracks as before', () => {
    expect(eventSound(hit('perfect', 'smash', 1), 0)?.sound).toBe(SHUTTLE_SOUNDS.powerSmash)
    expect(eventSound(hit('perfect', 'smash', 0.5), 0)?.sound).not.toBe(SHUTTLE_SOUNDS.powerSmash)
    expect(eventSound(hit('perfect', 'smash'), 0)?.sound).toBe(SHUTTLE_SOUNDS.smash)
  })

  it('swing = whoosh + body at every charge; louder and lower the more it was charged', () => {
    const layers = (c: number) => swingSound(c) as Tone[]
    expect(layers(0).length).toBeGreaterThanOrEqual(2) // layered even for a tap
    const vol = (c: number) => layers(c).reduce((a, t) => a + (t.vol ?? 0), 0)
    expect(vol(0.5)).toBeGreaterThan(vol(0))
    expect(vol(1)).toBeGreaterThan(vol(0.5))
    expect(layers(1)[1].freq).toBeLessThan(layers(0)[1].freq) // heavier body
    expect(layers(1)[0].dur).toBeGreaterThan(layers(0)[0].dur)
  })

  it('the same charge step returns the same precomputed sound (no allocation per swing)', () => {
    expect(swingSound(0.98)).toBe(swingSound(1))
    expect(swingSound(NaN)).toBe(swingSound(0))
  })

  it('charging rises in pitch stage by stage and tings at full; no sound before it starts', () => {
    expect(chargeSound(0)).toBeNull()
    const pitch = (n: number) => {
      const s = chargeSound(n)!
      return (Array.isArray(s) ? s[0] : s).freq
    }
    expect(pitch(2)).toBeGreaterThan(pitch(1))
    expect(chargeSound(3)).toBe(SHUTTLE_SOUNDS.chargeFull)
  })
})

describe('sound headroom', () => {
  /** engine/audio/sound.ts applyLevels: the sfx bus gain at sfx 1.0 is curve(1) × 0.5. */
  const SFX_BUS = 0.5
  /** Loudest moment: the tones sounding together right at the onset (start within 50 ms). */
  const onsetPeak = (s: Sound) =>
    (Array.isArray(s) ? s : [s]).filter((t) => (t.at ?? 0) <= 0.05).reduce((a, t) => a + (t.vol ?? 0.6), 0)

  it('every hit, at any grade / shot / charge, peaks at most 1.0 at full effects volume', () => {
    for (const grade of ['perfect', 'good', 'late'] as const)
      for (const shot of ['smash', 'drive', 'clear', 'drop'] as const)
        for (const power of [0, 0.5, 1]) {
          const r = eventSound({ ...at, k: 'hit', side: 0, grade, shot, charge: power, power }, 0)!
          expect(onsetPeak(r.sound) * r.vol * SFX_BUS, `${grade} ${shot} ${power}`).toBeLessThanOrEqual(1)
        }
  })

  it('every swing step peaks at most 1.0 at full effects volume', () => {
    for (const c of [0, 0.25, 0.5, 0.75, 1])
      expect(onsetPeak(swingSound(c)) * SFX_BUS, `charge ${c}`).toBeLessThanOrEqual(1)
  })

  it('the power smash is not boosted on top (its layers are the boost)', () => {
    expect(
      eventSound({ ...at, k: 'hit', side: 0, grade: 'perfect', shot: 'smash', charge: 1, power: 1 }, 0)!.vol,
    ).toBe(1)
  })
})
