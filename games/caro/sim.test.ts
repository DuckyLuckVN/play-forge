import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import {
  AI_ID,
  caroGame,
  CELEBRATE_TICKS,
  createState,
  step,
  UNDOS,
  type CaroInput,
  type CaroState,
} from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

const move = (player: string, cell: number): InputEvent<CaroInput> => ({ player, input: { t: 'move', cell } })
const undo = (player: string): InputEvent<CaroInput> => ({ player, input: { t: 'undo' } })

/** Ticks until the computer has answered (or gives up after a while). */
function untilTurn(state: CaroState, side: 1 | 2, max = 50) {
  for (let i = 0; i < max && state.turn !== side && !state.over; i++) step(state, [])
}

/** Online game where p0 is X. */
function duel(options = {}): CaroState {
  for (let seed = 0; ; seed++) {
    const s = createState(players(2), seed, options)
    if (s.seats[0].id === 'p0') return s
  }
}

describe('setup', () => {
  it('is deterministic for a seed', () => {
    expect(createState(players(2), 7)).toEqual(createState(players(2), 7))
  })

  it('reads the options', () => {
    const s = createState(players(1), 1, { size: '19', rule: 'blocked', timer: '15', solo: 'hard' })
    expect(s.size).toBe(19)
    expect(s.board).toHaveLength(361)
    expect(s.rule).toBe('blocked')
    expect(s.clock).toBe(150)
    expect(s.level).toBe('hard')
  })

  it('falls back to defaults for unknown options', () => {
    const s = createState(players(1), 1, { size: '99', rule: 'x', timer: 'y' })
    expect(s.size).toBe(15)
    expect(s.rule).toBe('free')
    expect(s.turnTicks).toBe(0)
  })

  it('solo: the player is X against the computer and starts', () => {
    const s = createState(players(1), 3)
    expect(s.seats[0].id).toBe('p0')
    expect(s.seats[1]).toMatchObject({ id: AI_ID, kind: 'ai' })
    expect(s.turn).toBe(1)
    expect(s.undos).toEqual([UNDOS, UNDOS])
  })

  it('pass and play gives both colours to the one player', () => {
    const s = createState(players(1), 3, { solo: 'local' })
    expect(s.seats.map((x) => x.id)).toEqual(['p0', 'p0'])
  })

  it('online: both colours happen across seeds, and there are no undos', () => {
    const firsts = new Set(Array.from({ length: 20 }, (_, i) => createState(players(2), i).seats[0].id))
    expect(firsts).toEqual(new Set(['p0', 'p1']))
    expect(createState(players(2), 1).undos).toEqual([0, 0])
  })
})

describe('moves', () => {
  it('alternates turns and ignores moves out of turn', () => {
    const s = duel()
    step(s, [move('p1', 0)])
    expect(s.board[0]).toBe(0)
    step(s, [move('p0', 0)])
    expect(s.board[0]).toBe(1)
    expect(s.turn).toBe(2)
    step(s, [move('p0', 1)])
    expect(s.board[1]).toBe(0)
    step(s, [move('p1', 1)])
    expect(s.board[1]).toBe(2)
  })

  it('rejects taken, out-of-range and junk cells', () => {
    const s = duel()
    step(s, [move('p0', 5)])
    for (const cell of [5, -1, 225, 1.5, NaN, '3' as unknown as number]) step(s, [move('p1', cell)])
    expect(s.moves).toEqual([5])
    step(s, [{ player: 'p1', input: null as unknown as CaroInput }])
    expect(s.turn).toBe(2)
  })

  it('five in a row wins and records the line', () => {
    const s = duel()
    // X on row 0, O on row 1.
    for (let i = 0; i < 4; i++) step(s, [move('p0', i), move('p1', 15 + i)])
    step(s, [move('p0', 4)])
    expect(s.over).toBe(true)
    expect(s.winner).toBe(1)
    expect(s.reason).toBe('five')
    expect(s.line).toEqual([0, 1, 2, 3, 4])
    expect(s.events).toContainEqual({ type: 'win', side: 1 })
    // A short celebration before the results screen.
    expect(caroGame.isFinished(s)).toBe(false)
    for (let i = 0; i < CELEBRATE_TICKS; i++) step(s, [])
    expect(caroGame.isFinished(s)).toBe(true)
    expect(s.events).toEqual([])
  })

  it('announces a four', () => {
    const s = duel()
    for (let i = 0; i < 3; i++) step(s, [move('p0', 30 + i), move('p1', 100 + i * 3)])
    step(s, [move('p0', 33)])
    expect(s.events).toContainEqual({ type: 'four', side: 1 })
  })

  it('a full board without five is a draw', () => {
    const s = duel()
    s.board.fill(1)
    s.board[0] = 0
    // The corner's three lines (→, ↓, ↘) start with O, so X at 0 can't make five.
    s.board[1] = 2
    s.board[15] = 2
    s.board[16] = 2
    step(s, [move('p0', 0)])
    expect(s.over).toBe(true)
    expect(s.winner).toBe(0)
    expect(s.reason).toBe('draw')
  })
})

