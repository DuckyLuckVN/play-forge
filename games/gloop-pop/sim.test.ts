import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { choosePlan } from './ai'
import { emptyJar, H, idx, makeCell } from './grid'
import { gloopCount } from './level'
import {
  AI_ID,
  boardOf,
  CLEAR_TICKS,
  createState,
  gloopGame,
  step,
  type Board,
  type GloopInput,
  type GloopState,
} from './sim'

const player = (id: string, slot = 0): PlayerInfo => ({ id, name: id, slot, ready: true }) as PlayerInfo
const solo = (opts: Record<string, string> = {}) => createState([player('me')], 7, opts)

function run(s: GloopState, ticks: number, input?: (s: GloopState) => InputEvent<GloopInput>[]) {
  for (let i = 0; i < ticks && !s.over; i++) step(s, input?.(s) ?? [])
  return s
}

/** Plays `id` like the computer would: one button a tick toward the best spot. */
function bot(id: string) {
  return (s: GloopState): InputEvent<GloopInput>[] => {
    const b = boardOf(s, id)!
    if (b.phase !== 'fall' || !b.piece) return []
    const plan = choosePlan(b.cells, b.piece, 'hard', { seed: b.pieces })
    const p = b.piece
    if (!plan) return [{ player: id, input: { t: 'drop' } }]
    const input: GloopInput =
      p.r !== plan.r
        ? { t: 'rot', dir: 1 }
        : p.x !== plan.x
          ? { t: 'move', dx: plan.x > p.x ? 1 : -1 }
          : { t: 'drop' }
    return [{ player: id, input }]
  }
}

const untilPhase = (s: GloopState, b: Board, phase: Board['phase'], max = 200) => {
  for (let i = 0; i < max && b.phase !== phase; i++) step(s, [])
}

describe('setup', () => {
  it('reads the options and clamps junk', () => {
    const s = createState([player('me')], 1, { speed: 'fast', level: '10', rival: 'hard' })
    expect(s.speed).toBe('fast')
    expect(s.startLevel).toBe(9)
    expect(s.boards.map((b) => b.id)).toEqual(['me', AI_ID])
    expect(s.boards[0].gloops).toBe(gloopCount(9))
    const odd = createState([player('me')], 1, { speed: 'warp', level: 'x' })
    expect([odd.speed, odd.startLevel, odd.boards.length]).toEqual(['medium', 0, 1])
  })

  it('gives every racer the same jar and capsules', () => {
    const s = createState([player('a'), player('b', 1)], 9, {})
    expect(s.boards[0].cells).toEqual(s.boards[1].cells)
    expect(s.boards[0].next).toEqual(s.boards[1].next)
  })
})

describe('playing a capsule', () => {
  it('spawns, moves, turns and falls', () => {
    const s = solo()
    const b = s.boards[0]
    untilPhase(s, b, 'fall')
    expect(b.piece).toMatchObject({ x: 3, y: 0, r: 0 })
    step(s, [{ player: 'me', input: { t: 'move', dx: -1 } }])
    step(s, [{ player: 'me', input: { t: 'rot', dir: 1 } }])
    expect(b.piece).toMatchObject({ x: 2, r: 1 })
    run(s, 40)
    expect(b.piece!.y).toBeGreaterThan(0)
  })

  it('soft drop is faster than gravity, hard drop locks at once', () => {
    const s = solo({ speed: 'slow' })
    const b = s.boards[0]
    b.cells = emptyJar()
    untilPhase(s, b, 'fall')
    step(s, [{ player: 'me', input: { t: 'soft', on: true } }])
    run(s, 10)
    expect(b.piece!.y).toBeGreaterThanOrEqual(5)
    step(s, [{ player: 'me', input: { t: 'drop' } }])
    expect(s.events.some((e) => e.type === 'land' && e.slam > 0)).toBe(true)
    expect(b.pieces).toBe(1)
  })

  it('ignores bad network input', () => {
    const s = solo()
    untilPhase(s, s.boards[0], 'fall')
    const before = JSON.stringify(s.boards[0].piece)
    step(s, [
      { player: 'me', input: { t: 'move', dx: 5 } as unknown as GloopInput },
      { player: 'me', input: null as unknown as GloopInput },
      { player: 'nobody', input: { t: 'drop' } },
    ])
    expect(JSON.stringify(s.boards[0].piece)).toBe(before)
  })
})

