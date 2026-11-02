import { describe, expect, it, vi } from 'vitest'
import type { Mood } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import {
  DRAW_CASES,
  type FramePatch,
  HOLD,
  HOLD_POSES,
  caseFrame,
  drawLog,
  frame,
  handsOf,
  held,
  kitFor,
  worstHold,
} from './body-fixtures'
import { BODIES } from './index'
import { ROBOT_PARTS, gearTurn, robot } from './robot'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const CAST: Array<[HeroId, string, string]> = [
  ['rookie', 'cube', 'glance'],
  ['bomber', 'bomb', 'fuse'],
  ['tinker', 'gear', 'spin'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]] as const)
const look = CREATURE_LOOKS.rookie

describe('robot body (Cubo, Boomer, Gizmo)', () => {
  it('is registered, and each robot hero has its variant and signature', () => {
    expect(BODIES.robot).toBe(robot)
    for (const [id, variant, signature] of CAST) {
      const l = CREATURE_LOOKS[id]
      expect(l).toMatchObject({ body: 'robot', variant, signature })
      for (const c of [l.main, l.second, l.hand, l.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      // Every variant's head, face, ear and chest come from one table.
      expect(ROBOT_PARTS[variant as keyof typeof ROBOT_PARTS]).toBeTruthy()
    }
  })

  it('stands within ±20% of the old figure, with sockets at the shoulders and the ball in reach', () => {
    for (const [, l] of LOOKS) {
      const m = robot.metrics(l, frame({ still: true }))
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      expect(m.armed).toBe(true)
      expect(m.socketF.x).toBeGreaterThan(0)
      expect(m.socketB.x).toBeLessThan(0)
      expect(m.socketF.y).toBeGreaterThan(m.head.y)
      for (const b of [HOLD, { x: 12, y: -14 }])
        expect(Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    }
  })

  it('draws each variant in every mood, eye style, still and fidget case, back hand first, with its hat', () => {
    for (const [, l] of LOOKS)
      for (const c of DRAW_CASES) {
        const f = caseFrame(c)
        const { kit, calls } = kitFor(robot, l, f)
        expect(() => robot.draw(fakeCanvas(), l, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('draws a distinct head per variant', () => {
    const logs = LOOKS.map(([, l]) => drawLog(robot, l, frame({ still: true })))
    expect(new Set(logs).size).toBe(LOOKS.length)
  })

  it('raises both arms on cheer and pump, and on cast', () => {
    for (const [, l] of LOOKS)
      for (const mood of ['cheer', 'pump', 'cast'] as Mood[]) {
        const p = robot.pose!(l, frame({ mood }))
        expect(Math.abs(p.sF)).toBeGreaterThan(1.9)
        expect(Math.abs(p.sB)).toBeGreaterThan(1.9)
      }
  })

  it('rests the back hand at its side while holding (no wave)', () => {
    for (const [, l] of LOOKS)
      for (const [mood, patch] of HOLD_POSES) {
        const f = held({ mood, pose: { ...patch } })
        const m = robot.metrics(l, f)
        const { back } = handsOf(robot, l, f)
        expect(back.y).toBeGreaterThan(m.socketB.y)
      }
  })

  it('holds a steady pose under reduced motion (no arm swing)', () => {
    expect(robot.pose!(look, frame({ still: true, t: 1 }))).toEqual(
      robot.pose!(look, frame({ still: true, t: 5.5 })),
    )
  })

  it('moves in its idle loop, frozen under reduced motion (fuse sparks, gear turns)', () => {
    for (const [, l] of LOOKS) {
      expect(drawLog(robot, l, frame({ t: 1 }))).not.toBe(drawLog(robot, l, frame({ t: 1.4 })))
      expect(drawLog(robot, l, frame({ t: 1, still: true }))).toBe(
        drawLog(robot, l, frame({ t: 5.5, still: true })),
      )
      const still = (patch: FramePatch) => robot.metrics(l, frame({ still: true, ...patch }))
      expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(
        still({ mood: 'hurt', moodAge: 1 }).bodyBox,
      )
    }
  })

  it('cheers with its own flourish per variant (the fuse flares, the gear whirs); KO per variant', () => {
    const cheer = LOOKS.map(([, l]) => {
      const c = drawLog(robot, l, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))
      expect(c).not.toBe(drawLog(robot, l, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' })))
      return c
    })
    expect(new Set(cheer).size).toBe(LOOKS.length)
    // Boomer fizzles with smoke and Gizmo's gear spins down: the KO keeps changing after the cube's screen is black.
    for (const id of ['bomber', 'tinker'] as const) {
      const l = CREATURE_LOOKS[id]
      const ko = (moodAge: number) =>
        drawLog(robot, l, frame({ mood: 'ko', moodAge, eyes: 'xx', pose: { fall: 1 } }))
      expect(ko(0.6)).not.toBe(ko(0.9))
    }
  })

  it('plays its signature', () => {
    for (const [, l] of LOOKS)
      expect(drawLog(robot, l, held({ fidget: 0.5 }))).not.toBe(drawLog(robot, l, held()))
  })

  it('tips over with pose.fall (KO): the head moves sideways and down', () => {
    for (const [, l] of LOOKS) {
      const up = robot.metrics(l, frame())
      const down = robot.metrics(l, frame({ mood: 'ko', pose: { fall: 1 } }))
      expect(Math.abs(down.head.x - up.head.x)).toBeGreaterThan(20)
      expect(down.head.y).toBeGreaterThan(up.head.y)
    }
  })

  it('holds the ball exactly in the front hand, mirrored and bigger too', () => {
    for (const [id] of CAST) {
      const worst = worstHold(id)
      expect(worst).not.toBeNull()
      expect(worst!).toBeLessThan(0.01)
    }
  })
  it("Gizmo's gear only ever turns forward: through a cheer, a pump, its signature and into a KO", () => {
    /** Angles over a run, the mood starting at t = 1 (whole half turns look the same, so compare mod π). */
    const run = (patch: (age: number) => FramePatch) =>
      Array.from({ length: 90 }, (_, i) => i / 30).map((age) =>
        gearTurn(frame({ t: 1 + age, ...patch(age) })),
      )
    const forward = (as: number[]) => {
      for (let i = 1; i < as.length; i++) {
        const d = (((as[i] - as[i - 1]) % Math.PI) + Math.PI) % Math.PI
        // A step is a small forward move (never a big wrap that would read as backward).
        expect(d).toBeLessThan(Math.PI / 2)
      }
    }
    forward(run((age) => ({ mood: age < 1.5 ? 'cheer' : 'idle', moodAge: age < 1.5 ? age : age - 1.5 })))
    forward(run((age) => ({ mood: age < 0.6 ? 'pump' : 'idle', moodAge: age < 0.6 ? age : age - 0.6 })))
    forward(run((age) => ({ fidget: age < 1 ? age : 0 })))
    forward(run((age) => (age < 1 ? { mood: 'idle' } : { mood: 'ko', moodAge: age - 1, pose: { fall: 1 } })))
  })
})
