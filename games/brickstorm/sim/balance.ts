// Headless bots that play whole runs, for tuning difficulty and the economy.
// `npm run balance` prints medians against the targets in the v2 plan.
import { random } from '@forge/core/rng'
import { pickBoost } from './boosts'
import { AIM_MIN, MAX_COLS } from './config'
import { dims } from './dims'
import { growBoard } from './meta'
import { aimFromPointer } from './physics'
import { cellCenter, spawnRow, specialChance } from './rows'
import { canRecall, createRun, drainEvents, fire, recall, step } from './run'
import type { BoostId, RunState } from './types'

/** random: blind aim · aimer: aims at the lowest brick, like a typical player · greedy: tries 6 angles ahead. */
export type Bot = 'random' | 'aimer' | 'greedy'

export interface RunResult {
  turns: number
  coins: number
  levels: number
  firstLevelTurn: number | null
}

/** Boosts the bots take first; anything else in the offer otherwise. */
const PREFER: BoostId[] = [
  'damage',
  'balls',
  'fireball',
  'bombball',
  'lightning',
  'twin',
  'crit',
  'big',
  'aftershock',
]
const GREEDY_ANGLES = 6
/** Bots recall a volley after this long, like an impatient player. */
const BOT_RECALL = 10

function playVolley(s: RunState): void {
  for (let i = 0; s.phase === 'volley'; i++) {
    step(s)
    if (s.volleyTime > BOT_RECALL && canRecall(s)) recall(s)
    if (i > 200_000) throw new Error('volley never ended')
  }
}

function score(s: RunState): number {
  let v = 0
  for (const e of drainEvents(s)) {
    if (e.type === 'kill') v += 10
    else if (e.type === 'hit') v += 1
    else if (e.type === 'pickup') v += 15
    else if (e.type === 'over') v -= 10_000
  }
  return v - 50 * s.bricks.filter((b) => b.row >= dims(s).dangerRow - 2).length
}

function greedyAngle(s: RunState): number {
  let best = Math.PI / 2
  let bestScore = -Infinity
  for (let i = 0; i < GREEDY_ANGLES; i++) {
    const a = AIM_MIN + ((Math.PI - 2 * AIM_MIN) * (i + 0.5)) / GREEDY_ANGLES
    const probe = structuredClone(s)
    probe.events = []
    fire(probe, a)
    playVolley(probe)
    const v = score(probe)
    if (v > bestScore) {
      bestScore = v
      best = a
    }
  }
  return best
}

/** Aims at the lowest brick (the most dangerous one), with a few degrees of wobble. */
function aimerAngle(s: RunState, rng: { seed: number }): number {
  const low = s.bricks.reduce<RunState['bricks'][number] | null>(
    (a, b) => (!a || b.row > a.row ? b : a),
    null,
  )
  if (!low) return Math.PI / 2
  const { x, y } = cellCenter(low.col, low.row)
  const wobble = ((random(rng) - 0.5) * 10 * Math.PI) / 180
  return Math.max(
    AIM_MIN,
    Math.min(Math.PI - AIM_MIN, aimFromPointer(s.launchX, x, y, dims(s).floorY) + wobble),
  )
}

export function simulateRun(seed: number, bot: Bot, maxTurns = 150): RunResult {
  const s = createRun(seed)
  const aimRng = { seed: seed ^ 0x9e3779b9 }
  let firstLevelTurn: number | null = null
  while (s.phase !== 'over' && s.turn < maxTurns) {
    if (s.phase === 'grow') {
      growBoard(s, s.cols < MAX_COLS ? 'col' : 'row')
      continue
    }
    if (s.phase === 'pick') {
      pickBoost(s, PREFER.find((id) => s.choices.includes(id)) ?? s.choices[0])
      continue
    }
    const angle =
      bot === 'random'
        ? AIM_MIN + random(aimRng) * (Math.PI - 2 * AIM_MIN)
        : bot === 'aimer'
          ? aimerAngle(s, aimRng)
          : greedyAngle(s)
    fire(s, angle)
    playVolley(s)
    drainEvents(s)
    if (firstLevelTurn === null && s.level > 0) firstLevelTurn = s.turn
  }
  return { turns: s.turn, coins: s.coins, levels: s.level, firstLevelTurn }
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b)
  return v.length ? v[Math.floor(v.length / 2)] : NaN
}

/** Share of spawned bricks that are special at a turn, over many rows. */
export function specialShare(turn: number, rows = 2000): number {
  let all = 0
  let special = 0
  for (let seed = 1; seed <= rows; seed++) {
    const s = createRun(seed)
    s.bricks = []
    s.turn = turn
    s.ballCount = 999
    spawnRow(s)
    all += s.bricks.length
    special += s.bricks.filter((b) => b.kind !== 'normal').length
  }
  return special / all
}

export function balanceReport(seeds: number, bots: Bot[] = ['random', 'aimer', 'greedy']): string {
  const lines = [`Brickstorm balance — ${seeds} seeds per bot`]
  for (const bot of bots) {
    const runs = Array.from({ length: seeds }, (_, i) => simulateRun(i + 1, bot))
    lines.push(
      `${bot.padEnd(7)} turns ${median(runs.map((r) => r.turns))}` +
        ` | coins ${median(runs.map((r) => r.coins))}` +
        ` | level-ups ${median(runs.map((r) => r.levels))}` +
        ` | first level-up turn ${median(runs.map((r) => r.firstLevelTurn ?? 999))}` +
        ` | turns min/max ${Math.min(...runs.map((r) => r.turns))}/${Math.max(...runs.map((r) => r.turns))}`,
    )
  }
  lines.push(
    `special share at turn 31: ${(specialShare(31) * 100).toFixed(1)}% (chance ${specialChance(31)})`,
  )
  return lines.join('\n')
}
