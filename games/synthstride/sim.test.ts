import { describe, expect, it } from 'vitest'
import {
  beatTicks,
  bpmAt,
  createState,
  DEATH_TICKS,
  DROP_COST,
  neighbours,
  PERFECT_TICKS,
  POINTS,
  STRIKE_GRACE,
  step,
  survivable,
  tileAt,
  type Strike,
  type StrideInput,
  type StrideState,
} from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const run = (s: StrideState, input?: StrideInput) => step(s, input ? [{ player: 'p0', input }] : [])
const untilBeat = (s: StrideState, beat: number) => {
  while (s.beat < beat && !s.over) run(s)
  return s
}
/** A state with no strikes or notes scheduled by chance. */
function quiet(): StrideState {
  const s = createState(me, 3)
  s.rng = { seed: 0 }
  return s
}
const strike = (tiles: number[], beat: number, id = 50): Strike => ({
  id,
  kind: 'tiles',
  tiles,
  warnBeat: beat - 2,
  beat,
})

describe('Synthstride sim', () => {
  it('beats arrive at the tempo', () => {
    const s = createState(me, 1)
    untilBeat(s, 0)
    const first = s.tick
    untilBeat(s, 4)
    expect(s.tick - first).toBeCloseTo(4 * beatTicks(s), -1)
    expect(bpmAt(0)).toBe(100)
    expect(bpmAt(9)).toBe(150)
  })

  it('a move right on the beat is Perfect and scores; off the beat resets the groove', () => {
    const s = createState(me, 1)
    untilBeat(s, 0)
    run(s, 'right') // 1 tick after the beat
    const mv = s.events.find((e) => e.type === 'move')
    expect(mv).toMatchObject({ rating: 'perfect', points: POINTS.perfect })
    expect(s.vitals.combo).toBe(1)
    // Halfway between beats: off.
    while (s.tick - s.lastBeatTick < Math.round(beatTicks(s) / 2)) run(s)
    run(s, 'left')
    expect(s.events.find((e) => e.type === 'move')).toMatchObject({ rating: 'off', points: 0 })
    expect(s.vitals.combo).toBe(0)
  })

  it('a second move in the same beat window is not rated twice', () => {
    const s = createState(me, 1)
    untilBeat(s, 0)
    run(s, 'right')
    run(s, 'right')
    expect(s.events.find((e) => e.type === 'move')).toMatchObject({ rating: null, points: 0 })
    expect(s.vitals.combo).toBe(1)
  })

  it('a move just before the beat counts for the coming beat', () => {
    const s = createState(me, 1)
    untilBeat(s, 0)
    const next = s.lastBeatTick + Math.round(beatTicks(s))
    while (s.tick < next - PERFECT_TICKS + 1) run(s)
    run(s, 'up')
    expect(s.events.find((e) => e.type === 'move')).toMatchObject({ rating: 'perfect' })
  })

  it('does not walk off the board', () => {
    const s = createState(me, 1)
    s.pos = tileAt(0, 0)
    run(s, 'left')
    run(s, 'up')
    expect(s.pos).toBe(tileAt(0, 0))
  })

  it('a strike hurts whoever stands in it after the grace, not before', () => {
    const s = quiet()
    s.pos = tileAt(0, 0)
    s.strikes = [strike([tileAt(0, 0)], 2)]
    untilBeat(s, 2)
    expect(s.vitals.hearts).toBe(3)
    // Step out within the grace: safe.
    for (let i = 0; i < STRIKE_GRACE - 2; i++) run(s)
    run(s, 'right')
    for (let i = 0; i < 20; i++) run(s)
    expect(s.vitals.hearts).toBe(3)
    expect(s.stats.dodges).toBe(1)
  })

  it('standing in a strike costs a heart', () => {
    const s = quiet()
    s.pos = tileAt(2, 2)
    s.strikes = [strike([tileAt(2, 2)], 1)]
    untilBeat(s, 1)
    for (let i = 0; i < 20; i++) run(s)
    expect(s.vitals.hearts).toBe(2)
  })

  it('stepping on a note on the beat scores extra and charges the Drop', () => {
    const s = quiet()
    untilBeat(s, 0)
    s.notes = [{ id: 9, tile: s.pos + 1, until: 99 }]
    run(s, 'right')
    expect(s.stats.notes).toBe(1)
    expect(s.charge).toBe(1)
    expect(s.events.find((e) => e.type === 'note')).toMatchObject({ points: POINTS.note + POINTS.noteOnBeat })
  })

  it('the Drop needs a full charge and makes you immune with double points', () => {
    const s = quiet()
    untilBeat(s, 0)
    run(s, 'drop')
    expect(s.dropUntil).toBe(-1)
    s.charge = DROP_COST
    run(s, 'drop')
    expect(s.dropUntil).toBe(s.beat + 8)
    s.strikes = [strike([s.pos], s.beat + 1)]
    untilBeat(s, s.beat + 2)
    expect(s.vitals.hearts).toBe(3)
  })

  it('survivable() finds a way out, and refuses a full-board strike', () => {
    expect(neighbours(tileAt(0, 0)).sort()).toEqual([0, 1, 4])
    const all = Array.from({ length: 16 }, (_, t) => t)
    expect(survivable(0, 0, [], strike(all, 2))).toBe(false)
    // Corner, row 0 then column 0 struck on consecutive beats: step diagonal-ish.
    const row0 = [0, 1, 2, 3]
    const col0 = [0, 4, 8, 12]
    expect(survivable(0, 0, [strike(row0, 1)], strike(col0, 2, 51))).toBe(true)
    // Corner tile struck next beat, both neighbours too: no way out.
    expect(survivable(0, 0, [], strike([0, 1, 4], 1))).toBe(false)
  })

  it('dies on the last heart, plays a dying phase, then ends', () => {
    const s = quiet()
    s.vitals.hearts = 1
    s.strikes = [strike([s.pos], 1)]
    untilBeat(s, 1)
    for (let i = 0; i < 20; i++) run(s)
    expect(s.diedAt).not.toBeNull()
    for (let i = 0; i < DEATH_TICKS + 5; i++) run(s)
    expect(s.over).toBe(true)
  })

  it('is deterministic for a seed', () => {
    const a = createState(me, 42)
    const b = createState(me, 42)
    for (let i = 0; i < 3000; i++) {
      const input = i % 37 === 0 ? 'right' : i % 53 === 0 ? 'left' : undefined
      run(a, input)
      run(b, input)
    }
    expect(a.score).toBe(b.score)
    expect(a.strikes).toEqual(b.strikes)
  })
})
