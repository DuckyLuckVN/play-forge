// A boss arriving blasts the bricks in its way (and a ring around it), the
// arena opens 4 rows, and a boss without its own movement skill steps aside
// every other turn, telegraphed the turn before.
import { describe, expect, it } from 'vitest'
import { bossBounds, bossParts } from './boss-kit'
import { BOSS_ROOM, bossTurn, damageBoss, spawnBoss } from './boss'
import { drainEvents } from './run'
import { brick, empty } from './testing'
import type { RunState } from './types'

const fill = (s: RunState, rows: number) => {
  for (let r = 0; r < rows; r++) for (let c = 0; c < s.cols; c++) brick(s, c, r, 10)
}

describe('boss arrival', () => {
  it('the arena opens sideways only (no extra rows)', () => {
    expect(BOSS_ROOM).toBe(0)
  })

  it('blasts the bricks under it and in a 1-cell ring, pays coins, tells the effects where', () => {
    const s = empty()
    s.turn = 30
    fill(s, 6)
    const coins = s.coins
    spawnBoss(s, ['minions'], 'block')
    const { left, right, bottom } = bossBounds(s)
    const plain = s.bricks.filter((b) => b.kind !== 'boss' && !b.role)
    // Nothing plain left in the footprint or its ring.
    expect(plain.some((b) => b.row <= bottom + 1 && b.col >= left - 1 && b.col <= right + 1)).toBe(false)
    // Bricks further away stay.
    expect(plain.some((b) => b.row === bottom + 2)).toBe(true)
    const e = drainEvents(s).find((e) => e.type === 'bossCrush')
    expect(e && e.type === 'bossCrush' && e.at.length).toBeGreaterThan(0)
    expect(s.coins).toBeGreaterThan(coins)
  })

  it('arriving on an empty board blasts nothing (no event)', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, ['minions'], 'block')
    expect(drainEvents(s).some((e) => e.type === 'bossCrush')).toBe(false)
  })
})

describe('boss steps aside', () => {
  const fight = () => {
    const s = empty()
    s.turn = 30
    s.ballCount = 20
    spawnBoss(s, ['enrage'], 'block')
    drainEvents(s)
    return s
  }
  const left = (s: RunState) => bossBounds(s).left

  it('warns the turn before, then dodges away from the side it was hit on', () => {
    const s = fight()
    const start = left(s)
    // Hit on its left half last volley.
    damageBoss(s, 5, 'ball', { col: start })
    s.turn = s.boss!.turn + 2
    bossTurn(s)
    const warn = drainEvents(s).find((e) => e.type === 'bossWarn')
    expect(warn).toMatchObject({ id: 'step', dir: 1 })
    expect(left(s)).toBe(start) // only a warning so far
    s.turn++
    bossTurn(s)
    expect(left(s)).toBe(start + 1)
  })

  it('never walks off the board', () => {
    const s = fight()
    for (const p of bossParts(s)) p.col -= bossBounds(s).left // flush left
    damageBoss(s, 5, 'ball', { col: bossBounds(s).right }) // hit on the right: wants to go left
    s.turn = s.boss!.turn + 2
    bossTurn(s)
    s.turn++
    bossTurn(s)
    expect(left(s)).toBe(0)
  })

  it('bosses with their own movement skill do not also step', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, ['blink'], 'block')
    drainEvents(s)
    damageBoss(s, 5, 'ball', { col: bossBounds(s).left })
    s.turn = s.boss!.turn + 2
    bossTurn(s)
    expect(drainEvents(s).some((e) => e.type === 'bossWarn' && e.id === 'step')).toBe(false)
  })

  it('does not step onto its own wards or summons', () => {
    const s = fight()
    const start = left(s)
    const { right, top } = bossBounds(s)
    const ward = brick(s, right + 1, top, 10)
    ward.role = 'ward'
    damageBoss(s, 5, 'ball', { col: start })
    s.turn = s.boss!.turn + 2
    bossTurn(s)
    s.turn++
    bossTurn(s)
    expect(left(s)).toBe(start)
    expect(s.bricks).toContain(ward)
  })
})
