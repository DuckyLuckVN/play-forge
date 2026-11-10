import { describe, expect, it } from 'vitest'
import { botStep, LEVELS, NEAR_LINE, newBotMemory, type BotLevel } from './ai'
import type { InputEvent } from '@forge/net/session'
import { COURT } from './physics'
import {
  setupBots,
  shuttlePopGame as game,
  TICK_RATE,
  type Level,
  type SpEvent,
  type SpInput,
  type SpState,
} from './sim'

/** 9 minutes of sim time. */
const MATCH_CAP = 9 * 60 * TICK_RATE
/** Hard v hard: 10 minutes. */
const HARD_CAP = 10 * 60 * TICK_RATE

interface MatchStats {
  winner: -1 | 0 | 1
  ticks: number
  points: number
  points0: number
  hits: number
  serveTick: number[]
  /** Swings per side: hit grades + whiffs. */
  swings: [Record<string, number>, Record<string, number>]
}

/** Bot vs bot to the end (or MATCH_CAP). Events are read once each by id. */
function play(a: Level, b: Level, seed: number, cap = MATCH_CAP): MatchStats {
  const s: SpState = setupBots(a, b, seed)
  const st: MatchStats = {
    winner: -1,
    ticks: 0,
    points: 0,
    points0: 0,
    hits: 0,
    serveTick: [],
    swings: [{}, {}],
  }
  let lastId = 0
  const count = (e: SpEvent) => {
    if (e.k === 'hit') {
      st.hits++
      st.swings[e.side][e.grade] = (st.swings[e.side][e.grade] ?? 0) + 1
    } else if (e.k === 'whiff') st.swings[e.side].whiff = (st.swings[e.side].whiff ?? 0) + 1
    else if (e.k === 'point') {
      st.points++
      if (e.side === 0) st.points0++
    }
  }
  while (s.phase !== 'over' && s.tick < cap) {
    const serving = s.phase === 'serve'
    const phaseT = s.phaseT
    game.tick(s, [])
    if (serving && s.phase === 'rally') st.serveTick.push(phaseT + 1)
    for (const e of s.events) if (e.id > lastId) count(e)
    lastId = s.nextEventId - 1
  }
  st.winner = s.winner
  st.ticks = s.tick
  return st
}

const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i)

/** Bot-vs-bot runs take ~5 s each unloaded; generous timeout so a busy machine does not flake. */
const SLOW = 60_000

