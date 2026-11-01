// Headless bots that play whole runs, for tuning difficulty and the economy.
// `npm run balance` prints medians against the targets in the v2 plan.
import { random } from '@forge/core/rng'
import { needsReplace, pickBoost, pickCost, skipPick, slottedBoosts } from './boosts'
import { AIM_MIN, MAX_COLS } from './config'
import { dims } from './dims'
import { growBoard } from './meta'
import { aimFromPointer } from './physics'
import { cellCenter, spawnRow, specialChance } from './rows'
import { canRecall, createRun, drainEvents, fire, recall, restingBall, step } from './run'
import { HERO_IDS, type HeroId } from './heroes'
import type { BoostId, RunState } from './types'

/** random: blind aim · aimer: aims at the lowest brick, like a typical player · greedy: tries 6 angles ahead. */
export type Bot = 'random' | 'aimer' | 'greedy'

export interface RunResult {
  turns: number
  coins: number
  levels: number
  firstLevelTurn: number | null
  /** Levels reached by the end of each turn listed in LEVEL_CHECKS. */
  levelsAt: number[]
  /** Bosses met and beaten. */
  bossesMet: number
  bossesBeaten: number
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

/** How much the bot likes a boost: its place in PREFER, unlisted ones last. */
const rank = (id: BoostId) => (PREFER.includes(id) ? PREFER.indexOf(id) : PREFER.length)

/**
 * The bot's pick: its favourite offer it can pay for (from this run's coins),
 * dropping its least favourite owned boost when slots are full; it skips when
 * it can afford nothing. Returns the coins it spent.
 */
function botPick(s: RunState, wallet: number): number {
  const affordable = s.choices.filter((id) => pickCost(s, id) <= wallet)
  if (!affordable.length) {
    skipPick(s)
    return 0
  }
  const take = (id: BoostId, replace?: BoostId) => {
    const cost = pickCost(s, id)
    pickBoost(s, id, replace)
    return cost
  }
  const best = [...affordable].sort((a, b) => rank(a) - rank(b))[0]
  if (!needsReplace(s, best)) return take(best)
  const worst = slottedBoosts(s.boosts).sort((a, b) => rank(b) - rank(a))[0]
  // Not worth a swap: level up something it has instead, if offered.
  const keep = affordable.find((id) => !needsReplace(s, id))
  if (rank(best) >= rank(worst) && keep) return take(keep)
  return take(best, worst)
}

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
    else if (e.type === 'breach') v -= 40 * e.damage
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
  // Like a player, it doesn't aim at thorns (they hurt) or at a weak point's stone wards.
  const targets = s.bricks.filter((b) => b.role !== 'thorn' && b.role !== 'ward')
  const low = targets.reduce<RunState['bricks'][number] | null>((a, b) => (!a || b.row > a.row ? b : a), null)
  if (!low) return Math.PI / 2
  const { x, y } = cellCenter(low.col, low.row)
  const wobble = ((random(rng) - 0.5) * 10 * Math.PI) / 180
  return Math.max(
    AIM_MIN,
    Math.min(Math.PI - AIM_MIN, aimFromPointer(s.launchX, x, y, restingBall(s).y) + wobble),
  )
}

/** Turns the report samples the level at, to show the pace of level-ups. */
const LEVEL_CHECKS = [10, 30, 60, 90] as const
/** Runs stop here, to keep the report fast. */
const MAX_TURNS = 300

export function simulateRun(
  seed: number,
  bot: Bot,
  maxTurns = MAX_TURNS,
  hero: HeroId = 'rookie',
): RunResult {
  const s = createRun(seed, hero)
  const aimRng = { seed: seed ^ 0x9e3779b9 }
  let firstLevelTurn: number | null = null
  let bossesMet = 0
  let bossesBeaten = 0
  let spent = 0
  const levelsAt: number[] = []
  while (s.phase !== 'over' && s.turn < maxTurns) {
    if (s.phase === 'grow') {
      growBoard(s, s.cols < MAX_COLS ? 'col' : 'row')
      continue
    }
    if (s.phase === 'pick') {
      spent += botPick(s, s.coins - spent)
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
    for (const e of drainEvents(s)) {
      if (e.type === 'boss') bossesMet++
      if (e.type === 'bossDown') bossesBeaten++
    }
    if (firstLevelTurn === null && s.level > 0) firstLevelTurn = s.turn
    for (const [i, at] of LEVEL_CHECKS.entries()) if (s.turn <= at) levelsAt[i] = s.level
  }
  return { turns: s.turn, coins: s.coins, levels: s.level, firstLevelTurn, levelsAt, bossesMet, bossesBeaten }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
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

export function balanceReport(
  seeds: number,
  bots: Bot[] = ['random', 'aimer', 'greedy'],
  heroes = false,
): string {
  const lines = [`Brickstorm balance — ${seeds} seeds per bot`]
  for (const bot of bots) {
    const runs = Array.from({ length: seeds }, (_, i) => simulateRun(i + 1, bot))
    lines.push(
      `${bot.padEnd(7)} turns ${median(runs.map((r) => r.turns))}` +
        ` | coins ${median(runs.map((r) => r.coins))}` +
        ` | level-ups ${median(runs.map((r) => r.levels))}` +
        ` | first level-up turn ${median(runs.map((r) => r.firstLevelTurn ?? 999))}` +
        ` | level at turn ${LEVEL_CHECKS.map((at, i) => `${at}:${median(runs.map((r) => r.levelsAt[i]))}`).join(' ')}` +
        ` | bosses beaten ${sum(runs.map((r) => r.bossesBeaten))}/${sum(runs.map((r) => r.bossesMet))}` +
        ` | turns min/max ${Math.min(...runs.map((r) => r.turns))}/${Math.max(...runs.map((r) => r.turns))}`,
    )
  }
  if (heroes) for (const bot of bots) lines.push(heroReport(seeds, bot))
  lines.push(
    `special share at turn 31: ${(specialShare(31) * 100).toFixed(1)}% (chance ${specialChance(31)})`,
  )
  return lines.join('\n')
}

/** Median turns per hero for one bot, so no hero is far stronger or weaker than the rest. */
export function heroReport(
  seeds: number,
  bot: Bot,
  only: readonly HeroId[] = HERO_IDS,
  maxTurns = MAX_TURNS,
): string {
  const lines = [`heroes (${bot}, median turns · p25 · p75):`]
  for (const hero of only) {
    const turns = Array.from({ length: seeds }, (_, i) => simulateRun(i + 1, bot, maxTurns, hero).turns).sort(
      (a, b) => a - b,
    )
    const at = (q: number) => turns[Math.min(turns.length - 1, Math.floor(turns.length * q))]
    lines.push(`  ${hero.padEnd(10)} ${String(median(turns)).padStart(4)} · ${at(0.25)} · ${at(0.75)}`)
  }
  return lines.join('\n')
}
