import { describe, expect, it } from 'vitest'
import { DANGER_ROW } from './config'
import { useHelper } from './meta'
import { drainEvents, fire } from './run'
import { brick, empty, runVolley } from './testing'

describe('on-demand helpers', () => {
  it('push back lifts every brick and pickup one row', () => {
    const s = empty()
    const top = brick(s, 0, 0, 5)
    const low = brick(s, 1, 6, 5)
    s.pickups.push({ id: s.nextId++, col: 2, row: 4, kind: 'ball' })
    expect(useHelper(s, 'pushBack')).toBe(true)
    expect(s.bricks).toEqual([{ ...low, row: 5 }])
    expect(s.bricks).not.toContain(top)
    expect(s.pickups[0].row).toBe(3)
    expect(drainEvents(s)).toContainEqual({ type: 'helper', id: 'pushBack' })
  })

  it('row bomb destroys the lowest row', () => {
    const s = empty()
    brick(s, 0, 7, 50)
    brick(s, 4, 7, 50)
    const higher = brick(s, 2, 6, 50)
    useHelper(s, 'rowBomb')
    expect(s.bricks).toEqual([higher])
    expect(drainEvents(s).filter((e) => e.type === 'kill')).toHaveLength(2)
  })

  it('freeze skips the next descend once, even at the danger row', () => {
    const s = empty()
    const b = brick(s, 0, DANGER_ROW - 1, 1e6)
    useHelper(s, 'freeze')
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(b.row).toBe(DANGER_ROW - 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('over')
  })

  it('fire pack arms 5 fireballs', () => {
    const s = empty()
    s.ballCount = 6
    useHelper(s, 'firePack')
    fire(s, Math.PI / 2)
    expect(s.balls.filter((b) => b.kind === 'fire')).toHaveLength(5)
  })

  it('surge fires 50% more balls once', () => {
    const s = empty()
    s.ballCount = 5
    useHelper(s, 'surge')
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(8)
    runVolley(s)
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(5)
  })

  it('only works while aiming', () => {
    const s = empty()
    fire(s, Math.PI / 2)
    expect(useHelper(s, 'surge')).toBe(false)
    expect(s.surgeNext).toBe(false)
  })
})
