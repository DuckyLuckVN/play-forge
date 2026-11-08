// Each level-up drops a skill orb into the next row. A ball touching it pauses
// the volley on the pick screen; a pick made there waits for the next round.
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

/** Fires straight up and steps until the volley pauses or ends. */
function shootUntilPaused(s: RunState): void {
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

  it('a ball touching it pauses the volley on the pick screen', () => {
    const s = orbAhead()
    shootUntilPaused(s)
    expect(s.phase).toBe('pick')
    expect(s.midVolley).toBe(true)
    expect(s.choices).toHaveLength(3)
    expect(s.pickups.some((p) => p.kind === 'skill')).toBe(false)
    expect(s.balls.some((b) => b.status !== 'landed')).toBe(true)
    // Paused: stepping does nothing until the screen closes.
    const ball = { ...s.balls[0] }
    step(s)
    expect(s.balls[0].y).toBe(ball.y)
  })

  it('closing it keeps the point and resumes the volley', () => {
    const s = orbAhead()
    shootUntilPaused(s)
    closePicks(s)
    expect(s.phase).toBe('volley')
    expect(s.midVolley).toBe(false)
    expect(s.pendingPicks).toBe(1)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.pendingPicks).toBe(1)
  })

  it('a pick made mid-volley takes effect from the next round', () => {
    const s = orbAhead()
    s.level = 1
    const before = runMods(s).damageMult
    shootUntilPaused(s)
    s.choices = ['damage', 'big', 'coins']
    pickBoost(s, 'damage')
    expect(s.phase).toBe('volley')
    expect(s.pendingPicks).toBe(0)
    expect(runMods(s).damageMult).toBe(before)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(runMods(s).damageMult).toBeGreaterThan(before)
  })

  it('Double Down picked mid-volley still doubles the next 3 volleys', () => {
    const s = orbAhead()
    s.ballCount = 2
    shootUntilPaused(s)
    s.choices = ['double', 'big', 'coins']
    pickBoost(s, 'double')
    runVolley(s)
    for (let i = 0; i < 3; i++) {
      s.bricks = []
      s.pickups = []
      fire(s, Math.PI / 2)
      expect(s.balls).toHaveLength(4)
      runVolley(s)
    }
    s.pickups = []
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(2)
  })

  it('with points left the screen stays open; the last pick resumes the volley', () => {
    const s = orbAhead(2)
    shootUntilPaused(s)
    pickBoost(s, s.choices[0])
    expect(s.phase).toBe('pick')
    pickBoost(s, s.choices[0])
    expect(s.phase).toBe('volley')
  })

  it('with no points to spend, the orb is just collected', () => {
    const s = orbAhead(0)
    shootUntilPaused(s)
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
