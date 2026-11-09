import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { COURT } from './physics'
import {
  MOVE_SPEED,
  NET_MARGIN,
  POINT_TICKS,
  SERVE_TIMEOUT,
  SWING_COOLDOWN,
  shuttlePopGame as game,
  toWorld,
  type SpEvent,
  type SpInput,
  type SpState,
} from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

const ev = (player: string, input: SpInput): InputEvent<SpInput> => ({ player, input })
const swing = (player: string, x = 0, z = 0): InputEvent<SpInput> => ev(player, { t: 'swing', x, z, tick: 0 })

/** Online match, p0 on side 0, p0 serving (searches seeds). */
function duel(): SpState {
  for (let seed = 1; ; seed++) {
    const s = game.setup(players(2), seed, {})
    if (s.server === 0) return s
  }
}

const allEvents = (s: SpState, out: SpEvent[]) => {
  for (const e of s.events) if (!out.some((o) => o.id === e.id)) out.push(e)
}

function run(
  s: SpState,
  ticks: number,
  inputs: (s: SpState) => InputEvent<SpInput>[] = () => [],
  seen: SpEvent[] = [],
) {
  for (let i = 0; i < ticks; i++) {
    game.tick(s, inputs(s))
    allEvents(s, seen)
  }
  return seen
}

/** Put the shuttle in the air mid-rally. */
function rally(
  s: SpState,
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  lastHitter: 0 | 1,
) {
  s.phase = 'rally'
  s.phaseT = 0
  s.shuttle.pos = { ...pos }
  s.shuttle.vel = { ...vel }
  s.shuttle.lastHitter = lastHitter
  s.shuttle.pending = null
}

describe('toWorld', () => {
  it('forward points at the net for both sides; right is mirrored', () => {
    expect(toWorld(0, 0, 1).z).toBe(1)
    expect(toWorld(1, 0, 1).z).toBe(-1)
    expect(toWorld(0, 1, 0).x).toBe(-toWorld(1, 1, 0).x)
  })
})

describe('setup', () => {
  it('one human → seat 1 is the computer at the chosen level', () => {
    const s = game.setup(players(1), 3, { solo: 'hard' })
    expect(s.players[0]).toMatchObject({ id: 'p0', kind: 'human', side: 0 })
    expect(s.players[1]).toMatchObject({ id: 'ai', kind: 'ai', side: 1, level: 'hard' })
    expect(s.server).toBe(0)
    expect(s.phase).toBe('serve')
  })
  it('defaults to normal and has no local option', () => {
    expect(game.setup(players(1), 3, {}).players[1].level).toBe('normal')
    expect(game.options![0].choices.map((c) => c.value)).toEqual(['easy', 'normal', 'hard'])
  })
  it('two humans, server in right service box, receiver diagonal', () => {
    const s = duel()
    const [a, b] = s.players
    expect(a.kind).toBe('human')
    expect(b.kind).toBe('human')
    // server side 0, score 0 → right box (view) = world x < 0, just behind the short line
    expect(a.x).toBeLessThan(0)
    expect(a.z).toBeLessThan(-COURT.shortLine)
    expect(a.z).toBeGreaterThan(-COURT.shortLine - 1)
    // receiver's right box (view of side 1) = world x > 0 → diagonal
    expect(b.x).toBeGreaterThan(0)
    expect(b.z).toBeGreaterThan(COURT.shortLine)
  })
  it('is deterministic for a seed', () => {
    expect(game.setup(players(2), 9, {})).toEqual(game.setup(players(2), 9, {}))
  })
})

describe('movement', () => {
  it('diagonal input is normalised: speed never above MOVE_SPEED', () => {
    const s = duel()
    s.phase = 'rally'
    let max = 0
    run(s, 40, () => [ev('p1', { t: 'move', x: 1, z: 1 })])
    for (let i = 0; i < 20; i++) {
      game.tick(s, [ev('p1', { t: 'move', x: 1, z: 1 })])
      max = Math.max(max, Math.hypot(s.players[1].vx, s.players[1].vz))
    }
    expect(max).toBeLessThanOrEqual(MOVE_SPEED + 1e-9)
    expect(max).toBeGreaterThan(MOVE_SPEED * 0.9)
  })
  it('ramps up over a few ticks', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [ev('p1', { t: 'move', x: 0, z: -1 })])
    expect(Math.hypot(s.players[1].vx, s.players[1].vz)).toBeLessThan(MOVE_SPEED / 2)
  })
  it("can't enter the other half (net margin)", () => {
    const s = duel()
    s.phase = 'rally'
    run(s, 200, () => [ev('p0', { t: 'move', x: 0, z: 1 }), ev('p1', { t: 'move', x: 0, z: 1 })])
    expect(s.players[0].z).toBeLessThanOrEqual(-NET_MARGIN)
    expect(s.players[1].z).toBeGreaterThanOrEqual(NET_MARGIN)
  })
  it('ignores junk move values', () => {
    const s = duel()
    s.phase = 'rally'
    run(s, 5, () => [ev('p1', { t: 'move', x: NaN, z: Infinity } as SpInput)])
    expect(Number.isFinite(s.players[1].x)).toBe(true)
    expect(Number.isFinite(s.players[1].z)).toBe(true)
  })
})

