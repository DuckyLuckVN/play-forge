import { describe, expect, it } from 'vitest'
import { eventSound, SHUTTLE_SOUNDS } from './sounds'
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