describe('popping', () => {
  it('flashes, pops, scores and lets loose halves fall', () => {
    const s = solo()
    const b = s.boards[0]
    b.cells = emptyJar()
    // Three red gloops in the bottom row, a red-red capsule above a blue half to drop in.
    for (let x = 0; x < 3; x++) b.cells[idx(x, H - 1)] = makeCell(0, true)
    b.cells[idx(7, H - 1)] = makeCell(2, true)
    b.gloops = 4
    b.next = [0, 1]
    untilPhase(s, b, 'fall')
    step(s, [{ player: 'me', input: { t: 'drop' } }])
    // Red half lands next to them in the bottom row making 4 in a row; blue half beside it.
    expect(b.phase).toBe('pop')
    untilPhase(s, b, 'settle')
    expect(b.gloops).toBe(1)
    // Medium speed doubles gloop points; the red half is worth 10.
    expect(b.score).toBe((100 + 200 + 400) * 2 + 10)
    expect(b.stats.popped).toBe(3)
  })

  it('a chain counts up and sends junk in a race', () => {
    const s = createState([player('a'), player('b', 1)], 3, {})
    const [a, other] = s.boards
    a.cells = emptyJar()
    // Two separate lines popped by one capsule: blue column under the capsule's
    // left half, red row next to its right half.
    for (let y = H - 4; y < H - 1; y++) a.cells[idx(0, y)] = makeCell(2, true)
    for (let x = 2; x < 5; x++) a.cells[idx(x, H - 1)] = makeCell(0, true)
    a.cells[idx(7, H - 1)] = makeCell(1, true) // one left, so the jar isn't cleared
    a.gloops = 7
    a.next = [2, 0]
    untilPhase(s, a, 'fall')
    a.piece = { x: 0, y: H - 5, r: 0, a: 2, b: 0 }
    // The red half falls to the bottom row after the blue pops: a 2-step chain.
    step(s, [{ player: 'a', input: { t: 'drop' } }])
    for (let i = 0; i < 120 && a.phase !== 'spawn'; i++) step(s, [])
    expect(a.stats.bestChain).toBe(2)
    expect(other.incoming).toHaveLength(2)
    expect(s.over).toBe(false)
  })
})

describe('jars and endings', () => {
  it('solo: a clear jar leads to the next level', () => {
    const s = solo()
    const b = s.boards[0]
    run(s, 4000, bot('me'))
    expect(b.stats.cleared).toBeGreaterThanOrEqual(1)
    expect(b.level).toBeGreaterThanOrEqual(1)
  })

  it('solo: the jar overflowing ends the match', () => {
    const s = solo()
    run(s, 20000, (st) => (st.boards[0].phase === 'fall' ? [{ player: 'me', input: { t: 'drop' } }] : []))
    expect(s.over).toBe(true)
    expect(s.boards[0].phase).toBe('out')
    for (let i = 0; i < 100; i++) step(s, [])
    expect(gloopGame.isFinished(s)).toBe(true)
  })

  it('race: first to clear wins', () => {
    const s = createState([player('a'), player('b', 1)], 11, {})
    run(s, 6000, bot('a'))
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
  })

  it('race: last jar standing wins', () => {
    const s = createState([player('a'), player('b', 1)], 11, {})
    gloopGame.removePlayer!(s, 'b')
    step(s, [])
    expect(s.over).toBe(true)
    expect(s.winner).toBe('a')
  })

  it('the computer can beat a player who does nothing', () => {
    const s = createState([player('me')], 5, { rival: 'normal' })
    run(s, 20000)
    expect(s.over).toBe(true)
    expect(s.winner).toBe(AI_ID)
  })

  it('a clear jar pauses before the next one', () => {
    expect(CLEAR_TICKS).toBeGreaterThan(30)
  })
})
