import { describe, expect, it, vi } from 'vitest'
import type { Mood } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import type { CreatureLook, Frame } from '../types'
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
import { golem } from './golem'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const look = CREATURE_LOOKS.knight!
const CAST: Array<[HeroId, string, string]> = [
  ['knight', 'brick', 'scarf'],
  ['giant', 'boulder', 'yawn'],
  ['titan', 'mountain', 'rumble'],
  ['berserker', 'lava', 'steam'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]!] as const)

/** Every fill colour a draw sets. */
function fillsOf(l: CreatureLook, f = frame()): string[] {
  const fills: string[] = []
  const c = new Proxy(fakeCanvas(), {
    set: (t, k, v) => {
      if (k === 'fillStyle') fills.push(String(v))
      return Reflect.set(t, k, v)
    },
  })
  golem.draw(c, l, f, kitFor(golem, l, f).kit)
  return fills
}

describe('golem body (Bastion)', () => {
  it('is registered, and knight is a brick golem with a scarf', () => {
    expect(BODIES.golem).toBe(golem)
    expect(look).toEqual({
      body: 'golem',
      variant: 'brick',
      main: '#b8bcc6',
      second: '#2f7df6',
      hand: '#b8bcc6',
      eye: '#ffffff',
      signature: 'scarf',
    })
  })

  it('is armed, stands within ±20% of the old figure, with sockets at the shoulders', () => {
    const m = golem.metrics(look, frame({ still: true }))
    expect(m.armed).toBe(true)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.socketF.x).toBeGreaterThan(0)
    expect(m.socketB.x).toBeLessThan(0)
    expect(m.socketF.y).toBeGreaterThan(m.head.y)
    expect(Math.hypot(HOLD.x - m.socketF.x, HOLD.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
  })

  it('draws each variant in every mood, eye style, still and fidget case, back hand first, with its hat', () => {
    for (const [, l] of LOOKS)
      for (const c of DRAW_CASES) {
        const f = caseFrame(c)
        const { kit, calls } = kitFor(golem, l, f)
        expect(() => golem.draw(fakeCanvas(), l, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('draws its fist hands without throwing, open or closed', () => {
    const f = frame()
    const h = kitFor(golem, look, f).kit.hands.front
    for (const open of [0, 1])
      expect(() => golem.drawHand!(fakeCanvas(), { ...h, open }, look, 4)).not.toThrow()
  })

  it('crumbles into 5 separate blocks on KO (pose.fall = 1): the torso splits, every block moves off its spot', () => {
    type P = Path2D & { ops: { name: string; args: number[] }[] }
    /** Torso halves (13 × 22 blocks) drawn in a frame. */
    const halves = (f: Frame) => {
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(golem, look, f).kit)
      return new Set(
        c.log
          .filter((r) => r.name === 'fill' && r.args[0] instanceof Path2D)
          .map((r) => r.args[0] as P)
          .filter((p) => p.ops.some((o) => o.name === 'roundRect' && o.args[2] === 13 && o.args[3] === 22)),
      ).size
    }
    const ko = frame({ mood: 'ko', moodAge: 2, eyes: 'xx', pose: { fall: 1 } })
    const up = frame({ still: true })
    expect(halves(up)).toBe(0)
    expect(halves(ko)).toBe(2)
    const a = golem.metrics(look, up)
    const b = golem.metrics(look, ko)
    // The head rolls off to the front and lands low; the sockets ride their torso halves down; the pile spreads.
    expect(b.head.x - a.head.x).toBeGreaterThan(10)
    expect(b.headTop).toBeGreaterThan(a.headTop + 20)
    expect(b.socketF.y - a.socketF.y).toBeGreaterThan(8)
    expect(b.socketB.y - a.socketB.y).toBeGreaterThan(15)
    expect(b.bodyBox.w).toBeGreaterThan(a.bodyBox.w * 1.3)
    expect(b.bodyBox.h).toBeLessThan(a.bodyBox.h * 0.9)
    // The head no longer sits over the torso pile's middle, so all five blocks show.
    expect(b.head.x - b.head.rx).toBeGreaterThan(b.bodyBox.x + b.bodyBox.w / 2 - 5)
  })

  it('hangs the back fist at its side, below the shoulder and clear of the torso, in idle, watch, aim and worried', () => {
    for (const [, l] of LOOKS)
      for (const [mood, patch] of HOLD_POSES)
        for (const t of [0, 0.8, 1.9]) {
          const f = held({ mood, t, pose: { ...patch } })
          const m = golem.metrics(l, f)
          const { back } = handsOf(golem, l, f)
          expect(back.y).toBeGreaterThan(m.socketB.y)
          expect(back.x).toBeLessThan(m.bodyBox.x + 1)
          // Hip level: between the knees and the chest.
          expect(back.y).toBeGreaterThan(-20)
          expect(back.y).toBeLessThan(-6)
        }
  })

  it('still lets an idle wave raise the back arm', () => {
    const p = golem.pose!(look, frame({ pose: { sB: -2.6, eB: 0.3 } }))
    expect(p.sB).toBeLessThan(-2)
  })

  it('raises its fists on cheer, then stomps: a shake offset only after the stomp, none when still or on a pump', () => {
    for (const mood of ['cheer', 'pump'] as Mood[]) {
      const up = golem.pose!(look, frame({ mood, moodAge: 0.2 }))
      expect(up.sF).toBeGreaterThan(1.9)
      expect(up.sB).toBeLessThan(-1.9)
    }
    const at = (moodAge: number, still = false) =>
      golem.offsetX!(look, frame({ mood: 'cheer', moodAge, still }))
    expect(at(0.2)).toBe(0)
    const shake = [0.45, 0.48, 0.5, 0.55, 0.6].map((a) => Math.abs(at(a)))
    expect(Math.max(...shake)).toBeGreaterThan(0.5)
    expect(Math.max(...shake)).toBeLessThan(3)
    expect(at(1.2)).toBe(0)
    expect(at(0.5, true)).toBe(0)
    expect(golem.offsetX!(look, frame())).toBe(0)
    for (const moodAge of [0.3, 0.35, 0.4, 0.5])
      expect(golem.offsetX!(look, frame({ mood: 'pump', moodAge }))).toBe(0)
  })

  it('breathes heavily, the head lagging a beat behind the shoulders', () => {
    const gap = [0, 0.4, 0.8, 1.2, 1.6, 2].map((t) => {
      const m = golem.metrics(look, frame({ t }))
      return m.head.y - m.socketF.y
    })
    expect(Math.max(...gap) - Math.min(...gap)).toBeGreaterThan(0.5)
    const lift = [0, 0.5, 1, 1.5, 2].map((t) => golem.metrics(look, frame({ t })).socketF.y)
    expect(Math.max(...lift) - Math.min(...lift)).toBeGreaterThan(1)
  })

  it('freezes its idle loops under reduced motion (same drawing at any time)', () => {
    const drawAt = (t: number) => {
      const f = frame({ t, still: true })
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(golem, look, f).kit)
      return JSON.stringify(c.log)
    }
    expect(drawAt(1)).toBe(drawAt(5.5))
  })

  it('holds a pose without one-shot motion under reduced motion (no stomp dip, hurt squash or gust)', () => {
    const still = (patch: FramePatch) => golem.metrics(look, frame({ still: true, ...patch }))
    const rest = still({})
    expect(still({ mood: 'cheer', moodAge: 0.5 }).socketF).toEqual(rest.socketF)
    expect(still({ mood: 'hurt', moodAge: 0.15 }).bodyBox).toEqual(rest.bodyBox)
  })

  it('the scarf whips on the signature move', () => {
    const drawWith = (fidget: number) => {
      const f = frame({ fidget })
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(golem, look, f).kit)
      return JSON.stringify(c.log)
    }
    expect(drawWith(0.5)).not.toBe(drawWith(0))
  })

  it('every golem holds the ball exactly in its front fist, mirrored and bigger too', () => {
    for (const [id] of CAST) {
      const worst = worstHold(id)
      expect(worst).not.toBeNull()
      expect(worst!).toBeLessThan(0.01)
    }
  })
  it('giant, titan and berserker are golems with their own variant and signature', () => {
    for (const [id, variant, signature] of CAST) {
      const l = CREATURE_LOOKS[id]!
      expect(l).toMatchObject({ body: 'golem', variant, signature })
      for (const c of [l.main, l.second, l.hand, l.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('every variant stands within ±20% of the old figure, the ball in reach, sockets below the head', () => {
    for (const [, l] of LOOKS) {
      const m = golem.metrics(l, held({ still: true }))
      expect(m.armed).toBe(true)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      expect(m.socketF.y).toBeGreaterThan(m.head.y)
      for (const b of [HOLD, { x: 12, y: -14 }])
        expect(Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    }
  })

  it('only Bastion wears the scarf and the gold badge', () => {
    /** The scarf band: a 28 × 6.5 strip round the neck. */
    const band = (l: CreatureLook) =>
      drawLog(golem, l, frame({ fidget: 0.5 })).includes('"roundRect","args":[-14,-32,28,6.5,3.2]')
    expect(band(look)).toBe(true)
    expect(fillsOf(look)).toContain('#ffc531')
    for (const variant of ['boulder', 'mountain', 'lava']) {
      expect(band({ ...look, variant })).toBe(false)
      expect(fillsOf({ ...look, variant }, frame({ fidget: 0.5 }))).not.toContain('#ffc531')
    }
  })

  it('free fists stay near the body and out of the head', () => {
    for (const [, l] of LOOKS)
      for (const mood of MOODS) {
        if (mood === 'throw' || mood === 'ko') continue
        for (const t of [0, 0.7, 1.9]) {
          const f = frame({ mood, t, moodAge: 0.5 })
          const m = golem.metrics(l, f)
          const h = handsOf(golem, l, f)
          for (const hand of [h.front, h.back]) {
            expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
            expect(
              Math.hypot((hand.x - m.head.x) / m.head.rx, (hand.y - m.head.y) / m.head.ry),
            ).toBeGreaterThan(1)
          }
        }
      }
  })

  it('moves in its idle loop and cheers with its own flourish per variant; frozen under reduced motion', () => {
    const cheer = LOOKS.map(([, l]) => {
      expect(drawLog(golem, l, frame({ t: 1 }))).not.toBe(drawLog(golem, l, frame({ t: 1.4 })))
      expect(drawLog(golem, l, frame({ t: 1, still: true }))).toBe(
        drawLog(golem, l, frame({ t: 5.5, still: true })),
      )
      expect(drawLog(golem, l, frame({ t: 1, still: true, fidget: 0.5 }))).toBe(
        drawLog(golem, l, frame({ t: 1, still: true })),
      )
      return drawLog(golem, l, frame({ mood: 'cheer', moodAge: 0.6, eyes: 'happy' }))
    })
    expect(new Set(cheer).size).toBe(LOOKS.length)
  })

  it('plays its signature: Bram yawns, Granite rumbles (a small shake), Grakka lets off steam', () => {
    for (const [, l] of LOOKS)
      expect(drawLog(golem, l, held({ fidget: 0.5 }))).not.toBe(drawLog(golem, l, held()))
    const titan = CREATURE_LOOKS.titan!
    const shake = [0.3, 0.4, 0.5, 0.6].map((fidget) =>
      Math.abs(golem.offsetX!(titan, held({ fidget, t: 1 + fidget }))),
    )
    expect(Math.max(...shake)).toBeGreaterThan(0.2)
    expect(Math.max(...shake)).toBeLessThan(1.5)
    expect(golem.offsetX!(titan, held({ fidget: 0.5, still: true }))).toBe(0)
    expect(golem.offsetX!(titan, frame({ mood: 'pump', moodAge: 0.35 }))).toBe(0)
  })

  it('KO per variant: Bram rolls back and settles in one piece; Granite and Grakka crumble', () => {
    const ko = frame({ mood: 'ko', moodAge: 2, eyes: 'xx', pose: { fall: 1 } })
    const up = (l: CreatureLook) => golem.metrics(l, frame({ still: true }))
    const bram = CREATURE_LOOKS.giant!
    const a = up(bram)
    const b = golem.metrics(bram, ko)
    expect(a.head.x - b.head.x).toBeGreaterThan(8)
    expect(b.bodyBox.w).toBeLessThan(a.bodyBox.w * 1.4)
    for (const id of ['titan', 'berserker'] as const) {
      const l = CREATURE_LOOKS[id]!
      const u = up(l)
      const d = golem.metrics(l, ko)
      expect(d.headTop).toBeGreaterThan(u.headTop + 20)
      expect(d.bodyBox.w).toBeGreaterThan(u.bodyBox.w * 1.2)
    }
    // Grakka's glow cools to dark rock on KO.
    const grakka = CREATURE_LOOKS.berserker!
    expect(fillsOf(grakka, ko)).toContain('#3b2a33')
    expect(fillsOf(grakka, frame())).not.toContain('#3b2a33')
  })
})
