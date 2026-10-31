import { describe, expect, it } from 'vitest'
import { killBrick } from './damage'
import { spawnRow } from './rows'
import { drainEvents } from './run'
import { brick, empty } from './testing'

describe('brick hp tracks the turn', () => {
  it('keeps turn 5 bricks at 5–7 with no doubles', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const s = empty(seed)
      s.turn = 5
      spawnRow(s)
      for (const b of s.bricks) {
        expect(b.hp).toBeGreaterThanOrEqual(5)
        expect(b.hp).toBeLessThanOrEqual(7)
      }
    }
  })

  it('doubles about 1 in 10 bricks from turn 10', () => {
    let all = 0
    let doubled = 0
    for (let seed = 1; seed <= 1000; seed++) {
      const s = empty(seed)
      s.turn = 21
      spawnRow(s)
      for (const b of s.bricks) {
        all++
        if (b.hp > 21 * (1 + 21 / 25) * 1.1 + 1) doubled++
      }
    }
    expect(doubled / all).toBeGreaterThan(0.06)
    expect(doubled / all).toBeLessThan(0.14)
  })
})

describe('kill coins', () => {
  it('reports exactly the coins each kill paid', () => {
    const s = empty(3)
    s.boosts = { midas: 1 }
    for (let i = 0; i < 50; i++) {
      const before = s.coins
      killBrick(s, brick(s, 0, 0, 1), 0)
      const kill = drainEvents(s).find((e) => e.type === 'kill')
      expect(kill && kill.type === 'kill' && kill.coins).toBe(s.coins - before)
    }
  })
})
