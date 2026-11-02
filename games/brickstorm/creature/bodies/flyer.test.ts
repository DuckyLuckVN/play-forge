import { describe, expect, it, vi } from 'vitest'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import type { Frame } from '../types'
import {
  DRAW_CASES,
  HOLD,
  HOLD_POSES,
  MOODS,
  POSE,
  caseFrame,
  drawLog,
  frame,
  handsOf,
  held,
  kitFor,
  toBox,
  worstHold,
} from './body-fixtures'
import { flyer, wingPoints } from './flyer'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const CAST: Array<[HeroId, string, string]> = [
  ['sage', 'owl', 'turn'],
  ['vampire', 'bat', 'wrap'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]!] as const)

describe('flyer body (Hoot, Count Flap)', () => {
  it('is registered, and each flyer hero has its variant and signature', () => {
    expect(BODIES.flyer).toBe(flyer)
    for (const [id, variant, signature] of CAST) {
      const look = CREATURE_LOOKS[id]!
      expect(look.body).toBe('flyer')
      expect(look.variant).toBe(variant)
      expect(look.signature).toBe(signature)
      for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is armed (the wings are the arms), stands within ±20% of the old figure, the ball in reach', () => {
    for (const [, look] of LOOKS) {
      const m = flyer.metrics(look, held({ still: true }))
      expect(m.armed).toBe(true)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      for (const s of [m.socketF, m.socketB]) expect(s.y).toBeGreaterThan(m.head.y)
      expect(m.socketF.x).toBeGreaterThan(m.socketB.x)
      for (const b of [HOLD, { x: 12, y: -15.6 }])
        expect(Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    }
  })

  it('draws each variant in every mood, eye style, still and fidget case, back wing first, with its hat', () => {
    for (const [, look] of LOOKS)
      for (const c of DRAW_CASES) {
        const f = caseFrame(c)
        const { kit, calls } = kitFor(flyer, look, f)
        expect(() => flyer.draw(fakeCanvas(), look, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('draws its wing mitts without throwing, open or closed', () => {
    for (const [, look] of LOOKS) {
      const h = kitFor(flyer, look, frame()).kit.hands.front
      for (const open of [0, 1])
        expect(() => flyer.drawHand!(fakeCanvas(), { ...h, open }, look, 3.4)).not.toThrow()
    }
  })

  it('hovers and flaps without the ball; lands and stops flapping while holding', () => {
    for (const [, look] of LOOKS) {
      const free = [0.9, 1.0, 1.1].map((t) => handsOf(flyer, look, frame({ mood: 'watch', t })))
      expect(
        Math.abs(free[0].back.y - free[2].back.y) + Math.abs(free[0].front.y - free[1].front.y),
      ).toBeGreaterThan(1)
      const air = flyer.metrics(look, frame({ mood: 'watch', t: 2 }))
      const land = flyer.metrics(look, held({ t: 2 }))
      expect(air.bodyBox.y + air.bodyBox.h).toBeLessThan(land.bodyBox.y + land.bodyBox.h - 2)
      const still = [0.9, 1.0, 1.1].map((t) => handsOf(flyer, look, held({ t })))
      for (const h of still) {
        expect(h.back.x).toBeCloseTo(still[0].back.x, 6)
        expect(h.back.y).toBeCloseTo(still[0].back.y, 6)
      }
    }
  })

  it('folds the back wing at its side while holding (no wave), clear of the head', () => {
    for (const [, look] of LOOKS)
      for (const [mood, patch] of HOLD_POSES) {
        const f = held({ mood, pose: { ...POSE, ...patch } })
        const m = flyer.metrics(look, f)
        const { back } = handsOf(flyer, look, f)
        expect(back.y).toBeGreaterThan(m.socketB.y)
        expect(back.x).toBeLessThan(m.socketB.x + 3)
      }
  })

  it('never covers the face with the front wing, in any mood', () => {
    for (const [, look] of LOOKS)
      for (const mood of MOODS)
        for (const t of [0.2, 0.9, 1.7]) {
          const f = frame({ mood, t, moodAge: 0.5, pose: { ...POSE, fall: mood === 'ko' ? 1 : 0 } })
          const m = flyer.metrics(look, f)
          const { front } = handsOf(flyer, look, f)
          // The root sits on the shoulder; the rest of the wing must stay off the face.
          for (const p of wingPoints(look, m, front, true).slice(1)) {
            const d = Math.hypot((p.x - m.head.x) / m.head.rx, (p.y - m.head.y) / m.head.ry)
            expect(d).toBeGreaterThan(0.95)
          }
        }
  })

  it('free wing mitts stay near the body and out of the head', () => {
    for (const [, look] of LOOKS)
      for (const mood of MOODS) {
        if (mood === 'throw' || mood === 'ko') continue
        for (const t of [0, 0.7, 1.9]) {
          const f = frame({ mood, t, moodAge: 0.5 })
          const m = flyer.metrics(look, f)
          const h = handsOf(flyer, look, f)
          for (const hand of [h.front, h.back]) {
            expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 5)
            expect(
              Math.hypot((hand.x - m.head.x) / m.head.rx, (hand.y - m.head.y) / m.head.ry),
            ).toBeGreaterThan(1)
          }
        }
      }
  })

  it('takes off on cheer with both wings up, its own flourish per variant; the pump stays light', () => {
    expect(flyer.offsetX).toBeUndefined()
    const logs = LOOKS.map(([, look]) => {
      const rest = flyer.metrics(look, held())
      const f = frame({ mood: 'cheer', moodAge: 0.5 })
      const m = flyer.metrics(look, f)
      expect(m.headTop).toBeLessThan(rest.headTop - 6)
      const h = handsOf(flyer, look, f)
      expect(h.front.y).toBeLessThan(m.socketF.y)
      expect(h.back.y).toBeLessThan(m.socketB.y)
      const pump = flyer.metrics(look, frame({ mood: 'pump', moodAge: 0.2 }))
      expect(Math.abs(pump.headTop - rest.headTop)).toBeLessThan(6)
      const cheer = drawLog(flyer, look, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))
      expect(cheer).not.toBe(drawLog(flyer, look, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' })))
      return cheer
    })
    expect(new Set(logs).size).toBe(LOOKS.length)
  })

  it('moves in its idle loop, frozen under reduced motion with no one-shot offsets', () => {
    for (const [, look] of LOOKS) {
      expect(drawLog(flyer, look, frame({ t: 1 }))).not.toBe(drawLog(flyer, look, frame({ t: 1.4 })))
      expect(drawLog(flyer, look, frame({ t: 1, still: true }))).toBe(
        drawLog(flyer, look, frame({ t: 5.5, still: true })),
      )
      const still = (patch: Partial<Frame>) => flyer.metrics(look, frame({ still: true, ...patch }))
      expect(still({ mood: 'cheer', moodAge: 0.4 }).head).toEqual(still({ mood: 'cheer', moodAge: 1.2 }).head)
      expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(
        still({ mood: 'hurt', moodAge: 1 }).bodyBox,
      )
    }
  })

  it('falls on KO: the owl flops on its back, the bat drops upside-down; revive stands back up', () => {
    const ko = frame({ mood: 'ko', moodAge: 2, pose: { ...POSE, fall: 1 } })
    for (const [, look] of LOOKS) {
      const up = flyer.metrics(look, frame())
      const down = flyer.metrics(look, ko)
      expect(down.headTop).toBeGreaterThan(up.headTop + 15)
      expect(down.head.y).toBeGreaterThan(-22)
      const back = flyer.metrics(look, frame({ mood: 'revive', pose: { ...POSE, fall: 0 } }))
      expect(back.headTop).toBeLessThan(down.headTop - 15)
    }
    const owl = flyer.metrics(CREATURE_LOOKS.sage!, ko)
    expect(owl.head.x).toBeLessThan(-5)
    const bat = flyer.metrics(CREATURE_LOOKS.vampire!, ko)
    // Upside-down-ish: the head ends lower than the body's middle.
    expect(bat.head.y).toBeGreaterThan(bat.bodyBox.y + bat.bodyBox.h / 2)
  })

  it('plays its signature: Hoot turns its head, Count Flap wraps its far wing round the body', () => {
    for (const [, look] of LOOKS)
      expect(drawLog(flyer, look, held({ fidget: 0.5 }))).not.toBe(drawLog(flyer, look, held()))
    const bat = CREATURE_LOOKS.vampire!
    const f = held({ fidget: 0.5 })
    const m = flyer.metrics(bat, f)
    const { back } = handsOf(flyer, bat, f)
    expect(back.x).toBeGreaterThan(m.socketB.x + 6)
    const k = kitFor(flyer, bat, f)
    flyer.draw(fakeCanvas(), bat, f, k.kit)
    // Wrapped round the front: drawn after the head (and its hat), before the front wing.
    expect(k.calls.indexOf('back')).toBeGreaterThan(k.calls.indexOf('hat'))
  })

  it('holds the ball exactly in the front wing mitt, mirrored and bigger too', () => {
    for (const [id] of CAST) {
      const worst = worstHold(id)
      expect(worst).not.toBeNull()
      expect(worst!).toBeLessThan(0.01)
    }
  })
})
