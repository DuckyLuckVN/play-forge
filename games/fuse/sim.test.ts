import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { blastTarget, chooseDir } from './ai'
import { ROCK, valueOf, type Dir } from './board'
import {
  AI_ID,
  boardOf,
  CELEBRATE_TICKS,
  createState,
  fuseGame,
  METER_MAX,
  movePoints,
  rockInterval,
  ROCK_EVERY,
  ROCK_FASTEST,
  START_BLASTS,
  step,
  TICK_RATE,
  UNDOS,
  type FuseInput,
  type FuseState,
} from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))
const mv = (player: string, dir: Dir): InputEvent<FuseInput> => ({ player, input: { t: 'move', dir } })
const tiles = (s: FuseState, id = 'p0') => boardOf(s, id)!.cells.filter((c) => c && c.v !== ROCK).length

/** Lays out tiers on a board (0 empty, -1 rock). */
function lay(s: FuseState, tiers: number[], id = 'p0') {
  const b = boardOf(s, id)!
  b.cells = tiers.map((v) => (v ? { id: ++s.nextId, v, ...(v === ROCK ? { hp: 2 } : {}) } : null))
}

describe('setup', () => {
  it('starts with two tiles and is deterministic', () => {
    const s = createState(players(1), 4)
    expect(s.size).toBe(5)
    expect(tiles(s)).toBe(2)
    expect(createState(players(1), 4)).toEqual(s)
  })

  it('reads the options and falls back to defaults', () => {
    const s = createState(players(1), 1, { size: '6', rocks: 'off', time: '3', rival: 'bot' })
    expect(s.size).toBe(6)
    expect(s.rocks).toBe(false)
    expect(s.clock).toBe(3 * 60 * TICK_RATE)
    expect(s.boards.map((b) => b.id)).toEqual(['p0', AI_ID])
    const d = createState(players(1), 1, { size: '9', time: 'x', rival: '?' })
    expect([d.size, d.rocks, d.timeTicks, d.boards.length]).toEqual([5, true, 0, 1])
  })

  it('undo only without a rival; race boards share the starting tiles', () => {
    expect(createState(players(1), 1).boards[0].undos).toBe(UNDOS)
    const race = createState(players(3), 9)
    expect(race.boards.map((b) => b.undos)).toEqual([0, 0, 0])
    const tiers = (id: string) => boardOf(race, id)!.cells.map((c) => c?.v ?? 0)
    expect(tiers('p1')).toEqual(tiers('p0'))
    expect(race.boards.every((b) => b.blasts === START_BLASTS)).toBe(true)
  })
})

describe('moves', () => {
  it('slides, merges, scores and spawns one tile', () => {
    const s = createState(players(1), 2)
    lay(s, [1, 1, 0, 0, 0, ...Array(20).fill(0)])
    step(s, [mv('p0', 'left')])
    const b = boardOf(s, 'p0')!
    expect(b.cells[0]?.v).toBe(2)
    expect(b.score).toBe(4)
    expect(b.moves).toBe(1)
    expect(tiles(s)).toBe(2)
    expect(s.events[0]).toMatchObject({ type: 'move', combo: 1, gained: 4 })
  })

  it('ignores a move that changes nothing (no spawn)', () => {
    const s = createState(players(1), 2)
    lay(s, [1, 2, 0, 0, 0, ...Array(20).fill(0)])
    step(s, [mv('p0', 'left')])
    expect(tiles(s)).toBe(2)
    expect(boardOf(s, 'p0')!.moves).toBe(0)
  })

  it('combos multiply points', () => {
    const m = (n: number) =>
      Array.from({ length: n }, () => ({ cell: 0, tier: 2, from: [0, 0] as [number, number] }))
    expect(movePoints(m(1))).toBe(4)
    expect(movePoints(m(2))).toBe(12) // 8 × 1.5
    expect(movePoints(m(6))).toBe(72) // capped at × 3
  })

  it('rejects junk input and moves on other boards', () => {
    const s = createState(players(2), 2)
    const before = JSON.stringify(s.boards)
    step(s, [
      { player: 'p0', input: { t: 'move', dir: 'sideways' as Dir } },
      { player: 'p0', input: { t: 'blast', cell: 999 } },
      { player: 'ghost', input: { t: 'move', dir: 'left' } },
      { player: 'p0', input: null as unknown as FuseInput },
    ])
    expect(JSON.stringify(s.boards)).toBe(before)
  })
})

