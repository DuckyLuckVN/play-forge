import { describe, expect, it } from 'vitest'
import { spawnBoss } from './boss'
import { applyHelpers, useHelper } from './meta'
import { drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'

describe('run-start helpers', () => {
  it('Power, Gold and Eagle Start begin the run with boosts', () => {
    const s = empty()
    applyHelpers(s, {
      headStart: false,
      luckyStart: false,
      powerStart: true,
      goldStart: true,
      eagleStart: true,
    })
    expect(s.boosts).toMatchObject({ damage: 2, coins: 2, eagle: 1 })
  })
})

describe('more mid-run helpers', () => {
  it('Mega Bomb halves every brick and dents the boss', () => {
    const s = empty()
    const a = brick(s, 0, 3, 40)
    const b = brick(s, 5, 6, 9)
    const tiny = brick(s, 2, 2, 1)
    useHelper(s, 'megaBomb')
    expect(a.hp).toBe(20)
    expect(b.hp).toBe(4.5)
    expect(s.bricks).not.toContain(tiny)
    const boss = empty()
    boss.turn = 30
    spawnBoss(boss, [])
    boss.phase = 'aim'
    const full = boss.boss!.hp
    useHelper(boss, 'megaBomb')
    expect(boss.boss!.hp).toBeLessThan(full)
  })

  it('Column Bomb clears the fullest column', () => {
    const s = empty()
    brick(s, 2, 1, 50)
    brick(s, 2, 3, 50)
    brick(s, 2, 5, 50)
    const other = brick(s, 4, 5, 50)
    useHelper(s, 'colBomb')
    expect(s.bricks).toEqual([other])
  })

  it('Laser Grid fires across the three lowest rows', () => {
    const s = empty()
    s.turn = 10
    const low = [brick(s, 0, 8, 100), brick(s, 1, 7, 100), brick(s, 2, 6, 100)]
    const high = brick(s, 3, 2, 100)
    useHelper(s, 'laserGrid')
    for (const b of low) expect(b.hp).toBeLessThan(100)
    expect(high.hp).toBe(100)
    expect(drainEvents(s).filter((e) => e.type === 'laser')).toHaveLength(3)
  })

  it('Midas Touch turns up to 4 plain bricks into gold', () => {
    const s = empty()
    for (let c = 0; c < 6; c++) brick(s, c, 2, 10)
    useHelper(s, 'midasTouch')
    expect(s.bricks.filter((b) => b.kind === 'gold')).toHaveLength(4)
  })

  it('Ball Rain adds 10 balls to the next volley only', () => {
    const s = empty()
    brick(s, 3, 0, 1e9)
    useHelper(s, 'ballRain')
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(11)
    runVolley(s)
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(1)
  })

  it('Overcharge doubles damage for one volley', () => {
    const s = empty()
    const target = brick(s, 3, 5, 1000)
    useHelper(s, 'overcharge')
    fire(s, Math.PI / 2)
    while (s.phase === 'volley' && target.hp === 1000) step(s)
    expect(target.hp).toBe(998)
    runVolley(s)
    const before = target.hp
    fire(s, Math.PI / 2)
    while (s.phase === 'volley' && target.hp === before) step(s)
    expect(target.hp).toBe(before - 1)
  })

  it('Vacuum collects every pickup on the board', () => {
    const s = empty()
    s.pickups.push({ id: 90, col: 1, row: 2, kind: 'ball' }, { id: 91, col: 5, row: 4, kind: 'coin' })
    useHelper(s, 'vacuum')
    expect(s.pickups).toHaveLength(0)
    expect(s.pendingBalls).toBe(1)
    expect(s.coins).toBeGreaterThan(0)
  })

  it('Pierce Shot lets every ball pass through its first 2 bricks', () => {
    const s = empty()
    brick(s, 3, 0, 1e9)
    useHelper(s, 'pierceShot')
    fire(s, Math.PI / 2)
    expect(s.balls.every((b) => b.pierceLeft >= 2)).toBe(true)
    runVolley(s)
    fire(s, Math.PI / 2)
    expect(s.balls.every((b) => b.pierceLeft === 0)).toBe(true)
  })
})
