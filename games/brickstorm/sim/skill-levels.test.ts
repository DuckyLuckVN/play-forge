import { describe, expect, it } from 'vitest'
import { BOOSTS, modsOf } from './boosts'
import { killBrick } from './damage'
import { fire } from './run'
import { brick, empty } from './testing'
import type { BoostId } from './types'

/** A skill's modifiers at levels 1, 2 and 3. */
const at = (id: BoostId) => [1, 2, 3].map((n) => modsOf({ [id]: n }))

describe('skills start weak and grow with each level', () => {
  it('chain lightning: rare at first, more arcs as it levels', () => {
    expect(at('lightning').map((m) => m.zapChance)).toEqual([0.05, 0.09, 0.14])
    expect(at('lightning').map((m) => m.zapArcs)).toEqual([1, 2, 3])
  })

  it('lucky strike: 5% more crits per level', () => {
    at('crit').forEach((m, i) => expect(m.critChance).toBeCloseTo(0.05 * (i + 1)))
  })

  it('fireball and bomb ball: rarer balls at first', () => {
    expect(at('fireball').map((m) => m.fireEvery)).toEqual([12, 8, 5])
    expect(at('bombball').map((m) => m.bombEvery)).toEqual([16, 11, 7])
  })

  it('twin shot and piercing: every 3rd ball, then every 2nd, then all', () => {
    expect(at('twin').map((m) => m.twinEvery)).toEqual([3, 2, 1])
    expect(at('pierce').map((m) => m.pierceEvery)).toEqual([3, 2, 1])
  })

  it('aftershock: half, full, then 1.5× damage to neighbours', () => {
    expect(at('aftershock').map((m) => m.aftershock)).toEqual([0.5, 1, 1.5])
  })

  it('rubber walls: +0.5 then +1 per bounce', () => {
    expect([1, 2].map((n) => modsOf({ bouncy: n }).bounceStep)).toEqual([0.5, 1])
  })

  it('heavy hitter: +20% per level', () => {
    expect(modsOf({ damage: 3 }).damageMult).toBeCloseTo(1.6)
  })

  it('the levelled skills can now be upgraded', () => {
    expect(BOOSTS.twin.max).toBe(3)
    expect(BOOSTS.pierce.max).toBe(3)
    expect(BOOSTS.aftershock.max).toBe(3)
    expect(BOOSTS.bombball.max).toBe(3)
    expect(BOOSTS.bouncy.max).toBe(2)
  })
})

describe('per-ball skills', () => {
  const volley = (boosts: Partial<Record<BoostId, number>>) => {
    const s = empty()
    s.ballCount = 6
    s.boosts = boosts
    fire(s, Math.PI / 2)
    return s.balls
  }

  it('twin shot level 1 makes every 3rd ball split', () => {
    expect(volley({ twin: 1 }).map((b) => !b.split)).toEqual([false, false, true, false, false, true])
    expect(volley({ twin: 3 }).every((b) => !b.split)).toBe(true)
  })

  it('piercing level 1 makes every 3rd ball pierce', () => {
    expect(volley({ pierce: 1 }).map((b) => b.pierceLeft)).toEqual([0, 0, 1, 0, 0, 1])
    expect(volley({ pierce: 3 }).every((b) => b.pierceLeft === 1)).toBe(true)
  })

  it('aftershock level 1 hits neighbours for half damage', () => {
    const s = empty()
    s.boosts = { aftershock: 1 }
    const center = brick(s, 3, 5, 1)
    const near = brick(s, 2, 5, 5)
    killBrick(s, center, 0)
    expect(near.hp).toBe(4.5)
  })
})