describe('rocks', () => {
  it('crack on the first merge beside them and break on the second', () => {
    const s = createState(players(1), 2, { rocks: 'off' })
    // The merge lands on cell 5, right under the rock at cell 0.
    const layout = [ROCK, 0, 0, 0, 0, 1, 1, ...Array(18).fill(0)]
    lay(s, layout)
    step(s, [mv('p0', 'left')])
    const b = boardOf(s, 'p0')!
    expect(b.cells[0]).toMatchObject({ v: ROCK, hp: 1 })
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'crumble', cracked: [0], broken: [] }))
    lay(s, layout)
    b.cells[0]!.hp = 1
    step(s, [mv('p0', 'left')])
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'crumble', cracked: [], broken: [0] }))
    expect(b.cells[0]?.v).not.toBe(ROCK)
  })

  it('come faster the longer the run', () => {
    expect(rockInterval(0)).toBe(ROCK_EVERY)
    expect(rockInterval(200)).toBeLessThan(ROCK_EVERY)
    expect(rockInterval(10_000)).toBe(ROCK_FASTEST)
  })

  it('drop in after ROCK_EVERY moves when on, never when off', () => {
    for (const rocks of ['on', 'off']) {
      const s = createState(players(1), 3, { rocks, size: '6' })
      const dirs: Dir[] = ['left', 'up', 'right', 'down']
      for (let i = 0; i < 200 && boardOf(s, 'p0')!.moves < ROCK_EVERY; i++) step(s, [mv('p0', dirs[i % 4])])
      const has = boardOf(s, 'p0')!.cells.some((c) => c?.v === ROCK)
      expect(has).toBe(rocks === 'on')
    }
  })
})

describe('blast, meter and undo', () => {
  it('blast clears a tile or rock and uses a charge', () => {
    const s = createState(players(1), 2)
    lay(s, [ROCK, 1, ...Array(23).fill(0)])
    step(s, [{ player: 'p0', input: { t: 'blast', cell: 0 } }])
    const b = boardOf(s, 'p0')!
    expect(b.cells[0]).toBeNull()
    expect(b.blasts).toBe(START_BLASTS - 1)
    step(s, [{ player: 'p0', input: { t: 'blast', cell: 1 } }])
    expect(b.cells[1]).not.toBeNull() // no charges left
  })

  it('merges charge a blast', () => {
    const s = createState(players(1), 2)
    const b = boardOf(s, 'p0')!
    b.meter = METER_MAX - 1
    lay(s, [1, 1, ...Array(23).fill(0)])
    step(s, [mv('p0', 'left')])
    expect(b.blasts).toBe(START_BLASTS + 1)
    expect(s.events).toContainEqual({ type: 'charged', p: 'p0' })
  })

  it('undo takes back one move, including the spawn', () => {
    const s = createState(players(1), 2)
    const b = boardOf(s, 'p0')!
    const before = JSON.stringify(b.cells)
    const dir = (['left', 'right', 'up', 'down'] as Dir[]).find((d) => {
      step(s, [mv('p0', d)])
      return b.moves > 0
    })!
    expect(dir).toBeTruthy()
    step(s, [{ player: 'p0', input: { t: 'undo' } }])
    expect(JSON.stringify(b.cells)).toBe(before)
    expect([b.moves, b.score, b.undos]).toEqual([0, 0, UNDOS - 1])
  })
})

