import { describe, expect, it } from 'vitest'
import { BOARD_W, CELL, COLS, DANGER_ROW, ROWS } from './config'
import { dims } from './dims'
import { pickBoost } from './boosts'
import { growBoard } from './meta'
import { spawnRow } from './rows'
import { fire } from './run'
import { brick, empty, runVolley } from './testing'

function toTurn50() {
  const s = empty()
  s.turn = 49
  brick(s, 0, 0, 1e9) // no board wipe
  fire(s, Math.PI / 2)
  runVolley(s)
  return s
}

describe('board growth', () => {
  it('starts at the default size', () => {
    const s = empty()
    expect([s.cols, s.rows]).toEqual([COLS, ROWS])
    expect(dims(s)).toMatchObject({ boardW: BOARD_W, dangerRow: DANGER_ROW })
  })

  it('offers a choice every 50 turns', () => {
    const s = toTurn50()
    expect(s.turn).toBe(50)
    expect(s.phase).toBe('grow')
  })

  it('adds a column: wider board, rows spawn across it', () => {
    const s = toTurn50()
    growBoard(s, 'col')
    expect(s.cols).toBe(COLS + 1)
    expect(dims(s).boardW).toBe(BOARD_W + CELL)
    expect(s.phase).toBe('aim')
    let used = false
    for (let seed = 1; seed <= 200 && !used; seed++) {
      s.rng.seed = seed
      s.bricks = []
      s.pickups = []
      s.turn = 7
      spawnRow(s)
      used = [...s.bricks, ...s.pickups].some((x) => x.col === COLS)
    }
    expect(used).toBe(true)
  })

  it('adds a row: the danger line moves down', () => {
    const s = toTurn50()
    growBoard(s, 'row')
    expect(s.rows).toBe(ROWS + 1)
    expect(dims(s).dangerRow).toBe(DANGER_ROW + 1)
  })

  it('ignores growth outside the grow phase', () => {
    const s = empty()
    growBoard(s, 'col')
    expect(s.cols).toBe(COLS)
  })

  it('respects the caps', () => {
    const s = toTurn50()
    s.cols = 10
    growBoard(s, 'col')
    expect(s.cols).toBe(10)
    expect(s.phase).toBe('grow')
    s.rows = 16
    s.phase = 'aim'
    s.turn = 99
    brick(s, 0, 0, 1e9)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.turn).toBe(100)
    expect(s.phase).toBe('aim')
  })

  it('bounces balls off the wider wall', () => {
    const s = toTurn50()
    growBoard(s, 'col')
    s.launchX = dims(s).boardW - 20
    fire(s, 0.3)
    let maxX = 0
    runVolley(s, (x) => {
      for (const b of x.balls) maxX = Math.max(maxX, b.x)
    })
    expect(maxX).toBeGreaterThan(BOARD_W)
    expect(maxX).toBeLessThanOrEqual(dims(s).boardW)
  })

  it('a level-up pick at turn 50 is followed by the grow choice', () => {
    const s = empty()
    s.turn = 49
    s.xp = 7
    brick(s, 3, 5, 1)
    brick(s, 0, 0, 1e9)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.turn).toBe(50)
    expect(s.phase).toBe('pick')
    pickBoost(s, s.choices[0])
    expect(s.phase).toBe('grow')
  })
})
