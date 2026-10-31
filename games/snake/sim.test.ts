import { describe, expect, it } from 'vitest'
import { resolveOptions, tickRateOf } from '@forge/net/session'
import { createState, snakeGame, SPEEDS, step, type SnakeState } from './sim'

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

function solo(): SnakeState {
  const state = createState(players(1), 42)
  state.food = [] // keep tests deterministic about growth
  return state
}

describe('snake simulation', () => {
  it('is deterministic for a given seed', () => {
    expect(createState(players(3), 7)).toEqual(createState(players(3), 7))
  })

  it('moves forward each tick', () => {
    const state = solo()
    const [x, y] = state.snakes[0].body[0]
    step(state, [])
    expect(state.snakes[0].body[0]).toEqual([x + 1, y])
    expect(state.snakes[0].body).toHaveLength(4)
  })

  it('ignores reversing into itself and buffers quick turns', () => {
    const state = solo()
    const [x, y] = state.snakes[0].body[0]
    step(state, [
      { player: 'p0', input: 'left' }, // reverse: ignored
      { player: 'p0', input: 'up' },
      { player: 'p0', input: 'left' }, // valid after 'up'
    ])
    expect(state.snakes[0].body[0]).toEqual([x, y - 1])
    step(state, [])
    expect(state.snakes[0].body[0]).toEqual([x - 1, y - 1])
  })

  it('grows and scores when eating', () => {
    const state = solo()
    const [x, y] = state.snakes[0].body[0]
    state.food = [[x + 1, y]]
    step(state, [])
    expect(state.events).toEqual([{ type: 'eat', player: 'p0' }])
    step(state, [])
    expect(state.events).toEqual([])
    expect(state.snakes[0].score).toBe(1)
    expect(state.snakes[0].body.length).toBeGreaterThan(4)
  })

  it('dies on hitting a wall and ends the solo game', () => {
    const state = solo()
    for (let i = 0; i < state.width && !state.over; i++) step(state, [])
    expect(state.snakes[0].alive).toBe(false)
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
  })

  it('declares the last snake standing the winner', () => {
    const state = createState(players(2), 1)
    // Steer p0 into the top wall while p1 keeps going.
    step(state, [{ player: 'p0', input: 'up' }])
    for (let i = 0; i < state.height && !state.over; i++) step(state, [])
    expect(state.over).toBe(true)
    expect(state.winner).toBe('p1')
  })

  it('defaults to normal speed, a little slower than before, with faster and slower choices', () => {
    const rate = (speed?: string) => tickRateOf(snakeGame, resolveOptions(snakeGame.options, { speed }))
    expect(rate()).toBe(8)
    expect(rate('slow')).toBeLessThan(rate())
    expect(rate('fast')).toBeGreaterThan(rate())
    expect(rate('turbo')).toBeGreaterThan(rate('fast'))
    expect(rate('bogus')).toBe(SPEEDS.normal)
  })

  it('never spawns two snakes on the same row', () => {
    for (let n = 1; n <= 8; n++) {
      const rows = createState(players(n), 1).snakes.map((s) => s.body[0][1])
      expect(new Set(rows).size).toBe(n)
    }
  })

  it('kills both snakes in a head-on collision', () => {
    const state = createState(players(2), 1)
    state.food = []
    const y = 5
    state.snakes[0].body = [
      [10, y],
      [9, y],
      [8, y],
    ]
    state.snakes[0].dir = 'right'
    state.snakes[1].body = [
      [12, y],
      [13, y],
      [14, y],
    ]
    state.snakes[1].dir = 'left'
    step(state, [])
    expect(state.snakes.every((s) => !s.alive)).toBe(true)
    expect(state.over).toBe(true)
    expect(state.winner).toBeNull()
  })
})
