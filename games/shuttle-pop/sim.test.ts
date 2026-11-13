import { tallyOf } from './tally'
import { describe, expect, it } from 'vitest'
import { resolveOptions, type InputEvent, type PlayerInfo } from '@forge/net/session'
import { ABILITY, acting, actReady, cooldownOf, type Act } from './ability'
import { CHARGE, chargeOf } from './charge'
import { COURT_SIZES, courtDims } from './courtsize'
import { COURT, DT, predictLanding } from './physics'
import { POWER_SWING } from './power'
import { AVAILABLE_IDS, isAvailable } from './presets'
import { launchShot, shotTarget } from './shots'
import { readyDepth } from './ai'
import { serveBox } from './rules'
import { STUN } from './stun'
import { TICK_RATE } from './court'
import {
  AI_ID,
  canAct,
  canCharge,
  contactCandidates,
  RECEIVE_BACK,
  RECEIVE_X,
  SERVE_BACK,
  SERVE_X,
  serverPlayer,
  setupDoubles,
  canStrike,
  canSwing,
  gradeRewind,
  gradesAtPress,
  launchTick,
  MAX_REWIND,
  MOVE_SPEED,
  tapContact,
  NET_MARGIN,
  POINT_TICKS,
  PRESETS,
  rewindTicks,
  SERVE_TIMEOUT,
  seedPreset,
  separateAi,
  shownName,
  setupBots,
  stepPlayer,
  SWING_COOLDOWN,
  shuttlePopGame as game,
  TAPPED,
  toWorld,
  type SpEvent,
  type SpInput,
  type SpPlayer,
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
    expect(game.options!.find((o) => o.id === 'solo')!.choices.map((c) => c.value)).toEqual([
      'easy',
      'normal',
      'hard',
    ])
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
  it('clamps the preset to 0..PRESETS−1, then a hidden one maps to an available look (host validation)', () => {
    const s = duel()
    game.tick(s, [ev('p0', { t: 'pick', preset: 99 }), ev('p1', { t: 'pick', preset: 1.7 })])
    expect(s.players[0].preset).toBe(3) // hidden → first free in picker order (Cloud taken → Mint)
    expect(s.players[1].preset).toBe(1)
    game.tick(s, [ev('p0', { t: 'pick', preset: -2 })])
    expect(s.players[0].preset).toBe(0)
    game.tick(s, [ev('p0', { t: 'pick', preset: PRESETS - 1 + 0.9 })])
    expect(isAvailable(s.players[0].preset)).toBe(true)
  })

  it('a hidden pick maps to the first available look the other human is not wearing', () => {
    const s = duel()
    for (const id of [4, 7, 11]) {
      s.players[1].preset = 0
      game.tick(s, [ev('p0', { t: 'pick', preset: id })])
      expect(isAvailable(s.players[0].preset)).toBe(true)
      expect(s.players[0].preset).not.toBe(0)
    }
    s.players[1].preset = 0
    seedPreset(s, 'p0', 5)
    expect(s.players[0].preset).toBe(1)
    s.players[1].preset = 1
    seedPreset(s, 'p0', 5)
    expect(s.players[0].preset).toBe(3)
  })

  it('every available pick keeps exactly that look', () => {
    for (const n of AVAILABLE_IDS) {
      const s = duel()
      game.tick(s, [ev('p0', { t: 'pick', preset: n })])
      expect(s.players[0].preset).toBe(n)
    }
  })

  it('non-numbers, NaN and ±Infinity are ignored (the look stays)', () => {
    const s = duel()
    game.tick(s, [ev('p0', { t: 'pick', preset: 2 })])
    for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined])
      game.tick(s, [ev('p0', { t: 'pick', preset: bad } as unknown as SpInput)])
    expect(s.players[0].preset).toBe(2)
    seedPreset(s, 'p0', NaN)
    seedPreset(s, 'p0', Infinity)
    seedPreset(s, 'p0', '7' as unknown as number)
    expect(s.players[0].preset).toBe(2)
  })

  it('the computer moves off the preset the player picks', () => {
    const s = game.setup(players(1), 1, {})
    expect(s.players[1].preset).toBe(1)
    game.tick(s, [ev('p0', { t: 'pick', preset: 1 })])
    expect(s.players[0].preset).toBe(1)
    expect(s.players[1].preset).toBe(3) // next card in picker order after Cloud: Mint
    game.tick(s, [ev('p0', { t: 'pick', preset: 3 })])
    expect(s.players[1].preset).toBe(2)
  })

  it('separateAi moves a clashing computer to the next free available preset, wrapping', () => {
    const s = game.setup(players(1), 1, {})
    const last = AVAILABLE_IDS[AVAILABLE_IDS.length - 1]
    s.players[0].preset = last
    s.players[1].preset = last
    separateAi(s)
    expect(s.players[1].preset).toBe(AVAILABLE_IDS[0])
    separateAi(s)
    expect(s.players[1].preset).toBe(AVAILABLE_IDS[0])
    AVAILABLE_IDS.forEach((n, i) => {
      s.players[0].preset = n
      s.players[1].preset = n
      separateAi(s)
      expect(s.players[1].preset).toBe(AVAILABLE_IDS[(i + 1) % AVAILABLE_IDS.length])
    })
  })

  it('the computer never wears a hidden preset, whatever the human picks', () => {
    for (let pick = -1; pick <= PRESETS + 1; pick++) {
      const s = game.setup(players(1), 1, {})
      s.players[1].preset = 9 // even a stale hidden seat is moved
      seedPreset(s, 'p0', pick)
      expect(isAvailable(s.players[0].preset)).toBe(true)
      expect(isAvailable(s.players[1].preset)).toBe(true)
      expect(s.players[1].preset).not.toBe(s.players[0].preset)
    }
  })

  it('seedPreset gives a fresh match the stored look, before any input', () => {
    const s = game.setup(players(1), 1, {})
    seedPreset(s, 'p0', 1)
    expect(s.players.map((p) => p.preset)).toEqual([1, 3])
    seedPreset(s, 'p0', 99)
    expect(s.players[0].preset).toBe(1)
    seedPreset(s, 'nobody', 3)
    expect(s.players[0].preset).toBe(1)
  })

  it('two humans may pick the same available preset', () => {
    const s = duel()
    game.tick(s, [ev('p0', { t: 'pick', preset: 2 }), ev('p1', { t: 'pick', preset: 2 })])
    expect(s.players.map((p) => p.preset)).toEqual([2, 2])
  })
})