describe('ending', () => {
  it('a stuck board with no blast or undo ends a solo game', () => {
    const s = createState(players(1), 2, { size: '4' })
    const b = boardOf(s, 'p0')!
    // No equal neighbours anywhere.
    lay(s, [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1])
    b.blasts = 0
    b.undos = 0
    step(s, [])
    expect(b.alive).toBe(false)
    expect(s.over).toBe(true)
    for (let i = 0; i < CELEBRATE_TICKS; i++) step(s, [])
    expect(fuseGame.isFinished(s)).toBe(true)
  })

  it('a stuck board with a blast left plays on', () => {
    const s = createState(players(1), 2, { size: '4' })
    lay(s, [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1])
    step(s, [])
    expect(s.over).toBe(false)
  })

  it('race until stuck: the last board standing wins', () => {
    const s = createState(players(2), 2, { size: '4' })
    lay(s, [1, 2, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 2, 1, 2, 1], 'p1')
    boardOf(s, 'p1')!.blasts = 0
    boardOf(s, 'p1')!.score = 999
    step(s, [])
    expect(s.over).toBe(true)
    expect(s.winner).toBe('p0')
  })

  it('timed race: the top score wins when the clock runs out; ties have no winner', () => {
    const s = createState(players(2), 2, { time: '3' })
    boardOf(s, 'p1')!.score = 50
    s.clock = 1
    step(s, [])
    expect(s.winner).toBe('p1')
    const tie = createState(players(2), 2, { time: '3' })
    tie.clock = 1
    step(tie, [])
    expect(tie.over).toBe(true)
    expect(tie.winner).toBeNull()
  })

  it('a player who leaves is out', () => {
    const s = createState(players(2), 2)
    fuseGame.removePlayer!(s, 'p1')
    step(s, [])
    expect(s.winner).toBe('p0')
  })
})

describe('race attacks', () => {
  it('a three-merge combo sends a rock to every rival, cancelling incoming first', () => {
    const s = createState(players(3), 2, { rocks: 'off' })
    lay(s, [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, ...Array(13).fill(0)])
    step(s, [mv('p0', 'left')])
    expect(s.events).toContainEqual({ type: 'attack', from: 'p0', n: 1, cancelled: 0 })
    expect(boardOf(s, 'p1')!.incoming).toBe(1)
    expect(boardOf(s, 'p2')!.incoming).toBe(1)
    // p1's next move drops the rock in.
    const p1 = boardOf(s, 'p1')!
    const dir = (['left', 'right', 'up', 'down'] as Dir[]).find((d) => {
      step(s, [mv('p1', d)])
      return p1.moves > 0
    })
    expect(dir).toBeTruthy()
    expect(p1.cells.some((c) => c?.v === ROCK)).toBe(true)
    expect(p1.incoming).toBe(0)

    // p2 answers with its own combo: it cancels the rock instead of sending one.
    lay(s, [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, ...Array(13).fill(0)], 'p2')
    step(s, [mv('p2', 'left')])
    expect(s.events).toContainEqual({ type: 'attack', from: 'p2', n: 0, cancelled: 1 })
    expect(boardOf(s, 'p0')!.incoming).toBe(0)
  })

  it('the computer rival plays by itself', () => {
    const s = createState(players(1), 5, { rival: 'bot' })
    for (let i = 0; i < 200; i++) step(s, [])
    expect(boardOf(s, AI_ID)!.moves).toBeGreaterThan(10)
  })
})

/** Plays a whole solo game with the greedy bot; returns moves made and best tile. */
function playOut(seed: number, options: Record<string, string>) {
  const s = createState(players(1), seed, options)
  const b = boardOf(s, 'p0')!
  b.undos = 0
  for (let i = 0; i < 4000 && !s.over; i++) {
    const d = chooseDir(b.cells, s.size, { seed: seed * 31 + i })
    step(s, [d ? mv('p0', d) : { player: 'p0', input: { t: 'blast', cell: blastTarget(b.cells, s.size) } }])
  }
  return { moves: b.moves, best: valueOf(b.best) }
}

describe('balance', () => {
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const runs = (options: Record<string, string>) =>
    Array.from({ length: 8 }, (_, i) => playOut(i + 1, options))

  it('5×5 with rocks: a steady player gets big tiles, but the run does end', () => {
    const r = runs({})
    // Milestones keep coming (256+), the ramp ends things (well under 4000 moves).
    expect(median(r.map((x) => x.best))).toBeGreaterThanOrEqual(256)
    expect(median(r.map((x) => x.moves))).toBeGreaterThan(300)
    expect(median(r.map((x) => x.moves))).toBeLessThan(2000)
  })

  it('rocks make it harder; 4×4 is the hard mode', () => {
    const off = median(runs({ rocks: 'off' }).map((x) => x.moves))
    const on = median(runs({}).map((x) => x.moves))
    const small = median(runs({ size: '4' }).map((x) => x.moves))
    expect(on).toBeLessThan(off)
    expect(small).toBeLessThan(on)
  })
})
