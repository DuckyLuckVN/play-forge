// Hazard bricks: Slime and Void eat balls, Water douses fire (and shrugs off
// lightning), Fire sets a normal ball burning until it burns out.
import { describe, expect, it } from 'vitest'
import { CELL } from './config'
import { damageBrick, zap } from './damage'
import { BURN_MAX, BURN_MIN, HAZARD_HP, SLIME_EAT } from './hazards'
import { cellCenter, pickSpecial, UNLOCK } from './rows'
import { drainEvents, step } from './run'
import { ballAt, brick, empty } from './testing'
import type { Ball, BrickKind, RunState } from './types'

/** One ball fired straight up into a brick of `kind` at (2, 5); returns the run and the ball. */
function shoot(kind: BrickKind, seed = 1, ball?: Partial<Ball>): { s: RunState; b: Ball } {
  const s = empty(seed)
  s.turn = 80
  const target = brick(s, 2, 5, 1000)
  target.kind = kind
  const c = cellCenter(2, 5)
  const b = { ...ballAt(c.x, c.y + CELL), ...ball }
  s.phase = 'volley'
  s.balls = [b]
  drainEvents(s)
  return { s, b }
}
const steps = (s: RunState, n: number) => {
  for (let i = 0; i < n && s.phase === 'volley'; i++) step(s)
}
const eaten = (s: RunState) => drainEvents(s).find((e) => e.type === 'eaten')

describe('hazard bricks', () => {
  it('unlock one by one through the run', () => {
    expect(UNLOCK.slime).toBe(20)
    expect(UNLOCK.water).toBe(35)
    expect(UNLOCK.fire).toBe(50)
    expect(UNLOCK.void).toBe(70)
  })

  it('void: the ball lands its hit, then is swallowed', () => {
    const { s, b } = shoot('void')
    steps(s, 30)
    expect(s.bricks[0].hp).toBeLessThan(1000)
    expect(b.status).toBe('landed')
    expect(eaten(s)).toMatchObject({ by: 'void' })
  })

  it('void and water toughness: void is fragile, water a bit tougher', () => {
    expect(HAZARD_HP.void).toBeLessThan(1)
    expect(HAZARD_HP.water).toBeGreaterThan(1)
  })

  it('slime eats about 30% of the balls that hit it', () => {
    let gone = 0
    const n = 300
    for (let seed = 1; seed <= n; seed++) {
      const { s, b } = shoot('slime', seed)
      steps(s, 30)
      if (b.status === 'landed' && b.y < 600) gone++
    }
    expect(SLIME_EAT).toBe(0.3)
    expect(gone / n).toBeGreaterThan(0.2)
    expect(gone / n).toBeLessThan(0.4)
  })

  it('water douses a fire ball into a normal one', () => {
    const { s, b } = shoot('water', 1, { kind: 'fire' })
    steps(s, 30)
    expect(b.kind).toBe('normal')
    expect(drainEvents(s).some((e) => e.type === 'douse')).toBe(true)
  })

  it('water shrugs off lightning', () => {
    const s = empty()
    const w = brick(s, 1, 1, 50)
    w.kind = 'water'
    const n = brick(s, 2, 1, 50)
    zap(s, { col: 0, row: 1 }, 3, 10, 0)
    expect(w.hp).toBe(50)
    expect(n.hp).toBe(40)
    damageBrick(s, w, 10, 'zap')
    expect(w.hp).toBe(50)
  })

  it('fire sets a normal ball burning; it burns out after a few seconds', () => {
    const { s, b } = shoot('fire')
    steps(s, 30)
    expect(b.burn).toBeGreaterThanOrEqual(0)
    expect(b.burn).toBeLessThanOrEqual(BURN_MAX)
    // Keep it bouncing far from the floor until it burns out.
    for (let i = 0; i < (BURN_MAX + 1) * 120 && b.status === 'flying'; i++) {
      b.y = 300
      b.vy = -Math.abs(b.vy || 600)
      step(s)
    }
    expect(b.status).toBe('landed')
    expect(eaten(s)).toMatchObject({ by: 'burn' })
    expect(BURN_MIN).toBeGreaterThan(1)
  })

  it('a fire ball is not set burning by a fire brick', () => {
    const { s, b } = shoot('fire', 1, { kind: 'fire' })
    steps(s, 30)
    expect(b.burn).toBeUndefined()
  })

  it('water puts out a burning ball', () => {
    const { s, b } = shoot('water', 1, { burn: 1 })
    steps(s, 30)
    expect(b.burn).toBeUndefined()
  })

  it('hazards are rarer than the good specials, and a row gets at most one void', () => {
    const kinds: BrickKind[] = ['gold', 'bomb', 'slime', 'void']
    const count: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const k = pickSpecial(kinds, {}, () => (i + 0.5) / 1000)
      count[k] = (count[k] ?? 0) + 1
    }
    expect(count.slime).toBeLessThan(count.gold)
    expect(count.void).toBeLessThan(count.slime)
    for (let i = 0; i < 50; i++) expect(pickSpecial(kinds, { void: 1 }, () => i / 50)).not.toBe('void')
  })
})
