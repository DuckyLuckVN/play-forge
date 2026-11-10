import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { CHARGE, chargeOf } from './charge'
import { COURT, predictLanding } from './physics'
import {
  canSwing,
  gradeRewind,
  MAX_REWIND,
  MOVE_SPEED,
  NET_MARGIN,
  POINT_TICKS,
  rewindTicks,
  SERVE_TIMEOUT,
  seedPreset,
  separateAi,
  shownName,
  setupBots,
  SWING_COOLDOWN,
  shuttlePopGame as game,
  TAPPED,
  toWorld,
  type SpEvent,
  type SpInput,
  type SpState,
} from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

const ev = (player: string, input: SpInput): InputEvent<SpInput> => ({ player, input })
/** No tick: the host's own swing (rewind 0). Guest swings carry the tick they saw (see 'lag fairness'). */
const swing = (player: string, x = 0, z = 0): InputEvent<SpInput> => ev(player, { t: 'swing', x, z })

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

  it('the computer moves off the preset the player picks', () => {
    const s = game.setup(players(1), 1, {})
    expect(s.players[1].preset).toBe(1)
    game.tick(s, [ev('p0', { t: 'pick', preset: 1 })])
    expect(s.players[0].preset).toBe(1)
    expect(s.players[1].preset).toBe(2)
    game.tick(s, [ev('p0', { t: 'pick', preset: 3 })])
    expect(s.players[1].preset).toBe(2)
  })

  it('separateAi moves a clashing computer to the next free preset', () => {
    const s = game.setup(players(1), 1, {})
    s.players[0].preset = 3
    s.players[1].preset = 3
    separateAi(s)
    expect(s.players[1].preset).toBe(0)
    separateAi(s)
    expect(s.players[1].preset).toBe(0)
  })

  it('seedPreset gives a fresh match the stored look, before any input', () => {
    const s = game.setup(players(1), 1, {})
    seedPreset(s, 'p0', 1)
    expect(s.players.map((p) => p.preset)).toEqual([1, 2])
    seedPreset(s, 'p0', 99)
    expect(s.players[0].preset).toBe(3)
    seedPreset(s, 'nobody', 0)
    expect(s.players[0].preset).toBe(3)
  })

  it('two humans may pick the same preset', () => {
    const s = duel()
    game.tick(s, [ev('p0', { t: 'pick', preset: 2 }), ev('p1', { t: 'pick', preset: 2 })])
    expect(s.players.map((p) => p.preset)).toEqual([2, 2])
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
  it('a smash onto the back corner lines is called at its true landing point → in', () => {
    // Shift a steep smash so its predicted landing sits on the corner (lines are in); the call
    // must use that point, not the below-floor overshoot of the last tick.
    const vel = { x: 1.2, y: -7, z: 16 }
    const probe = predictLanding({ pos: { x: 0, y: 2.6, z: 1 }, vel: { ...vel } }).pos
    const eps = 1e-9
    const start = { x: COURT.halfWidth - eps - probe.x, y: 2.6, z: 1 + COURT.halfLen - eps - probe.z }
    const want = predictLanding({ pos: { ...start }, vel: { ...vel } }).pos
    expect(Math.abs(want.x)).toBeLessThanOrEqual(COURT.halfWidth)
    expect(want.z).toBeLessThanOrEqual(COURT.halfLen)
    expect(want.z).toBeCloseTo(COURT.halfLen, 6)
    const s = duel()
    rally(s, start, vel, 0)
    const seen = run(s, 120)
    const land = seen.find((e) => e.k === 'land')
    if (land?.k !== 'land') throw new Error('no land event')
    expect(land.in).toBe(true)
    expect(Math.abs(land.x - want.x)).toBeLessThan(1e-6)
    expect(Math.abs(land.z - want.z)).toBeLessThan(1e-6)
    expect(seen.find((e) => e.k === 'point')).toMatchObject({ side: 0 })
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
  it('a shuttle hit this tick is not hittable back on the same tick, whatever the input order', () => {
    for (const reversed of [false, true]) {
      const s = duel()
      s.players[0].x = 0
      s.players[0].z = -0.5
      s.players[1].x = 0
      s.players[1].z = 0.4
      // Over p0 (p1 hit last), within p0's reach now; once p0 hits it, it crosses into p1's reach.
      rally(s, { x: 0, y: 1.5, z: -0.5 }, { x: 0, y: 0, z: 2 }, 1)
      const both = [swing('p0', 0, 1), swing('p1', 0, 1)]
      game.tick(s, reversed ? both.reverse() : both)
      const now = s.events.filter((e) => e.tick === s.tick)
      expect(now.find((e) => e.k === 'hit')).toMatchObject({ side: 0 })
      expect(now.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
      expect(s.shuttle.pending).toBeNull()
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
  it('a Perfect hit counts in stats.perfect for its side', () => {
    const s = passing()
    run(s, 3)
    game.tick(s, [swing('p1')])
    expect(s.stats.perfect).toEqual([0, 1])
  })
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

describe('lag fairness (swing rewind)', () => {
  it('rewindTicks clamps host − input to [0, MAX_REWIND]', () => {
    expect(MAX_REWIND).toBe(7)
    expect(rewindTicks(100, 50)).toBe(7)
    expect(rewindTicks(100, 120)).toBe(0)
    expect(rewindTicks(100, 95)).toBe(5)
    expect(rewindTicks(100, 100)).toBe(0)
    expect(rewindTicks(100, NaN)).toBe(0)
    expect(rewindTicks(100, -1e9)).toBe(7)
  })

  /** The shuttle crosses p1 sideways at 6 m/s: in reach for ~±11 ticks around the closest approach. */
  function crossing() {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 1.5, z: 3 }, { x: 6, y: 1, z: 0 }, 0)
    game.tick(s, []) // records the closest approach at this tick
    return { s, closest: s.tick }
  }
  /** p1 pressed `seen` ticks after the closest approach (on screen); the press reaches the host `lag` ticks later. */
  function guestSwing(seen: number, lag: number) {
    const { s, closest } = crossing()
    run(s, seen + lag - 1)
    game.tick(s, [ev('p1', { t: 'swing', x: 0, z: 0, tick: closest + seen })])
    return { s, evs: s.events.filter((e) => e.tick === s.tick) }
  }

  it('history tick T holds the shuttle as swings at tick T see it (findContact dt = 0)', () => {
    const s = duel()
    rally(s, { x: 0, y: 1.5, z: 3 }, { x: 6, y: 1, z: 0 }, 0)
    run(s, 3)
    const seen = { ...s.shuttle.pos }
    game.tick(s, [])
    expect(s.history.at(-1)).toMatchObject({ tick: s.tick, pos: seen })
  })
  it('a guest swing 5 ticks late is graded from the rewound time', () => {
    const { evs } = guestSwing(3, 5) // host-time dt = −8 (good); the guest saw dt = −3
    expect(evs.find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'perfect' })
  })
  it('hits via history when the shuttle is already past (out of reach now), launching from where it is', () => {
    const { s, evs } = guestSwing(8, 5)
    expect(evs.find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'good' })
    expect(s.shuttle.lastHitter).toBe(1)
    expect(s.shuttle.vel.z).toBeLessThan(0) // sent back over the net
  })
  it('without a tick (host / own swing) there is no rewind: the same press whiffs', () => {
    const { s } = crossing()
    run(s, 12)
    game.tick(s, [swing('p1')])
    expect(s.events.filter((e) => e.tick === s.tick).some((e) => e.k === 'whiff')).toBe(true)
  })
  it('a tick far in the past rewinds only MAX_REWIND ticks', () => {
    const { evs } = guestSwing(3, 30) // tampered / bad clock: would be a perfect if fully rewound
    expect(evs.some((e) => e.k === 'hit')).toBe(false)
    expect(evs.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
  })
  it('a tick in the future is no rewind (never a head start)', () => {
    const { s, closest } = crossing()
    run(s, 12)
    game.tick(s, [ev('p1', { t: 'swing', x: 0, z: 0, tick: closest + 1000 })])
    expect(s.events.filter((e) => e.tick === s.tick).some((e) => e.k === 'whiff')).toBe(true)
  })
  it('the computer never gets a rewind', () => {
    const s = game.setup(players(1), 5, {})
    s.players[1].x = 0
    s.players[1].z = 3
    s.players[1].level = undefined // no bot inputs of its own
    rally(s, { x: 0, y: 1.5, z: 3 }, { x: 6, y: 1, z: 0 }, 0)
    game.tick(s, [])
    const closest = s.tick
    run(s, 12)
    game.tick(s, [ev('ai', { t: 'swing', x: 0, z: 0, tick: closest })])
    expect(s.events.filter((e) => e.tick === s.tick).some((e) => e.k === 'whiff')).toBe(true)
  })
  it('a hit clears the history: the old flight is never a rewind candidate', () => {
    const { s } = guestSwing(3, 5)
    const hitTick = s.tick
    expect(s.history.every((h) => h.tick >= hitTick)).toBe(true)
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

describe('canSwing (local swing anim gate)', () => {
  it('serve: only the server; rally: both; between points: nobody', () => {
    const s = duel()
    s.tick = 100
    expect(canSwing(s, s.players[0])).toBe(true)
    expect(canSwing(s, s.players[1])).toBe(false)
    s.phase = 'rally'
    expect(canSwing(s, s.players[1])).toBe(true)
    s.phase = 'point'
    expect(canSwing(s, s.players[0])).toBe(false)
  })
  it('not while the last swing is cooling down', () => {
    const s = duel()
    s.phase = 'rally'
    s.tick = 100
    s.players[0].swingAt = 100 - SWING_COOLDOWN + 1
    expect(canSwing(s, s.players[0])).toBe(false)
    s.players[0].swingAt = 100 - SWING_COOLDOWN
    expect(canSwing(s, s.players[0])).toBe(true)
  })
})

describe('shownName', () => {
  it("names the computer in the page's language at display time, humans by their lobby name", () => {
    const s = game.setup(players(1), 1, {})
    s.players[1].name = 'Máy' // baked in another language at setup
    expect(shownName(s.players[1])).toBe('Computer')
    expect(shownName(s.players[0])).toBe('P0')
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
  it('history keeps the last 24 ticks (with where each side stood)', () => {
    const s = duel()
    run(s, 40)
    expect(s.history).toHaveLength(24)
    expect(s.history[23].tick).toBe(s.tick)
    expect(s.history[23].who[1]).toEqual({ x: s.players[1].x, z: s.players[1].z })
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

describe('match stats (results screen)', () => {
  it('longest rally (serve + hits) and Perfect hits per side match the events', () => {
    const s = setupBots('normal', 'normal', 5)
    const seen: SpEvent[] = []
    for (let i = 0; i < 60 * 60 * 2; i++) {
      game.tick(s, [])
      allEvents(s, seen)
    }
    let shots = 0
    let longest = 0
    const perfect = [0, 0]
    for (const e of seen) {
      if (e.k === 'serve') shots = 1
      else if (e.k === 'hit') {
        shots++
        if (e.grade === 'perfect') perfect[e.side]++
      } else if (e.k === 'point') longest = Math.max(longest, shots)
    }
    expect(longest).toBeGreaterThan(1)
    expect(s.stats).toEqual({ shots, longest, perfect })
  })

  it('starts at zero', () => {
    expect(game.setup(players(2), 1, {}).stats).toEqual({ shots: 0, longest: 0, perfect: [0, 0] })
  })
})

describe('hold-to-charge', () => {
  const charge = (player: string, cancel = false): InputEvent<SpInput> =>
    ev(player, cancel ? { t: 'charge', cancel: true } : { t: 'charge' })
  /** Shuttle passes right through p1 (as in 'swing timing'); p1 starts charging `hold` ticks before. */
  function chargedHit(hold: number, rewindTick?: number, heldZ = 0) {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1) // in the air on the far half meanwhile
    game.tick(s, [charge('p1')])
    run(s, hold - 1)
    rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
    s.history.length = 0
    const sw: SpInput =
      rewindTick === undefined
        ? { t: 'swing', x: 0, z: heldZ }
        : { t: 'swing', x: 0, z: heldZ, tick: rewindTick }
    game.tick(s, [ev('p1', sw)])
    return { s, hit: s.events.find((e) => e.k === 'hit' && e.tick === s.tick) }
  }

  it('a charge press starts charging (chargeAt = the tick); the release swing ends it', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [charge('p1')])
    expect(s.players[1].chargeAt).toBe(s.tick)
    game.tick(s, [charge('p1')]) // a repeat press keeps the first start
    expect(s.players[1].chargeAt).toBe(s.tick - 1)
    game.tick(s, [swing('p1')])
    expect(s.players[1].chargeAt).toBe(-1)
  })

  it('a tap (no charge press) hits with charge 0, exactly like before', () => {
    const { hit } = chargedHit(1)
    expect(hit).toMatchObject({ grade: 'perfect', charge: 0 })
  })

  it('a full hold hits with charge 1; a half hold in between', () => {
    expect(chargedHit(40).hit).toMatchObject({ grade: 'perfect', charge: 1 })
    const half = chargedHit(20).hit as { charge: number }
    expect(half.charge).toBeCloseTo((20 - CHARGE.start) / (CHARGE.full - CHARGE.start), 9)
  })

  it('a charged clear gets to the far end sooner than a tapped one from the same spot', () => {
    const full = chargedHit(40, undefined, -1)
    const tap = chargedHit(1, undefined, -1)
    expect(full.hit).toMatchObject({ shot: 'clear', charge: 1 })
    expect(tap.hit).toMatchObject({ shot: 'clear', charge: 0 })
    expect(predictLanding(full.s.shuttle).ticks).toBeLessThan(predictLanding(tap.s.shuttle).ticks)
  })

  it('timing is graded at the release tick (rewound for a lagged guest), the charge from the hold', () => {
    // The swing lands on tick 42 of the duel; a guest's screen showed tick 35 at its release (rewind 7):
    // the contact is 7 ticks after the rewound release → Good, and the hold still counts in full.
    const tick = chargedHit(40).s.tick
    expect(chargedHit(40, tick - 7).hit).toMatchObject({ grade: 'good', charge: 1 })
    expect(chargedHit(40, tick - 3).hit).toMatchObject({ grade: 'perfect', charge: 1 })
  })

  describe('a tap is graded at the press (the swing goes out on the button-up)', () => {
    it('a press with the contact on it swings at once, graded at the press; the release only ends it', () => {
      for (const hold of [5, 8, CHARGE.start, 25]) {
        const s = duel()
        s.players[1].x = 0
        s.players[1].z = 3
        rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
        game.tick(s, [ev('p1', { t: 'charge' })])
        const pressTick = s.tick
        const seen = run(s, hold - 1)
        game.tick(s, [swing('p1')])
        allEvents(s, seen)
        const hits = seen.concat(s.events).filter((e) => e.k === 'hit')
        expect(hits[0], `hold ${hold}`).toMatchObject({ grade: 'perfect', charge: 0, tick: pressTick })
        expect(
          s.events.some((e) => e.k === 'whiff'),
          `hold ${hold}`,
        ).toBe(false)
        expect(s.players[1].chargeAt).toBe(-1)
      }
    })

    it('a short hold released before a later contact is a tap graded at the press; a longer one at the release', () => {
      // Pressed while the shuttle is still far (no contact soon), the passing shuttle placed at the release.
      expect(chargedHit(5).hit).toMatchObject({ grade: 'perfect', charge: 0 }) // dt 5 from the press
      expect(chargedHit(MAX_REWIND).hit).toMatchObject({ grade: 'good', charge: 0 }) // dt 7 from the press
      // A press older than MAX_REWIND is no anchor: graded at the release.
      expect(chargedHit(MAX_REWIND + 1).hit).toMatchObject({ grade: 'perfect', charge: 0 })
      expect(chargedHit(12).hit).toMatchObject({ grade: 'perfect' }) // charged: graded at the release
      expect((chargedHit(12).hit as { charge: number }).charge).toBeGreaterThan(0)
    })

    it("a guest's press carries its screen tick (rewind-clamped like a swing)", () => {
      // The press reaches the host 7 ticks after the closest approach, stamped at it: Perfect.
      const s = duel()
      s.players[1].x = 0
      s.players[1].z = 3
      rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
      const closest = s.tick + 1
      run(s, 7)
      game.tick(s, [ev('p1', { t: 'charge', tick: closest })])
      expect(s.players[1].chargeAt).toBe(TAPPED) // swung at once, graded at the stamped press
      expect(s.events.find((e) => e.k === 'hit')).toMatchObject({ grade: 'perfect', charge: 0 })
      // A tick far in the past is clamped to MAX_REWIND.
      const t = duel()
      t.phase = 'rally'
      game.tick(t, [ev('p1', { t: 'charge', tick: -500 })])
      expect(t.players[1].pressAt).toBe(t.tick - MAX_REWIND)
      expect(t.players[1].chargeAt).toBe(t.tick) // the hold counts from the arrival
    })
  })

  describe('rewind limits of press-graded taps', () => {
    it('gradeRewind: a tap anchors on its press only within MAX_REWIND of now; never more', () => {
      expect(gradeRewind(100, 95, 0, 0)).toBe(5) // press 5 ticks ago: graded there
      expect(gradeRewind(100, 93, 0, 0)).toBe(MAX_REWIND)
      expect(gradeRewind(100, 92, 2, 0)).toBe(2) // too old: graded at the (stamped) release
      expect(gradeRewind(100, 95, 3, 0.4)).toBe(3) // charged: always the release
      expect(gradeRewind(100, -1, 4, 0)).toBe(4) // no press
      for (let press = 60; press <= 100; press++)
        for (const r of [0, 3, 7]) expect(gradeRewind(100, press, r, 0)).toBeLessThanOrEqual(MAX_REWIND)
    })

    it('pressed out of reach, ran in, released 9 ticks later: no Perfect from back then', () => {
      const s = duel()
      const p1 = s.players[1]
      p1.x = -2.2 // far from the shuttle's path
      p1.z = 3
      // A fast shuttle crossing 0.6 m from (0, 3) on the next tick, out of reach of (0, 3) 9 ticks later.
      rally(s, { x: -0.13, y: 1.5, z: 3.6 }, { x: 8, y: 1, z: 0 }, 0)
      game.tick(s, [ev('p1', { t: 'charge' })])
      run(s, CHARGE.start - 1)
      p1.x = 0 // "ran" next to the old crossing point just now
      p1.vx = 0
      game.tick(s, [swing('p1')])
      expect(s.events.some((e) => e.k === 'hit' && e.grade === 'perfect')).toBe(false)
    })

    it('the hold counts host arrival ticks: a stamped-early press adds no charge', () => {
      const s = duel()
      s.phase = 'rally'
      s.tick = 200
      game.tick(s, [ev('p1', { t: 'charge', tick: s.tick + 1 - MAX_REWIND })])
      expect(s.players[1].chargeAt).toBe(s.tick)
      const at = s.tick
      run(s, 14)
      rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
      s.players[1].x = 0
      s.players[1].z = 3
      s.history.length = 0
      game.tick(s, [swing('p1')])
      const hit = s.events.find((e) => e.k === 'hit') as { charge: number }
      expect(hit.charge).toBeCloseTo(chargeOf(s.tick - at), 9)
    })

    it('a press while the last one is TAPPED is ignored (a resync after a tap starts no new charge)', () => {
      const s = duel()
      s.phase = 'rally'
      s.players[1].chargeAt = TAPPED
      game.tick(s, [ev('p1', { t: 'charge' })])
      expect(s.players[1].chargeAt).toBe(TAPPED)
      game.tick(s, [swing('p1')])
      expect(s.players[1].chargeAt).toBe(-1)
      expect(s.events.some((e) => e.k === 'whiff')).toBe(false)
    })
  })

  it('a charge press during the swing cooldown is accepted; a release the cooldown rejects still ends it', () => {
    const s = duel()
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1)
    game.tick(s, [swing('p1')]) // whiff: cooldown starts
    game.tick(s, [charge('p1')])
    expect(s.players[1].chargeAt).toBe(s.tick)
    game.tick(s, [swing('p1')]) // still cooling down: ignored as a swing
    expect(s.players[1].chargeAt).toBe(-1)
    expect(s.players[1].swingAt).toBe(s.tick - 2)
  })

  it('cancel ends a charge without swinging', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [charge('p1')])
    const swingAt = s.players[1].swingAt
    game.tick(s, [charge('p1', true)])
    expect(s.players[1].chargeAt).toBe(-1)
    expect(s.players[1].swingAt).toBe(swingAt)
    expect(s.events.some((e) => e.k === 'whiff')).toBe(false)
  })

  it('a charge press while not allowed to swing (receiver in the serve, between points) is ignored', () => {
    const s = duel()
    game.tick(s, [charge('p1')])
    expect(s.players[1].chargeAt).toBe(-1)
    game.tick(s, [charge('p0')]) // the server may charge
    expect(s.players[0].chargeAt).toBe(s.tick)
    s.phase = 'point'
    game.tick(s, [charge('p1')])
    expect(s.players[1].chargeAt).toBe(-1)
  })

  it('a charge held through the point carries into the next serve (the client still holds the button)', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [charge('p1')])
    const at = s.players[1].chargeAt
    s.phase = 'point'
    s.phaseT = POINT_TICKS - 1
    game.tick(s, [])
    expect(s.phase).toBe('serve')
    expect(s.players[1].chargeAt).toBe(at)
  })

  it('charging slows the run to CHARGE.moveMul of full speed', () => {
    const s = duel()
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1)
    s.players[1].z = 5
    s.players[1].x = -2.5 // side 1's view-right is world +x: room to run
    run(s, 12, () => [ev('p1', { t: 'move', x: 1, z: 0 })])
    expect(Math.hypot(s.players[1].vx, s.players[1].vz)).toBeCloseTo(MOVE_SPEED, 6)
    game.tick(s, [charge('p1')])
    run(s, 12)
    expect(Math.hypot(s.players[1].vx, s.players[1].vz)).toBeCloseTo(MOVE_SPEED * CHARGE.moveMul, 6)
  })

  it('serves ignore the charge (same serve as a tap)', () => {
    const serveVel = (hold: number) => {
      const s = duel()
      if (hold) {
        game.tick(s, [charge('p0')])
        run(s, hold)
      }
      game.tick(s, [swing('p0', 0, -1)])
      expect(s.phase).toBe('rally')
      return s.shuttle.vel
    }
    const a = serveVel(0)
    const b = serveVel(40)
    expect(b.y).toBeCloseTo(a.y, 9)
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 9)
  })

  it('junk charge inputs are ignored safely', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [ev('p1', { t: 'charge', cancel: 'yes' } as unknown as SpInput)])
    expect(s.players[1].chargeAt).toBe(s.tick) // non-boolean cancel = a press, never a crash
    game.tick(s, [ev('p1', { t: 'charge', cancel: true })])
    game.tick(s, [ev('nobody', { t: 'charge' })])
    expect(s.players.every((p) => p.chargeAt === -1)).toBe(true)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  it('netView shows who is charging', () => {
    const s = duel()
    s.phase = 'rally'
    game.tick(s, [charge('p1')])
    const v = game.netView!(s) as SpState
    expect(v.players[1].chargeAt).toBe(s.tick)
  })
})
