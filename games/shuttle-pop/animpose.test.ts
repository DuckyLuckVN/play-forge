import { describe, expect, it } from 'vitest'
import { jumpMotionInto, type JumpMotion } from './animpose'

describe('jumpMotionInto', () => {
  const out: JumpMotion = { crouch: 0, cock: 0, stretch: 0 }

  it('anticipates, cocks the racket during ascent, and stretches at the apex', () => {
    expect(jumpMotionInto(1, 30, out).crouch).toBeGreaterThan(0)
    expect(jumpMotionInto(5, 30, out).cock).toBeGreaterThan(0)
    expect(jumpMotionInto(15, 30, out).stretch).toBeGreaterThan(0.8)
  })

  it('returns all weights to rest after the jump', () => {
    expect(jumpMotionInto(30, 30, out)).toEqual({ crouch: 0, cock: 0, stretch: 0 })
    expect(jumpMotionInto(-1, 30, out)).toEqual({ crouch: 0, cock: 0, stretch: 0 })
  })
})
