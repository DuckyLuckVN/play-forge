// Each level-up drops a skill orb on a random free cell; until a ball collects
// it, it jumps to a new random cell every turn. Collecting it banks the skill
// point and the pick screen opens when the turn ends (the volley keeps flying).
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
import { scatterOrbs } from './orbs'
import { spawnRow } from './rows'
import { empty, runVolley } from './testing'
import type { RunState } from './types'

/** A run aiming straight up at a skill orb in the launch column. */
function orbAhead(points = 0): RunState {
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
  it('each level-up queues one orb, placed on a random free cell at the next turn', () => {
    const s = empty()
    gainXp(s, xpToNext(0) + xpToNext(1))
    expect(s.pendingPicks).toBe(0)
    expect(s.orbsDue).toBe(2)
    s.turn = 2
    spawnRow(s)
    scatterOrbs(s)
    const orbs = s.pickups.filter((p) => p.kind === 'skill')
    expect(orbs).toHaveLength(2)
    expect(orbs.every((p) => p.row < dims(s).dangerRow - 1)).toBe(true)
    expect(s.orbsDue).toBe(0)
    expect(s.events.filter((e) => e.type === 'orbHop')).toHaveLength(2)
  })

  it('orbs land on random rows, not only the new one', () => {
    const rows = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const s = empty(seed)
      s.orbsDue = 1
      scatterOrbs(s)
      rows.add(s.pickups.find((p) => p.kind === 'skill')!.row)
    }
    expect(rows.size).toBeGreaterThan(1)
  })

  it('an orb never shares a cell with a brick or another pickup', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = empty(seed)
      s.orbsDue = 3
      s.turn = 5
      spawnRow(s)
      scatterOrbs(s)
      scatterOrbs(s)
      const cells = [...s.bricks, ...s.pickups].map((c) => `${c.col},${c.row}`)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  it('with no free cell, the orb waits for a later turn', () => {
    const s = empty()
    for (let row = 0; row < dims(s).dangerRow; row++)
      for (let col = 0; col < s.cols; col++)
        s.bricks.push({ id: s.nextId++, col, row, hp: 1, maxHp: 1, kind: 'normal' } as never)
    s.pickups.push({ id: s.nextId++, col: 0, row: 0, kind: 'skill' })
    scatterOrbs(s)
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
    expect(s.orbsDue).toBe(1)
  })

  it('a ball touching it does not pause the volley', () => {
    const s = orbAhead()
    fire(s, Math.PI / 2)
    for (let i = 0; i < 60 * 60 && s.pickups.some((p) => p.kind === 'skill'); i++) step(s)
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
    expect(s.phase).toBe('volley')
    expect(s.events.some((e) => e.type === 'pickup' && e.kind === 'skill')).toBe(true)
  })

  it('collecting it banks the point and announces the coming pick', () => {
    const s = orbAhead()
    shootTurn(s)
    expect(s.pendingPicks).toBe(1)
    expect(s.events.some((e) => e.type === 'orbPick')).toBe(true)
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

  it('an uncollected orb never falls off: it jumps to a new cell when the next turn starts', () => {
    const s = empty()
    s.pickups.push({ id: s.nextId++, col: 0, row: dims(s).dangerRow - 2, kind: 'skill' })
    s.launchX = s.cols * CELL - 20
    for (let turn = 0; turn < 4; turn++) {
      fire(s, Math.PI / 2)
      runVolley(s)
      expect(s.pickups.filter((p) => p.kind === 'skill')).toHaveLength(1)
    }
    expect(s.events.some((e) => e.type === 'orbHop')).toBe(true)
    expect(s.pendingPicks).toBe(0)
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
