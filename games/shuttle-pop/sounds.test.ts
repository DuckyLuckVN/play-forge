import { describe, expect, it } from 'vitest'
import type { Sound, Tone } from '@forge/audio/sound'
import {
  actionSound,
  type ActionSoundKind,
  chargeSound,
  eventSound,
  hitSound,
  SHUTTLE_SOUNDS,
  SMASH_LAND,
  SWING,
  swingSound,
} from './sounds'
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

  it('power 0 / missing sounds exactly as before (same object)', () => {
    expect(hitSound('drive', 'good', 0, true).sound).toBe(SHUTTLE_SOUNDS.good)
    expect(hitSound('smash', 'good', undefined, true).sound).toBe(SHUTTLE_SOUNDS.smash)
  })

  it('more power = more layers and more volume, smash included', () => {
    const n = (p: number) => (hitSound('smash', 'good', p, true).sound as Tone[]).length
    expect(n(0.5)).toBeGreaterThan(n(0))
    expect(hitSound('clear', 'good', 0.8, true).vol).toBeGreaterThan(hitSound('clear', 'good', 0.4, true).vol)
  })

  it('a power hit of any shot carries the sting, after the onset', () => {
    for (const shot of ['smash', 'drive', 'clear', 'drop'] as const) {
      const s = hitSound(shot, 'perfect', 1, true).sound as Tone[]
      expect(s, shot).toEqual(expect.arrayContaining(SHUTTLE_SOUNDS.powerSting))
    }
    for (const t of SHUTTLE_SOUNDS.powerSting) expect(t.at ?? 0).toBeGreaterThan(0.05)
    expect(hitSound('drive', 'good', 0.5, true).sound).not.toEqual(
      expect.arrayContaining(SHUTTLE_SOUNDS.powerSting),
    )
  })

  it('theirs stays quieter than ours, power smash included', () => {
    expect(hitSound('smash', 'perfect', 1, false).vol).toBeLessThan(hitSound('smash', 'perfect', 1, true).vol)
  })

  it('a smash landing thumps, harder with power; other landings tick as before', () => {
    const land: SpEvent = { ...at, k: 'land', x: 0, z: 1, in: true }
    expect(eventSound(land, 0)?.sound).toBe(SHUTTLE_SOUNDS.land)
    expect(eventSound(land, 0, { shot: 'clear', power: 1 })?.sound).toBe(SHUTTLE_SOUNDS.land)
    const peak = (p: number) =>
      (eventSound(land, 0, { shot: 'smash', power: p })!.sound as Tone[]).reduce(
        (a, t) => a + (t.vol ?? 0),
        0,
      )
    expect(peak(1)).toBeGreaterThan(peak(0))
    expect(peak(0)).toBeGreaterThan(SHUTTLE_SOUNDS.land.vol!)
    expect((eventSound(land, 0, { shot: 'smash', power: 0 })!.sound as Tone[])[0]).toBe(SHUTTLE_SOUNDS.land)
  })

  it('NaN / out-of-range power never yields a NaN or non-positive frequency', () => {
    for (const p of [NaN, -1, 3])
      for (const t of hitSound('smash', 'late', p, true).sound as Tone[]) {
        expect(t.freq).toBeGreaterThan(0)
        if (t.to !== undefined) expect(t.to).toBeGreaterThan(0)
      }
  })

  it('a power smash (power >= popFrom) booms (with the crowd); a lesser smash cracks as before', () => {
    expect(eventSound(hit('perfect', 'smash', 1), 0)?.sound).toEqual(
      expect.arrayContaining(SHUTTLE_SOUNDS.powerSmash),
    )
    expect(eventSound(hit('perfect', 'smash', 0.5), 0)?.sound).not.toEqual(
      expect.arrayContaining(SHUTTLE_SOUNDS.powerSmash),
    )
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

describe('actionSound', () => {
  const KINDS: ActionSoundKind[] = ['jump', 'jumpLand', 'dive', 'diveLand', 'bonk']
  it('every action has its own sound; theirs is quieter', () => {
    const sounds = KINDS.map((k) => actionSound(k, true).sound)
    expect(new Set(sounds).size).toBe(KINDS.length)
    for (const k of KINDS) expect(actionSound(k, false).vol).toBeLessThan(actionSound(k, true).vol)
  })
  it('landings are heavy (a low body under 130 Hz)', () => {
    for (const k of ['jumpLand', 'diveLand'] as const)
      expect((actionSound(k, true).sound as Tone[]).some((t) => t.wave === 'sine' && t.freq < 130)).toBe(true)
  })
})

describe('sound headroom', () => {
  /** engine/audio/sound.ts applyLevels: the sfx bus gain at sfx 1.0 is curve(1) × 0.5. */
  const SFX_BUS = 0.5
  /** Loudest moment: the tones sounding together right at the onset (start within 50 ms). */
  const onsetPeak = (s: Sound) =>
    (Array.isArray(s) ? s : [s]).filter((t) => (t.at ?? 0) <= 0.05).reduce((a, t) => a + (t.vol ?? 0.6), 0)

  it('every hit, at any grade / shot / power / side, peaks at most 1.0 at full effects volume', () => {
    for (const grade of ['perfect', 'good', 'late'] as const)
      for (const shot of ['smash', 'drive', 'clear', 'drop'] as const)
        for (const power of [0, 0.25, 0.5, 0.75, 0.9, 1])
          for (const mine of [true, false]) {
            const r = hitSound(shot, grade, power, mine)
            expect(
              onsetPeak(r.sound) * r.vol * SFX_BUS,
              `${grade} ${shot} ${power} ${mine}`,
            ).toBeLessThanOrEqual(1)
          }
  })

  it('every action sound peaks at most 1.0 at full effects volume', () => {
    for (const k of ['jump', 'jumpLand', 'dive', 'diveLand', 'bonk'] as const) {
      const r = actionSound(k, true)
      expect(onsetPeak(r.sound) * r.vol * SFX_BUS, k).toBeLessThanOrEqual(1)
    }
  })

  it('every smash landing step peaks at most 1.0 at full effects volume', () => {
    SMASH_LAND.forEach((s, i) => expect(onsetPeak(s) * SFX_BUS, `step ${i}`).toBeLessThanOrEqual(1))
  })

  it('every swing step peaks at most 1.0 at full effects volume', () => {
    for (const c of [0, 0.25, 0.5, 0.75, 1])
      expect(onsetPeak(swingSound(c)) * SFX_BUS, `charge ${c}`).toBeLessThanOrEqual(1)
    SWING.forEach((s, i) => expect(onsetPeak(s) * SFX_BUS, `step ${i}`).toBeLessThanOrEqual(1))
  })

  it('the power smash is not boosted on top (its layers are the boost)', () => {
    expect(
      eventSound({ ...at, k: 'hit', side: 0, grade: 'perfect', shot: 'smash', charge: 1, power: 1 }, 0)!.vol,
    ).toBe(1)
  })
})
