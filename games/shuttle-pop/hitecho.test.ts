import { describe, expect, it } from 'vitest'
import { HitEcho } from './hitecho'
import { PREDICT, type PredictedHit } from './guestshuttle'
import { MAX_REWIND, type SpEvent } from './sim'

const pred: PredictedHit = { side: 1, grade: 'good', shot: 'clear', power: 0, from: 100 }
const hit = (side: 0 | 1, tick: number, id = tick): SpEvent => ({
  id,
  tick,
  k: 'hit',
  side,
  grade: 'perfect',
  shot: 'drive',
})

describe('HitEcho (a predicted own hit is heard once)', () => {
  it('the host hit answering the prediction is heard once (any grade/shot)', () => {
    const e = new HitEcho()
    e.note(pred)
    expect(e.heard(hit(1, 100 - MAX_REWIND))).toBe(true)
    expect(e.heard(hit(1, 101, 999))).toBe(false)
  })

  it('the last answering tick (from + confirmTicks) is still the echo', () => {
    const e = new HitEcho()
    e.note(pred)
    expect(e.heard(hit(1, 100 + PREDICT.confirmTicks))).toBe(true)
  })

  it('without a note every hit plays (host, vs AI, spectator)', () => {
    expect(new HitEcho().heard(hit(1, 100))).toBe(false)
    expect(new HitEcho().heard(hit(0, 100))).toBe(false)
  })

  it("the opponent's hit, an older own hit, or one past confirmTicks is not the echo", () => {
    const e = new HitEcho()
    e.note(pred)
    expect(e.heard(hit(0, 100))).toBe(false)
    expect(e.heard(hit(1, 100 - MAX_REWIND - 1))).toBe(false)
    expect(e.heard(hit(1, 100 + PREDICT.confirmTicks + 1))).toBe(false)
  })

  it('an event past confirmTicks drops the note: a later own hit plays', () => {
    const e = new HitEcho()
    e.note(pred)
    e.heard({ id: 1, tick: 100 + PREDICT.confirmTicks + 1, k: 'net' })
    expect(e.heard(hit(1, 101))).toBe(false)
  })

  it('an own whiff or a new serve drops the note: the next real hit plays', () => {
    const e = new HitEcho()
    e.note(pred)
    e.heard({ id: 1, tick: 101, k: 'whiff', side: 1 })
    expect(e.heard(hit(1, 102))).toBe(false)
    e.note(pred)
    e.heard({ id: 2, tick: 103, k: 'serve', side: 0 })
    expect(e.heard(hit(1, 104))).toBe(false)
  })

  it("the opponent's whiff keeps the note", () => {
    const e = new HitEcho()
    e.note(pred)
    e.heard({ id: 1, tick: 101, k: 'whiff', side: 0 })
    expect(e.heard(hit(1, 102))).toBe(true)
  })

  it('reset forgets', () => {
    const e = new HitEcho()
    e.note(pred)
    e.reset()
    expect(e.heard(hit(1, 100))).toBe(false)
  })
})
