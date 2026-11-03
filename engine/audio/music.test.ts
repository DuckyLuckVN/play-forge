import { describe, expect, it } from 'vitest'
import { musicMuted, noteToMidi, parseSteps } from './music'
import { ARCADE, LOUNGE } from './tracks'

describe('music', () => {
  it('parses notes', () => {
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('C#4')).toBe(61)
    expect(noteToMidi('Bb3')).toBe(58)
  })

  it('extends notes over holds', () => {
    const steps = parseSteps('C4 - - . x E4+G4')
    expect(steps[0]).toEqual({ notes: [60], len: 3 })
    expect(steps[3].notes).toBeNull()
    expect(steps[4]).toEqual({ notes: [], len: 1 })
    expect(steps[5].notes).toEqual([64, 67])
  })

  it('stock tracks parse and every part loops in whole bars', () => {
    for (const track of [LOUNGE, ARCADE]) {
      const lengths = track.parts.map((p) => parseSteps(p.steps).length)
      const longest = Math.max(...lengths)
      for (const len of lengths) {
        expect(len % 8).toBe(0)
        expect(longest % len).toBe(0)
      }
    }
  })
})

describe('debug mode', () => {
  it('mutes music when the page is opened with ?debug', () => {
    expect(musicMuted('?debug')).toBe(true)
    expect(musicMuted('?seed=3&debug')).toBe(true)
    expect(musicMuted('?seed=3')).toBe(false)
    expect(musicMuted('')).toBe(false)
  })
})
