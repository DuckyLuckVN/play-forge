import { describe, expect, it } from 'vitest'
import { bankRun, DEFAULT_SAVE } from '../save'
import { xpToNext } from './boosts'
import { DANGER_ROW } from './config'
import { revive, useHelper } from './meta'
import { createRun, drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'

describe('review fixes', () => {
  it('freeze never stacks two bricks in one cell', () => {
    const s = createRun(42)
    for (const b of s.bricks) b.hp = 1e9
    useHelper(s, 'freeze')
    fire(s, Math.PI / 2)
    runVolley(s)
    const cells = s.bricks.map((b) => `${b.col},${b.row}`)
    expect(new Set(cells).size).toBe(cells.length)
    const pickupCells = s.pickups.map((p) => `${p.col},${p.row}`)
    expect(new Set(pickupCells).size).toBe(pickupCells.length)
  })

  it('a twin split off a brick side does not hit that brick again', () => {
    const s = empty()
    s.boosts = { twin: 1 }
    const b = brick(s, 3, 5, 1000)
    fire(s, Math.PI / 2)
    const ball = s.balls[0]
    ball.status = 'flying'
    s.fireTimer = 1
    // Coming in from the left, nearly flat, into the brick's left side.
    ball.x = 3 * 56 + 2 - ball.r + 1
    ball.y = 56 + 5 * 56 + 28
    ball.vx = 600
    ball.vy = 100
    for (let i = 0; i < 4; i++) step(s)
    expect(b.hp).toBe(999)
  })

  it('a saved snapshot carries no pending events', () => {
    const s = createRun(1)
    s.events.push({ type: 'levelUp' })
    const { save } = bankRun(structuredClone(DEFAULT_SAVE), s, 0)
    expect(save.run!.state.events).toEqual([])
    expect(s.events).toHaveLength(1)
  })

  it('a helper that levels you up opens the pick right away, at combo 1×', () => {
    const s = empty()
    s.xp = xpToNext(0) - 1
    s.combo = 120
    brick(s, 0, 4, 1)
    useHelper(s, 'rowBomb')
    expect(s.combo).toBe(0)
    expect(s.phase).toBe('pick')
    expect(s.choices).toHaveLength(3)
  })

  it('revive keeps the same turn and spawns no new row', () => {
    const s = empty()
    brick(s, 0, DANGER_ROW, 5)
    const kept = brick(s, 1, 2, 5)
    s.phase = 'over'
    const turn = s.turn
    revive(s)
    expect(s.turn).toBe(turn)
    expect(s.bricks).toEqual([kept])
    expect(s.phase).toBe('aim')
    expect(drainEvents(s).some((e) => e.type === 'revive')).toBe(true)
  })
})
