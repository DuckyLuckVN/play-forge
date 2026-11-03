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
    expect(at('fireball').map((m) => m.fireChance)).toEqual([0.08, 0.125, 0.2])
    expect(at('bombball').map((m) => m.bombChance)).toEqual([0.06, 0.09, 0.14])
  })

  it('twin shot and piercing: a third of balls, then half, then all', () => {
    expect(at('twin').map((m) => m.twinChance)).toEqual([0.33, 0.5, 1])
    expect(at('pierce').map((m) => m.pierceChance)).toEqual([0.33, 0.5, 1])
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
    s.ballCount = 600
    s.boosts = boosts
    fire(s, Math.PI / 2)
    return s.balls
  }

  const share = (xs: boolean[]) => xs.filter(Boolean).length / xs.length

  it('twin shot level 1 makes about a third of balls split; level 3 all', () => {
    expect(share(volley({ twin: 1 }).map((b) => !b.split))).toBeCloseTo(0.33, 1)
    expect(volley({ twin: 3 }).every((b) => !b.split)).toBe(true)
  })

  it('piercing level 1 makes about a third of balls pierce; level 3 all', () => {
    expect(share(volley({ pierce: 1 }).map((b) => b.pierceLeft === 1))).toBeCloseTo(0.33, 1)
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
