import { describe, expect, it } from 'vitest'
import { arenaProgress, BOSS_DROP, BOSS_SETTLE, bossDrop, shownBoard } from './boss-entrance'

const OPEN = 0.35
const LAND = 1.35

describe('arena size change', () => {
  const grow = { grow: true, age: 0, held: false, cols: 1, rows: 4 }
  it('a boss arena holds its old size through the rumble, then eases open', () => {
    expect(arenaProgress(grow, OPEN, LAND, 0.9)).toBe(0)
    expect(arenaProgress({ ...grow, age: OPEN }, OPEN, LAND, 0.9)).toBe(0)
    const mid = arenaProgress({ ...grow, age: (OPEN + LAND) / 2 }, OPEN, LAND, 0.9)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(arenaProgress({ ...grow, age: LAND }, OPEN, LAND, 0.9)).toBe(1)
  })
  it('a held shrink stays at the old size until released', () => {
    const shrink = { grow: false, age: 5, held: true, cols: 1, rows: 4 }
    expect(arenaProgress(shrink, OPEN, LAND, 0.9)).toBe(0)
    expect(arenaProgress({ ...shrink, held: false, age: 0.9 }, OPEN, LAND, 0.9)).toBe(1)
  })
  it('the shown board goes from the old size to the real one', () => {
    expect(shownBoard({ cols: 9, rows: 16 }, grow, 0)).toEqual({ cols: 7, rows: 12 })
    expect(shownBoard({ cols: 9, rows: 16 }, grow, 0.5)).toEqual({ cols: 8, rows: 14 })
    expect(shownBoard({ cols: 9, rows: 16 }, grow, 1)).toEqual({ cols: 9, rows: 16 })
    expect(shownBoard({ cols: 7, rows: 12 }, { grow: false, cols: 1, rows: 4 }, 0)).toEqual({
      cols: 9,
      rows: 16,
    })
  })
})

describe('boss drop', () => {
  it('is hidden while the arena opens', () => {
    expect(bossDrop(LAND - 0.01, LAND).visible).toBe(false)
  })
  it('falls in, landing at full size', () => {
    const start = bossDrop(LAND, LAND)
    expect(start).toMatchObject({ visible: true, fall: 1, landed: false })
    const mid = bossDrop(LAND + BOSS_DROP / 2, LAND)
    expect(mid.fall).toBeGreaterThan(0)
    expect(mid.fall).toBeLessThan(1)
    const end = bossDrop(LAND + BOSS_DROP, LAND)
    expect(end).toMatchObject({ fall: 0, scale: 1, landed: true, done: false })
  })
  it('is done once the dust settles', () => {
    expect(bossDrop(LAND + BOSS_DROP + BOSS_SETTLE, LAND).done).toBe(true)
  })
})
