import { describe, expect, it } from 'vitest'
import {
  createState,
  DEATH_TICKS,
  NOVA_COST,
  PERFECT_WINDOW,
  POINTS,
  REPARRY_TICKS,
  SHIELD_D,
  step,
  switchTicks,
  type GuardInput,
  type GuardState,
  type Kind,
  type Dir,
} from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const run = (s: GuardState, input?: GuardInput) => step(s, input ? [{ player: 'p0', input }] : [])

/** A quiet state with no planned arrivals, plus one projectile landing at `at`. */
function withProj(kind: Kind, dir: Dir, at: number): GuardState {
  const s = createState(me, 1)
  s.nextArrive = 1e9 // planner idle
  s.projs = [{ id: 99, kind, dir, from: dir, to: dir, d: 50, speed: 60, arriveAt: at }]
  return s
}

const until = (s: GuardState, tick: number) => {
  while (s.tick < tick && !s.over) run(s)
  return s
}

describe('Halo Guard sim', () => {
  it('blocks a bolt you face; a late-ish turn is a plain block', () => {
    const s = withProj('bolt', 1, 40)
    run(s, 'right') // tick 0: turn long before
    until(s, 41)
    expect(s.stats).toMatchObject({ blocks: 1, perfects: 0 })
    expect(s.score).toBe(POINTS.block)
    expect(s.vitals.hearts).toBe(3)
  })

  it('a turn within the window before impact is a perfect parry and charges Nova', () => {
    const s = withProj('bolt', 1, 40)
    until(s, 40 - PERFECT_WINDOW)
    run(s, 'right')
    until(s, 41)
    expect(s.stats.perfects).toBe(1)
    expect(s.charge).toBe(1)
    expect(s.score).toBe(POINTS.perfect)
  })

  it('heavies are worth double', () => {
    const s = withProj('heavy', 2, 30)
    until(s, 25)
    run(s, 'down')
    until(s, 31)
    expect(s.score).toBe(POINTS.perfect * 2)
  })

  it('re-pressing the lane you face re-arms the parry only after a cooldown', () => {
    const s = withProj('bolt', 0, 100)
    run(s, 'right')
    run(s, 'up') // tick 1: turn to up
    const armed = s.parryAt
    until(s, armed + REPARRY_TICKS - 1)
    run(s, 'up')
    expect(s.parryAt).toBe(armed)
    run(s, 'up')
    expect(s.parryAt).toBe(armed + REPARRY_TICKS)
  })

  it('an unguarded threat costs a heart and the combo', () => {
    const s = withProj('bolt', 3, 20)
    s.vitals.combo = 6
    until(s, 21)
    expect(s.vitals.hearts).toBe(2)
    expect(s.vitals.combo).toBe(0)
  })

  it('sparks must be let in: facing them fizzles, facing away collects', () => {
    const a = withProj('spark', 0, 20)
    until(a, 21)
    expect(a.stats.sparks).toBe(0)
    expect(a.vitals.hearts).toBe(3)
    const b = withProj('spark', 0, 20)
    run(b, 'left')
    until(b, 21)
    expect(b.stats.sparks).toBe(1)
    expect(b.charge).toBe(1)
  })

  it('Nova needs a full charge, clears the field and shields for a while', () => {
    const s = withProj('bolt', 2, 200)
    run(s, 'nova')
    expect(s.projs.length).toBe(1)
    s.charge = NOVA_COST
    run(s, 'nova')
    expect(s.projs.length).toBe(0)
    expect(s.charge).toBe(0)
    s.projs = [{ id: 5, kind: 'bolt', dir: 2, from: 2, to: 2, d: 30, speed: 60, arriveAt: s.tick + 10 }]
    until(s, s.tick + 12)
    expect(s.vitals.hearts).toBe(3)
  })

  it('a feint hops to a neighbouring lane before landing', () => {
    const s = createState(me, 1)
    s.nextArrive = 1e9
    s.projs = [{ id: 1, kind: 'feint', dir: 0, from: 0, to: 1, d: 60, speed: 60, arriveAt: 60, hopAt: 30 }]
    until(s, 31)
    expect(s.projs[0].dir).toBe(1)
  })

  it('projectiles close in at their speed and land at the shield radius', () => {
    const s = withProj('bolt', 0, 30) // 60 units/s = 1 unit a tick
    until(s, 30)
    expect(s.projs[0].d).toBeCloseTo(SHIELD_D + 1)
    run(s)
    expect(s.projs).toEqual([])
  })

  it('dies on the last heart, plays a dying phase, then ends', () => {
    const s = withProj('bolt', 1, 5)
    s.vitals.hearts = 1
    until(s, 6)
    expect(s.diedAt).toBe(5)
    expect(s.over).toBe(false)
    until(s, 5 + DEATH_TICKS + 1)
    expect(s.over).toBe(true)
  })

  it('is deterministic for a seed', () => {
    const a = createState(me, 42)
    const b = createState(me, 42)
    for (let i = 0; i < 3000; i++) {
      run(a, i % 40 === 0 ? 'left' : undefined)
      run(b, i % 40 === 0 ? 'left' : undefined)
    }
    expect(a.score).toBe(b.score)
    expect(a.projs.map((p) => p.arriveAt)).toEqual(b.projs.map((p) => p.arriveAt))
  })

  it('switch time shrinks with tier but stays humane', () => {
    expect(switchTicks(0)).toBeGreaterThan(switchTicks(9))
    expect(switchTicks(9)).toBeGreaterThanOrEqual(15)
  })
})