describe('serve', () => {
  it('no held dir → short serve lands in the diagonal short box, point to server', () => {
    const s = duel()
    game.tick(s, [swing('p0')])
    expect(s.events.some((e) => e.k === 'serve' && e.side === 0 && e.shot === 'serveShort')).toBe(true)
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
  function swingAfter(after: number, pressured = false) {
    const s = passing()
    s.shuttle.pressured = pressured
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
  it('a pressured shuttle (power smash incoming) shrinks the Perfect window to 4', () => {
    expect(swingAfter(4, true).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'perfect' })
    expect(swingAfter(5, true).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'good' })
    expect(swingAfter(5, false).find((e) => e.k === 'hit')).toMatchObject({ side: 1, grade: 'perfect' })
  })
  it('a tap return clears the pressure; so does the next serve set-up', () => {
    const s = passing()
    s.shuttle.pressured = true
    run(s, 3)
    game.tick(s, [swing('p1')])
    expect(s.events.some((e) => e.k === 'hit' && e.tick === s.tick)).toBe(true)
    expect(s.shuttle.pressured).toBe(false)
    s.shuttle.pressured = true
    run(s, 300 + POINT_TICKS)
    expect(s.phase).toBe('serve')
    expect(s.shuttle.pressured).toBe(false)
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

describe('lag-compensated hits (launch from the rewound contact)', () => {
  type V = { x: number; y: number; z: number }
  /** The receiver stands at `at` (default: on the shuttle's path); the closest approach is the first tick (C). */
  function onPath(pos: V, vel: V, at: { x: number; z: number } = pos) {
    const s = duel()
    const side = pos.z > 0 ? 1 : 0
    s.players[side].x = at.x
    s.players[side].z = at.z
    rally(s, pos, vel, side === 0 ? 1 : 0)
    return { s, id: `p${side}`, C: s.tick + 1 }
  }
  /** The swing seen at tick C, delivered `lag` ticks later; returns the state and every event. */
  function swingSeenAt(pos: V, vel: V, lag: number, at?: { x: number; z: number }) {
    const { s, id, C } = onPath(pos, vel, at)
    const seen = run(s, lag)
    game.tick(s, [ev(id, { t: 'swing', x: 0, z: 0, tick: C })])
    allEvents(s, seen)
    return { s, C, seen }
  }

  it('a rewound guest hit flies as if it had no lag', () => {
    const pos = { x: 0, y: 1.5, z: 3 }
    const vel = { x: 6, y: 1, z: 0 }
    const a = swingSeenAt(pos, vel, 0)
    const b = swingSeenAt(pos, vel, 5)
    expect(a.seen.find((e) => e.k === 'hit')).toMatchObject({ tick: a.C, grade: 'perfect' })
    expect(b.seen.find((e) => e.k === 'hit')).toMatchObject({ tick: b.C + 5, grade: 'perfect' })
    run(a.s, a.C + 10 - a.s.tick)
    run(b.s, b.C + 10 - b.s.tick)
    expect(b.s.tick).toBe(a.s.tick)
    for (const k of ['x', 'y', 'z'] as const) {
      expect(b.s.shuttle.pos[k]).toBeCloseTo(a.s.shuttle.pos[k], 9)
      expect(b.s.shuttle.vel[k]).toBeCloseTo(a.s.shuttle.vel[k], 9)
    }
  })

  it('a fast-forward into the net scores like a lag-free hit', () => {
    // A low drop right at the tape: no lift clears the net from there. The shuttle drifts back off the
    // tape (and away from p0), so a hit from where it is 5 ticks later would clear: only a launch from
    // the contact point nets.
    const pos = { x: 0, y: 0.6, z: -0.02 }
    const vel = { x: 1.5, y: -0.5, z: -1.2 }
    const at = { x: -0.3, z: -0.3 }
    const a = swingSeenAt(pos, vel, 0, at)
    const b = swingSeenAt(pos, vel, 5, at)
    const kinds = (r: typeof a, tick: number) => r.seen.filter((e) => e.tick === tick).map((e) => e.k)
    expect(kinds(a, a.C)).toEqual(['hit', 'net', 'point'])
    // The rewound hit resolves on the tick it arrives: hit, then the net it flew into during the fast-forward.
    expect(kinds(b, b.C + 5)).toEqual(['hit', 'net', 'point'])
    expect(b.seen.filter((e) => e.k === 'point')).toEqual([expect.objectContaining({ side: 1 })])
    expect(b.s.score).toEqual(a.s.score)
    expect(b.s.phase).toBe('point')
  })

  it('AI and on-time swings are unchanged', () => {
    // Recorded before hits launched from the rewound contact (AI swings have rewind 0: a no-op for them);
    // re-recorded when the power swing changed charged launches (the bots charge) and for the full-charge recovery (seed 11);
    // re-recorded when the bots started to jump / lunge (ai.ts LEVELS.ability), and when the lunge
    // started to really slide (seed 2), for the 2026-11-12 AI retune (no silent misses, LEVELS, tactics), and for the 2026-11-13 near-shuttle
    // fix (swing from where it stands, re-timed contact, blocked-swing retry, split step, reactTicks; believable
    // misread whiffs and the whiff/Late weights; easy balls never whiffed,
    // timing whiffs, Hard reactTicks 9).
    const fingerprint: number[][] = []
    const finals: SpState[] = []
    for (let seed = 1; seed <= 20; seed++) {
      const s = setupBots('hard', 'hard', seed)
      run(s, 600)
      const { score, stats, rng } = s
      fingerprint.push([...score, stats.shots, stats.longest, ...stats.perfect, rng])
      finals.push(s)
    }
    expect(fingerprint).toEqual([
      [0, 0, 12, 0, 5, 4, -1455494930],
      [1, 0, 3, 8, 4, 3, -823659259],
      [0, 1, 8, 1, 3, 1, 440012082],
      [0, 0, 9, 0, 2, 1, 440012083],
      [0, 1, 0, 7, 3, 2, 1703683424],
      [0, 0, 9, 0, 1, 1, 440012085],
      [1, 0, 6, 3, 2, 1, 440012086],
      [0, 1, 4, 8, 4, 4, -1455494923],
      [0, 0, 12, 0, 3, 5, -1455494922],
      [0, 0, 10, 0, 2, 2, -191823581],
      [1, 0, 0, 14, 7, 4, 1575801036],
      [0, 1, 0, 8, 3, 1, 1071847761],
      [0, 0, 10, 0, 2, 2, -191823578],
      [0, 0, 8, 0, 2, 3, 1071847763],
      [1, 0, 0, 11, 3, 2, -823659246],
      [0, 0, 9, 0, 0, 2, 440012095],
      [1, 0, 3, 6, 3, 3, 440012096],
      [0, 1, 1, 8, 1, 4, 440012097],
      [1, 0, 0, 9, 1, 4, 440012098],
      [0, 0, 10, 0, 3, 2, -191823571],
    ])
    const shuttle = (s: SpState) => ({
      pos: s.shuttle.pos,
      vel: s.shuttle.vel,
      lastHitter: s.shuttle.lastHitter,
    })
    // Positions / velocities to 9 decimals, not bit-exact: the last bits of float maths differ across
    // Node / V8 versions and CPUs (CI: Node 22 x64 vs a dev Mac), while any real change in the rally moves
    // them far more (and the integer fingerprint above stays exact).
    const close = (got: SpState, want: ReturnType<typeof shuttle>) => {
      const g = shuttle(got)
      expect(g.lastHitter).toBe(want.lastHitter)
      for (const k of ['pos', 'vel'] as const)
        for (const a of ['x', 'y', 'z'] as const) expect(g[k][a], `${k}.${a}`).toBeCloseTo(want[k][a], 9)
    }
    close(finals[0], {
      pos: { x: 0.40595205467668344, y: 3.1589127364028, z: 2.9817299727350797 },
      vel: { x: -0.1910177998194872, y: -1.2797944904123113, z: 3.444133166335663 },
      lastHitter: 0,
    })
    close(finals[1], {
      pos: { x: -0.18511115742703074, y: 4.10702988934557, z: 0.9369640285419196 },
      vel: { x: 1.1418936243332736, y: 3.5330349570184563, z: 6.263307307540929 },
      lastHitter: 0,
    })
    close(finals[2], {
      pos: { x: 0.6478971825462866, y: 1.6003728563011055, z: 0.037685372102987454 },
      vel: { x: 0.44093018521080973, y: -3.0624243302739664, z: 3.181654814883022 },
      lastHitter: 0,
    })
  })

  it('an unlagged late swing (contact in the past, lag 0) still launches from where the shuttle is now', () => {
    for (const stamped of [false, true]) {
      const { s, id } = onPath({ x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 })
      run(s, 5)
      const now = { ...s.shuttle.pos }
      const input: SpInput = stamped
        ? { t: 'swing', x: 0, z: 0, tick: s.tick + 1 }
        : { t: 'swing', x: 0, z: 0 }
      game.tick(s, [ev(id, input)])
      expect(s.events.find((e) => e.k === 'hit' && e.tick === s.tick)).toMatchObject({ grade: 'perfect' })
      expect(s.history.at(-1)!.pos).toEqual(now) // not the contact point 5 ticks back
      expect(s.shuttle.lastHitter).toBe(1)
    }
  })
})

describe('serve timeout', () => {
  it('SERVE_TIMEOUT is one minute', () => {
    expect(SERVE_TIMEOUT / TICK_RATE).toBe(60)
  })

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
      } else if (e.k === 'point') {
        longest = Math.max(longest, shots)
        shots = 0 // the sim's stats.shots resets at the point too (the window can end before the next serve)
      }
    }
    expect(longest).toBeGreaterThan(1)
    expect(s.stats).toMatchObject({ shots, longest, perfect })
    // Each side's players' tallies add up to that side's Perfect hits.
    for (const side of [0, 1] as const)
      expect(
        s.players.filter((p) => p.side === side).reduce((n, p) => n + tallyOf(s.stats, p.id).perfect, 0),
      ).toBe(perfect[side])
  })

  it('starts at zero', () => {
    expect(game.setup(players(2), 1, {}).stats).toEqual({ shots: 0, longest: 0, perfect: [0, 0] })
  })
})

describe('hold-to-charge', () => {
  const charge = (player: string, cancel = false): InputEvent<SpInput> =>
    ev(player, cancel ? { t: 'charge', cancel: true } : { t: 'charge' })
  /** Shuttle passes right through p1 (as in 'swing timing'); p1 starts charging `hold` ticks before. */
  function chargedHit(hold: number, rewindTick?: number, heldZ = 0, contactY = 1.5) {
    const s = duel()
    s.players[1].x = 0
    s.players[1].z = 3
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1) // in the air on the far half meanwhile
    game.tick(s, [charge('p1')])
    run(s, hold - 1)
    rally(s, { x: 0, y: contactY, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
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

  it('a full-charge Perfect smash carries power > 0.9 into the event and s.shuttle.power; a tap 0; a serve resets', () => {
    const { s, hit } = chargedHit(40, undefined, 1, 2.2)
    expect(hit).toMatchObject({ shot: 'smash', grade: 'perfect' })
    const power = (hit as { power: number }).power
    expect(power).toBeGreaterThan(0.9)
    expect(s.shuttle.power).toBe(power)
    expect(s.shuttle.pressured).toBe(true)
    const tap = chargedHit(1, undefined, 1, 2.2)
    expect(tap.hit).toMatchObject({ shot: 'smash', power: 0 })
    expect(tap.s.shuttle.power).toBe(0)
    expect(tap.s.shuttle.pressured).toBe(false)
    rally(s, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0)
    run(s, 600)
    expect(s.shuttle.power).toBe(0)
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

  it('a charged clear lands deeper and hangs longer than a tapped one from the same spot', () => {
    const full = chargedHit(40, undefined, -1)
    const tap = chargedHit(1, undefined, -1)
    expect(full.hit).toMatchObject({ shot: 'clear', charge: 1 })
    expect(tap.hit).toMatchObject({ shot: 'clear', charge: 0 })
    const a = predictLanding(tap.s.shuttle)
    const b = predictLanding(full.s.shuttle)
    expect(b.pos.z).toBeLessThan(a.pos.z) // side 1 hits toward z < 0
    expect(b.ticks).toBeGreaterThan(a.ticks)
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

    it("a moving guest's stamped swing is judged from where it saw itself (its predicted, current spot)", () => {
      for (const lag of [5, 6, 7]) {
        const s = duel()
        const p1 = s.players[1]
        p1.z = 3
        p1.x = -1.5 // out of reach when the shuttle passes (host time)…
        // A fast shuttle crossing 0.8 m from (0, 3) on the next tick (T), gone by T + lag.
        rally(s, { x: -0.2, y: 1.5, z: 3.8 }, { x: 12, y: 1, z: 0 }, 0)
        game.tick(s, [])
        const T = s.tick
        for (let k = 1; k < lag; k++) {
          p1.x = -1.5 + (1.5 * k) / lag // …running in, ahead on its own (predicted) screen
          game.tick(s, [])
        }
        p1.x = 0
        game.tick(s, [ev('p1', { t: 'swing', x: 0, z: 0, tick: T })])
        expect(
          s.events.find((e) => e.k === 'hit'),
          `lag ${lag}`,
        ).toMatchObject({ side: 1, grade: 'perfect' })
      }
    })

    it('the hold counts arrival to arrival: a lagged release (rewind 7) still gets the full hold', () => {
      const s = duel()
      s.phase = 'rally'
      game.tick(s, [ev('p1', { t: 'charge' })])
      const at = s.tick
      run(s, 24)
      rally(s, { x: 0, y: 1.5, z: 3 }, { x: 1.2, y: 1, z: 0 }, 0)
      s.players[1].x = 0
      s.players[1].z = 3
      s.history.length = 0
      game.tick(s, [ev('p1', { t: 'swing', x: 0, z: 0, tick: s.tick + 1 - MAX_REWIND })])
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

  describe('recovery after a full-charge swing', () => {
    const speed = (s: SpState) => Math.hypot(s.players[1].vx, s.players[1].vz)
    /** Rally, p1 runs right, holds `hold` ticks, swings (whiff), then keeps running 20 ticks: speed per tick. */
    function afterSwing(hold: number) {
      const s = duel()
      rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 5, z: 0 }, 1)
      s.players[1].z = 5
      s.players[1].x = -2.5
      run(s, 12, () => [ev('p1', { t: 'move', x: 1, z: 0 })])
      game.tick(s, [charge('p1')])
      run(s, hold - 1) // the swing tick closes the hold: `hold` ticks counted
      game.tick(s, [swing('p1', 0, 0)])
      const speeds: number[] = []
      for (let i = 0; i < 20; i++) {
        game.tick(s, [])
        speeds.push(speed(s))
      }
      return { s, speeds }
    }
    it('a 30-tick hold slows to recoveryMoveMul for recoveryTicks, then full speed again', () => {
      const { speeds } = afterSwing(30)
      // speeds[i] is tick +i+1; the swing tick itself is the first slowed one (15 ticks: swing + 14).
      for (let i = 5; i <= 13; i++) {
        expect(speeds[i]).toBeGreaterThan(MOVE_SPEED * POWER_SWING.recoveryMoveMul * 0.95)
        expect(speeds[i]).toBeLessThan(MOVE_SPEED * POWER_SWING.recoveryMoveMul * 1.05)
      }
      expect(speeds[14]).toBeGreaterThan(MOVE_SPEED * POWER_SWING.recoveryMoveMul * 1.05)
      expect(speeds[19]).toBeCloseTo(MOVE_SPEED, 6)
    })
    it('a 29-tick hold or a tap does not lock', () => {
      for (const hold of [29, 0]) {
        const { s, speeds } = afterSwing(hold)
        expect(speeds[10]).toBeGreaterThan(MOVE_SPEED * 0.65)
        expect(s.players[1].recoverUntil).toBe(-1)
      }
    })
    it('a full-charge serve does not lock', () => {
      const s = duel()
      game.tick(s, [charge('p0')])
      run(s, 40)
      game.tick(s, [swing('p0', 0, -1)])
      expect(s.phase).toBe('rally')
      expect(s.players[0].recoverUntil).toBe(-1)
    })
    it('the rally ending during the lock clears it', () => {
      const { s } = afterSwing(30)
      expect(s.players[1].recoverUntil).toBeGreaterThanOrEqual(0)
      s.phase = 'point'
      s.phaseT = POINT_TICKS - 1
      game.tick(s, [])
      expect(s.phase).toBe('serve')
      expect(s.players[1].recoverUntil).toBe(-1)
    })
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

describe('shared lag predicates', () => {
  it('gradesAtPress: charge 0 and 0..MAX_REWIND ticks since the press', () => {
    expect(gradesAtPress(0, 0)).toBe(true)
    expect(gradesAtPress(MAX_REWIND, 0)).toBe(true)
    expect(gradesAtPress(MAX_REWIND + 1, 0)).toBe(false)
    expect(gradesAtPress(-1, 0)).toBe(false)
    expect(gradesAtPress(3, 1)).toBe(false)
  })
  it('tapContact: contact within CHARGE.start ticks of the press', () => {
    expect(tapContact(10 + CHARGE.start, 10)).toBe(true)
    expect(tapContact(10 + CHARGE.start + 1, 10)).toBe(false)
    expect(tapContact(5, 10)).toBe(true)
  })
  it('launchTick: the later of contact and screen tick', () => {
    expect(launchTick(10, 12)).toBe(12)
    expect(launchTick(14, 12)).toBe(14)
  })
})

describe('court size', () => {
  /** Online match on the given court, p0 on side 0 serving. */
  function duelOn(court: string): SpState {
    for (let seed = 1; ; seed++) {
      const s = game.setup(players(2), seed, { court })
      if (s.server === 0) return s
    }
  }

  it('the court option: not aloneOnly, default normal, three sizes', () => {
    const opt = game.options!.find((o) => o.id === 'court')!
    expect(opt).toBeDefined()
    expect(opt.aloneOnly).toBeFalsy()
    expect(opt.default).toBe('normal')
    expect(opt.choices.map((c) => c.value)).toEqual(COURT_SIZES)
  })

  it('createState builds state.court from the option; junk is normal', () => {
    expect(game.setup(players(1), 1, { court: 'xl' }).court).toEqual(courtDims('xl'))
    expect(game.setup(players(1), 1, { court: 'huge' }).court).toEqual(courtDims('normal'))
    expect(game.setup(players(1), 1, {}).court).toEqual(courtDims('normal'))
  })

  it('netView sends the court', () => {
    const s = game.setup(players(2), 1, { court: 'large' })
    expect((game.netView!(s) as SpState).court).toEqual(courtDims('large'))
  })

  it('serve stance scales with the short line', () => {
    const s = duelOn('xl')
    const { shortLine } = courtDims('xl')
    const [a, b] = s.players
    expect(a.z).toBeLessThan(-shortLine)
    expect(a.z).toBeGreaterThan(-shortLine - 1)
    expect(b.z).toBeGreaterThan(shortLine)
  })

  it('players may run past the bigger lines, not past their margin', () => {
    const xl = courtDims('xl')
    const chase = (court?: typeof xl) => {
      const p = { side: 0 as const, x: 0, z: -3, vx: 0, vz: 0, move: { x: -1, z: -1 } }
      for (let i = 0; i < 600; i++) {
        if (court) stepPlayer(p, DT, 1, court)
        else stepPlayer(p, DT)
      }
      return p
    }
    const big = chase(xl)
    expect(Math.abs(big.x)).toBeCloseTo(xl.halfWidth + 0.8, 9)
    expect(Math.abs(big.z)).toBeCloseTo(xl.halfLen + 0.8, 9)
    const normal = chase()
    expect(Math.abs(normal.x)).toBeCloseTo(COURT.halfWidth + 0.8, 9)
    expect(Math.abs(normal.z)).toBeCloseTo(COURT.halfLen + 0.8, 9)
  })

  it('a landing beyond the Normal back line is in on Large', () => {
    for (const [court, inside, pointTo] of [
      ['large', true, 0],
      ['normal', false, 1],
    ] as const) {
      const s = game.setup(players(2), 1, { court })
      rally(s, { x: 0, y: 0.05, z: 7.2 }, { x: 0, y: -3, z: 0 }, 0)
      const seen: SpEvent[] = []
      for (let i = 0; i < 60 && !seen.some((e) => e.k === 'land'); i++) run(s, 1, () => [], seen)
      const land = seen.find((e) => e.k === 'land')
      const point = seen.find((e) => e.k === 'point')
      expect(land).toMatchObject({ in: inside })
      expect(point).toMatchObject({ side: pointTo })
    }
  })
})

describe('jump / lunge ability', () => {
  type V = { x: number; y: number; z: number }
  const ability = (player: string, x = 0, z = 0, tick?: number): InputEvent<SpInput> =>
    ev(player, tick === undefined ? { t: 'ability', x, z } : { t: 'ability', x, z, tick })
  /** Flights from side 1 onto p0's half; `idx` = flight index of the jump / lunge box's closest approach. */
  const LOB = { pos: { x: 0, y: 4.2, z: -2.6 }, vel: { x: 0, y: -1, z: -5 }, at: { x: 0, z: -4 }, idx: 19 } // over p0 at y ≈ 3.44
  const FLAT = { pos: { x: 0, y: 3.2, z: -1.5 }, vel: { x: 0, y: 1.5, z: -13 }, at: { x: 0, z: -4 }, idx: 14 } // y ≈ 3.23, under-and-past
  const WIDE = {
    pos: { x: 1.8, y: 0.9, z: -1 },
    vel: { x: 0, y: 0.6, z: -8 },
    at: { x: 0, z: -2.83 },
    idx: 16,
  } // 1.8 m wide at y ≈ 0.7
  /** The jump box is first entered at index 31: out of a press-at-index-0's window (horizonOf('jump') = 30). */
  const EARLY = {
    pos: { x: 0, y: 4.28, z: -0.95 },
    vel: { x: 0, y: 1.9, z: -6.4 },
    at: { x: 0, z: -4 },
    idx: 37,
  }
  type Scene = { pos: V; vel: V; at: { x: number; z: number }; idx: number }

  /** p0 (side 0) at the scene's spot, the shuttle at flight index 0 on the next tick (tick T0 + 1 + k sees index k). */
  function scene(sc: Scene, side: 0 | 1 = 0) {
    const s = duel()
    const flip = side === 1 ? -1 : 1
    const p = s.players[side]
    p.x = sc.at.x
    p.z = flip * sc.at.z
    rally(s, { ...sc.pos, z: flip * sc.pos.z }, { ...sc.vel, z: flip * sc.vel.z }, side === 0 ? 1 : 0)
    return { s, p, T0: s.tick, contact: s.tick + 1 + sc.idx }
  }
  /** Runs empty ticks up to `tick` − 1, then `tick` with `inputs`; returns every event seen. */
  function at(s: SpState, tick: number, inputs: InputEvent<SpInput>[], seen: SpEvent[] = []) {
    run(s, tick - 1 - s.tick, () => [], seen)
    game.tick(s, inputs)
    allEvents(s, seen)
    return seen
  }
  /** Ticks until the first hit / whiff (or `max`), collecting events. */
  function untilStrike(s: SpState, seen: SpEvent[], max = 60) {
    for (let i = 0; i < max && !seen.some((e) => e.k === 'hit' || e.k === 'whiff'); i++) {
      game.tick(s, [])
      allEvents(s, seen)
    }
    return seen
  }

  const button = (k: 'jump' | 'lunge', x = 0, z = 0, auto?: true): InputEvent<SpInput> =>
    ev('p0', { t: 'ability', x, z, k, ...(auto ? { auto } : {}) })
  const handSwing = (): InputEvent<SpInput> => ev('p0', { t: 'swing', x: 0, z: 0 })

  it('Jump button (auto swing off): leaps, never strikes; a swing in the air smashes with the jump reach', () => {
    const { s, contact } = scene(LOB)
    const seen = at(s, contact - ABILITY.jump.lead, [button('jump')])
    expect(s.players[0].act).toMatchObject({ k: 'jump', free: true })
    at(s, contact - 1, [], seen)
    expect(seen.some((e) => e.k === 'hit' || e.k === 'whiff')).toBe(false)
    at(s, contact, [handSwing()], seen)
    untilStrike(s, seen)
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'jump', shot: 'smash' })
  })

  it('auto swing on: the Jump button strikes by itself (the old forced jump)', () => {
    const { s, contact } = scene(LOB)
    const seen = untilStrike(s, at(s, contact - ABILITY.jump.lead, [button('jump', 0, 0, true)]))
    expect(s.players[0].act!.free).toBeUndefined()
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'jump', shot: 'smash' })
  })

  it('a Perfect hit cuts the running Jump / Dive cooldown by ABILITY.perfectCut', () => {
    const { s, contact } = scene(LOB)
    const seen = untilStrike(s, at(s, contact - ABILITY.jump.lead, [button('jump', 0, 0, true)]))
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, grade: 'perfect' })
    const a = s.players[0].act!
    expect(a.cut).toBe(ABILITY.perfectCut)
    expect(actReady(a, a.at + cooldownOf(a) - ABILITY.perfectCut)).toBe(true)
    expect(actReady(a, a.at + cooldownOf(a) - ABILITY.perfectCut - 1)).toBe(false)
  })

  it('auto swing on: the Dive button slides and strikes the wide drive by itself', () => {
    const { s, contact } = scene(WIDE)
    const seen = untilStrike(s, at(s, contact - ABILITY.dive.glide, [button('lunge', -1, 0, true)]))
    expect(s.players[0].act).toMatchObject({ k: 'lunge', free: true })
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'lunge', shot: 'clear' })
  })

  it('auto swing on: a dive with nothing to reach only slides (no whiff)', () => {
    const { s, contact } = scene(WIDE)
    const seen = at(s, contact - ABILITY.dive.glide, [button('lunge', 1, 0, true)])
    run(s, 30, () => [], seen)
    expect(seen.some((e) => e.k === 'hit' || e.k === 'whiff')).toBe(false)
  })

  it('a high lob + ability = jump-smash hit with act jump, stronger than a tap smash', () => {
    const { s, contact } = scene(LOB)
    const seen = at(s, contact - ABILITY.jump.lead, [ability('p0', 0, 1)])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ side: 0, act: 'jump' })
    untilStrike(s, seen)
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({
      tick: contact,
      side: 0,
      act: 'jump',
      shot: 'smash',
      grade: 'perfect',
    })
    // history[0] = the launch (the hit clears history, then records the launched shuttle).
    const launch = s.history.find((h) => h.tick === contact)!
    const tap = launchShot(
      'smash',
      'perfect',
      launch.pos,
      shotTarget('smash', 0, 0, s.court),
      () => 0.5,
      0,
      s.court,
    )
    expect(Math.hypot(launch.vel.x, launch.vel.y, launch.vel.z)).toBeGreaterThan(
      Math.hypot(tap.vel.x, tap.vel.y, tap.vel.z),
    )
  })

  it('a shuttle out of normal reach that passes high is unreachable by a plain swing', () => {
    const plain = scene(FLAT)
    const p = at(plain.s, plain.contact, [swing('p0', 0, 1)])
    expect(untilStrike(plain.s, p).find((e) => e.k === 'hit' || e.k === 'whiff')?.k).toBe('whiff')
    const jump = scene(FLAT)
    const j = at(jump.s, jump.contact - ABILITY.jump.lead, [ability('p0', 0, 1)])
    expect(untilStrike(jump.s, j).find((e) => e.k === 'hit')).toMatchObject({ act: 'jump', grade: 'perfect' })
  })

  it('a low wide drive + ability = lunge lift', () => {
    const lunge = scene(WIDE)
    const l = untilStrike(lunge.s, at(lunge.s, lunge.contact - ABILITY.lunge.lead, [ability('p0', 0, 1)]))
    expect(l.find((e) => e.k === 'act')).toMatchObject({ act: 'lunge' })
    const hit = l.find((e) => e.k === 'hit')
    expect(hit).toMatchObject({ act: 'lunge', shot: 'clear', side: 0 })
    expect(hit && hit.k === 'hit' && hit.grade).not.toBe('perfect')
    expect(lunge.p.act).toMatchObject({ k: 'lunge' })
    expect(lunge.p.act!.dx).toBeGreaterThan(0.99) // toward the shuttle (world +x)
    const plain = scene(WIDE)
    const p = untilStrike(plain.s, at(plain.s, plain.contact, [swing('p0', 0, 1)]))
    expect(p.some((e) => e.k === 'whiff')).toBe(true)
    expect(p.some((e) => e.k === 'hit')).toBe(false)
  })

  it('locks: no move or swing while airborne / on the floor, then free', () => {
    const { air, lock, airMul } = ABILITY.jump
    const { s, p, contact } = scene(LOB)
    const press = contact - ABILITY.jump.lead
    const right = ev('p0', { t: 'move', x: 1, z: 0 })
    at(s, press, [right, ability('p0', 0, 1)])
    let prev = { x: p.x, z: p.z }
    for (let k = 1; k < air; k++) {
      game.tick(s, [])
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThanOrEqual(MOVE_SPEED * airMul * DT + 1e-9)
      prev = { x: p.x, z: p.z }
    }
    for (let k = 0; k < lock; k++) {
      const before = p.swingAt
      const n = s.events.length
      game.tick(s, [swing('p0'), ev('p0', { t: 'charge' })])
      expect(p.swingAt).toBe(before)
      expect(p.chargeAt).toBe(-1)
      expect(s.events.slice(n).some((e) => e.k === 'whiff' || e.k === 'hit')).toBe(false)
    }
    expect(s.tick).toBe(press + air + lock - 1)
    expect(Math.hypot(p.vx, p.vz)).toBe(0) // stopped well inside the lock
    const still = p.x
    game.tick(s, [])
    expect(p.x).not.toBe(still) // at + air + lock: free

    const { dive, floor } = ABILITY.lunge
    const w = scene(WIDE)
    const wPress = w.contact - ABILITY.lunge.lead
    at(w.s, wPress, [ev('p0', { t: 'move', x: 1, z: 0 }), ability('p0', 0, 1)])
    const from = { x: w.p.x, z: w.p.z }
    const dir = { x: w.p.act!.dx, z: w.p.act!.dz }
    // The dive slides `slide` m along its direction (the held run is locked), then lies still on the floor.
    run(w.s, dive)
    const slid = { x: w.p.x, z: w.p.z }
    expect(slid.x - from.x).toBeCloseTo(dir.x * ABILITY.lunge.slide, 6)
    expect(slid.z - from.z).toBeCloseTo(dir.z * ABILITY.lunge.slide, 6)
    run(w.s, floor - 1)
    expect(w.s.tick).toBe(wPress + dive + floor - 1)
    expect({ x: w.p.x, z: w.p.z }).toEqual(slid)
    game.tick(w.s, [])
    expect(w.p.x).not.toBe(slid.x)
  })

  it('a press before the jump box is in range is a hop (no committed whiff)', () => {
    const { s, p, T0 } = scene(EARLY)
    const seen = at(s, T0 + 1, [ability('p0', 0, 1)]) // the box is 31 ticks on: out of the 30-tick window
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'hop' })
    expect(seen.some((e) => e.k === 'whiff')).toBe(false)
    expect(acting(p.act, T0 + 2)).toBe(false)
  })

  it('mistimed jump commits: a Late clear, full lock and 3 s cooldown', () => {
    const { s, p, T0 } = scene(EARLY)
    const press = T0 + 3 // the box is 29 ticks on: the edge of the window, graded Late at best
    const seen = at(s, press, [ability('p0', 0, 1)])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'jump' })
    untilStrike(s, seen)
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, grade: 'late' })
    for (let k = 0; k < ABILITY.jump.air + ABILITY.jump.lock; k++) expect(acting(p.act, press + k)).toBe(true)
    expect(acting(p.act, press + ABILITY.jump.air + ABILITY.jump.lock)).toBe(false)
    // Keep a rally going (a far-side high shuttle) so only the cooldown can refuse the press.
    run(s, 99 - (s.tick - press), () => [], seen)
    rally(s, { x: 0, y: 6, z: 3 }, { x: 0, y: 6, z: 0 }, 0)
    const n = seen.length
    at(s, press + 120, [ability('p0')], seen)
    expect(seen.slice(n).some((e) => e.k === 'act')).toBe(false)
    expect(canAct(s, p)).toBe(false)
    at(s, press + ABILITY.jump.cooldown, [ability('p0')], seen)
    expect(seen.slice(n).find((e) => e.k === 'act')).toMatchObject({ tick: press + ABILITY.jump.cooldown })
  })

  it('canStrike: the one rule for a strike (host press and AI): rally, not my own hit, swing cooldown, not mid-hit', () => {
    const { s, p } = scene(LOB)
    expect(canStrike(s, p)).toBe(true)
    p.swingAt = s.tick - SWING_COOLDOWN + 1
    expect(canStrike(s, p)).toBe(false)
    p.swingAt = s.tick - SWING_COOLDOWN
    expect(canStrike(s, p)).toBe(true)
    expect(canStrike(s, p, -1)).toBe(false) // a shuttle hit this tick can't be struck back
    s.shuttle.lastHitter = 0
    expect(canStrike(s, p)).toBe(false) // my own last hit
    s.shuttle.lastHitter = 1
    s.shuttle.pending = {
      atTick: s.tick + 1,
      id: 'p0',
      side: 0,
      kind: 'clear',
      grade: 'good',
      aimX: 0,
      charge: 0,
      fromTick: s.tick,
    }
    expect(canStrike(s, p)).toBe(false)
    s.shuttle.pending = null
    s.phase = 'serve'
    expect(canStrike(s, p)).toBe(false)
  })

  it('no target → hop: act event, no swing, 1 s cooldown, no lock', () => {
    const run2 = (presses: number[]) => {
      const s = duel() // serve phase: p1 is the receiver (free to move)
      const p = s.players[1]
      const seen: SpEvent[] = []
      const start = s.tick
      for (let k = 1; k <= 80; k++)
        at(
          s,
          start + k,
          [ev('p1', { t: 'move', x: 1, z: 0 }), ...(presses.includes(k) ? [ability('p1')] : [])],
          seen,
        )
      return { s, p, seen, start }
    }
    const ref = run2([])
    const hop = run2([1, 60, 61])
    const acts = hop.seen.filter((e) => e.k === 'act')
    expect(acts).toEqual([
      expect.objectContaining({ side: 1, act: 'hop', tick: hop.start + 1 }),
      expect.objectContaining({ side: 1, act: 'hop', tick: hop.start + 61 }), // +59 refused, +60 taken
    ])
    expect(hop.seen.some((e) => e.k === 'whiff' || e.k === 'hit')).toBe(false)
    expect(hop.p.swingAt).toBe(ref.p.swingAt)
    expect(hop.p.x).toBe(ref.p.x) // run speed untouched
    expect(hop.p.z).toBe(ref.p.z)

    // A rally press with the shuttle on the opponent's half hops too.
    const { s, p } = scene(LOB)
    rally(s, { x: 0, y: 3, z: 3 }, { x: 0, y: 4, z: 0 }, 0)
    const seen = at(s, s.tick + 1, [ability('p0')])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'hop' })
    expect(p.swingAt).toBe(-SWING_COOLDOWN)
  })

  it('ignored while charging, in point / over, twice in a tick', () => {
    const { s, p, contact } = scene(LOB)
    const press = contact - ABILITY.jump.lead
    at(s, press - 1, [ev('p0', { t: 'charge' })])
    const n = s.events.length
    game.tick(s, [ability('p0', 0, 1)])
    expect(s.events.slice(n).some((e) => e.k === 'act')).toBe(false)
    expect(p.act).toBeNull()
    // A charge press in the same tick wins too, whatever the order.
    const b = scene(LOB)
    const seenB = at(b.s, press, [ability('p0', 0, 1), ev('p0', { t: 'charge' })])
    expect(seenB.some((e) => e.k === 'act')).toBe(false)
    expect(b.p.chargeAt).toBe(press)

    const c = scene(LOB)
    c.s.phase = 'point'
    c.s.phaseT = 0
    expect(at(c.s, press, [ability('p0', 0, 1)]).some((e) => e.k === 'act')).toBe(false)

    const d = scene(LOB)
    const seenD = at(d.s, press, [ability('p0', 0, 1), ability('p0', 0, 1)])
    expect(seenD.filter((e) => e.k === 'act')).toHaveLength(1)
  })

  it('actLand fires once at the landing tick; resetForServe clears act', () => {
    const lands = (sc: Scene, lead: number) => {
      const { s, contact } = scene(sc)
      const press = contact - lead
      const seen = at(s, press, [ability('p0', 0, 1)])
      run(s, 60, () => [], seen)
      return { s, press, landed: seen.filter((e) => e.k === 'actLand') }
    }
    const j = lands(LOB, ABILITY.jump.lead)
    expect(j.landed).toEqual([expect.objectContaining({ side: 0, act: 'jump', tick: j.press + 30 })])
    const l = lands(WIDE, ABILITY.lunge.lead)
    expect(l.landed).toEqual([expect.objectContaining({ side: 0, act: 'lunge', tick: l.press + 12 })])
    // Play on to the next serve.
    const s = l.s
    run(s, 400, () => [], [])
    expect(s.phase).toBe('serve')
    expect(s.players[0].act).toBeNull()
    expect(canAct(s, s.players[0])).toBe(true)
  })

  it('a lagged ability grades like an unlagged one', () => {
    const play = (lag: number, stamp: (press: number) => number | undefined) => {
      const { s, contact } = scene(LOB, 1)
      const press = contact - ABILITY.jump.lead
      const seen = at(s, press + lag, [ability('p1', 0, 1, stamp(press))])
      untilStrike(s, seen)
      const hit = seen.find((e) => e.k === 'hit')
      return { s, hit, launch: s.history.find((h) => h.tick === hit?.tick) }
    }
    const a = play(0, () => undefined)
    const b = play(5, (press) => press)
    expect(a.hit).toMatchObject({ act: 'jump', grade: 'perfect', side: 1 })
    expect(b.hit).toMatchObject({ act: 'jump', grade: (a.hit as { grade: string }).grade, tick: a.hit!.tick })
    for (const k of ['x', 'y', 'z'] as const) expect(b.launch!.vel[k]).toBeCloseTo(a.launch!.vel[k], 9)
    // At the full MAX_REWIND the rewind is what keeps it Perfect (unstamped, the same press is 7 ticks late).
    expect(play(MAX_REWIND, (press) => press).hit).toMatchObject({ grade: 'perfect' })
    expect(play(MAX_REWIND, () => undefined).hit).toMatchObject({ grade: 'good' })
    // A stamp far in the past rewinds only MAX_REWIND (like a swing's): the same as a stamp 7 ticks back.
    const far = play(9, (press) => press - 1000)
    const capped = play(9, (press) => press + 9 - MAX_REWIND)
    expect(far.hit).toEqual(capped.hit)
  })

  it('netView carries act', () => {
    const { s, contact } = scene(LOB)
    at(s, contact - ABILITY.jump.lead, [ability('p0', 0, 1)])
    const act: Act = s.players[0].act!
    expect(act).toMatchObject({ k: 'jump', at: s.tick })
    expect((game.netView!(s) as SpState).players[0].act).toEqual(act)
  })
})