describe('computer opponent', () => {
  it('every level can miss (never perfect)', () => {
    for (const l of Object.values(LEVELS)) {
      expect(l.grade.whiff).toBeGreaterThan(0)
      expect(l.grade.perfect).toBeLessThan(1)
    }
  })

  it(
    'bot memory stays JSON (state round-trips mid-match)',
    () => {
      const s = setupBots('normal', 'normal', 3)
      for (let i = 0; i < 400; i++) game.tick(s, [])
      expect(s.players[0].bot).toBeDefined()
      expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    },
    SLOW,
  )

  it(
    'serves within ~1 s (well before the serve timeout)',
    () => {
      const m = play('normal', 'easy', 7)
      expect(m.serveTick.length).toBeGreaterThan(5)
      for (const t of m.serveTick) expect(t).toBeLessThanOrEqual(TICK_RATE)
    },
    SLOW,
  )

  it(
    'hard v hard: never perfect-only, ends within 10 min, both ends even',
    () => {
      const tally: Record<string, number> = {}
      let total = 0
      let wins0 = 0
      let points = 0
      let points0 = 0
      // Mirror-exact sim (mirror.test.ts): a side gap is sampling noise. Win rates swing ~±5.6% (1σ) at
      // 80 matches (other seed ranges: 42–50%), so the win band is wider than the point-share band.
      const n = 80
      for (const seed of seeds(n, 300)) {
        const m = play('hard', 'hard', seed, HARD_CAP)
        expect(m.winner, `seed ${seed} ended within 10 min`).not.toBe(-1)
        if (m.winner === 0) wins0++
        points += m.points
        points0 += m.points0
        for (const sw of m.swings)
          for (const [k, c] of Object.entries(sw)) {
            tally[k] = (tally[k] ?? 0) + c
            total += c
          }
      }
      if (process.env.BALANCE_LOG)
        console.warn(JSON.stringify({ wins0: wins0 / n, share0: points0 / points }))
      expect(total).toBeGreaterThanOrEqual(500)
      expect((total - (tally.perfect ?? 0)) / total).toBeGreaterThanOrEqual(0.03)
      expect(wins0 / n).toBeGreaterThanOrEqual(0.35)
      expect(wins0 / n).toBeLessThanOrEqual(0.65)
      expect(points0 / points).toBeGreaterThanOrEqual(0.45)
      expect(points0 / points).toBeLessThanOrEqual(0.55)
    },
    SLOW,
  )

  it(
    'rallies are sane and normal vs normal is even',
    () => {
      let hits = 0
      let points = 0
      let wins0 = 0
      const n = 40
      for (const seed of seeds(n, 100)) {
        const m = play('normal', 'normal', seed)
        expect(m.winner, `seed ${seed} ended`).not.toBe(-1)
        expect(m.ticks).toBeLessThanOrEqual(MATCH_CAP)
        hits += m.hits
        points += m.points
        if (m.winner === 0) wins0++
      }
      const mean = hits / points
      expect(mean).toBeGreaterThanOrEqual(4)
      expect(mean).toBeLessThanOrEqual(10)
      expect(wins0 / n).toBeGreaterThanOrEqual(0.35)
      expect(wins0 / n).toBeLessThanOrEqual(0.65)
    },
    SLOW,
  )

  it(
    'levels rank: hard beats easy',
    () => {
      let hardWins = 0
      const n = 30
      for (const seed of seeds(n, 200)) {
        // alternate seats so side doesn't matter
        const hardSide = seed % 2 === 0 ? 0 : 1
        const m = seed % 2 === 0 ? play('hard', 'easy', seed) : play('easy', 'hard', seed)
        if (m.winner === hardSide) hardWins++
      }
      expect(hardWins / n).toBeGreaterThanOrEqual(0.8)
    },
    SLOW,
  )
})

/** Bot on side 1 facing a shuttle at (x, y, z) with velocity `vel` (side 0 just hit it). */
function incoming(x: number, z: number, y = 3, vel = { x: 0, y: 0, z: 0 }): SpState {
  const s = setupBots('normal', 'normal', 1)
  s.phase = 'rally'
  s.phaseT = 0
  for (const p of s.players) p.kind = 'human' // the test drives side 1 by hand
  s.players[1].x = 0
  s.players[1].z = 3.2
  s.shuttle.pos = { x, y, z }
  s.shuttle.vel = { ...vel }
  s.shuttle.lastHitter = 0
  s.shuttle.pending = null
  s.events = [{ id: s.nextEventId++, tick: s.tick, k: 'hit', side: 0, grade: 'good', shot: 'clear' }]
  s.tick += 30 // past every level's reactTicks
  return s
}

/** botStep once (plans); returns whether it plans to swing. */
function plansSwing(level: BotLevel, x: number, z: number, r: number): boolean {
  const s = incoming(x, z)
  const mem = newBotMemory(1, 1)
  botStep(s, 1, level, mem, () => r)
  return mem.plannedSwingTick >= 0
}

