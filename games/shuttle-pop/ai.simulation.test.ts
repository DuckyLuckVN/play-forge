// Bot v bot simulations: many full matches (slow; `npm run test:sim`).
import { describe, expect, it } from 'vitest'
import { random } from '@forge/core/rng'
import type { InputEvent } from '@forge/net/session'
import { botStep, type BotLevel } from './ai'
import { HARD_CAP, MATCH_CAP, play } from './ai.harness'
import { canAct, setupBots, shuttlePopGame as game, type SpInput } from './sim'

const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i)

describe('computer opponent', () => {
  it('hard v hard: never perfect-only, ends within 10 min, both ends even', () => {
    const tally: Record<string, number> = {}
    let total = 0
    let wins0 = 0
    let points = 0
    let points0 = 0
    // Mirror-exact sim (mirror.simulation.test.ts): a side gap is sampling noise; 80 matches keep it ~±5.6% (1σ).
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
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ wins0: wins0 / n, share0: points0 / points }))
    expect(total).toBeGreaterThanOrEqual(500)
    expect((total - (tally.perfect ?? 0)) / total).toBeGreaterThanOrEqual(0.03)
    expect(wins0 / n).toBeGreaterThanOrEqual(0.4)
    expect(wins0 / n).toBeLessThanOrEqual(0.6)
    expect(points0 / points).toBeGreaterThanOrEqual(0.45)
    expect(points0 / points).toBeLessThanOrEqual(0.55)
  })

  it('rallies are sane and normal vs normal is even', () => {
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
  })

  it('levels rank: hard beats easy', () => {
    let hardWins = 0
    const n = 30
    for (const seed of seeds(n, 200)) {
      // alternate seats so side doesn't matter
      const hardSide = seed % 2 === 0 ? 0 : 1
      const m = seed % 2 === 0 ? play('hard', 'easy', seed) : play('easy', 'hard', seed)
      if (m.winner === hardSide) hardWins++
    }
    expect(hardWins / n).toBeGreaterThanOrEqual(0.8)
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
  it('uses the ability more on harder levels', () => {
    const rate = (l: BotLevel) => abilityOf(l).strikes / abilityOf(l).shots
    const r = { easy: rate('easy'), normal: rate('normal'), hard: rate('hard') }
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ abilityPerShot: r }))
    expect(r.easy).toBeLessThan(r.normal)
    expect(r.normal).toBeLessThan(r.hard)
    expect(r.easy).toBeLessThanOrEqual(0.05)
    expect(r.hard).toBeGreaterThanOrEqual(0.08)
    expect(r.hard).toBeLessThanOrEqual(0.35)
  })

  it('the computer never presses while locked or cooling', () => {
    for (const l of ['easy', 'normal', 'hard'] as const) expect(abilityOf(l).blocked, l).toBe(0)
  })
})

/** FNV-1a over a string: a compact fingerprint of a long input log. */
function fnv(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0
  return h
}

describe('doubles AI', () => {
  it('1v1 botStep output is unchanged', () => {
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
  })
})
