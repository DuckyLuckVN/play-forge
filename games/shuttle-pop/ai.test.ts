import { describe, expect, it } from 'vitest'
import {
  BOT_SERVE_TICKS,
  botStep,
  coverDepth,
  LEVELS,
  NEAR_LINE,
  newBotMemory,
  readShot,
  readyDepth,
  safeOffset,
  type BotLevel,
  type BotMemory,
} from './ai'
import type { InputEvent } from '@forge/net/session'
import { MATCH_CAP, play, SLOW } from './ai.harness'
import { COURT, predictLanding } from './physics'
import { findContact, WINDOW } from './shots'
import { COURT_SIZES, courtDims } from './courtsize'
import { toWorld } from './court'
import { STUN } from './stun'
import {
  createState,
  serverPlayer,
  setupBots,
  setupDoubles,
  shuttlePopGame as game,
  TICK_RATE,
  type SpEvent,
  type SpInput,
  type SpState,
} from './sim'

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

describe('no silent miss', () => {
  it('safeOffset mirrors a late-side swing that would come with the landing; keeps the rest', () => {
    // Contact 22 ticks ahead, landing 26 ahead: a swing 12 after the contact is too late → 12 before.
    expect(safeOffset(12, 22, 26)).toBe(-12)
    expect(safeOffset(4, 22, 26)).toBe(-4)
    // Room before the landing, or an early swing: unchanged.
    expect(safeOffset(12, 22, 60)).toBe(12)
    expect(safeOffset(-9, 22, 26)).toBe(-9)
    expect(safeOffset(0, 22, 23)).toBe(0)
  })

  it('a low drop with a late-side Good roll still swings before the shuttle lands', () => {
    // A drop falling short in front of the bot: the meet is low (~0.3 m), a few ticks before the landing.
    const s = incoming(0.3, 1, 1.6, { x: 0, y: -2, z: 3 })
    const mem = newBotMemory(1, 1)
    // Rolls: grade 0.4 → Good, no smash (0.9), Good on the late side (0.9), the latest (0.99 → +12).
    const rolls = [0.4, 0.9, 0.9, 0.99]
    let i = 0
    const rng = () => rolls[i++] ?? 0.9
    const land = predictLanding(s.shuttle)
    const start = s.tick
    const kinds: string[] = []
    let landedAt = -1
    let lastId = s.nextEventId - 1
    while (s.phase === 'rally' && s.shuttle.lastHitter !== 1 && s.tick < start + 120) {
      const out = botStep(s, 1, 'normal', mem, rng, () => 0.99)
      if (s.tick === start) {
        const c = findContact(s.shuttle, mem.target, 0, land.ticks)
        // The case under test: the late-side swing (contact + 12) would come after the landing.
        expect(c!.dt + WINDOW.good).toBeGreaterThanOrEqual(land.ticks)
        expect(mem.plannedSwingTick).toBeLessThan(start + land.ticks)
      }
      for (const x of out) if (x.t !== 'move') kinds.push(x.t)
      game.tick(
        s,
        out.map((input) => ({ player: s.players[1].id, input })),
      )
      for (const e of s.events) if (e.id > lastId && e.k === 'land' && landedAt < 0) landedAt = e.tick
      lastId = s.nextEventId - 1
    }
    expect(kinds).toContain('swing')
    expect(landedAt).toBe(-1) // returned (a Good hit), never left to drop
  })
})

describe('meet height', () => {
  it('meets a deep falling shuttle around swing height, not at its lowest in-reach point', () => {
    // A deep clear coming down near the bot: time to set up at the preferred meet height (MEET_Y 1.4).
    const s = incoming(0.5, 1.5, 4, { x: 0, y: 2, z: 3 })
    const mem = newBotMemory(1, 1)
    botStep(s, 1, 'normal', mem, () => 0.5) // Good, no smash try
    const c = findContact(s.shuttle, mem.target, 0, predictLanding(s.shuttle).ticks)
    expect(c).not.toBeNull()
    expect(c!.pos.y).toBeGreaterThanOrEqual(0.9) // MEET_Y − 0.5
    expect(Math.abs(c!.pos.y - 1.4)).toBeLessThan(0.3)
  })
})

describe('shot tactics', () => {
  it('readShot: a drop when they are deep, a clear when at the net, a drive between', () => {
    expect(readShot(COURT.halfLen - 0.5, COURT)).toBe(0)
    expect(readShot(1, COURT)).toBe(-1)
    expect(readShot(3.2, COURT)).toBe(1)
    // Bigger courts read depth as a share of the half.
    const xl = courtDims('xl')
    expect(readShot(0.5 * xl.halfLen, xl)).toBe(1)
  })

  it('a read plays by where the opponent stands; harder levels read more', () => {
    expect(LEVELS.easy.tactics.read).toBeLessThan(LEVELS.normal.tactics.read)
    expect(LEVELS.normal.tactics.read).toBeLessThan(LEVELS.hard.tactics.read)
    /** Side 1's planned held z for the deep clear, the opponent standing `depth` m from the net. */
    const heldZ = (depth: number) => {
      const s = incoming(0.5, 1.5, 4, { x: 0, y: 2, z: 3 })
      s.players[0].x = 0
      s.players[0].z = -depth
      const mem = newBotMemory(1, 1)
      // rng 0.45 (normal): Good, no smash try, no body shot, the read roll hits (< 0.5).
      botStep(s, 1, 'normal', mem, () => 0.45)
      return mem.plannedHeld.z
    }
    expect(heldZ(COURT.halfLen - 0.5)).toBe(0) // deep → drop
    expect(heldZ(1)).toBe(-1) // at the net → clear over them
    expect(heldZ(3.2)).toBe(1) // mid → drive
  })

  it('a body shot aims at the opponent; otherwise away from them', () => {
    const heldX = (rng: number) => {
      const s = incoming(0.5, 1.5, 4, { x: 0, y: 2, z: 3 })
      s.players[0].x = 1.5 // world x; side 1 views it as x = 1.5 (toWorld)
      s.players[0].z = -3
      const mem = newBotMemory(1, 1)
      botStep(s, 1, 'hard', mem, () => rng)
      return mem.plannedHeld.x
    }
    // hard: rng 0.1 → body roll hits (< 0.12): aim at them; rng 0.95 (whiff roll, no body): away.
    expect(heldX(0.1)).toBeCloseTo(1.5 / (COURT.halfWidth - 0.4))
    expect(heldX(0.95)).toBeLessThan(0)
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

describe('bot jump / lunge', () => {
  it('ability chance rises with the level', () => {
    expect(LEVELS.easy.ability).toBeLessThan(LEVELS.normal.ability)
    expect(LEVELS.normal.ability).toBeLessThan(LEVELS.hard.ability)
  })

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

  it('never chases players: where it stands and when it swings ignore the opponent (only the shot reads them)', () => {
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
    // Where the computer stands and when it swings: the same wherever the opponent is; only the shot
    // (held direction: placement and the tactics' read, shot tactics) changes.
    const noAim = (outs: SpInput[][]) =>
      outs.map((o) => o.map((i) => (i.t === 'swing' || i.t === 'ability' ? i.t : i)))
    expect(noAim(run(0.2, -5))).toEqual(noAim(atNet))
    expect(noAim(run(2, -5))).toEqual(noAim(atNet))
  })
})

describe('doubles AI', () => {
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