describe('line calls', () => {
  const inX = COURT.halfWidth - NEAR_LINE / 2
  const outX = COURT.halfWidth + NEAR_LINE / 2
  it('normal/hard call near-line shots right', () => {
    for (const level of ['normal', 'hard'] as const) {
      expect(plansSwing(level, inX, 3.5, 0)).toBe(true)
      expect(plansSwing(level, outX, 3.5, 0)).toBe(false)
    }
  })
  it('easy can misjudge near-line shots (leaves an in-shot, plays an out-shot)', () => {
    expect(LEVELS.easy.misjudge).toBeGreaterThan(0)
    // rng 0 → misjudge roll hits; rng 0.99 → it calls right
    expect(plansSwing('easy', inX, 3.5, 0)).toBe(false)
    expect(plansSwing('easy', outX, 3.5, 0)).toBe(true)
    expect(plansSwing('easy', inX, 3.5, 0.99)).toBe(true)
    expect(plansSwing('easy', outX, 3.5, 0.99)).toBe(false)
  })
  it('easy calls clear shots right (no misjudge away from lines)', () => {
    expect(plansSwing('easy', 0.5, 3.5, 0)).toBe(true)
    expect(plansSwing('easy', COURT.halfWidth + 0.6, 3.5, 0)).toBe(false)
  })
})

describe('rolled whiff', () => {
  it("a rolled whiff swings and emits 'whiff', never a hit", () => {
    // a deep clear still travelling back: past the contact the shuttle moves away (contact is the closest point)
    const s = incoming(0.5, 1.5, 4, { x: 0, y: 2, z: 3 })
    const mem = newBotMemory(1, 1)
    // rng 0.999: grade roll → whiff (last bucket), no smash attempt
    const seen: SpEvent[] = []
    let lastId = s.nextEventId - 1
    while (s.phase === 'rally') {
      const inputs: InputEvent<SpInput>[] = botStep(s, 1, 'normal', mem, () => 0.999).map((input) => ({
        player: s.players[1].id,
        input,
      }))
      game.tick(s, inputs)
      for (const e of s.events) if (e.id > lastId) seen.push(e)
      lastId = s.nextEventId - 1
    }
    expect(seen.some((e) => e.k === 'whiff' && e.side === 1)).toBe(true)
    expect(seen.some((e) => e.k === 'hit' && e.side === 1)).toBe(false)
  })
})

describe('bot hold-to-charge', () => {
  it('levels charge more the harder they are; never a sure thing', () => {
    expect(LEVELS.easy.charge).toBeLessThan(LEVELS.normal.charge)
    expect(LEVELS.normal.charge).toBeLessThan(LEVELS.hard.charge)
    expect(LEVELS.hard.charge).toBeLessThan(1)
  })

  it('presses charge before its planned swing and releases on the planned tick (charged hit)', () => {
    // A high, slow lob: plenty of time to set up and charge.
    const s = incoming(0.3, 1.5, 4, { x: 0, y: 3, z: 3 })
    const mem = newBotMemory(1, 1)
    const inputs: SpInput[] = []
    const seen: SpEvent[] = []
    let lastId = s.nextEventId - 1
    // rng 0.01: perfect, smash try, charge yes (shortest hold, CHARGE.full − 6 ticks)
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1) {
      const out = botStep(s, 1, 'hard', mem, () => 0.01)
      inputs.push(...out.filter((i) => i.t !== 'move'))
      game.tick(
        s,
        out.map((input) => ({ player: s.players[1].id, input })),
      )
      for (const e of s.events) if (e.id > lastId) seen.push(e)
      lastId = s.nextEventId - 1
    }
    const kinds = inputs.map((i) => i.t)
    expect(kinds.indexOf('charge')).toBeGreaterThanOrEqual(0)
    expect(kinds.indexOf('charge')).toBeLessThan(kinds.indexOf('swing'))
    const hit = seen.find((e) => e.k === 'hit' && e.side === 1) as { charge?: number } | undefined
    expect(hit?.charge ?? 0).toBeGreaterThan(0)
  })

  it('rng that rolls no charge: a plain tap swing (no charge input)', () => {
    const s = incoming(0.3, 1.5, 4, { x: 0, y: 3, z: 3 })
    const mem = newBotMemory(1, 1)
    const kinds: string[] = []
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1) {
      const out = botStep(s, 1, 'easy', mem, () => 0.6)
      for (const i of out) if (i.t !== 'move') kinds.push(i.t)
      game.tick(
        s,
        out.map((input) => ({ player: s.players[1].id, input })),
      )
    }
    expect(kinds).not.toContain('charge')
  })
})
