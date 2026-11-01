import { describe, expect, it } from 'vitest'
import { explode } from './damage'
import { BALL_R } from './config'
import { BOMB_BALL_HITS, bombBlast, drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'

describe('fireball', () => {
  it('makes about 8% of balls fireballs at level 1, by chance (seeded)', () => {
    const s = empty()
    s.boosts = { fireball: 1 }
    s.ballCount = 2000
    fire(s, Math.PI / 2)
    const share = s.balls.filter((b) => b.kind === 'fire').length / 2000
    expect(share).toBeGreaterThan(0.06)
    expect(share).toBeLessThan(0.1)
    // Same seed, same volley: saved runs replay exactly.
    const again = empty()
    again.boosts = { fireball: 1 }
    again.ballCount = 2000
    fire(again, Math.PI / 2)
    expect(again.balls.map((b) => b.kind)).toEqual(s.balls.map((b) => b.kind))
  })

  it('burns through a column of bricks without bouncing', () => {
    const s = empty()
    s.fireCharges = 1
    const column = [2, 3, 4, 5].map((row) => brick(s, 3, row, 1000))
    fire(s, Math.PI / 2)
    expect(s.fireCharges).toBe(0)
    runVolley(s)
    // Up through all four, off the ceiling, and back down through all four: 2 damage each way.
    for (const b of column) expect(b.hp).toBe(996)
  })
})

describe('bomb ball', () => {
  it('blows up the 3x3 around its first hit, killing each brick once', () => {
    const s = empty()
    s.turn = 5
    for (const col of [2, 3, 4]) for (const row of [5, 6]) brick(s, col, row, 1)
    fire(s, Math.PI / 2)
    s.balls[0].kind = 'bomb'
    runVolley(s)
    const kills = drainEvents(s).filter((e) => e.type === 'kill')
    expect(kills).toHaveLength(6)
    expect(s.bricks.filter((b) => b.row > 1)).toHaveLength(0)
  })

  it('blasts for a few of the ball’s own hits: it grows with the build, not with the bricks', () => {
    const s = empty()
    s.turn = 200
    expect(bombBlast(s)).toBe(BOMB_BALL_HITS)
    s.boosts = { damage: 5 }
    expect(bombBlast(s)).toBeCloseTo(BOMB_BALL_HITS * 2)
  })

  it('hits a boss once per blast, however many of its parts are in range', () => {
    const s = empty()
    for (const col of [2, 3, 4])
      for (const row of [4, 5]) {
        const b = brick(s, col, row, 1000)
        b.kind = 'boss'
      }
    s.boss = { hp: 1000, maxHp: 1000, traits: [], noun: 'Golem', turn: 1, dir: 1 }
    explode(s, 3, 5, 10, 0, 'bomb')
    expect(s.boss.hp).toBe(990)
  })

  it('makes about 6% of balls bombs at level 1, by chance', () => {
    const s = empty()
    s.boosts = { bombball: 1 }
    s.ballCount = 2000
    fire(s, Math.PI / 2)
    const share = s.balls.filter((b) => b.kind === 'bomb').length / 2000
    expect(share).toBeGreaterThan(0.04)
    expect(share).toBeLessThan(0.08)
  })
})

describe('twin shot', () => {
  it('splits each ball once on its first hit', () => {
    const s = empty()
    s.boosts = { twin: 3 } // level 3: every ball splits
    s.ballCount = 5
    for (let c = 0; c < 7; c++) brick(s, c, 3, 1e6)
    fire(s, Math.PI / 2 + 0.3)
    let most = 0
    runVolley(s, (x) => (most = Math.max(most, x.balls.length)))
    expect(most).toBeGreaterThan(5)
    expect(most).toBeLessThanOrEqual(10)
  })
})

describe('big balls', () => {
  it('grows the ball radius', () => {
    const s = empty()
    s.boosts = { big: 1 }
    fire(s, Math.PI / 2)
    expect(s.balls[0].r).toBeCloseTo(BALL_R * 1.2)
  })
})

describe('chain lightning', () => {
  it('arcs 14% of hits to three bricks at level 3 (about 0.42 arcs per hit)', () => {
    const s = empty()
    s.boosts = { lightning: 3 }
    let hits = 0
    let zaps = 0
    for (let v = 0; hits < 300 && v < 50; v++) {
      s.bricks = []
      for (let c = 0; c < 7; c++) for (const row of [2, 3]) brick(s, c, row, 1e6)
      s.ballCount = 20
      s.phase = 'aim'
      fire(s, Math.PI / 2 + 0.4 * Math.sin(v))
      runVolley(s, (x) => {
        for (const e of drainEvents(x)) {
          if (e.type === 'hit') hits++
          if (e.type === 'zap') zaps++
        }
      })
    }
    expect(zaps / hits).toBeGreaterThan(0.3)
    expect(zaps / hits).toBeLessThan(0.6)
  })
})

describe('step', () => {
  it('is unaffected by having no boosts', () => {
    const s = empty()
    fire(s, Math.PI / 2)
    step(s)
    expect(s.balls[0].kind).toBe('normal')
    expect(s.balls[0].r).toBe(BALL_R)
  })
})
