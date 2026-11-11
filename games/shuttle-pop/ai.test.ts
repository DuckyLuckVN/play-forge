import { describe, expect, it } from 'vitest'
import { random } from '@forge/core/rng'
import {
  BOT_SERVE_TICKS,
  botStep,
  coverDepth,
  LEVELS,
  NEAR_LINE,
  newBotMemory,
  readyDepth,
  type BotLevel,
  type BotMemory,
} from './ai'
import type { InputEvent } from '@forge/net/session'
import { COURT } from './physics'
import { COURT_SIZES, courtDims } from './courtsize'
import { toWorld } from './court'
import { STUN } from './stun'
import {
  canAct,
  createState,
  serverPlayer,
  setupBots,
  setupDoubles,
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
      // Mirror-exact sim (mirror.test.ts): a side gap is sampling noise; 80 matches keep it ~±5.6% (1σ).
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
      expect(wins0 / n).toBeGreaterThanOrEqual(0.4)
      expect(wins0 / n).toBeLessThanOrEqual(0.6)
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
      // Mirror-exact: a side gap is sampling noise (n as in hard v hard).
      const n = 80
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

describe('bigger courts', () => {
  it('ready spot scales with the court', () => {
    expect(readyDepth(COURT)).toBe(3.2)
    const xl = courtDims('xl')
    expect(readyDepth(xl)).toBeCloseTo(3.2 * 1.3)
    const s = setupBots('normal', 'normal', 3, 'xl')
    const home = { x: 0, z: readyDepth(xl) }
    // Find side 1's first hit, then watch its move input while its own shot is in the air.
    let lastId = s.nextEventId - 1
    let hitAt = -1
    while (hitAt < 0 && s.phase !== 'over' && s.tick < MATCH_CAP) {
      game.tick(s, [])
      for (const e of s.events) if (e.id > lastId && e.k === 'hit' && e.side === 1) hitAt = e.tick
      lastId = s.nextEventId - 1
    }
    expect(hitAt).toBeGreaterThanOrEqual(0)
    let checked = 0
    for (let i = 0; i < 20 && s.phase === 'rally' && s.shuttle.lastHitter === 1; i++) {
      const me = s.players[1]
      const mem = structuredClone(me.bot!)
      const [move] = botStep(s, 1, 'normal', mem, () => 0.5)
      const v = toWorld(1, move.t === 'move' ? move.x : 0, move.t === 'move' ? move.z : 0)
      const to = { x: home.x - me.x, z: home.z - me.z }
      const d = Math.hypot(to.x, to.z)
      if (d > 0.1) {
        // Heads straight for the XL ready spot (not Normal's 3.2 m).
        expect((v.x * to.x + v.z * to.z) / (Math.hypot(v.x, v.z) * d)).toBeGreaterThan(0.999)
        checked++
      }
      game.tick(s, [])
    }
    expect(checked).toBeGreaterThanOrEqual(5)
  })

  it(
    'bot v bot matches finish with real rallies at every size',
    () => {
      for (const size of COURT_SIZES) {
        const s = setupBots('hard', 'hard', 11, size)
        while (s.phase !== 'over' && s.tick < 20 * 60 * TICK_RATE) game.tick(s, [])
        expect(s.phase, size).toBe('over')
        expect(s.stats.longest, size).toBeGreaterThanOrEqual(4)
      }
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
    // rng 0.01: perfect, smash try, charge yes (shortest hold, CHARGE.full − 6 ticks); no ability roll.
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1) {
      const out = botStep(
        s,
        1,
        'hard',
        mem,
        () => 0.01,
        () => 0.99,
      )
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

interface AbilityStats {
  /** Jump / lunge presses that took effect (act events other than a hop). */
  strikes: number
  /** Shots (serves + hits): each is an incoming shot for the other seat. */
  shots: number
  /** Ability inputs a bot sent while sim.ts canAct said no. */
  blocked: number
}

/**
 * Bot v bot at `level` to the end, with the test driving botStep for both seats (the sim's bot loop is
 * switched off by clearing `level`; same per-seat rng streams as sim.ts botInputs).
 */
function playAbility(level: BotLevel, seed: number): AbilityStats {
  const s = setupBots(level, level, seed)
  for (const p of s.players) p.level = undefined
  const st: AbilityStats = { strikes: 0, shots: 0, blocked: 0 }
  let lastId = s.nextEventId - 1
  while (s.phase !== 'over' && s.tick < MATCH_CAP) {
    const inputs: InputEvent<SpInput>[] = []
    for (const p of s.players) {
      const mem = p.bot!
      const rng = () => {
        const r = { seed: mem.rng }
        const v = random(r)
        mem.rng = r.seed
        return v
      }
      for (const input of botStep(s, p.side, level, mem, rng)) {
        if (input.t === 'ability' && !canAct(s, p)) st.blocked++
        inputs.push({ player: p.id, input })
      }
    }
    game.tick(s, inputs)
    for (const e of s.events) {
      if (e.id <= lastId) continue
      if (e.k === 'act' && e.act !== 'hop') st.strikes++
      else if (e.k === 'hit' || e.k === 'serve') st.shots++
    }
    lastId = s.nextEventId - 1
  }
  return st
}

/** 40 matches per level, run once and shared by the ability tests. */
const abilityRuns = new Map<BotLevel, AbilityStats>()
function abilityOf(level: BotLevel): AbilityStats {
  let r = abilityRuns.get(level)
  if (!r) {
    r = { strikes: 0, shots: 0, blocked: 0 }
    for (const seed of seeds(40, 500)) {
      const m = playAbility(level, seed)
      r.strikes += m.strikes
      r.shots += m.shots
      r.blocked += m.blocked
    }
    abilityRuns.set(level, r)
  }
  return r
}

describe('bot jump / lunge', () => {
  it('ability chance rises with the level', () => {
    expect(LEVELS.easy.ability).toBeLessThan(LEVELS.normal.ability)
    expect(LEVELS.normal.ability).toBeLessThan(LEVELS.hard.ability)
  })

  it('uses the ability more on harder levels', () => {
    const rate = (l: BotLevel) => abilityOf(l).strikes / abilityOf(l).shots
    const r = { easy: rate('easy'), normal: rate('normal'), hard: rate('hard') }
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ abilityPerShot: r }))
    expect(r.easy).toBeLessThan(r.normal)
    expect(r.normal).toBeLessThan(r.hard)
    expect(r.easy).toBeLessThanOrEqual(0.05)
    expect(r.hard).toBeGreaterThanOrEqual(0.08)
    expect(r.hard).toBeLessThanOrEqual(0.35)
  }, 180_000)

  it('the computer never presses while locked or cooling', () => {
    for (const l of ['easy', 'normal', 'hard'] as const) expect(abilityOf(l).blocked, l).toBe(0)
  }, 180_000)

  it('a planned jump presses the ability (not a swing) and strikes', () => {
    // A high lob dropping deep on side 1: the bot (rng 0 → smash try + ability roll) jumps for it.
    const s = incoming(0, -1, 2.5, { x: 0, y: 9, z: 5 })
    const mem = newBotMemory(1, 1)
    const seen: string[] = []
    let lastId = s.nextEventId - 1
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1 && s.tick < 2000) {
      const out = botStep(
        s,
        1,
        'hard',
        mem,
        () => 0,
        () => 0,
      )
      for (const i of out) if (i.t !== 'move') seen.push(i.t)
      game.tick(
        s,
        out.map((input) => ({ player: s.players[1].id, input })),
      )
      for (const e of s.events) if (e.id > lastId && e.k === 'act') seen.push(`act:${e.act}`)
      lastId = s.nextEventId - 1
    }
    expect(mem.plannedAct).toBe('jump')
    expect(seen).toContain('ability')
    expect(seen).not.toContain('swing')
    expect(seen).toContain('act:jump')
  })

  it('a failed ability roll plans a plain swing', () => {
    const s = incoming(0, -1, 2.5, { x: 0, y: 9, z: 5 })
    const mem = newBotMemory(1, 1)
    botStep(
      s,
      1,
      'hard',
      mem,
      () => 0,
      () => 0.99,
    )
    expect(mem.plannedAct).toBeNull()
  })
})

describe('bot under a racket stun', () => {
  const STILL = { t: 'move', x: 0, z: 0 }
  /** One tick: side 1's botStep (constant rngs, no ability) fed to the sim; returns its inputs. */
  function stepBot(s: SpState, mem: BotMemory, seen: SpEvent[] = []): SpInput[] {
    const lastId = s.nextEventId - 1
    const out = botStep(
      s,
      1,
      'normal',
      mem,
      () => 0.5,
      () => 0.99,
    )
    game.tick(
      s,
      out.map((input) => ({ player: s.players[1].id, input })),
    )
    for (const e of s.events) if (e.id > lastId) seen.push(e)
    return out
  }

  it('a stunned computer stands still and swings nothing, then replans', () => {
    // A high lob dropping deep on side 1: plenty of flight left after the stun.
    const s = incoming(0, -1, 2.5, { x: 0, y: 9, z: 5 })
    const mem = newBotMemory(1, 1)
    for (let i = 0; i < 3; i++) stepBot(s, mem)
    expect(mem.targetAt).toBeGreaterThanOrEqual(0) // a plan was made before the bonk
    const stunAt = s.tick
    s.players[1].stunAt = stunAt
    for (let i = 0; i < STUN.ticks; i++) {
      expect(stepBot(s, mem), `tick +${i}`).toEqual([STILL])
      expect(mem.targetAt).toBe(-1)
    }
    // Free again (the shot's event has scrolled out of the log by now): a fresh plan from here.
    expect(s.tick).toBe(stunAt + STUN.ticks)
    const seen: SpEvent[] = []
    const [move] = stepBot(s, mem, seen)
    expect(mem.targetAt).toBe(stunAt + STUN.ticks)
    expect(mem.plannedSwingTick).toBeGreaterThan(s.tick - 1)
    const me = s.players[1]
    const v = move.t === 'move' ? toWorld(1, move.x, move.z) : { x: 0, z: 0 }
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(0)
    expect(v.x * (mem.target.x - me.x) + v.z * (mem.target.z - me.z)).toBeGreaterThan(0)
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1 && s.tick < stunAt + 600) stepBot(s, mem, seen)
    expect(seen.some((e) => (e.k === 'hit' || e.k === 'whiff') && e.side === 1)).toBe(true)
  })

  it('never aims at players: the plan ignores where the opponent stands', () => {
    /** Side 1's inputs for 120 ticks of the same flight, the opponent standing at (x, z). */
    const run = (x: number, z: number) => {
      const s = incoming(0.5, 1.5, 4, { x: 0, y: 3, z: 3 })
      s.players[0].x = x
      s.players[0].z = z
      const mem = newBotMemory(1, 1)
      const outs: SpInput[][] = []
      for (let i = 0; i < 120 && s.phase === 'rally'; i++) outs.push(stepBot(s, mem))
      return outs
    }
    const atNet = run(0, -0.4)
    expect(atNet.length).toBe(120)
    // Where the computer stands and when it swings: the same wherever the opponent is.
    expect(run(0.2, -5)).toEqual(atNet)
    // Far to one side, only the shot's aim changes (it plays away from the opponent: shot placement,
    // not the body): moves and swing ticks stay the same.
    const noAim = (outs: SpInput[][]) =>
      outs.map((o) => o.map((i) => (i.t === 'swing' || i.t === 'ability' ? i.t : i)))
    expect(noAim(run(2, -5))).toEqual(noAim(atNet))
  })
})

