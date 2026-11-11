import { describe, expect, it } from 'vitest'
import {
  ABILITY,
  abilityShot,
  actArc,
  actArcInto,
  actorIndex,
  acting,
  actMoveMul,
  actReady,
  cooldownLeft,
  horizonOf,
  landTick,
  leadOf,
  pickAbility,
  pickReachOf,
  reachOf,
  slideEnd,
  slideOf,
  slideStep,
  strikeFrom,
  type Act,
  type AbilityKind,
} from './ability'
import { stepShuttle, type Flight } from './physics'
import { REACH } from './shots'

const act = (k: AbilityKind, at: number): Act => ({ k, at, dx: 0, dz: 0 })
/** A high lob on side 0's half: apex ~3.4 m around z -2.2 (enters plain reach at y 2.9, peaks above it). */
const lob = (): Flight => ({ pos: { x: 0, y: 2.9, z: -1.5 }, vel: { x: 0, y: 3.5, z: -2.5 } })
/** A low drive, y ~0.8, passing 1.8 m wide of a player at (0, -5.4). */
const drive = (): Flight => ({ pos: { x: 1.8, y: 0.8, z: -7 }, vel: { x: 0, y: 1.2, z: 9 } })

describe('ability', () => {
  it('reach boxes: jump +0.95 m up, lunge 1.6 m from its slide end (+1.5 m out from the press), none = REACH', () => {
    expect(reachOf('jump').maxY).toBeCloseTo(REACH.maxY + 0.95)
    expect(reachOf('jump').minY).toBeCloseTo(2.2)
    expect(reachOf('lunge').radius).toBeCloseTo(1.6)
    expect(pickReachOf('lunge').radius).toBeCloseTo(REACH.radius + 1.5)
    expect(pickReachOf('jump')).toBe(reachOf('jump'))
    expect(reachOf()).toBe(REACH)
    expect(leadOf('jump')).toBe(ABILITY.jump.lead)
    expect(leadOf('lunge')).toBe(ABILITY.lunge.lead)
    expect(leadOf()).toBe(0)
  })

  it('picks jump for a high shuttle, lunge for a low far one, hop otherwise', () => {
    // a shuttle only above plain reach: jump; its contact is above REACH.maxY
    const over: Flight = { pos: { x: -3, y: 3.2, z: -2 }, vel: { x: 12, y: 2.6, z: 0 } }
    expect(pickAbility(over, { x: 0, z: -2 }, 0, 1, true).k).toBe('jump')
    const f = lob()
    const snap = JSON.stringify(f)
    const j = pickAbility(f, { x: 0.4, z: -2.2 }, 0, 1, true)
    expect(JSON.stringify(f)).toBe(snap)
    expect(j.k).toBe('jump')
    expect(Math.hypot(j.dx, j.dz)).toBeCloseTo(1)
    expect(j.dx).toBeLessThan(0) // toward the shuttle (x 0)
    const l = pickAbility(drive(), { x: 0, z: -5.4 }, 0, 1, true)
    expect(l.k).toBe('lunge')
    expect(Math.hypot(l.dx, l.dz)).toBeCloseTo(1)
    expect(l.dx).toBeGreaterThan(0)
    // dead centre on the contact: 0/0 direction, still a jump
    const c = pickAbility(lob(), { x: 0, z: -2.2 }, 0, 1, true)
    expect(c.k).toBe('jump')
    expect(Math.abs(c.dx) + Math.abs(c.dz)).toBeLessThanOrEqual(1)
    const hop = { k: 'hop', dx: 0, dz: 0 }
    // the other half: side 1 standing at the mirrored spot
    expect(pickAbility(lob(), { x: 0.4, z: 2.2 }, 1, 0, true)).toEqual(hop)
    expect(pickAbility(lob(), { x: 0.4, z: -2.2 }, 1, 0, true)).toEqual(hop)
    expect(pickAbility(lob(), { x: 0.4, z: -2.2 }, 0, 1, false)).toEqual(hop)
    expect(pickAbility(lob(), { x: 0.4, z: -2.2 }, 0, 0, true)).toEqual(hop)
    // a plain swing reaches it: hop (no free jump / lunge)
    const mid: Flight = { pos: { x: 0, y: 2.2, z: -1.5 }, vel: { x: 0, y: 1.5, z: -2.5 } }
    expect(pickAbility(mid, { x: 0.4, z: -2.2 }, 0, 1, true)).toEqual(hop)
    expect(pickAbility(drive(), { x: 1.0, z: -5.4 }, 0, 1, true)).toEqual(hop)
    // nothing in any box: hop
    expect(pickAbility(lob(), { x: 2.5, z: -6 }, 0, 1, true)).toEqual(hop)
  })

  it('never picks a move that cannot grade: the horizon is lead + the late window per kind', () => {
    expect(horizonOf('jump')).toBe(30)
    expect(horizonOf('lunge')).toBe(26)
    // The jump box is first entered 31 ticks out: a press now would whiff for sure (lock + cooldown) = hop.
    const early = (): Flight => ({ pos: { x: 0, y: 4.28, z: -0.95 }, vel: { x: 0, y: 1.9, z: -6.4 } })
    const at = { x: 0, z: -4 }
    expect(pickAbility(early(), at, 0, 1, true).k).toBe('hop')
    // Two ticks on (29 out): it grades (Late at worst), so the button jumps.
    const f = early()
    stepShuttle(f)
    stepShuttle(f)
    expect(pickAbility(f, at, 0, 1, true).k).toBe('jump')
  })

  it('timeline: jump locks air + 0.4 s, lunge 0.9 s, hop never', () => {
    expect(acting(null, 5)).toBe(false)
    expect(acting(act('jump', 100), 99)).toBe(false)
    expect(acting(act('jump', 100), 100)).toBe(true)
    expect(acting(act('jump', 100), 153)).toBe(true)
    expect(acting(act('jump', 100), 154)).toBe(false)
    expect(acting(act('lunge', 100), 153)).toBe(true)
    expect(acting(act('lunge', 100), 154)).toBe(false)
    expect(acting(act('hop', 100), 101)).toBe(false)
    expect(actMoveMul(null, 5)).toBe(1)
    expect(actMoveMul(act('jump', 100), 99)).toBe(1)
    expect(actMoveMul(act('jump', 100), 110)).toBe(0.5)
    expect(actMoveMul(act('jump', 100), 140)).toBe(0)
    expect(actMoveMul(act('jump', 100), 154)).toBe(1)
    expect(actMoveMul(act('lunge', 100), 101)).toBe(0)
    expect(actMoveMul(act('lunge', 100), 154)).toBe(1)
    expect(actMoveMul(act('hop', 100), 105)).toBe(1)
    expect(landTick(act('jump', 100))).toBe(130)
    expect(landTick(act('lunge', 100))).toBe(112)
    expect(landTick(act('hop', 100))).toBe(118)
  })

  it('cooldowns: 3 s shared, hop 1 s', () => {
    expect(actReady(null, 0)).toBe(true)
    expect(actReady(act('jump', 100), 279)).toBe(false)
    expect(actReady(act('jump', 100), 280)).toBe(true)
    expect(actReady(act('lunge', 100), 279)).toBe(false)
    expect(actReady(act('hop', 100), 159)).toBe(false)
    expect(actReady(act('hop', 100), 160)).toBe(true)
    expect(cooldownLeft(act('lunge', 100), 190)).toBeCloseTo(0.5)
    expect(cooldownLeft(act('jump', 100), 100)).toBe(1)
    expect(cooldownLeft(act('jump', 100), 50)).toBe(1)
    expect(cooldownLeft(act('jump', 100), 280)).toBe(0)
    expect(cooldownLeft(null, 5)).toBe(0)
  })

  it('shot override: jump smashes stronger, lunge only lifts', () => {
    expect(abilityShot('jump', { x: 0, z: 0 }, 'good')).toEqual({ kind: 'smash', grade: 'good', charge: 0.8 })
    expect(abilityShot('jump', { x: 1, z: 1 }, 'perfect')).toEqual({
      kind: 'smash',
      grade: 'perfect',
      charge: 0.8,
    })
    expect(abilityShot('jump', { x: 0, z: -1 }, 'perfect')).toEqual({
      kind: 'clear',
      grade: 'perfect',
      charge: 0,
    })
    expect(abilityShot('jump', { x: 0, z: 1 }, 'late')).toEqual({ kind: 'clear', grade: 'late', charge: 0 })
    expect(abilityShot('lunge', { x: 0, z: 1 }, 'perfect')).toEqual({
      kind: 'clear',
      grade: 'good',
      charge: 0,
    })
    expect(abilityShot('lunge', { x: 0, z: 0 }, 'late')).toEqual({ kind: 'clear', grade: 'late', charge: 0 })
  })

  it('arc: jump peaks mid-air at height, hop is small, lunge dives then recovers', () => {
    const j = act('jump', 0)
    expect(actArc(j, 15).lift).toBeCloseTo(1.1)
    expect(actArc(j, 0).lift).toBe(0)
    expect(actArc(j, 30).lift).toBe(0)
    expect(actArc(j, 40).lift).toBe(0)
    expect(actArc(j, -1).lift).toBe(0)
    expect(actArc(j, 15).dive).toBe(0)
    expect(actArc(j, 7.5).lift).toBeGreaterThan(0.5) // fractional render ticks
    expect(actArc(act('hop', 0), 9).lift).toBeCloseTo(0.25)
    const l = act('lunge', 0)
    expect(actArc(l, 0).dive).toBe(0)
    expect(actArc(l, 6).dive).toBeCloseTo(0.5)
    expect(actArc(l, 12).dive).toBe(1)
    expect(actArc(l, 30).dive).toBe(1)
    expect(actArc(l, 48).dive).toBeGreaterThan(0)
    expect(actArc(l, 48).dive).toBeLessThan(1)
    expect(actArc(l, 54).dive).toBe(0)
    expect(actArc(l, 30).lift).toBe(0)
    expect(actArc(null, 3)).toEqual({ lift: 0, dive: 0 })
  })

  it('actArcInto fills one object in place, the same as actArc', () => {
    const out = { lift: 9, dive: 9 }
    for (const [a, t] of [
      [act('jump', 0), 15],
      [act('lunge', 0), 6],
      [act('hop', 0), 9],
      [null, 3],
    ] as const) {
      expect(actArcInto(a, t, out)).toBe(out)
      expect(out).toEqual(actArc(a, t))
    }
  })

  it('actorIndex: the seat of an act / actLand event (by side, kind and tick; any number of players)', () => {
    const players = [
      { side: 0 as const, act: act('jump', 10) },
      { side: 1 as const, act: act('lunge', 12) },
      { side: 1 as const, act: act('hop', 20) },
      { side: 0 as const, act: null },
    ]
    expect(actorIndex(players, { k: 'act', side: 0, act: 'jump', tick: 10 })).toBe(0)
    expect(actorIndex(players, { k: 'act', side: 1, act: 'hop', tick: 20 })).toBe(2)
    expect(actorIndex(players, { k: 'actLand', side: 1, act: 'lunge', tick: 24 })).toBe(1)
    expect(actorIndex(players, { k: 'actLand', side: 0, act: 'jump', tick: 40 })).toBe(0)
    // No exact match (state moved on): the first player on that side.
    expect(actorIndex(players, { k: 'act', side: 1, act: 'jump', tick: 99 })).toBe(1)
    expect(actorIndex([], { k: 'act', side: 1, act: 'jump', tick: 99 })).toBe(-1)
  })

  describe('Jump / Dive buttons (forced moves)', () => {
    it('jump: strikes a high shuttle; nothing in the box (or not mine) = an empty jump, never a hop', () => {
      const j = pickAbility(lob(), { x: 0.4, z: -2.2 }, 0, 1, true, 'jump')
      expect(j).toMatchObject({ k: 'jump' })
      expect(j.empty).toBeUndefined()
      expect(pickAbility(drive(), { x: 0, z: -5.4 }, 0, 1, true, 'jump')).toEqual({
        k: 'jump',
        dx: 0,
        dz: 0,
        empty: true,
      })
      expect(pickAbility(lob(), { x: 0.4, z: -2.2 }, 0, 1, false, 'jump').empty).toBe(true)
    })

    it('dive: goes the held way; strikes from the slide end, else empty', () => {
      // The wide drive passes 1.8 m to +x: diving +x reaches it.
      const toward = pickAbility(drive(), { x: 0, z: -5.4 }, 0, 1, true, 'lunge', { x: 1, z: 0 })
      expect(toward).toEqual({ k: 'lunge', dx: 1, dz: 0 })
      // Diving the other way: still a dive (the player's call), nothing to strike.
      const away = pickAbility(drive(), { x: 0, z: -5.4 }, 0, 1, true, 'lunge', { x: -1, z: 0 })
      expect(away).toEqual({ k: 'lunge', dx: -1, dz: 0, empty: true })
      // No direction held: toward the shuttle it would reach.
      const auto = pickAbility(drive(), { x: 0, z: -5.4 }, 0, 1, true, 'lunge')
      expect(auto.k).toBe('lunge')
      expect(auto.dx).toBeGreaterThan(0.5)
      expect(auto.empty).toBeUndefined()
      // Nothing to reach and nothing held: toward the net (side 0 = +z, side 1 = −z), empty.
      expect(pickAbility(lob(), { x: 2.5, z: -6 }, 0, 1, true, 'lunge')).toEqual({
        k: 'lunge',
        dx: 0,
        dz: 1,
        empty: true,
      })
      expect(pickAbility(lob(), { x: 2.5, z: 6 }, 1, 0, false, 'lunge')).toMatchObject({
        dz: -1,
        empty: true,
      })
      // An easy shuttle a plain swing reaches: the button still dives (no hop rule for a forced move).
      expect(pickAbility(drive(), { x: 1.0, z: -5.4 }, 0, 1, true, 'lunge', { x: 1, z: 0 }).k).toBe('lunge')
    })

    it('an empty forced move cools down like a hop; a striking one the full 3 s', () => {
      const empty: Act = { k: 'lunge', at: 0, dx: 1, dz: 0, empty: true }
      expect(actReady(empty, ABILITY.hop.cooldown - 1)).toBe(false)
      expect(actReady(empty, ABILITY.hop.cooldown)).toBe(true)
      expect(cooldownLeft(empty, ABILITY.hop.cooldown / 2)).toBeCloseTo(0.5)
      expect(actReady(act('lunge', 0), ABILITY.hop.cooldown)).toBe(false)
    })
  })

  describe('dive slide', () => {
    it('slides `slide` m over the dive, eased out, the press tick itself free', () => {
      const { dive, slide } = ABILITY.lunge
      expect(slideOf(0)).toBe(0)
      expect(slideOf(dive)).toBe(slide)
      expect(slideOf(dive + 5)).toBe(slide)
      expect(slideOf(dive / 2)).toBeGreaterThan(slide / 2) // a burst that settles
      const a: Act = { k: 'lunge', at: 10, dx: 0.6, dz: -0.8 }
      const o = { x: 0, z: 0 }
      let x = 0
      let z = 0
      for (let e = 0; e <= dive + 3; e++) {
        slideStep(a, e, o)
        if (e === 0 || e > dive) expect(o).toEqual({ x: 0, z: 0 })
        x += o.x
        z += o.z
      }
      expect(x).toBeCloseTo(0.6 * slide)
      expect(z).toBeCloseTo(-0.8 * slide)
      expect(slideStep(act('jump', 0), 3, o)).toEqual({ x: 0, z: 0 })
      expect(slideStep(null, 3, o)).toEqual({ x: 0, z: 0 })
    })

    it('a lunge reaches from its slide end, also mid-dive (strikeFrom)', () => {
      const a: Act = { k: 'lunge', at: 0, dx: 1, dz: 0 }
      const { slide, dive } = ABILITY.lunge
      expect(slideEnd({ x: 1, z: 2 }, 1, 0)).toEqual({ x: 1 + slide, z: 2 })
      expect(strikeFrom({ x: 0, z: 0 }, a, 0)).toEqual({ x: slide, z: 0 })
      // Halfway through the dive the body has slid slideOf(e): the rest is added on.
      const mid = strikeFrom({ x: slideOf(4), z: 0 }, a, 4)
      expect(mid.x).toBeCloseTo(slide)
      expect(strikeFrom({ x: 3, z: 0 }, a, dive)).toEqual({ x: 3, z: 0 })
      expect(strikeFrom({ x: 3, z: 0 }, act('jump', 0), 2)).toEqual({ x: 3, z: 0 })
    })
  })
})