describe('racket stun', () => {
  const bonksOf = (seen: SpEvent[]) => seen.filter((e) => e.k === 'bonk')
  const ability = (player: string, x = 0, z = 0): InputEvent<SpInput> => ev(player, { t: 'ability', x, z })
  /** High over side 1's back court: nobody near the net can reach it. */
  const HIGH = { x: 0, y: 4, z: 5.5 }
  /** Keeps the shuttle hanging at HIGH (rally never ends). */
  const pin = (s: SpState) => {
    s.shuttle.pos = { ...HIGH }
    s.shuttle.vel = { x: 0, y: 0, z: 0 }
  }
  /** A pinned rally (last hit by side 0), p0 / p1 face to face across the net (`x` apart from the centre). */
  function face(x = 0): SpState {
    const s = duel()
    rally(s, HIGH, { x: 0, y: 0, z: 0 }, 0)
    const [a, b] = s.players
    a.x = x
    a.z = -0.35
    b.x = x
    b.z = 0.35
    return s
  }
  /** One tick with `inputs`, the shuttle pinned first. */
  function tick(s: SpState, inputs: InputEvent<SpInput>[] = [], seen: SpEvent[] = []) {
    pin(s)
    game.tick(s, inputs)
    allEvents(s, seen)
    return seen
  }
  /** Pinned ticks until s.tick === `to` − 1. */
  const idle = (s: SpState, to: number, seen: SpEvent[] = []) => {
    while (s.tick < to - 1) tick(s, [], seen)
    return seen
  }

  it('a swing at an opponent across the net stuns them: bonk event, no move, no swing, no ability for 48 ticks', () => {
    expect(STUN.ticks).toBe(48)
    const s = face()
    const [a, b] = s.players
    const seen = tick(s, [swing('p1')])
    const T = s.tick
    expect(bonksOf(seen)).toEqual([
      expect.objectContaining({ k: 'bonk', side: 0, who: 'p0', by: 'p1', tick: T }),
    ])
    expect(a.stunAt).toBe(T)
    expect(b.stunAt).toBe(-1)
    const start = { x: a.x, z: a.z }
    const swingAt = a.swingAt
    const during: SpEvent[] = []
    tick(s, [ev('p0', { t: 'move', x: 0, z: -1 })], during)
    tick(s, [ev('p0', { t: 'charge' })], during)
    expect(a.chargeAt).toBe(-1)
    tick(s, [swing('p0')], during)
    tick(s, [ability('p0')], during)
    expect(a.act).toBeNull()
    idle(s, T + 48, during)
    expect(s.tick).toBe(T + 47)
    expect(during.filter((e) => e.tick > T)).toEqual([])
    expect(a.swingAt).toBe(swingAt)
    expect({ x: a.x, z: a.z }).toEqual(start)
    const after = tick(s, [swing('p0')])
    expect(Math.hypot(a.x - start.x, a.z - start.z)).toBeGreaterThan(0)
    expect(a.swingAt).toBe(T + 48)
    expect(after.some((e) => e.k === 'whiff' && e.side === 0)).toBe(true)
  })

  it('out of reach or a serve: no bonk', () => {
    const far = face(0.9)
    far.players[1].x = -0.9 // 1.8 m apart across the net
    expect(bonksOf(tick(far, [swing('p1')]))).toEqual([])
    // The serve: p0 serves standing next to the receiver.
    const sv = duel()
    sv.players[0].x = 0
    sv.players[0].z = -0.35
    sv.players[1].x = 0
    sv.players[1].z = 0.35
    const seen = run(sv, 1, () => [swing('p0')])
    expect(seen.some((e) => e.k === 'serve')).toBe(true)
    expect(bonksOf(seen)).toEqual([])
    expect(sv.players[1].stunAt).toBe(-1)
    // A hop (nothing to strike) in reach never bonks.
    const hop = face()
    const h = tick(hop, [ability('p1')])
    expect(hop.players[1].act).toMatchObject({ k: 'hop' })
    expect(bonksOf(h)).toEqual([])
  })

  it('the swinger pays only the normal cooldown', () => {
    const s = face()
    const b = s.players[1]
    tick(s, [swing('p1')])
    const T = s.tick
    expect(b.swingAt).toBe(T)
    expect(b.recoverUntil).toBe(-1)
    expect(b.stunAt).toBe(-1)
    idle(s, T + SWING_COOLDOWN)
    const seen = tick(s, [swing('p1')])
    expect(b.swingAt).toBe(T + SWING_COOLDOWN)
    expect(seen.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
  })

  it('immunity: no second stun for 120 ticks after the stun ends', () => {
    expect(STUN.immune).toBe(120)
    const s = face()
    tick(s, [swing('p1')])
    const T = s.tick
    const seen: SpEvent[] = []
    // The swinger's own cooldown (SWING_COOLDOWN) spaces the tries; the last immune one is 20 ticks early.
    for (const k of [20, 60, 120, 168 - SWING_COOLDOWN]) {
      idle(s, T + k, seen)
      tick(s, [swing('p1')], seen)
    }
    const later = (e: SpEvent) => e.tick > T
    expect(bonksOf(seen).filter(later)).toEqual([])
    idle(s, T + 168, seen)
    tick(s, [swing('p1')], seen)
    expect(bonksOf(seen).filter(later)).toEqual([
      expect.objectContaining({ who: 'p0', by: 'p1', tick: T + 168 }),
    ])
  })

  it('a contact already made still resolves', () => {
    const s = duel()
    rally(s, { x: 0, y: 1.2, z: -0.6 }, { x: 0, y: 0, z: 0 }, 1)
    const [a, b] = s.players
    a.x = 0
    a.z = -0.35
    b.x = 0
    b.z = 0.35
    const T = s.tick + 1
    s.shuttle.pending = {
      atTick: T + 3,
      id: 'p0',
      side: 0,
      kind: 'clear',
      grade: 'good',
      aimX: 0,
      charge: 0,
      fromTick: T + 3,
    }
    const seen = run(s, 1, () => [swing('p1')])
    expect(bonksOf(seen)).toEqual([expect.objectContaining({ who: 'p0', by: 'p1' })])
    run(s, 3, () => [], seen)
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, tick: T + 3 })
  })

  it('a held charge is dropped: its button-up after the stun does not swing', () => {
    const s = face()
    const a = s.players[0]
    tick(s, [ev('p0', { t: 'charge' })])
    expect(a.chargeAt).toBe(s.tick)
    tick(s, [swing('p1')])
    const T = s.tick
    expect(a.chargeAt).toBe(TAPPED)
    expect(a.pressAt).toBe(-1)
    const swingAt = a.swingAt
    const seen = idle(s, T + 50)
    tick(s, [swing('p0')], seen)
    expect(seen.some((e) => (e.k === 'hit' || e.k === 'whiff') && e.side === 0)).toBe(false)
    expect(a.swingAt).toBe(swingAt)
    expect(a.chargeAt).toBe(-1)
  })

  it('same-tick swings: mutual bonk stuns both, two swingers stun a victim once', () => {
    const s = face()
    const seen = tick(s, [swing('p0'), swing('p1')])
    const T = s.tick
    expect(bonksOf(seen)).toEqual([
      expect.objectContaining({ who: 'p1', by: 'p0' }),
      expect.objectContaining({ who: 'p0', by: 'p1' }),
    ])
    expect(s.players.map((p) => p.stunAt)).toEqual([T, T])

    // Three bodies (friendly fire, matched by id): p1 and p2 both reach p0 and each other.
    const t3 = face()
    const p2: SpPlayer = { ...t3.players[1], id: 'p2', name: 'P2', x: 0.3, move: { x: 0, z: 0 } }
    t3.players[1].x = -0.3
    ;(t3.players as SpPlayer[]).push(p2)
    const three = tick(t3, [swing('p1'), swing('p2')])
    expect(bonksOf(three).map((e) => e.k === 'bonk' && [e.who, e.by])).toEqual([
      ['p0', 'p1'],
      ['p2', 'p1'],
      ['p1', 'p2'],
    ])

    // A bonk and a hit on the same tick: the hit still happens.
    const h = duel()
    rally(h, { x: 0, y: 1.0, z: -0.6 }, { x: 0, y: 0, z: 0 }, 1)
    h.players[0].x = 0
    h.players[0].z = -0.35
    h.players[1].x = 0
    h.players[1].z = 0.35
    const hs = run(h, 1, () => [swing('p0'), swing('p1')])
    expect(hs.some((e) => e.k === 'hit' && e.side === 0)).toBe(true)
    expect(bonksOf(hs)).toHaveLength(2)
  })

  it('a stunned jump keeps its arc and cooldown but cannot move', () => {
    const LOB = { pos: { x: 0, y: 4.2, z: -2.6 }, vel: { x: 0, y: -1, z: -5 }, at: { x: 0, z: -4 }, idx: 19 }
    const s = duel()
    const [a, b] = s.players
    a.x = LOB.at.x
    a.z = LOB.at.z
    rally(s, LOB.pos, LOB.vel, 1)
    const press = s.tick + 1 + LOB.idx - ABILITY.jump.lead
    run(s, press - 1 - s.tick)
    run(s, 1, () => [ev('p0', { t: 'move', x: 1, z: 0 }), ability('p0', 0, 1)])
    const act = { ...a.act! }
    expect(act).toMatchObject({ k: 'jump', at: press })
    // Mid-air, at the net (teleported) and bonked by p1.
    a.x = 0
    a.z = -0.35
    a.vx = a.vz = 0
    b.x = 0
    b.z = 0.35
    run(s, 4, () => (pin(s), []))
    const seen = run(s, 1, () => (pin(s), [swing('p1')]))
    expect(s.tick).toBe(press + 5)
    expect(bonksOf(seen)).toEqual([expect.objectContaining({ who: 'p0', by: 'p1' })])
    const at = { x: a.x, z: a.z }
    while (s.tick < press + 30) {
      tick(s)
      expect(a.act).toEqual(act)
      expect({ x: a.x, z: a.z }).toEqual(at)
    }
    // Locked until the stun is over and the cooldown is ready (the cooldown runs on).
    idle(s, press + 5 + STUN.ticks + 1)
    expect(canAct(s, a)).toBe(false)
    while (!actReady(a.act, s.tick)) {
      expect(canAct(s, a)).toBe(false)
      tick(s)
    }
    expect(canAct(s, a)).toBe(true)
    expect(a.act).toEqual(act)
  })

  it('a lagged swing bonks from now: the victim who already walked away is safe', () => {
    const s = face()
    idle(s, s.tick + 10)
    const near = tick(s, [ev('p1', { t: 'swing', x: 0, z: 0, tick: s.tick + 1 - 5 })])
    expect(bonksOf(near)).toEqual([expect.objectContaining({ who: 'p0', by: 'p1' })])

    const gone = face()
    idle(gone, gone.tick + 10) // in reach for the last ticks (history has it there) …
    gone.players[0].x = 1.5 // … now out of reach
    const g = tick(gone, [ev('p1', { t: 'swing', x: 0, z: 0, tick: gone.tick + 1 - 5 })])
    expect(bonksOf(g)).toEqual([])
    expect(gone.players[0].stunAt).toBe(-1)
  })

  it('resetForServe clears stunAt; netView carries it', () => {
    const s = face()
    tick(s, [swing('p1')])
    const v = game.netView!(s) as SpState
    expect(v.players.map((p) => p.stunAt)).toEqual(s.players.map((p) => p.stunAt))
    expect(v.players[0].stunAt).toBe(s.tick)
    // Let the shuttle fall: point, then the next serve.
    let guard = 0
    while (s.phase !== 'serve' && guard++ < 2000) game.tick(s, [])
    expect(s.phase).toBe('serve')
    expect(s.players.map((p) => p.stunAt)).toEqual([-1, -1])
  })

  it('a computer swing bonks like any swing', () => {
    const s = game.setup(players(1), 5, { solo: 'normal' })
    rally(s, HIGH, { x: 0, y: 0, z: 0 }, 0)
    const [h, ai] = s.players
    h.x = 0
    h.z = -0.35
    ai.x = 0
    ai.z = 0.35
    const seen = tick(s, [ev(AI_ID, { t: 'swing', x: 0, z: 0 })])
    expect(bonksOf(seen)).toEqual([expect.objectContaining({ who: 'p0', by: AI_ID })])
  })
})