describe('computer', () => {
  it('answers after a short think', () => {
    const s = createState(players(1), 4)
    step(s, [move('p0', 112)])
    expect(s.turn).toBe(2)
    expect(s.think).toBeGreaterThan(2)
    untilTurn(s, 1)
    expect(s.moves).toHaveLength(2)
    expect(s.board.filter((m) => m === 2)).toHaveLength(1)
  })

  it('cannot be moved for by the player', () => {
    const s = createState(players(1), 4)
    step(s, [move('p0', 112)])
    step(s, [move('p0', 113)])
    expect(s.moves).toEqual([112])
  })
})

describe('undo', () => {
  it('takes back your move and the computer reply', () => {
    const s = createState(players(1), 4)
    step(s, [move('p0', 112)])
    untilTurn(s, 1)
    step(s, [undo('p0')])
    expect(s.moves).toEqual([])
    expect(s.board.every((m) => m === 0)).toBe(true)
    expect(s.turn).toBe(1)
    expect(s.undos[0]).toBe(UNDOS - 1)
    expect(s.events).toContainEqual({ type: 'undo', cells: expect.any(Array) })
  })

  it('while the computer thinks, takes back just your move', () => {
    const s = createState(players(1), 4)
    step(s, [move('p0', 112)])
    step(s, [undo('p0')])
    expect(s.moves).toEqual([])
    expect(s.turn).toBe(1)
  })

  it('runs out', () => {
    const s = createState(players(1), 4)
    for (let i = 0; i < UNDOS + 2; i++) {
      step(s, [move('p0', 112)])
      untilTurn(s, 1)
      step(s, [undo('p0')])
    }
    expect(s.undos[0]).toBe(0)
    expect(s.moves).toHaveLength(2)
  })

  it('pass and play: one move, charged to whoever made it', () => {
    const s = createState(players(1), 4, { solo: 'local' })
    step(s, [move('p0', 112), move('p0', 113)])
    step(s, [undo('p0')])
    expect(s.moves).toEqual([112])
    expect(s.turn).toBe(2)
    expect(s.undos).toEqual([UNDOS, UNDOS - 1])
  })

  it('is not available online', () => {
    const s = duel()
    step(s, [move('p0', 112)])
    step(s, [undo('p0')])
    expect(s.moves).toEqual([112])
  })
})

describe('timer', () => {
  it('plays a quick move when time runs out', () => {
    const s = duel({ timer: '15' })
    for (let i = 0; i < 150; i++) step(s, [])
    expect(s.moves).toHaveLength(1)
    expect(s.turn).toBe(2)
    expect(s.clock).toBe(150)
  })

  it('resets on every move', () => {
    const s = duel({ timer: '30' })
    for (let i = 0; i < 100; i++) step(s, [])
    step(s, [move('p0', 112)])
    expect(s.clock).toBe(300)
  })
})

describe('ending early', () => {
  it('resigning hands the win to the other side', () => {
    const s = duel()
    step(s, [{ player: 'p1', input: { t: 'resign' } }])
    expect(s).toMatchObject({ over: true, winner: 1, reason: 'resign' })
  })

  it('a player leaving hands the win to the other side', () => {
    const s = duel()
    caroGame.removePlayer!(s, 'p0')
    expect(s).toMatchObject({ over: true, winner: 2, reason: 'left' })
  })

  it('ignores everything once over', () => {
    const s = duel()
    caroGame.removePlayer!(s, 'p0')
    step(s, [move('p1', 3)])
    expect(s.moves).toEqual([])
  })
})
