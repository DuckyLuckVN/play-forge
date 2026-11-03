import { describe, expect, it, vi } from 'vitest'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import {
  DRAW_CASES,
  type FramePatch,
  HOLD,
  HOLD_POSES,
  MOODS,
  caseFrame,
  drawLog,
  frame,
  handsOf,
  held,
  kitFor,
  toBox,
  worstHold,
} from './body-fixtures'
import { frog } from './frog'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const look = CREATURE_LOOKS.monk

describe('frog body (Master Ribbit)', () => {
  it('is registered, and the monk is a frog that catches flies', () => {
    expect(BODIES.frog).toBe(frog)
    expect(look.body).toBe('frog')
    expect(look.signature).toBe('fly')
    for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is armed (front legs are the arms), stands within ±20% of the old figure, the ball in reach', () => {
    const m = frog.metrics(look, held({ still: true }))
    expect(m.armed).toBe(true)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.socketF.x).toBeGreaterThan(m.socketB.x)
    for (const b of [HOLD, { x: 12, y: -15.6 }])
      expect(Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    for (const s of [m.socketF, m.socketB])
      expect(Math.hypot(3, -m.handR - s.y)).toBeLessThanOrEqual(m.upper + m.fore + 0.01)
  })

  it('draws in every mood, eye style, still and fidget case, back leg first, with its hat', () => {
    for (const c of DRAW_CASES) {
      const f = caseFrame(c)
      const { kit, calls } = kitFor(frog, look, f)
      expect(() => frog.draw(fakeCanvas(), look, f, kit)).not.toThrow()
      expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
      expect(calls).toContain('hat')
    }
  })

  it('draws its webbed hands without throwing, open or closed', () => {
    const h = kitFor(frog, look, frame()).kit.hands.front
    for (const open of [0, 1])
      expect(() => frog.drawHand!(fakeCanvas(), { ...h, open }, look, 4)).not.toThrow()
  })

  it('plants the free front leg on the ground while holding', () => {
    for (const [mood, patch] of HOLD_POSES)
      for (const t of [0, 0.8, 1.9]) {
        const f = held({ mood, t, pose: { ...patch } })
        const m = frog.metrics(look, f)
        const { back } = handsOf(frog, look, f)
        expect(Math.abs(back.y + m.handR)).toBeLessThan(1)
      }
  })

  it('free hands stay near the body and out of the head', () => {
    for (const mood of MOODS) {
      if (mood === 'throw' || mood === 'ko') continue
      for (const t of [0, 0.7, 1.9]) {
        const f = frame({ mood, t, moodAge: 0.5 })
        const m = frog.metrics(look, f)
        const h = handsOf(frog, look, f)
        for (const hand of [h.front, h.back]) {
          expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
          expect(
            Math.hypot((hand.x - m.head.x) / m.head.rx, (hand.y - m.head.y) / m.head.ry),
          ).toBeGreaterThan(1)
        }
      }
    }
  })

  it('pulses its throat (idle loop), frozen under reduced motion with no one-shot offsets', () => {
    expect(drawLog(frog, look, frame({ t: 1 }))).not.toBe(drawLog(frog, look, frame({ t: 1.4 })))
    expect(drawLog(frog, look, frame({ t: 1, still: true }))).toBe(
      drawLog(frog, look, frame({ t: 5.5, still: true })),
    )
    const still = (patch: FramePatch) => frog.metrics(look, frame({ still: true, ...patch }))
    expect(still({ mood: 'cheer', moodAge: 0.4 }).head).toEqual(still({ mood: 'cheer', moodAge: 1.2 }).head)
    expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(still({ mood: 'hurt', moodAge: 1 }).bodyBox)
  })

  it('cheers with a big hop and a tongue flick; the pump is a little hop', () => {
    expect(frog.offsetX).toBeUndefined()
    const rest = frog.metrics(look, held())
    const peak = frog.metrics(look, frame({ mood: 'cheer', moodAge: 0.37 }))
    expect(peak.headTop).toBeLessThan(rest.headTop - 12)
    const pump = frog.metrics(look, frame({ mood: 'pump', moodAge: 0.22 }))
    expect(pump.headTop).toBeLessThan(rest.headTop - 1)
    expect(pump.headTop).toBeGreaterThan(rest.headTop - 8)
    const tongue = drawLog(frog, look, frame({ mood: 'cheer', moodAge: 0.45, eyes: 'happy' }))
    expect(tongue).not.toBe(drawLog(frog, look, frame({ mood: 'idle', moodAge: 0.45, eyes: 'happy' })))
  })

  it('splats flat on KO; revive sits back up', () => {
    const up = frog.metrics(look, frame())
    const down = frog.metrics(look, frame({ mood: 'ko', moodAge: 2, pose: { fall: 1 } }))
    expect(down.headTop).toBeGreaterThan(up.headTop + 15)
    expect(down.bodyBox.w).toBeGreaterThan(down.bodyBox.h * 2)
    const back = frog.metrics(look, frame({ mood: 'revive', pose: { fall: 0 } }))
    expect(back.headTop).toBeCloseTo(up.headTop, 0)
  })

  it('catches a fly on its signature', () => {
    const logs = [0.3, 0.65, 0.9].map((fidget) => drawLog(frog, look, held({ fidget })))
    for (const l of logs) expect(l).not.toBe(drawLog(frog, look, held()))
    expect(new Set(logs).size).toBe(3)
  })

  it('holds the ball exactly in the front hand, mirrored and bigger too', () => {
    const worst = worstHold('monk')
    expect(worst).not.toBeNull()
    expect(worst!).toBeLessThan(0.01)
  })
})