describe('pick', () => {
  it('clamps the preset to 0..3', () => {
    const s = duel()
    game.tick(s, [ev('p0', { t: 'pick', preset: 9 }), ev('p1', { t: 'pick', preset: 1.7 })])
    expect(s.players[0].preset).toBe(3)
    expect(s.players[1].preset).toBe(1)
    game.tick(s, [ev('p0', { t: 'pick', preset: -2 })])
    expect(s.players[0].preset).toBe(0)
  })
})

describe('serve', () => {
  it('no held dir → short serve lands in the diagonal short box, point to server', () => {
    const s = duel()
    game.tick(s, [swing('p0')])
    expect(s.events.some((e) => e.k === 'serve' && e.side === 0)).toBe(true)
    expect(s.phase).toBe('rally')
    const seen = run(s, 300)
    const land = seen.find((e) => e.k === 'land')
    expect(land).toBeDefined()
    if (land?.k !== 'land') throw new Error()
    expect(land.in).toBe(true)
    expect(land.x).toBeGreaterThan(0)
    expect(land.x).toBeLessThanOrEqual(COURT.halfWidth)
    expect(land.z).toBeGreaterThanOrEqual(COURT.shortLine)
    expect(land.z).toBeLessThan(COURT.shortLine + 1.2)
    expect(seen.find((e) => e.k === 'point')).toMatchObject({ side: 0 })
    expect(s.score).toEqual([1, 0])
  })
  it('only the server can serve', () => {
    const s = duel()
    game.tick(s, [swing('p1')])
    expect(s.phase).toBe('serve')
  })
  it('server switches to the left box on an odd score; shuttle follows the hand', () => {
    const s = duel()
    game.tick(s, [swing('p0')])
    run(s, 300 + POINT_TICKS)
    expect(s.phase).toBe('serve')
    expect(s.score).toEqual([1, 0])
    expect(s.players[0].x).toBeGreaterThan(0) // left box from side 0's view
    expect(Math.hypot(s.shuttle.pos.x - s.players[0].x, s.shuttle.pos.z - s.players[0].z)).toBeLessThan(1)
    expect(s.shuttle.pos.y).toBeGreaterThan(0)
  })
  it('pulling back serves long (deep)', () => {
    const s = duel()
    game.tick(s, [swing('p0', 0, -1)])
    const land = run(s, 300).find((e) => e.k === 'land')
    if (land?.k !== 'land') throw new Error()
    expect(land.z).toBeGreaterThan(COURT.halfLen - 2)
  })
})

describe('faults and points', () => {
  it('landing out → point to the receiver, who serves next', () => {
    const s = duel()
    rally(s, { x: 0, y: 2, z: 3 }, { x: 0, y: 2, z: 12 }, 0)
    const seen = run(s, 200)
    const land = seen.find((e) => e.k === 'land')
    expect(land).toMatchObject({ in: false })
    expect(seen.find((e) => e.k === 'point')).toMatchObject({ side: 1 })
    expect(s.score).toEqual([0, 1])
    expect(s.server).toBe(1)
  })
  it('net hit → point to the receiver', () => {
    const s = duel()
    rally(s, { x: 0, y: 0.8, z: -1 }, { x: 0, y: 0, z: 8 }, 0)
    const seen = run(s, 30)
    expect(seen.some((e) => e.k === 'net')).toBe(true)
    expect(seen.find((e) => e.k === 'point')).toMatchObject({ side: 1 })
    expect(seen.some((e) => e.k === 'land')).toBe(false)
    expect(s.score).toEqual([0, 1])
  })
  it('landing in → point to the hitter, and the hitter serves next', () => {
    const s = duel()
    s.players[0].x = 2
    s.players[0].z = -6
    rally(s, { x: 0, y: 2, z: 1 }, { x: 0, y: 1, z: -4 }, 1)
    const seen = run(s, 200)
    expect(seen.find((e) => e.k === 'land')).toMatchObject({ in: true })
    expect(seen.find((e) => e.k === 'point')).toMatchObject({ side: 1 })
    expect(s.server).toBe(1)
    run(s, POINT_TICKS)
    expect(s.phase).toBe('serve')
    // side 1 server, own score 1 (odd) → left box from side 1's view = world x < 0
    expect(s.players[1].x).toBeLessThan(0)
    expect(s.players[1].z).toBeGreaterThan(COURT.shortLine)
  })
  it('falling back on own side (never crossed) → point to the other side', () => {
    const s = duel()
    rally(s, { x: 0, y: 1, z: -3 }, { x: 0, y: 0, z: 0 }, 0)
    expect(run(s, 100).find((e) => e.k === 'point')).toMatchObject({ side: 1 })
  })
  it('a match ends at 11 with a lead of 2', () => {
    const s = duel()
    s.score = [10, 3]
    rally(s, { x: 0, y: 2, z: 1 }, { x: 0, y: 1, z: 3 }, 0)
    run(s, 200 + POINT_TICKS)
    expect(s.score).toEqual([11, 3])
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
    expect(game.isFinished(s)).toBe(true)
  })
})