describe('doubles', () => {
  const infos = (...seats: number[]): PlayerInfo[] =>
    seats.map((seat) => ({ id: `p${seat}`, name: `P${seat}`, slot: seat, ready: true, connected: true }))
  /** Humans at `seats` (2v2), side 0 serving with its slot-0 player (searches seeds). */
  function doubles(...seats: number[]): SpState {
    for (let seed = 1; ; seed++) {
      const s = game.setup(infos(...seats), seed, { mode: '2v2' })
      if (s.server === 0) return s
    }
  }
  const byId = (s: SpState, id: string) => s.players.find((p) => p.id === id)!
  /** Bots play on until a point is scored (rallies can be long; ≤ 6000 ticks). */
  const scoreSoon = (s: SpState) => {
    for (let i = 0; i < 6000 && s.score[0] + s.score[1] === 0; i++) game.tick(s, [])
    return s.score[0] + s.score[1] > 0
  }
  const near = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 9)
    expect(a.z).toBeCloseTo(b.z, 9)
  }
  /** Every seat's serve stance: server in its box, receiver diagonal, partners split to the other half. */
  function expectStances(s: SpState) {
    const { shortLine, halfWidth } = s.court
    const { xSign } = serveBox(s.server, s.score[s.server])
    const rcvSide = s.server === 0 ? 1 : 0
    const srv = serverPlayer(s)
    const rcv = s.players.find((p) => p.side === rcvSide && p.slot === s.serveSlot[rcvSide])!
    for (const p of s.players) {
      const want =
        p === srv
          ? toWorld(p.side, xSign * SERVE_X, -(shortLine + SERVE_BACK))
          : p === rcv
            ? toWorld(p.side, xSign * RECEIVE_X, -(shortLine + RECEIVE_BACK))
            : toWorld(p.side, -xSign * (halfWidth / 2), -readyDepth(s.court))
      near(p, want)
    }
  }
  /** `side` wins the rally: the shuttle drops into the other side's back corner; runs to the next serve set-up. */
  function winPoint(s: SpState, side: 0 | 1) {
    const spot = toWorld(side === 0 ? 1 : 0, s.court.halfWidth - 0.3, -(s.court.halfLen - 0.3))
    rally(s, { x: spot.x, y: 0.05, z: spot.z }, { x: 0, y: -3, z: 0 }, side)
    const seen = run(s, 1)
    expect(seen.filter((e) => e.k === 'point')).toEqual([expect.objectContaining({ side })])
    let guard = 0
    while (s.phase !== 'serve' && guard++ < 1000) game.tick(s, [])
    expect(s.phase).toBe('serve')
  }

  it('1v1 is the default; maxPlayers 4; seating opens 4 seats in 2 teams only in 2v2', () => {
    expect(game.setup(players(2), 1, {}).players).toHaveLength(2)
    expect(game.maxPlayers).toBe(4)
    expect(game.seating!({})).toEqual({ seats: 2, teams: 1, botFill: false })
    expect(game.seating!({ mode: '2v2' })).toEqual({ seats: 4, teams: 2, botFill: true })
    const solo = game.options!.find((o) => o.id === 'solo')!
    expect(solo.shownWhen!(1, {})).toBe(true)
    expect(solo.shownWhen!(2, {})).toBe(false)
    expect(solo.shownWhen!(3, { mode: '2v2' })).toBe(true)
    expect(solo.shownWhen!(4, { mode: '2v2' })).toBe(false)
  })
  it('the mode option defaults to 1v1', () => {
    expect(game.options![0].id).toBe('mode')
    expect(game.options![0].choices.map((c) => c.value)).toEqual(['1v1', '2v2'])
    expect(resolveOptions(game.options)).toMatchObject({ mode: '1v1', solo: 'normal', court: 'normal' })
    expect(resolveOptions(game.options, { mode: '2v2' }).mode).toBe('2v2')
    expect(resolveOptions(game.options, { mode: '3v3' }).mode).toBe('1v1')
  })
  it('seating opens 4 seats in 2v2', () => {
    expect(game.seating!(resolveOptions(game.options)).seats).toBe(2)
    expect(game.seating!(resolveOptions(game.options, { mode: '2v2' }))).toEqual({
      seats: 4,
      teams: 2,
      botFill: true,
    })
  })
  it('2v2 alone: 1 human + 3 computers, seats A,B,A,B', () => {
    const s = game.setup(players(1), 7, { mode: '2v2', solo: 'hard' })
    expect(s.players.map((p) => p.side)).toEqual([0, 1, 0, 1])
    expect(s.players.map((p) => p.slot)).toEqual([0, 0, 1, 1])
    expect(s.players.map((p) => p.id)).toEqual(['p0', `${AI_ID}1`, `${AI_ID}2`, `${AI_ID}3`])
    expect(s.players.map((p) => p.kind)).toEqual(['human', 'ai', 'ai', 'ai'])
    expect(s.players.slice(1).every((p) => p.level === 'hard' && p.bot)).toBe(true)
    expect(s.aiLevel).toBe('hard')
    expect(s.court.halfWidth).toBe(3.05)
    expect(game.setup(players(1), 7, { mode: '2v2', court: 'large' }).court.halfWidth).toBeCloseTo(
      3.05 * (courtDims('large').halfWidth / COURT.halfWidth),
      9,
    )
    expect(s.server).toBe(0)
    expect(serverPlayer(s).id).toBe('p0')
    expectStances(s)
  })
  it('2v2 alone in a seat on team B: that team serves, the human first', () => {
    const s = game.setup(infos(3), 7, { mode: '2v2' })
    expect(s.players.map((p) => p.id)).toEqual([`${AI_ID}0`, `${AI_ID}1`, `${AI_ID}2`, 'p3'])
    expect(s.server).toBe(1)
    expect(s.serveSlot).toEqual([0, 1])
    expect(serverPlayer(s).id).toBe('p3')
  })
  it('1v1 keeps one player per side, slot 0, serveSlot [0, 0]', () => {
    const s = game.setup(players(1), 7, {})
    expect(s.players.map((p) => p.slot)).toEqual([0, 0])
    expect(s.serveSlot).toEqual([0, 0])
    expect(s.court.halfWidth).toBe(COURT.halfWidth)
  })
  it('2v2 seats follow room seats', () => {
    const mates = game.setup(infos(0, 2), 3, { mode: '2v2' })
    expect(byId(mates, 'p0').side).toBe(0)
    expect(byId(mates, 'p2').side).toBe(0)
    expect(mates.players.map((p) => p.kind)).toEqual(['human', 'ai', 'human', 'ai'])
    const rivals = game.setup(infos(0, 1), 3, { mode: '2v2' })
    expect(byId(rivals, 'p0').side).toBe(0)
    expect(byId(rivals, 'p1').side).toBe(1)
  })
  it('computer looks are all different and avoid humans', () => {
    for (const preset of AVAILABLE_IDS) {
      const s = game.setup(players(1), 7, { mode: '2v2' })
      seedPreset(s, 'p0', preset)
      const looks = s.players.map((p) => p.preset)
      expect(new Set(looks).size).toBe(4)
      expect(looks.every(isAvailable)).toBe(true)
    }
    const fresh = game.setup(players(1), 7, { mode: '2v2' }).players.map((p) => p.preset)
    expect(new Set(fresh).size).toBe(4)
  })
  it('serve rotation: A0 → (B wins) B0 → (A wins) A1; boxes follow the score; receiver and partners', () => {
    const s = game.setup(players(1), 7, { mode: '2v2' })
    expect(serverPlayer(s).id).toBe('p0')
    winPoint(s, 1)
    expect(s.score).toEqual([0, 1])
    expect(s.server).toBe(1)
    expect(serverPlayer(s).id).toBe(`${AI_ID}1`)
    expect(s.serveSlot).toEqual([1, 0])
    expectStances(s)
    // B serves from its left box (odd score): view x < 0.
    expect(toWorld(1, serverPlayer(s).x, 0).x).toBeLessThan(0)
    winPoint(s, 0)
    expect(s.score).toEqual([1, 1])
    expect(serverPlayer(s).id).toBe(`${AI_ID}2`)
    expect(s.serveSlot).toEqual([1, 1])
    expectStances(s)
    winPoint(s, 0) // the serving team wins: same server, other box
    expect(serverPlayer(s).id).toBe(`${AI_ID}2`)
    expect(s.serveSlot).toEqual([1, 1])
    expectStances(s)
  })
  it('only the server may charge / serve in the serve phase', () => {
    const s = doubles(0, 2)
    expect(serverPlayer(s).id).toBe('p0')
    const mate = byId(s, 'p2')
    expect(canCharge(s, mate)).toBe(false)
    expect(canCharge(s, byId(s, 'p0'))).toBe(true)
    const seen = run(s, 1, () => [ev('p2', { t: 'charge' })])
    expect(mate.chargeAt).toBe(-1)
    seen.push(...run(s, 1, () => [swing('p2')]))
    expect(s.phase).toBe('serve')
    expect(seen.some((e) => 'by' in e && e.by === 'p2')).toBe(false)
    expect(seen.some((e) => e.k === 'serve')).toBe(false)
    run(s, 1, () => [swing('p0')])
    expect(s.phase).toBe('rally')
    expect(s.events.find((e) => e.k === 'serve')).toMatchObject({ side: 0, by: 'p0' })
  })
  it("a teammate's pending hit fires for the swinger, not the side's first player", () => {
    const s = doubles(0, 2)
    const [a, , b] = [byId(s, 'p0'), null, byId(s, 'p2')]
    a.x = 2.5
    a.z = -6
    b.x = 0
    b.z = -3
    rally(s, { x: 0, y: 1.6, z: -1.6 }, { x: 0, y: 1.5, z: -3 }, 1)
    game.tick(s, [swing('p2')])
    const pend = s.shuttle.pending
    expect(pend).toMatchObject({ id: 'p2', side: 0 })
    expect(pend!.atTick).toBeGreaterThan(s.tick)
    const seen = run(s, 30, () => [ev('p0', { t: 'move', x: 0, z: 0 })])
    expect(seen.filter((e) => e.k === 'hit')).toEqual([expect.objectContaining({ side: 0, by: 'p2' })])
    expect(seen.some((e) => e.k === 'whiff')).toBe(false)
  })
  it('a rewound swing in 2v2 reads its own history spot', () => {
    const s = doubles(0, 2)
    rally(s, { x: 0, y: 3, z: -3 }, { x: 0, y: 2, z: 0 }, 1)
    run(s, 10, () => [ev('p2', { t: 'move', x: 1, z: 0 }), ev('p0', { t: 'move', x: -1, z: 0 })])
    const p2 = byId(s, 'p2')
    expect(s.history.at(-1)!.who).toHaveLength(4)
    expect(s.history.at(-1)!.who[2]).toEqual({ x: p2.x, z: p2.z })
    const rewind = 3
    const cands = contactCandidates(s, p2, rewind)
    for (let i = 0; i + rewind < s.history.length; i++)
      expect({ x: cands[i].at.x, z: cands[i].at.z }).toEqual(s.history[i + rewind].who[2])
    expect(cands[0].at).not.toEqual(s.history[rewind].who[0])
  })
  it("teammates can't both hit: the second same-tick swing whiffs", () => {
    const s = doubles(0, 2)
    const a = byId(s, 'p0')
    const b = byId(s, 'p2')
    a.x = 0.3
    a.z = -3
    b.x = -0.3
    b.z = -3
    rally(s, { x: 0, y: 1.6, z: -1.6 }, { x: 0, y: 1.5, z: -3 }, 1)
    game.tick(s, [swing('p0'), swing('p2')])
    const now = s.events.filter((e) => e.tick === s.tick)
    expect(now.filter((e) => e.k === 'whiff')).toEqual([expect.objectContaining({ side: 0, by: 'p2' })])
    const seen = run(s, 30)
    expect([...now, ...seen].filter((e) => e.k === 'hit')).toEqual([expect.objectContaining({ by: 'p0' })])
  })
  it('a human leaving 2v2 becomes a computer; the match goes on', () => {
    const s = doubles(0, 2)
    s.aiLevel = 'easy'
    run(s, 2, () => [ev('p2', { t: 'move', x: 1, z: 0 })])
    const seat = byId(s, 'p2')
    seat.chargeAt = s.tick
    seat.pressAt = s.tick
    game.removePlayer!(s, 'p2')
    expect(s.phase).not.toBe('over')
    expect(s.winner).toBe(-1)
    expect(s.players).toHaveLength(4)
    expect(s.players[2]).toMatchObject({ id: `${AI_ID}2`, kind: 'ai', level: 'easy', side: 0, slot: 1 })
    expect(s.players[2].bot).toBeDefined()
    expect(s.players[2].chargeAt).toBe(-1)
    expect(s.players[2].pressAt).toBe(-1)
    // The leaver's id no longer drives the seat; the computer plays it.
    const x = s.players[2].x
    run(s, 30, () => [ev('p2', { t: 'move', x: -1, z: 0 })])
    expect(s.players[2].move).not.toEqual({ x: -1, z: 0 })
    expect(s.players[2].x).not.toBe(x)
    expect(game.isFinished(s)).toBe(false)
    expect(scoreSoon(s)).toBe(true)
  })
  it("the computer taking a leaver's seat doesn't wear a remaining human's look", () => {
    const s = doubles(0, 2)
    byId(s, 'p0').preset = byId(s, 'p2').preset // two humans may match
    game.removePlayer!(s, 'p2')
    const looks = s.players.map((p) => p.preset)
    expect(looks[2]).not.toBe(byId(s, 'p0').preset)
    expect(new Set(looks).size).toBe(4)
  })
  it('a human seat in its grace window is driven by the computer; on return the human resumes', () => {
    const s = doubles(0, 2)
    s.aiLevel = 'easy'
    const seat = byId(s, 'p2')
    // Connected: no bot input for a human seat, only its own input moves it.
    run(s, 20)
    expect(seat.bot).toBeUndefined()
    game.setConnected!(s, 'p2', false)
    expect(seat.away).toBe(true)
    expect(seat.kind).toBe('human')
    run(s, 60)
    expect(seat.bot).toBeDefined() // botInputs stepped it
    game.setConnected!(s, 'p2', true)
    expect(seat.away).toBeUndefined()
    expect(seat.move).toEqual({ x: 0, z: 0 })
    delete seat.bot
    run(s, 60)
    expect(seat.bot).toBeUndefined() // no bot step runs for it any more
    expect(seat.id).toBe('p2')
  })
  it('setConnected is a no-op in 1v1 and for the computer seats', () => {
    const s = duel()
    game.setConnected!(s, 'p1', false)
    expect(s.players.some((p) => p.away)).toBe(false)
    const d = doubles(0)
    game.setConnected!(d, `${AI_ID}1`, false)
    expect(d.players.some((p) => p.away)).toBe(false)
  })
  it("a computer taking a seat keeps the other computers' looks", () => {
    const s = doubles(0, 2)
    s.players[3].preset = byId(s, 'p0').preset // an old clash the takeover must not touch
    const keep = [s.players[1].preset, s.players[3].preset]
    game.removePlayer!(s, 'p2')
    expect([s.players[1].preset, s.players[3].preset]).toEqual(keep)
  })
  it('a human leaving 1v1 still ends it (other side wins)', () => {
    const s = duel()
    game.removePlayer!(s, 'p1')
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
  })
  it('setupDoubles runs 1500 ticks without throwing and scores', () => {
    const s = setupDoubles(['normal', 'normal', 'normal', 'normal'], 11)
    expect(s.players.map((p) => p.id)).toEqual([0, 1, 2, 3].map((i) => `${AI_ID}${i}`))
    expect(s.players.every((p) => p.kind === 'ai' && p.level === 'normal')).toBe(true)
    // 1500 ticks (25 s): since the bots stopped letting low shots drop (ai.ts safeOffset), first rallies run longer.
    const seen = run(s, 1500)
    const shots = seen.filter((e) => e.k === 'hit' || e.k === 'serve')
    expect(shots.length).toBeGreaterThan(2)
    expect(shots.every((e) => 'by' in e && !!e.by)).toBe(true)
    // Each seat plans from its own spot: both teammates of a side get to hit, and points come quickly.
    const hitters = new Set(seen.filter((e) => e.k === 'hit').map((e) => ('by' in e ? e.by : '')))
    expect(hitters.size).toBeGreaterThanOrEqual(3)
    expect(s.score[0] + s.score[1]).toBeGreaterThan(0)
  })
})
