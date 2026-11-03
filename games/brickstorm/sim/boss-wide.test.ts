// A boss fight widens the arena: a column on each side, for the boss to move
// and summon in. After the boss the extra columns go, once they are empty.
import { describe, expect, it } from 'vitest'
import { BOSS_EVERY, BOSS_SIDE_COLS, BOSS_SPAWN_ROW, shrinkArena, spawnBoss } from './boss'
import { CELL, COLS, MAX_COLS } from './config'
import { baseCols } from './dims'
import { growBoard } from './meta'
import { spawnRow } from './rows'
import { drainEvents, rowDrops } from './run'
import { brick, empty } from './testing'

function atBoss(seed = 1) {
  const s = empty(seed)
  s.turn = BOSS_EVERY
  return s
}

describe('boss arena widens', () => {
  it('adds a column on each side, and everything on the board slides over with it', () => {
    const s = atBoss()
    const b = brick(s, 0, 8, 10)
    s.pickups.push({ id: s.nextId++, col: 2, row: 7, kind: 'coin' })
    const launch = s.launchX
    spawnBoss(s, [], 'block')
    expect(BOSS_SIDE_COLS).toBe(1)
    expect(s.cols).toBe(COLS + 2)
    expect(baseCols(s)).toBe(COLS)
    expect(b.col).toBe(1)
    expect(s.pickups[0].col).toBe(3)
    expect(s.launchX).toBe(launch + CELL)
    expect(drainEvents(s).find((e) => e.type === 'arena')).toMatchObject({ grow: true, cols: 1 })
  })

  it('the boss is centred on the wider board', () => {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    const parts = s.bricks.filter((b) => b.kind === 'boss')
    const left = Math.min(...parts.map((b) => b.col))
    const right = Math.max(...parts.map((b) => b.col))
    expect(left).toBe(s.cols - 1 - right)
  })

  it('does not stack: a second boss while the sides are still there keeps one per side', () => {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    s.boss = null
    s.bricks = []
    brick(s, 0, 2, 10) // pins the left side open
    spawnBoss(s, [], 'block')
    expect(baseCols(s)).toBe(COLS)
    expect(s.cols).toBe(COLS + 2)
  })
})

describe('after the boss', () => {
  function afterBoss() {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    s.boss = null
    s.bricks = []
    s.pickups = []
    drainEvents(s)
    return s
  }

  it('empty side columns go, the board narrows back, and the hero stays on it', () => {
    const s = afterBoss()
    const keep = brick(s, 3, 2, 10)
    s.launchX = (s.cols - 0.5) * CELL // standing in the right-hand extra column
    shrinkArena(s)
    expect(s.cols).toBe(COLS)
    expect(baseCols(s)).toBe(COLS)
    expect(keep.col).toBe(2)
    expect(s.launchX).toBeLessThanOrEqual(s.cols * CELL)
    expect(drainEvents(s).some((e) => e.type === 'arena' && !e.grow && e.cols)).toBe(true)
  })

  it('a brick in a side column is pushed in to a free cell in its row', () => {
    const s = afterBoss()
    const side = brick(s, 0, 3, 10)
    const right = brick(s, s.cols - 1, 4, 10)
    shrinkArena(s)
    expect(s.cols).toBe(COLS)
    expect(side.col).toBe(0) // was column 1 of the real board, now the edge
    expect(right.col).toBe(COLS - 1)
    expect(new Set(s.bricks.map((b) => `${b.col},${b.row}`)).size).toBe(s.bricks.length)
  })

  it('a side brick with no room in its row is crushed (no coins)', () => {
    const s = afterBoss()
    for (let c = 1; c < s.cols - 1; c++) brick(s, c, 3, 10)
    brick(s, 0, 3, 10)
    const coins = s.coins
    shrinkArena(s)
    expect(s.bricks.filter((b) => b.row === 3)).toHaveLength(COLS)
    expect(s.coins).toBe(coins)
  })

  it('narrows in one go: a single arena event for the whole snap back', () => {
    const s = afterBoss()
    shrinkArena(s)
    shrinkArena(s)
    const arena = drainEvents(s).filter((e) => e.type === 'arena')
    expect(arena).toHaveLength(1)
    expect(arena[0]).toMatchObject({ grow: false, cols: 1 })
  })

  it('new rows stay out of the side columns until they go', () => {
    const s = afterBoss()
    brick(s, 0, 3, 10)
    brick(s, s.cols - 1, 3, 10)
    // (Only while they are still there: normally they go before the next row.)
    for (let i = 0; i < 20; i++) {
      s.turn = 31 + i
      spawnRow(s)
    }
    const fresh = s.bricks.filter((b) => b.row === 0)
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh.every((b) => b.col >= 1 && b.col <= s.cols - 2)).toBe(true)
    expect(s.pickups.every((p) => p.col >= 1 && p.col <= s.cols - 2)).toBe(true)
  })

  it('growing a column mid-fight keeps the boss sides at the edges, and the cap counts only the real board', () => {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    s.phase = 'grow'
    const edge = brick(s, s.cols - 1, 9, 10)
    growBoard(s, 'col')
    expect(baseCols(s)).toBe(COLS + 1)
    expect(edge.col).toBe(s.cols - 1)
    s.cols = MAX_COLS + 2 // a full board plus the sides
    s.phase = 'grow'
    growBoard(s, 'col')
    expect(s.cols).toBe(MAX_COLS + 2)
  })

  it('an old save with no side columns is untouched', () => {
    const s = empty()
    const cols = s.cols
    shrinkArena(s)
    expect(s.cols).toBe(cols)
  })
})

describe('boss spawn position', () => {
  it('arrives one row down, leaving a free row above it', () => {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    const parts = s.bricks.filter((b) => b.kind === 'boss')
    expect(Math.min(...parts.map((b) => b.row))).toBe(BOSS_SPAWN_ROW)
    expect(BOSS_SPAWN_ROW).toBe(1)
  })
})

describe('boss arena: wider, not taller', () => {
  it('adds no rows (the screen is height-limited: rows would shrink everything)', () => {
    const s = atBoss()
    const rows = s.rows
    spawnBoss(s, [], 'block')
    expect(s.rows).toBe(rows)
  })

  it('while a boss lives the board drops every other turn, starting with a pause', () => {
    const s = atBoss()
    spawnBoss(s, [], 'block')
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      seen.push(rowDrops(s))
      s.turn++
    }
    expect(seen).toEqual([0, 1, 0, 1])
  })

  it('no boss: every turn as before', () => {
    const s = atBoss()
    expect(rowDrops(s)).toBe(1)
    s.turn++
    expect(rowDrops(s)).toBe(1)
  })
})