describe('swings', () => {
  it('receiver returns the serve with a hit event', () => {
    const s = duel()
    game.tick(s, [swing('p0')])
    // p1 swings every 20 ticks while the shuttle comes; at least one connects
    const seen = run(s, 120, (st) => (st.tick % 20 === 0 && st.shuttle.lastHitter === 0 ? [swing('p1')] : []))
    const hit = seen.find((e) => e.k === 'hit')
    expect(hit).toMatchObject({ side: 1 })
  })
  it('swinging with nothing in reach is a whiff', () => {
    const s = duel()
    rally(s, { x: 0, y: 2, z: -3 }, { x: 0, y: 1, z: -2 }, 1)
    s.players[0].x = 2.5
    s.players[0].z = -6
    game.tick(s, [swing('p0')])
    expect(s.events.some((e) => e.k === 'whiff' && e.side === 0)).toBe(true)
  })
  it("can't hit a shuttle you hit last", () => {
    const s = duel()
    s.players[0].x = 0
    s.players[0].z = -2
    rally(s, { x: 0, y: 1.5, z: -2.2 }, { x: 0, y: 3, z: 2 }, 0)
    const seen = run(s, 20, (st) => (st.tick % 20 === 1 ? [swing('p0')] : []))
    expect(seen.some((e) => e.k === 'hit')).toBe(false)
    expect(seen.some((e) => e.k === 'whiff' && e.side === 0)).toBe(true)
  })
  it('double swing at the net on the same tick → exactly one hit, by the side the shuttle is over', () => {
    for (const [z, reversed] of [
      [0.05, false],
      [0, false],
      [0.05, true],
      [0, true],
    ] as const) {
      const s = duel()
      s.players[0].x = 0
      s.players[0].z = -0.4
      s.players[1].x = 0
      s.players[1].z = 0.4
      rally(s, { x: 0, y: 1.7, z }, { x: 0, y: 0.5, z: 1 }, 0)
      const both = [swing('p0', 0, 1), swing('p1', 0, 1)]
      game.tick(s, reversed ? both.reverse() : both)
      const seen: SpEvent[] = []
      allEvents(s, seen)
      run(s, 30, () => [], seen)
      const hits = seen.filter((e) => e.k === 'hit')
      expect(hits).toHaveLength(1)
      expect(hits[0]).toMatchObject({ side: 1 })
    }
  })
  it("can't hit a shuttle over the other half (reach across the net)", () => {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 0.3
    // p1 may hit (p0 hit last), but the shuttle stays over side 0 while in p1's reach
    rally(s, { x: 0, y: 1.6, z: -0.2 }, { x: 0, y: 2, z: -0.5 }, 0)
    game.tick(s, [swing('p1')])
    const seen: SpEvent[] = []
    allEvents(s, seen)
    run(s, 25, () => [], seen)
    expect(seen.some((e) => e.k === 'hit')).toBe(false)
    expect(seen.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
  })
  it('the hit shuttle crosses the net', () => {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 2.2, z: 2.5 }, { x: 0, y: 0, z: 1 }, 0)
    game.tick(s, [swing('p1', 0, -1)])
    const seen = run(s, 300)
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 1 })
    expect(seen.some((e) => e.k === 'net')).toBe(false)
    const land = seen.find((e) => e.k === 'land')
    if (land?.k !== 'land') throw new Error()
    expect(land.z).toBeLessThan(0)
  })
})

