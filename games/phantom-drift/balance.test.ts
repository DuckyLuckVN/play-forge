// Balance report: human-like bots of a few skill levels play every character
// over many seeds (used to pick the unlock scores and check no perk swings
// scores too far). The report only runs on demand:
//   BALANCE=1 npx vitest run games/phantom-drift/balance.test.ts
// and is written to BALANCE_OUT (default balance-report.txt). SEEDS sets runs per row.
import { random, type RngState } from '@forge/core/rng'
import { describe, expect, it } from 'vitest'
import { CHARACTERS, perksOf, type Character } from './characters'
import {
  covers,
  createState,
  displayScore,
  step,
  TICK_RATE,
  type DriftInput,
  type DriftState,
  type Obj,
} from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
/** Depth overlap with the player row (sim.ts OVERLAP). */
const OVERLAP = 5
/** Ticks to slide one lane (1 / LANE_STEP). */
const LANE_TICKS = 5

export interface Skill {
  name: string
  /** Lead time range (ticks before a row arrives) when the bot starts to dodge. */
  lead: [number, number]
  /** Chance to misread a row and not dodge it at all. */
  blunder: number
  /** Ticks to notice a faller warning. */
  react: number
}

export const SKILLS: Skill[] = [
  { name: 'first run', lead: [1, 22], blunder: 0.25, react: 26 },
  { name: 'new', lead: [2, 24], blunder: 0.15, react: 22 },
  { name: 'casual', lead: [2, 26], blunder: 0.08, react: 20 },
  { name: 'practiced', lead: [3, 30], blunder: 0.04, react: 18 },
  { name: 'skilled', lead: [3, 32], blunder: 0.02, react: 15 },
]

function blocked(o: Obj, lanes: number): number[] {
  if (o.kind === 'sweeper') {
    const lo = Math.min(o.from!, o.to!)
    return Array.from({ length: Math.abs(o.to! - o.from!) + 1 }, (_, i) => lo + i)
  }
  return covers(o, lanes)
}

/** A player with human timing: dodges late or early, sometimes not at all. */
function makeBot(skill: Skill, seed: number) {
  const rng: RngState = { seed: seed * 7919 + 13 }
  const plan = new Map<number, { lead: number; blunder: boolean }>()
  let fullSince = -1
  return (s: DriftState): DriftInput | null => {
    const p = s.player
    const ticksPer = s.speed / TICK_RATE
    const arrival = (o: Obj) => (o.z - OVERLAP) / ticksPer
    const rowPlan = (row: number) => {
      let r = plan.get(row)
      if (!r) {
        const [lo, hi] = skill.lead
        r = { lead: lo + random(rng) * (hi - lo), blunder: random(rng) < skill.blunder }
        plan.set(row, r)
      }
      return r
    }
    const all = Array.from({ length: s.lanes }, (_, l) => l)
    const pending = s.objects.filter((o) => !o.done && arrival(o) > -1)
    const next = pending.length ? pending.reduce((a, b) => (b.z < a.z ? b : a)).row : null
    const inRow = pending.filter((o) => o.row === next)
    const hazards = inRow.filter((o) => o.kind !== 'wisp')
    const bad = new Set(hazards.flatMap((o) => blocked(o, s.lanes)))
    const free = all.filter((l) => !bad.has(l))
    const wisps = inRow.filter((o) => o.kind === 'wisp').map((o) => o.lane)
    const falling = s.fallers.filter((f) => s.tick - (f.slamAt - f.tele) >= skill.react).map((f) => f.lane)

    // Phantom: a panic button when a hit is coming, or spent once it sat full a while.
    const charged = p.charge >= s.perks.phantomCost && s.tick >= p.phantomUntil
    if (charged && fullSince < 0) fullSince = s.tick
    if (!charged) fullSince = -1

    const nearest = (lanes: number[]) =>
      lanes.reduce((a, b) => (Math.abs(b - p.target) < Math.abs(a - p.target) ? b : a), lanes[0])
    let goal = p.target
    if (falling.length) goal = nearest(all.filter((l) => !falling.includes(l)))
    else if (next !== null) {
      const r = rowPlan(next)
      const t = arrival(inRow[0])
      const want = wisps.length && !hazards.length ? nearest(wisps) : nearest(free.length ? free : all)
      const travel = Math.abs(want - p.target) * LANE_TICKS
      if (!r.blunder && t <= r.lead + Math.max(0, travel - LANE_TICKS)) goal = want
      if (charged && bad.has(p.target) && hazards.length && t < 8 && (r.blunder || goal === p.target))
        return 'phase'
    }
    if (charged && s.tick - fullSince > 5 * TICK_RATE) return 'phase'
    return goal < p.target ? 'left' : goal > p.target ? 'right' : null
  }
}

export function playRun(c: Character, skill: Skill, seed: number, maxSeconds = 600) {
  const s = createState(me, seed, perksOf(c))
  const bot = makeBot(skill, seed)
  for (let i = 0; i < maxSeconds * TICK_RATE && !s.over; i++) {
    const input = bot(s)
    step(s, input ? [{ player: 'p0', input }] : [])
  }
  return { score: displayScore(s), seconds: (s.diedAt ?? s.tick) / TICK_RATE, stats: s.stats }
}

const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)]
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// The browser tsconfig has no Node types; read the environment loosely.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

describe('Phantom Drift balance harness', () => {
  it('bots play whole runs, deterministically', () => {
    const a = playRun(CHARACTERS[0], SKILLS[0], 3)
    expect(a.seconds).toBeGreaterThan(5)
    expect(a).toEqual(playRun(CHARACTERS[0], SKILLS[0], 3))
  })

  it.runIf(env.BALANCE)(
    'writes the balance report',
    async () => {
      const SEEDS = Number(env.SEEDS ?? 60)
      const lines: string[] = []
      for (const skill of SKILLS) {
        const base = mean(Array.from({ length: SEEDS }, (_, i) => playRun(CHARACTERS[0], skill, i + 1).score))
        for (const c of CHARACTERS) {
          const runs = Array.from({ length: SEEDS }, (_, i) => playRun(c, skill, i + 1))
          const scores = runs.map((r) => r.score)
          const m = mean(scores)
          lines.push(
            [
              skill.name.padEnd(10),
              c.id.padEnd(6),
              `mean ${Math.round(m)}`.padEnd(11),
              `p25 ${pct(scores, 0.25)}`.padEnd(10),
              `p50 ${pct(scores, 0.5)}`.padEnd(10),
              `p90 ${pct(scores, 0.9)}`.padEnd(10),
              `max ${Math.max(...scores)}`.padEnd(10),
              `time ${Math.round(mean(runs.map((r) => r.seconds)))}s`.padEnd(10),
              `vs wisp ${(((m - base) / base) * 100).toFixed(1)}%`,
            ].join(' '),
          )
        }
      }
      // Node-only: this test runs only with BALANCE set.
      const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
        writeFileSync(path: string, data: string): void
      }
      fs.writeFileSync(env.BALANCE_OUT ?? 'balance-report.txt', lines.join('\n') + '\n')
    },
    600_000,
  )
})
