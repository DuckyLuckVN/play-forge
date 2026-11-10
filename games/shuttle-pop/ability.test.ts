import { describe, expect, it } from 'vitest'
import {
  ABILITY,
  abilityShot,
  actArc,
  acting,
  actMoveMul,
  actReady,
  cooldownLeft,
  landTick,
  leadOf,
  pickAbility,
  reachOf,
  type Act,
  type AbilityKind,
} from './ability'
import type { Flight } from './physics'
import { REACH } from './shots'

const act = (k: AbilityKind, at: number): Act => ({ k, at, dx: 0, dz: 0 })
/** A high lob on side 0's half: apex ~3.4 m around z -2.2 (enters plain reach at y 2.9, peaks above it). */
const lob = (): Flight => ({ pos: { x: 0, y: 2.9, z: -1.5 }, vel: { x: 0, y: 3.5, z: -2.5 } })
/** A low drive, y ~0.8, passing 1.8 m wide of a player at (0, -5.4). */
const drive = (): Flight => ({ pos: { x: 1.8, y: 0.8, z: -7 }, vel: { x: 0, y: 1.2, z: 9 } })

describe('ability', () => {
  it('reach boxes: jump +0.8 m up, lunge +1.2 m out, none = REACH', () => {
    expect(reachOf('jump').maxY).toBeCloseTo(REACH.maxY + 0.8)
    expect(reachOf('jump').minY).toBeCloseTo(2.2)
    expect(reachOf('lunge').radius).toBeCloseTo(REACH.radius + 1.2)
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
    expect(abilityShot('jump', { x: 0, z: 0 }, 'good')).toEqual({ kind: 'smash', grade: 'good', charge: 0.6 })
    expect(abilityShot('jump', { x: 1, z: 1 }, 'perfect')).toEqual({
      kind: 'smash',
      grade: 'perfect',
      charge: 0.6,
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
    expect(actArc(j, 15).lift).toBeCloseTo(0.75)
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
})
