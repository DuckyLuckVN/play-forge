import { describe, expect, it } from 'vitest'
import { BOSS_SPAWN_ROW, spawnBoss } from './boss'
import { BOSS_SHAPES, bodyBricks } from './boss-shapes'
import { empty } from './testing'

describe('boss body bricks', () => {
  it('carries the triangle and orb parts (the boss card preview drew them all as squares)', () => {
    const parts = bodyBricks('brute', 0, 50, 50)
    const shaped = parts.filter((b) => b.shape).map((b) => `${b.col},${b.row}:${b.shape}`)
    expect(shaped).toEqual(Object.entries(BOSS_SHAPES.brute.shaped!).map(([k, v]) => `${k}:${v}`))
  })

  it('matches what spawnBoss puts on the board, cell for cell', () => {
    for (const id of Object.keys(BOSS_SHAPES)) {
      const s = empty(1)
      s.turn = 30
      spawnBoss(s, [], id)
      const onBoard = s.bricks.filter((b) => b.kind === 'boss')
      const left = Math.min(...onBoard.map((b) => b.col))
      const key = (dx: number) => (b: { col: number; row: number; shape?: string }) =>
        `${b.col - dx},${b.row}:${b.shape ?? ''}`
      expect(onBoard.map(key(left)).sort()).toEqual(
        bodyBricks(id, 0, 1, 1, 0, BOSS_SPAWN_ROW).map(key(0)).sort(),
      )
    }
  })
})
