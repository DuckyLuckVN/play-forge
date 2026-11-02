import { describe, expect, it, vi } from 'vitest'
import { HeroAvatar } from '../../hero-avatar'
import { fakeCanvas, installPath2D, type CallRecord } from '../../test-canvas'
import { CREATURE_LOOKS } from '../looks'
import type { HandPose } from '../types'
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
  held,
  kitFor,
  run,
  toBox,
  worstHold,
} from './body-fixtures'
import { crab } from './crab'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

installPath2D()

const look = CREATURE_LOOKS.pirate

/** Every ellipse drawn, straight on the canvas or inside a path. */
function ellipses(log: CallRecord[]): number[][] {
  const out: number[][] = []
  for (const c of log) {
    if (c.name === 'ellipse') out.push(c.args as number[])
    for (const a of c.args)
      if (a && typeof a === 'object' && 'ops' in a)
        for (const op of (a as { ops: CallRecord[] }).ops)
          if (op.name === 'ellipse') out.push(op.args as number[])
  }
  return out
}

describe('crab body (Cap’n Pinch)', () => {
  it('is registered, and the pirate is a crab that snips', () => {
    expect(BODIES.crab).toBe(crab)
    expect(look.body).toBe('crab')
    expect(look.signature).toBe('snip')
    for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is armed (claws), stands within ±20% of the old figure, the ball in reach', () => {
    const m = crab.metrics(look, held({ still: true }))
    expect(m.armed).toBe(true)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-36)
    expect(m.socketF.x).toBeGreaterThan(m.socketB.x)
    for (const b of [HOLD, { x: 12, y: -15.6 }]) {
      const d = Math.hypot(b.x - m.socketF.x, b.y - m.socketF.y)
      expect(d).toBeLessThan(m.upper + m.fore)
      expect(d).toBeGreaterThan(Math.abs(m.upper - m.fore))
    }
  })

  it('draws in every mood, eye style, still and fidget case, back claw first, with its hat', () => {
    for (const c of DRAW_CASES) {
      const f = caseFrame(c)
      const { kit, calls } = kitFor(crab, look, f)
      expect(() => crab.draw(fakeCanvas(), look, f, kit)).not.toThrow()
      expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
      expect(calls).toContain('hat')
    }
  })

  it('draws claws whose pincers open with `open`; holding a ball it leaves the upper pincer to the grip', () => {
    const h = kitFor(crab, look, held()).kit.hands.front
    const draw = (p: HandPose) => {
      const c = fakeCanvas()
      crab.drawHand!(c, p, look, 4.6)
      return ellipses(c.log)
    }
    const shut = draw({ ...h, open: 0 })
    const open = draw({ ...h, open: 1 })
    expect(JSON.stringify(open)).not.toBe(JSON.stringify(shut))
    expect(draw({ ...h, open: 0, grip: 7 }).length).toBeLessThan(shut.length)
  })

  it('grips the ball between its pincers: the grip draws the upper pincer at the ball edge', () => {
    for (const r of [5, 7, 9]) {
      const ball = { x: 12, y: -21, r }
      const h: HandPose = { x: 12, y: -21, ex: 4, ey: -18, open: 0, front: true }
      const c = fakeCanvas()
      crab.drawGrip!(c, h, ball, look)
      const es = ellipses(c.log)
      expect(es.length).toBeGreaterThan(0)
      // The pincer sits on the ball's upper edge (the side away from the floor for this forearm).
      const edge = es.filter(([x, y]) => {
        const d = Math.hypot(x - ball.x, y - ball.y)
        return d > r * 0.75 && d < r * 1.7 && y < ball.y
      })
      expect(edge.length).toBeGreaterThan(0)
    }
  })

  it('scuttles sideways at rest (offsetX), still under reduced motion, smooth on the pump', () => {
    const at = (patch: FramePatch) => crab.offsetX!(look, held(patch))
    expect(Math.abs(at({ t: 1 }) - at({ t: 2.2 }))).toBeGreaterThan(1)
    expect(at({ t: 1, still: true })).toBe(0)
    expect(at({ t: 2.2, still: true })).toBe(0)
    // Crouched to aim it stops scuttling.
    expect(Math.abs(at({ mood: 'aim', t: 1.2, pose: { crouch: 0.35 } }))).toBeLessThan(0.3)
    for (let t = 0; t < 0.4; t += 1 / 60) {
      const a = crab.offsetX!(look, frame({ mood: 'pump', moodAge: t, t: 1 + t }))
      const b = crab.offsetX!(look, frame({ mood: 'pump', moodAge: t + 1 / 60, t: 1 + t + 1 / 60 }))
      expect(Math.abs(a - b)).toBeLessThan(0.3)
    }
  })

  it('rests the back claw out to the side while holding, clear of the head', () => {
    for (const [mood, patch] of HOLD_POSES) {
      const f = held({ mood, pose: { ...patch } })
      const m = crab.metrics(look, f)
      const { back } = handsOf(crab, look, f)
      expect(back.x).toBeLessThan(m.bodyBox.x)
      expect(back.y).toBeGreaterThan(m.head.y + m.head.ry)
    }
  })

  it('free claws stay near the body and out of the head', () => {
    for (const mood of MOODS) {
      if (mood === 'throw' || mood === 'ko') continue
      for (const t of [0, 0.7, 1.9]) {
        const f = frame({ mood, t, moodAge: 0.5 })
        const m = crab.metrics(look, f)
        const h = handsOf(crab, look, f)
        for (const hand of [h.front, h.back]) {
          expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
          expect(
            Math.hypot((hand.x - m.head.x) / m.head.rx, (hand.y - m.head.y) / m.head.ry),
          ).toBeGreaterThan(1)
        }
      }
    }
  })

  it('cheers with both claws up, clacking', () => {
    const f = frame({ mood: 'cheer', moodAge: 0.5 })
    const m = crab.metrics(look, f)
    const h = handsOf(crab, look, f)
    expect(h.front.y).toBeLessThan(m.socketF.y)
    expect(h.back.y).toBeLessThan(m.socketB.y)
    expect(drawLog(crab, look, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))).not.toBe(
      drawLog(crab, look, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' })),
    )
  })

  it('moves in its idle loop, frozen under reduced motion', () => {
    expect(drawLog(crab, look, frame({ t: 1 }))).not.toBe(drawLog(crab, look, frame({ t: 1.4 })))
    expect(drawLog(crab, look, frame({ t: 1, still: true }))).toBe(
      drawLog(crab, look, frame({ t: 5.5, still: true })),
    )
    const still = (patch: FramePatch) => crab.metrics(look, frame({ still: true, ...patch }))
    expect(still({ mood: 'cheer', moodAge: 0.4 }).head).toEqual(still({ mood: 'cheer', moodAge: 1.2 }).head)
    expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(still({ mood: 'hurt', moodAge: 1 }).bodyBox)
  })

  it('flips onto its back on KO, claws and legs in the air; revive rights it', () => {
    const f = frame({ mood: 'ko', moodAge: 2, pose: { fall: 1 } })
    const up = crab.metrics(look, frame())
    const down = crab.metrics(look, f)
    // The eyes end up underneath.
    expect(down.head.y).toBeGreaterThan(down.bodyBox.y + down.bodyBox.h / 2)
    expect(down.headTop).toBeGreaterThan(up.headTop + 10)
    const h = handsOf(crab, look, f)
    for (const hand of [h.front, h.back]) expect(hand.y).toBeLessThan(down.bodyBox.y + down.bodyBox.h / 2)
    const back = crab.metrics(look, frame({ mood: 'revive', pose: { fall: 0 } }))
    expect(back.headTop).toBeCloseTo(up.headTop, 0)
  })

  it('snips on its signature: the back claw rises and clacks', () => {
    const f = held({ fidget: 0.5 })
    const m = crab.metrics(look, f)
    expect(handsOf(crab, look, f).back.y).toBeLessThan(m.socketB.y - 4)
    expect(drawLog(crab, look, f)).not.toBe(drawLog(crab, look, held()))
  })

  it('holds the ball exactly in the front claw, mirrored and bigger too', () => {
    const worst = worstHold('pirate')
    expect(worst).not.toBeNull()
    expect(worst!).toBeLessThan(0.01)
  })

  it('clacks its claws on cheer in the real avatar (the kit draws the `open` the body sets on k.hands)', () => {
    const spy = vi.spyOn(crab, 'drawHand')
    try {
      const a = new HeroAvatar('pirate')
      run(a, 0.3, actx())
      a.setMood('cheer')
      let most = 0
      for (let i = 0; i < 30; i++) {
        a.update(1 / 60, actx())
        a.draw(fakeCanvas(), 760)
      }
      for (const [, h] of spy.mock.calls) most = Math.max(most, h.open)
      expect(most).toBeGreaterThan(0.3)
    } finally {
      spy.mockRestore()
    }
  })

  it('draws its pincer grip over the held ball in the real avatar', () => {
    const spy = vi.spyOn(crab, 'drawGrip')
    try {
      const a = new HeroAvatar('pirate')
      const h = { x: 100, y: 740, r: 5 }
      run(a, 0.5, actx({ hold: h }))
      a.draw(fakeCanvas(), 760)
      expect(spy).toHaveBeenCalledTimes(1)
      const [, hand, ball] = spy.mock.calls[0]
      expect(ball.x).toBeCloseTo(hand.x, 6)
      expect(ball.y).toBeCloseTo(hand.y, 6)
    } finally {
      spy.mockRestore()
    }
  })
})
