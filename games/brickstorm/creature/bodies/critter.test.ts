import { describe, expect, it, vi } from 'vitest'
import type { Mood } from '../../hero-avatar'
import { HeroAvatar, type AvatarContext } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import {
  DRAW_CASES,
  type FramePatch,
  HOLD,
  HOLD_POSES,
  MOODS,
  actx,
  caseFrame,
  drawLog,
  frame,
  handsOf,
  kitFor,
  run,
  toBox,
  worstHold,
} from './body-fixtures'
import { critter } from './critter'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

/** Hero → [variant, signature]. */
const CAST: Array<[HeroId, string, string]> = [
  ['ranger', 'sprout', 'rustle'],
  ['ninja', 'cat', 'pawlick'],
  ['paladin', 'lion', 'roar'],
  ['sorcerer', 'crystal', 'glint'],
  ['dragon', 'dragon', 'puff'],
  ['gambler', 'dice', 'reroll'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]] as const)

describe('critter body (Sprig, Kage, Aurelia, Nyx, Drakon, Lucky)', () => {
  it('is registered, and each critter hero has its variant and signature', () => {
    expect(BODIES.critter).toBe(critter)
    for (const [id, variant, signature] of CAST) {
      const look = CREATURE_LOOKS[id]
      expect(look.body).toBe('critter')
      expect(look.variant).toBe(variant)
      expect(look.signature).toBe(signature)
      for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is armed (front legs are the arms), stands within ±20% of the old figure, the ball in reach', () => {
    for (const [, look] of LOOKS) {
      const m = critter.metrics(look, frame({ still: true, hold: HOLD, holding: true }))
      expect(m.armed).toBe(true)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      // Both front-leg sockets sit at the chest, under the head.
      for (const s of [m.socketF, m.socketB]) expect(s.y).toBeGreaterThan(m.head.y + m.head.ry * 0.5)
      expect(m.socketF.x).toBeGreaterThan(m.socketB.x)
      expect(Math.hypot(HOLD.x - m.socketF.x, HOLD.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
      // Planted paws reach the ground from both sockets.
      for (const s of [m.socketF, m.socketB])
        expect(Math.hypot(2, -m.handR - s.y)).toBeLessThanOrEqual(m.upper + m.fore + 0.01)
    }
  })

  it('rears up to hold the ball: the torso tilts up and the shoulders rise', () => {
    for (const [, look] of LOOKS) {
      const down = critter.metrics(look, frame({ still: true }))
      const up = critter.metrics(look, frame({ still: true, hold: HOLD, holding: true }))
      expect(up.socketF.y).toBeLessThan(down.socketF.y - 1)
    }
  })

  it('draws each variant in every mood, eye style, still and fidget case without throwing, back paw first, with its hat', () => {
    for (const [, look] of LOOKS)
      for (const c of DRAW_CASES) {
        const f = caseFrame(c)
        const { kit, calls } = kitFor(critter, look, f)
        expect(() => critter.draw(fakeCanvas(), look, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('draws its paws without throwing, open or closed', () => {
    for (const [, look] of LOOKS) {
      const h = kitFor(critter, look, frame()).kit.hands.front
      for (const open of [0, 1])
        expect(() => critter.drawHand!(fakeCanvas(), { ...h, open }, look, 4)).not.toThrow()
    }
  })

  it('plants the free front paw on the ground while holding (not raised like a wave)', () => {
    for (const [, look] of LOOKS)
      for (const [mood, patch] of HOLD_POSES)
        for (const t of [0, 0.8, 1.9]) {
          const f = frame({ mood, t, pose: patch, hold: HOLD, holding: true })
          const m = critter.metrics(look, f)
          const { back } = handsOf(critter, look, f)
          expect(back.y).toBeGreaterThan(m.socketB.y)
          // On the ground: the paw's bottom within a unit of the floor.
          expect(Math.abs(back.y + m.handR)).toBeLessThan(1)
        }
  })

  it('stands on all fours without the ball (both paws on the ground)', () => {
    for (const [, look] of LOOKS) {
      const f = frame()
      const m = critter.metrics(look, f)
      const h = handsOf(critter, look, f)
      for (const p of [h.front, h.back]) expect(Math.abs(p.y + m.handR)).toBeLessThan(1)
    }
  })

  it('still lets an idle wave raise the back paw', () => {
    const p = critter.pose!(LOOKS[0][1], frame({ pose: { sB: -2.6, eB: 0.3 }, hold: HOLD, holding: true }))
    expect(p.sB).toBeLessThan(-2)
  })

  it('free paws stay near the body and out of the head in every free pose', () => {
    for (const [, look] of LOOKS)
      for (const mood of MOODS) {
        if (mood === 'throw' || mood === 'ko') continue
        for (const t of [0, 0.7, 1.9]) {
          const f = frame({ mood, t, moodAge: 0.5 })
          const m = critter.metrics(look, f)
          const h = handsOf(critter, look, f)
          for (const hand of [h.front, h.back]) {
            expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
            const hx = (hand.x - m.head.x) / m.head.rx
            const hy = (hand.y - m.head.y) / m.head.ry
            expect(Math.hypot(hx, hy)).toBeGreaterThan(1)
          }
        }
      }
  })

  it('rears up with both paws high on cheer and cast; the pump never shakes the screen', () => {
    expect(critter.offsetX).toBeUndefined()
    for (const [, look] of LOOKS) {
      const rest = critter.metrics(look, frame({ hold: HOLD, holding: true }))
      for (const mood of ['cheer', 'cast'] as Mood[]) {
        const f = frame({ mood, moodAge: 1.2 })
        const m = critter.metrics(look, f)
        const h = handsOf(critter, look, f)
        expect(h.front.y).toBeLessThan(m.socketF.y)
        expect(h.back.y).toBeLessThan(m.socketB.y)
      }
      const cheer = critter.metrics(look, frame({ mood: 'cheer', moodAge: 0.5 }))
      expect(cheer.socketF.y).toBeLessThan(rest.socketF.y)
    }
  })

  it('each cheer plays its own flourish (the drawing differs from a plain happy face)', () => {
    const logs = LOOKS.map(([, look]) => {
      const cheer = drawLog(critter, look, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))
      const calm = drawLog(critter, look, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' }))
      expect(cheer).not.toBe(calm)
      return cheer
    })
    expect(new Set(logs).size).toBe(LOOKS.length)
  })

  it('wags its tail and twitches its ears (idle loop), frozen under reduced motion with no one-shot offsets', () => {
    for (const [, look] of LOOKS) {
      expect(drawLog(critter, look, frame({ t: 1 }))).not.toBe(drawLog(critter, look, frame({ t: 1.4 })))
      expect(drawLog(critter, look, frame({ t: 1, still: true }))).toBe(
        drawLog(critter, look, frame({ t: 5.5, still: true })),
      )
      const still = (patch: FramePatch) => critter.metrics(look, frame({ still: true, ...patch }))
      const rest = still({})
      // The cheer rear-up is a pose; its hop, flip and tumble are one-shots that stay off.
      expect(still({ mood: 'cheer', moodAge: 0.4 }).head).toEqual(still({ mood: 'cheer', moodAge: 1.2 }).head)
      expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(
        still({ mood: 'hurt', moodAge: 1 }).bodyBox,
      )
      expect(still({ t: 4 }).head).toEqual(rest.head)
    }
  })

  it('flops over on its side on KO, and revives as pose.fall returns to 0', () => {
    for (const [, look] of LOOKS) {
      const up = critter.metrics(look, frame())
      const down = critter.metrics(look, frame({ mood: 'ko', moodAge: 2, pose: { fall: 1 } }))
      expect(down.headTop).toBeGreaterThan(up.headTop + 15)
      expect(down.head.y).toBeGreaterThan(-20)
      // Lying down: long and low.
      expect(down.bodyBox.w).toBeGreaterThan(down.bodyBox.h * 1.5)
      const f = frame({ mood: 'ko', moodAge: 2, pose: { fall: 1 } })
      const h = handsOf(critter, look, f)
      for (const hand of [h.front, h.back]) expect(hand.y).toBeGreaterThan(-10)
      const back = critter.metrics(look, frame({ mood: 'revive', pose: { fall: 0 } }))
      expect(back.headTop).toBeCloseTo(critter.metrics(look, frame({ mood: 'revive' })).headTop, 6)
    }
  })

  it('plays its signature move on the fidget; Kage licks a raised paw', () => {
    for (const [, look] of LOOKS)
      expect(drawLog(critter, look, frame({ fidget: 0.5 }))).not.toBe(drawLog(critter, look, frame()))
    const kage = CREATURE_LOOKS.ninja
    const f = frame({ fidget: 0.5, hold: HOLD, holding: true })
    const m = critter.metrics(kage, f)
    const { back } = handsOf(critter, kage, f)
    // Raised in front of the face, up by the mouth (the solver's head box shrinks to the crown meanwhile).
    expect(back.y).toBeLessThan(m.socketB.y - 6)
    expect(back.x).toBeGreaterThan(m.head.x + 6)
    expect(critter.metrics(kage, frame({ hold: HOLD, holding: true })).head.ry).toBeGreaterThan(m.head.ry)
  })

  it('never snaps its posture between moods: the head glides across cheer → idle and throw → watch', () => {
    // Sprig: no flip or hop on its cheer, so any jump would be the rear-up snapping.
    const h = { x: 100, y: 740, r: 5 }
    /** The head each frame (the first metrics call of each draw). */
    const steps = (a: HeroAvatar, seconds: number, c: AvatarContext) => {
      const out: Array<{ x: number; y: number }> = []
      for (let t = 0; t < seconds; t += 1 / 60) {
        a.update(1 / 60, c)
        const orig = critter.metrics
        let head: { x: number; y: number } | null = null
        critter.metrics = (l, f) => {
          const m = orig(l, f)
          head ??= m.head
          return m
        }
        a.draw(fakeCanvas(), 760)
        critter.metrics = orig
        out.push(head!)
      }
      return out
    }
    const maxStep = (ps: Array<{ x: number; y: number }>) =>
      Math.max(...ps.slice(1).map((p, i) => Math.hypot(p.x - ps[i].x, p.y - ps[i].y)))
    const a = new HeroAvatar('ranger')
    run(a, 0.5, actx({ hold: h }))
    a.setMood('cheer')
    const cheer = steps(a, 2.2, actx({ hold: h }))
    expect(a.mood).toBe('idle')
    expect(maxStep(cheer.slice(30))).toBeLessThan(1.5)
    a.setMood('throw')
    const thrown = steps(a, 1.2, actx({ watch: { x: 200, y: 300 } }))
    expect(a.mood).toBe('watch')
    expect(maxStep(thrown)).toBeLessThan(1.5)
  })

  it('holds the ball exactly in the front paw, mirrored and bigger too', () => {
    for (const [id] of CAST) {
      const worst = worstHold(id)
      expect(worst).not.toBeNull()
      expect(worst!).toBeLessThan(0.01)
    }
  })
})