/** FNV-1a over a string: a compact fingerprint of a long input log. */
function fnv(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0
  return h
}

describe('doubles AI', () => {
  it(
    '1v1 botStep output is unchanged',
    () => {
      // Pinned before 2v2 teammates (Task 5): 1v1 bots draw the same rng and send the same inputs.
      const s = setupBots('normal', 'hard', 5)
      for (const p of s.players) p.level = undefined
      const log: string[] = []
      for (let t = 0; t < 4000 && s.phase !== 'over'; t++) {
        const inputs: InputEvent<SpInput>[] = []
        s.players.forEach((p, i) => {
          const mem = p.bot!
          const rng = () => {
            const r = { seed: mem.rng }
            const v = random(r)
            mem.rng = r.seed
            return v
          }
          for (const input of botStep(s, i as 0 | 1, i === 0 ? 'normal' : 'hard', mem, rng))
            inputs.push({ player: p.id, input })
        })
        log.push(JSON.stringify(inputs))
        game.tick(s, inputs)
      }
      expect(fnv(log.join('|'))).toBe(170158273)
    },
    SLOW,
  )

  /**
   * normal×4 doubles run by the sim; at each shot's plan tick, the receiving pair's memories (both plan
   * on the same tick: same level). Shots where a receiver was stunned (no plan) are skipped.
   */
  function pairPlans(seed: number, shots: number) {
    const s = setupDoubles(['normal', 'normal', 'normal', 'normal'], seed)
    const react = LEVELS.normal.reactTicks
    const out: { side: 0 | 1; mems: BotMemory[] }[] = []
    let due: { at: number; side: 0 | 1 } | null = null
    let lastId = s.nextEventId - 1
    while (out.length < shots && s.phase !== 'over') {
      game.tick(s, [])
      for (const e of s.events)
        if (e.id > lastId && (e.k === 'hit' || e.k === 'serve'))
          due = { at: e.tick + react, side: e.side === 0 ? 1 : 0 }
      lastId = s.nextEventId - 1
      if (!due || s.tick !== due.at) continue
      const team = s.players.filter((p) => p.side === due!.side)
      if (team.every((p) => p.bot!.targetAt === due!.at))
        out.push({ side: due.side, mems: team.map((p) => structuredClone(p.bot!)) })
    }
    return out
  }

  it(
    'doubles: exactly one AI per side plans a swing for a shot',
    () => {
      const plans = pairPlans(21, 30)
      expect(plans).toHaveLength(30)
      let one = 0
      for (const { mems } of plans) {
        const swings = mems.filter((m) => m.plannedSwingTick >= 0).length
        expect(swings).toBeLessThanOrEqual(1)
        // A shot called in has one taker and one cover; a shot left alone (out / net): neither covers.
        const covers = mems.filter((m) => m.cover).length
        expect(covers).toBeLessThanOrEqual(1)
        if (swings === 1) {
          one++
          expect(covers).toBe(1)
        }
      }
      expect(one / plans.length).toBeGreaterThanOrEqual(0.7)
    },
    SLOW,
  )

  it(
    'doubles: the cover AI stands on the other half',
    () => {
      let checked = 0
      for (const { side, mems } of pairPlans(33, 30)) {
        const taker = mems.find((m) => !m.cover && m.plannedSwingTick >= 0)
        const cover = mems.find((m) => m.cover)
        if (!taker || !cover) continue
        const tx = toWorld(side, taker.target.x, taker.target.z).x
        if (Math.abs(tx) < 0.6) continue
        checked++
        expect(Math.sign(toWorld(side, cover.target.x, cover.target.z).x)).toBe(-Math.sign(tx))
        expect(Math.abs(cover.target.z)).toBeCloseTo(coverDepth(COURT), 6)
      }
      expect(checked).toBeGreaterThanOrEqual(5)
    },
    SLOW,
  )

  /** 2v2 alone (human p0 + ai2 on side 0) mid-rally: a shuttle falling straight onto (x, z) on side 0. */
  function teamRally(x: number, z: number): SpState {
    const s = createState([{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }], 1, {
      mode: '2v2',
    })
    s.phase = 'rally'
    s.phaseT = 0
    s.shuttle.pos = { x, y: 3, z }
    s.shuttle.vel = { x: 0, y: 0, z: 0 }
    s.shuttle.lastHitter = 1
    s.shuttle.pending = null
    s.events = [{ id: s.nextEventId++, tick: s.tick, k: 'hit', side: 1, grade: 'good', shot: 'clear' }]
    s.tick += 30
    return s
  }

  it('doubles: AI defers to a nearer human teammate', () => {
    const near = teamRally(1.2, -3)
    Object.assign(near.players[0], { x: 1.0, z: -3.2 })
    Object.assign(near.players[2], { x: -1.5, z: -2 })
    const mem = newBotMemory(1, 2)
    botStep(
      near,
      2,
      'normal',
      mem,
      () => 0.5,
      () => 0.99,
    )
    expect(mem.cover).toBe(true)
    expect(mem.plannedSwingTick).toBe(-1)
    expect(Math.sign(toWorld(0, mem.target.x, mem.target.z).x)).toBe(-Math.sign(toWorld(0, 1.2, -3).x))
    // The human far away: the computer takes it.
    const far = teamRally(1.2, -3)
    Object.assign(far.players[0], { x: -2.5, z: -1 })
    Object.assign(far.players[2], { x: 0.5, z: -3 })
    const mem2 = newBotMemory(1, 2)
    botStep(
      far,
      2,
      'normal',
      mem2,
      () => 0.5,
      () => 0.99,
    )
    expect(mem2.cover).toBe(false)
    expect(mem2.plannedSwingTick).toBeGreaterThanOrEqual(0)
  })

  it('doubles: AI serves only when it is the server', () => {
    const s = setupDoubles(['normal', 'normal', 'normal', 'normal'], 4)
    for (const [server, slots] of [
      [0, [0, 0]],
      [0, [1, 0]],
      [1, [0, 1]],
    ] as const) {
      s.phase = 'serve'
      s.phaseT = BOT_SERVE_TICKS
      s.server = server
      s.serveSlot = [slots[0], slots[1]]
      const servers = s.players.filter((_, i) =>
        botStep(s, i, 'normal', newBotMemory(1, i), () => 0.5).some((input) => input.t === 'swing'),
      )
      expect(servers).toEqual([serverPlayer(s)])
      expect(servers[0].slot).toBe(slots[server])
    }
  })
})
