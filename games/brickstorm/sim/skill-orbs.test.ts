// Each level-up drops a skill orb into the next row. A ball touching it flags
// the pick screen, which opens when the turn ends (the volley keeps flying).
import { describe, expect, it } from 'vitest'
import { CELL } from './config'
import {
  closePicks,
  canRerollWithPoint,
  pickBoost,
  rerollWithPoint,
  runMods,
  openPicks,
  xpToNext,
} from './boosts'
import { gainXp } from './damage'
import { dims } from './dims'
import { growBoard } from './meta'
import { fire, step } from './run'
import { spawnRow } from './rows'
import { empty, runVolley } from './testing'
import type { RunState } from './types'

/** A run aiming straight up at a skill orb in the launch column. */
function orbAhead(points = 1): RunState {
  const s = empty()
  s.pendingPicks = points
  const col = Math.floor(s.launchX / CELL)
  s.pickups.push({ id: s.nextId++, col, row: 4, kind: 'skill' })
  return s
}

/** Fires straight up and steps until the volley (and its turn) ends. */
function shootTurn(s: RunState): void {
  fire(s, Math.PI / 2)
  for (let i = 0; i < 60 * 60 && s.phase === 'volley'; i++) step(s)
}

describe('skill orbs', () => {
  it('each level-up queues one orb, placed in the next row', () => {
    const s = empty()
    gainXp(s, xpToNext(0) + xpToNext(1))
    expect(s.pendingPicks).toBe(2)
    expect(s.orbsDue).toBe(2)
    s.turn = 2
    spawnRow(s)
    expect(s.pickups.filter((p) => p.kind === 'skill')).toHaveLength(2)
    expect(s.pickups.filter((p) => p.kind === 'skill').every((p) => p.row === 0)).toBe(true)
    expect(s.orbsDue).toBe(0)
  })

  it('an orb never shares a cell with a brick or another pickup', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = empty(seed)
      s.orbsDue = 3
      s.turn = 5
      spawnRow(s)
      const cells = [...s.bricks, ...s.pickups].map((c) => `${c.col},${c.row}`)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  it('a ball touching it does not pause the volley', () => {
    const s = orbAhead()
    fire(s, Math.PI / 2)
    for (let i = 0; i < 60 * 60 && s.pickups.some((p) => p.kind === 'skill'); i++) step(s)
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
    expect(s.phase).toBe('volley')
    expect(s.events.some((e) => e.type === 'pickup' && e.kind === 'skill')).toBe(true)
  })

  it('announces the coming pick only when a point is left', () => {
    const withPoint = orbAhead(1)
    shootTurn(withPoint)
    expect(withPoint.events.some((e) => e.type === 'orbPick')).toBe(true)
    const spent = orbAhead(0)
    shootTurn(spent)
    expect(spent.events.some((e) => e.type === 'orbPick')).toBe(false)
  })

  it('the pick screen opens when the turn ends', () => {
    const s = orbAhead()
    shootTurn(s)
    expect(s.phase).toBe('pick')
    expect(s.balls).toHaveLength(0)
    expect(s.choices).toHaveLength(3)
    expect(s.pickAfterVolley).toBeFalsy()
  })

  it('closing it keeps the point; a later turn does not reopen it', () => {
    const s = orbAhead()
    shootTurn(s)
    closePicks(s)
    expect(s.phase).toBe('aim')
    expect(s.pendingPicks).toBe(1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
  })

  it('a pick at the end of the turn works from the next shot', () => {
    const s = orbAhead()
    s.level = 1
    const before = runMods(s).damageMult
    shootTurn(s)
    s.choices = ['damage', 'big', 'coins']
    pickBoost(s, 'damage')
    expect(s.phase).toBe('aim')
    expect(runMods(s).damageMult).toBeGreaterThan(before)
  })

  it('a board growth due comes first, then the pick screen', () => {
    const s = orbAhead()
    s.growPending = true
    s.turn = 0
    shootTurn(s)
    expect(s.phase).toBe('grow')
    growBoard(s, 'row')
    expect(s.phase).toBe('pick')
  })

  it('a bonus-round volley opens it too', () => {
    const s = orbAhead()
    s.bonus = { left: 10, spawn: true }
    shootTurn(s)
    expect(s.phase).toBe('pick')
  })

  it('the run ending that turn opens nothing', () => {
    const s = orbAhead()
    s.hp = 0.0001
    s.bricks.push({
      id: s.nextId++,
      col: 0,
      row: dims(s).dangerRow - 1,
      hp: 999,
      maxHp: 999,
      kind: 'normal',
    } as never)
    shootTurn(s)
    expect(s.phase).toBe('over')
  })

  it('with no points to spend, the orb is just collected', () => {
    const s = orbAhead(0)
    shootTurn(s)
    expect(s.phase).toBe('aim')
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
  })

  it('a missed orb falls away and the point stays banked', () => {
    const s = empty()
    s.pendingPicks = 1
    s.pickups.push({ id: s.nextId++, col: 0, row: dims(s).dangerRow - 1, kind: 'skill' })
    s.launchX = s.cols * CELL - 20
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
    expect(s.pendingPicks).toBe(1)
    expect(openPicks(s)).toBe(true)
  })
})

describe('reroll with a skill point', () => {
  function picking(points: number, free = 0): RunState {
    const s = empty()
    s.pendingPicks = points
    s.freePicks = free
    openPicks(s)
    return s
  }

  it('needs two points (one stays to pick)', () => {
    const s = picking(1)
    expect(canRerollWithPoint(s)).toBe(false)
    expect(rerollWithPoint(s)).toBe(false)
    expect(s.pendingPicks).toBe(1)
  })

  it('spends one point for new offers, without raising the coin reroll price', () => {
    const s = picking(2)
    expect(canRerollWithPoint(s)).toBe(true)
    expect(rerollWithPoint(s)).toBe(true)
    expect(s.pendingPicks).toBe(1)
    expect(s.rerollsUsed).toBe(0)
    expect(s.choices).toHaveLength(3)
    expect(s.phase).toBe('pick')
  })

  it('spends a paid point first, keeping free ones for a pick', () => {
    const s = picking(3, 1)
    rerollWithPoint(s)
    expect(s.freePicks).toBe(1)
    const all = picking(2, 2)
    rerollWithPoint(all)
    expect(all.freePicks).toBe(1)
  })

  it('works only on the pick screen', () => {
    const s = empty()
    s.pendingPicks = 3
    expect(rerollWithPoint(s)).toBe(false)
  })
})
