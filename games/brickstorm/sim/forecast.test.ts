// The crash forecast: what the bricks near the line will cost the hero, using
// the same numbers the crash itself uses.
import { describe, expect, it } from 'vitest'
import { spawnBoss } from './boss'
import { dims } from './dims'
import { crashForecast } from './forecast'
import { breachDamage } from './health'
import { fire } from './run'
import { brick, empty, runVolley } from './testing'

describe('crash forecast', () => {
  it('is empty when nothing is near the line', () => {
    const s = empty()
    brick(s, 0, 2, 10)
    const f = crashForecast(s)
    expect(f.damage).toBe(0)
    expect(f.next.size).toBe(0)
    expect(f.soon.size).toBe(0)
  })

  it('bricks one row above the line: their total is exactly what the crash will take', () => {
    const s = empty()
    s.turn = 25
    const { dangerRow } = dims(s)
    const row = [0, 1, 2, 3, 4].map((c) => brick(s, c, dangerRow - 1, 10 + c))
    row[0].hp = 2 // worn down: hurts less
    const f = crashForecast(s)
    const expected = breachDamage(
      s,
      row.map((b) => ({ ...b, row: dangerRow })),
    )
    expect(f.damage).toBe(expected)
    // The badges add up to the bar's preview (give or take rounding).
    const sum = [...f.next.values()].reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - expected)).toBeLessThanOrEqual(row.length)
    expect(f.next.get(row[0].id)!).toBeLessThan(f.next.get(row[1].id)!)
  })

  it('matches the health actually lost when the turn ends', () => {
    const s = empty()
    s.turn = 25
    const { dangerRow } = dims(s)
    for (const c of [0, 1, 2]) brick(s, c, dangerRow - 1, 1e6) // too tough to break this volley
    const before = s.hp
    const f = crashForecast(s)
    fire(s, Math.PI / 2) // straight up the middle, clear of the bricks
    runVolley(s)
    expect(before - s.hp).toBe(f.damage)
  })

  it('bricks two rows up show as "soon", not in the next-turn total', () => {
    const s = empty()
    s.turn = 25
    const { dangerRow } = dims(s)
    const b = brick(s, 0, dangerRow - 2, 10)
    const f = crashForecast(s)
    expect(f.damage).toBe(0)
    expect(f.soon.get(b.id)).toBeGreaterThan(0)
  })

  it('a frozen turn means nothing crashes next turn', () => {
    const s = empty()
    s.turn = 25
    s.freezeNext = true
    const b = brick(s, 0, dims(s).dangerRow - 1, 10)
    const f = crashForecast(s)
    expect(f.damage).toBe(0)
    expect(f.soon.get(b.id)).toBeGreaterThan(0)
  })

  it('a boss about to crash counts its full hit', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, [], 'block')
    s.turn++ // a boss fight drops every other turn: this is a turn it drops
    const { dangerRow } = dims(s)
    const bottom = Math.max(...s.bricks.map((b) => b.row))
    for (const b of s.bricks) b.row += dangerRow - 1 - bottom
    const f = crashForecast(s)
    expect(f.boss).toBeGreaterThan(0)
    expect(f.damage).toBe(
      breachDamage(
        s,
        s.bricks.map((b) => ({ ...b, row: dangerRow })),
      ),
    )
  })
})
