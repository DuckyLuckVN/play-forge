import { describe, expect, it } from 'vitest'
import { bonkVictims, racketHits, STUN, stunImmune, stunLook, stunned, type Body } from './stun'

const body = (id: string, side: 0 | 1, x: number, z: number): Body => ({ id, side, x, z })

describe('stun rules', () => {
  it('racket reach: 1.2 m beside a teammate, 1.0 m across the net, never yourself', () => {
    const a = body('a', 0, 0, -2)
    expect(racketHits(a, body('b', 0, 1.19, -2))).toBe(true)
    expect(racketHits(a, body('b', 0, 1.21, -2))).toBe(false)
    const n = body('n', 0, 0, -0.3)
    expect(racketHits(n, body('m', 1, 0, 0.3))).toBe(true)
    expect(racketHits(n, body('m', 1, 0.9, 0.3))).toBe(false)
    expect(racketHits(a, { ...a })).toBe(false)
  })

  it('stun lasts 48 ticks, immunity 120 more', () => {
    expect(stunned(100, 99)).toBe(false)
    expect(stunned(100, 100)).toBe(true)
    expect(stunned(100, 147)).toBe(true)
    expect(stunned(100, 148)).toBe(false)
    expect(stunImmune(100, 267)).toBe(true)
    expect(stunImmune(100, 268)).toBe(false)
    expect(stunned(-1, 5)).toBe(false)
    expect(stunImmune(-1, 5)).toBe(false)
  })

  it('bonkVictims: everyone in reach but the swinger and the immune, any team, by id', () => {
    const tick = 500
    const mk = () => [
      { ...body('a', 0, 0, -1), stunAt: -1 },
      { ...body('b', 0, 1.0, -1), stunAt: -1 },
      { ...body('c', 1, 0, -0.3), stunAt: -1 },
      { ...body('d', 1, 3, 3), stunAt: -1 },
    ]
    const ps = mk()
    expect(bonkVictims(ps[0], ps, tick).map((p) => p.id)).toEqual(['b', 'c'])
    ps[2].stunAt = tick - 60
    expect(bonkVictims(ps[0], ps, tick).map((p) => p.id)).toEqual(['b'])
    ps[1].stunAt = tick - 200
    expect(bonkVictims(ps[0], ps, tick).map((p) => p.id)).toEqual(['b'])
    ps[2].stunAt = -1
    expect(bonkVictims(ps[0], ps, tick).map((p) => p.id)).toEqual(['b', 'c'])
  })

  it('no stun-lock: an attacker trying every 20 ticks stuns at most once per 168 ticks', () => {
    const atk = { ...body('a', 0, 0, -2), stunAt: -1 }
    const vic = { ...body('v', 0, 0.5, -2), stunAt: -1 }
    const players = [atk, vic]
    const stuns: number[] = []
    let stunnedTicks = 0
    for (let tick = 0; tick < 1200; tick++) {
      if (stunned(vic.stunAt, tick)) stunnedTicks++
      if (tick % 20 === 0 && bonkVictims(atk, players, tick).length > 0) {
        vic.stunAt = tick
        stuns.push(tick)
      }
    }
    expect(stuns.length).toBeGreaterThan(0)
    expect(stuns.length).toBeLessThanOrEqual(8)
    for (let i = 1; i < stuns.length; i++) {
      expect(stuns[i] - stuns[i - 1]).toBeGreaterThanOrEqual(STUN.ticks + STUN.immune)
    }
    expect(stunnedTicks / 1200).toBeLessThanOrEqual(48 / 168 + 0.01)
  })

  it('look: stars while stunned, a short flinch, spin grows', () => {
    const l = stunLook(100, 100)
    expect(l.on).toBe(true)
    expect(l.flinch).toBe(1)
    expect(stunLook(100, 106).flinch).toBeCloseTo(0.5)
    expect(stunLook(100, 112).flinch).toBe(0)
    const off = stunLook(100, 148)
    expect(off.on).toBe(false)
    expect(off.spin).toBe(0)
    expect(stunLook(100, 130).spin).toBeGreaterThan(stunLook(100, 110).spin)
  })
})
