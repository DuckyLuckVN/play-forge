// A beaten boss gives no pick: it opens a short bonus round instead. Shoot the
// socket before the timer runs out for a new skill slot.
import { describe, expect, it } from 'vitest'
import { BONUS_TIME } from './bonus'
import { boostSlots } from './boosts'
import { BOSS_EVERY, bossParts, spawnBoss } from './boss'
import { CELL } from './config'
import { damageBrick } from './damage'
import { drainEvents, endBonus, fire, resumeBonus, step, tickBonus } from './run'
import { empty, runVolley } from './testing'
import type { RunState } from './types'

/** A boss fight at turn 30 with some firepower. */
function withBoss(seed = 1): RunState {
  const s = empty(seed)
  s.turn = BOSS_EVERY
  s.ballCount = 20
  spawnBoss(s, [], 'block')
  return s
}

/** The boss falls, then the volley in flight ends: the bonus round opens. */
function inBonus(seed = 1): RunState {
  const s = withBoss(seed)
  damageBrick(s, bossParts(s)[0], 1e9, 'laser')
  s.bricks = []
  s.ballCount = 1
  fire(s, Math.PI / 2)
  runVolley(s)
  return s
}

const ghosts = (s: RunState) => s.bricks.filter((b) => b.ghost)
const socket = (s: RunState) => s.pickups.find((p) => p.kind === 'socket')

describe('boss rewards', () => {
  it('a beaten boss gives no free pick and no slot by itself', () => {
    const s = withBoss()
    const slots = boostSlots(s)
    damageBrick(s, bossParts(s)[0], 1e9, 'laser')
    expect(s.freePicks ?? 0).toBe(0)
    expect(s.bossesBeaten).toBe(1)
    expect(boostSlots(s)).toBe(slots)
    expect(s.bonusDue).toBe(true)
  })

  it('old saved runs keep the slots their beaten bosses gave', () => {
    const s = withBoss()
    delete s.extraSlots
    s.bossesBeaten = 2
    expect(boostSlots(s)).toBe(5)
    damageBrick(s, bossParts(s)[0], 1e9, 'laser')
    expect(s.bossesBeaten).toBe(3)
    expect(boostSlots(s)).toBe(5)
  })
})

describe('bonus round', () => {
  it('opens when the volley ends: arena still boss size, a socket among 4-6 ghost blocks', () => {
    const s = withBoss()
    const room = { cols: s.cols, rows: s.rows, left: s.bossLeft, right: s.bossRight, room: s.bossRoom }
    damageBrick(s, bossParts(s)[0], 1e9, 'laser')
    s.bricks = []
    const turn = s.turn
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.bonus?.left).toBe(BONUS_TIME)
    expect(s.bonusDue).toBe(false)
    expect(s.turn).toBe(turn)
    expect({ cols: s.cols, rows: s.rows, left: s.bossLeft, right: s.bossRight, room: s.bossRoom }).toEqual(
      room,
    )
    expect(socket(s)).toBeTruthy()
    expect(ghosts(s).length).toBeGreaterThanOrEqual(4)
    expect(ghosts(s).length).toBeLessThanOrEqual(6)
    expect(drainEvents(s).some((e) => e.type === 'bonus')).toBe(true)
  })

  it('volleys in it move nothing and start no new turn', () => {
    const s = inBonus()
    const turn = s.turn
    const rows = new Map(ghosts(s).map((b) => [b.id, b.row]))
    s.launchX = 20
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.turn).toBe(turn)
    expect(s.bonus).toBeTruthy()
    for (const g of ghosts(s)) expect(g.row).toBe(rows.get(g.id))
  })

  it('ghost blocks pay no coins or XP', () => {
    const s = inBonus()
    const { coins, xp, level, kills } = s
    for (const g of ghosts(s)) damageBrick(s, g, 1e9, 'laser')
    expect(ghosts(s)).toHaveLength(0)
    expect([s.coins, s.xp, s.level, s.kills]).toEqual([coins, xp, level, kills])
  })

  it('a ball on the socket adds a slot and pauses; ending it moves on to the next turn', () => {
    const s = inBonus()
    const slots = boostSlots(s)
    const turn = s.turn
    const p = socket(s)!
    // Clear the way and shoot straight at it.
    s.bricks = []
    s.launchX = (p.col + 0.5) * CELL
    drainEvents(s)
    fire(s, Math.PI / 2)
    for (let i = 0; i < 3600 && !s.bonus?.won; i++) step(s)
    expect(s.bonus?.won).toBe(true)
    expect(boostSlots(s)).toBe(slots + 1)
    expect(drainEvents(s)).toContainEqual({ type: 'slot', slots: slots + 1 })
    // Paused for the dialog: nothing moves, the timer stops.
    const y = s.balls[0].y
    step(s)
    tickBonus(s, 60)
    expect(s.balls[0].y).toBe(y)
    expect(s.bonus).toBeTruthy()
    endBonus(s)
    expect(s.bonus).toBeNull()
    expect(s.balls).toHaveLength(0)
    expect(ghosts(s)).toHaveLength(0)
    expect(socket(s)).toBeUndefined()
    expect(s.turn).toBe(turn + 1)
    expect(s.phase).toBe('aim')
  })

  it('runs out after 10 real seconds: no slot, balls recalled, next turn', () => {
    const s = inBonus()
    const slots = boostSlots(s)
    const turn = s.turn
    s.launchX = 20
    fire(s, Math.PI / 2)
    step(s)
    tickBonus(s, BONUS_TIME / 2)
    expect(s.bonus?.left).toBeCloseTo(BONUS_TIME / 2)
    drainEvents(s)
    tickBonus(s, BONUS_TIME / 2)
    expect(drainEvents(s).some((e) => e.type === 'bonusMiss')).toBe(true)
    expect(s.bonus).toBeNull()
    expect(boostSlots(s)).toBe(slots)
    expect(s.balls).toHaveLength(0)
    expect(ghosts(s)).toHaveLength(0)
    expect(socket(s)).toBeUndefined()
    expect(s.turn).toBe(turn + 1)
    expect(s.phase).toBe('aim')
  })

  it('the timer waits on the pick screen', () => {
    const s = inBonus()
    s.phase = 'pick'
    tickBonus(s, BONUS_TIME * 2)
    expect(s.bonus?.left).toBe(BONUS_TIME)
  })

  it('a run loaded mid-round gets the full time back', () => {
    const s = inBonus()
    tickBonus(s, 7)
    resumeBonus(s)
    expect(s.bonus?.left).toBe(BONUS_TIME)
  })
})