describe('swing timing', () => {
  /** Shuttle passes right through p1 (closest on the first tick), drifting slowly so it stays in reach. */
  function passing() {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
    return s
  }
  /** Swing `after` ticks after the closest approach; returns the swing tick's events. */
  function swingAfter(after: number) {
    const s = passing()
    run(s, after) // first tick records the closest approach
    game.tick(s, [swing('p1')])
    return s.events.filter((e) => e.tick === s.tick)
  }
  it('a few ticks late is graded by |dt| (perfect band), hit at once', () => {
    expect(swingAfter(3).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'perfect' })
    expect(swingAfter(6).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'perfect' })
  })
  it('7-12 ticks late is good, not perfect', () => {
    for (const after of [7, 8, 12]) {
      expect(swingAfter(after).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'good' })
    }
  })
  it('later than pastGrace is a whiff, not a free perfect', () => {
    for (const after of [13, 14, 20, 30]) {
      const evs = swingAfter(after)
      expect(evs.some((e) => e.k === 'hit')).toBe(false)
      expect(evs.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
    }
  })
  it('a hit with dt > 0 fires exactly at its contact tick', () => {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 1.6, z: 1.6 }, { x: 0, y: 1.5, z: 3 }, 0)
    game.tick(s, [swing('p1')])
    const pend = s.shuttle.pending
    expect(pend).not.toBeNull()
    expect(pend!.atTick).toBeGreaterThan(s.tick)
    const seen = run(s, 30)
    const hits = seen.filter((e) => e.k === 'hit')
    expect(hits).toHaveLength(1)
    expect(hits[0].tick).toBe(pend!.atTick)
  })
  it('running away from a scheduled hit whiffs', () => {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 1.6, z: 1.6 }, { x: 0, y: 1.5, z: 3 }, 0)
    game.tick(s, [swing('p1')])
    expect(s.shuttle.pending!.atTick).toBeGreaterThan(s.tick)
    s.players[1].x = 2.5 // ran off
    const seen = run(s, 30)
    expect(seen.some((e) => e.k === 'hit')).toBe(false)
    expect(seen.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
  })
  it('swing cooldown: a second swing inside SWING_COOLDOWN ticks is ignored', () => {
    const s = duel()
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1) // p1 hit last: every p1 swing whiffs
    const whiffs = () => s.events.filter((e) => e.k === 'whiff').length
    game.tick(s, [swing('p1')])
    expect(whiffs()).toBe(1)
    run(s, SWING_COOLDOWN - 2)
    game.tick(s, [swing('p1')])
    expect(whiffs()).toBe(1)
    game.tick(s, [swing('p1')])
    expect(whiffs()).toBe(2)
  })
  it("a swing that can't resolve (receiver during the serve) doesn't start the cooldown", () => {
    const s = duel()
    const before = s.players[1].swingAt
    game.tick(s, [swing('p1')])
    expect(s.players[1].swingAt).toBe(before)
  })
})

describe('serve timeout', () => {
  it('an idle server short-serves after SERVE_TIMEOUT ticks', () => {
    const s = game.setup(players(1), 5, {})
    s.server = 1
    s.players[1].kind = 'human' // an idle seat (the computer would serve on its own)
    game.tick(s, [])
    run(s, SERVE_TIMEOUT - 2)
    expect(s.phase).toBe('serve')
    game.tick(s, [])
    expect(s.phase).toBe('rally')
    expect(s.events.some((e) => e.k === 'serve' && e.side === 1)).toBe(true)
  })
})

describe('bookkeeping', () => {
  it('events only keep the last 60 ticks; ids are unique', () => {
    const s = duel()
    game.tick(s, [swing('p0')])
    run(s, 70)
    expect(s.events.every((e) => e.tick > s.tick - 60)).toBe(true)
    const ids = s.events.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('history keeps the last 24 ticks', () => {
    const s = duel()
    run(s, 40)
    expect(s.history).toHaveLength(24)
    expect(s.history[23].tick).toBe(s.tick)
  })
  it('netView strips history and rng', () => {
    const s = duel()
    run(s, 10)
    const v = game.netView!(s) as Record<string, unknown>
    expect(v).not.toHaveProperty('history')
    expect(v).not.toHaveProperty('rng')
    expect(v).toHaveProperty('shuttle')
    expect(s.history.length).toBeGreaterThan(0)
  })
  it('removePlayer ends the match, the other side wins', () => {
    const s = duel()
    game.removePlayer!(s, 'p0')
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(1)
    expect(game.isFinished(s)).toBe(true)
  })
  it('determinism: same seed + inputs → identical state after 600 ticks', () => {
    const script = (st: SpState): InputEvent<SpInput>[] => {
      const t = st.tick
      const out: InputEvent<SpInput>[] = [
        ev('p0', { t: 'move', x: Math.sin(t / 30), z: Math.cos(t / 40) }),
        ev('p1', { t: 'move', x: Math.cos(t / 25), z: Math.sin(t / 35) }),
      ]
      if (t % 13 === 0) out.push(swing('p0', 0, (t % 3) - 1))
      if (t % 17 === 0) out.push(swing('p1', 0, (t % 3) - 1))
      return out
    }
    const a = game.setup(players(2), 42, {})
    const b = game.setup(players(2), 42, {})
    run(a, 600, script)
    run(b, 600, script)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })
})
