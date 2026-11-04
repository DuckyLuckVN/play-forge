import { describe, expect, it } from 'vitest'
import { bpmAt, BUILD_BEATS, CYCLE_BEATS, INTRO_BEATS, sectionAt, VERSE_BEATS } from './song'

describe('song', () => {
  it('runs intro, then verse → build → drop, looping', () => {
    expect(sectionAt(0)).toBe('intro')
    expect(sectionAt(INTRO_BEATS)).toBe('verse')
    expect(sectionAt(INTRO_BEATS + VERSE_BEATS)).toBe('build')
    expect(sectionAt(INTRO_BEATS + VERSE_BEATS + BUILD_BEATS)).toBe('drop')
    expect(sectionAt(INTRO_BEATS + CYCLE_BEATS)).toBe('verse')
    expect(sectionAt(INTRO_BEATS + CYCLE_BEATS - 1)).toBe('drop')
  })

  it('has a tempo range per choice', () => {
    expect([bpmAt(0, 9, 'chill'), bpmAt(9, 9, 'chill')]).toEqual([90, 130])
    expect([bpmAt(0, 9, 'normal'), bpmAt(9, 9, 'normal')]).toEqual([100, 150])
    expect([bpmAt(0, 9, 'hyper'), bpmAt(9, 9, 'hyper')]).toEqual([120, 175])
    expect(bpmAt(20, 9, 'hyper')).toBe(175)
  })
})
