// Balance vs a "reasonable human": a scripted player with human-ish limits (reacts ~250 ms after the
// opponent's hit, runs to where the shuttle comes down, swings with timing error ~N(0, 6 ticks), picks
// shots at random). Pins the difficulty targets: beats Easy most matches, Normal about even, Hard
// sometimes. Also checks the smash is the fastest shot off the racket.
import { describe, expect, it } from 'vitest'
import { random } from '@forge/core/rng'
import type { InputEvent } from '@forge/net/session'
import { isIn, predictLanding, stepShuttle, type Flight } from './physics'
import { readyDepth } from './ai'
import {
  ABILITY,
  abilityShot,
  actReady,
  horizonOf,
  leadOf,
  pickAbility,
  reachOf,
  type Strike,
} from './ability'
import { type CourtSize } from './courtsize'
import { findContact, launchFor, REACH, shotTarget, type ShotKind } from './shots'
import {
  createState,
  shuttlePopGame as game,
  MOVE_SPEED,
  TICK_RATE,
  toWorld,
  type Level,
  type SpInput,
  type SpState,
} from './sim'

/** A scripted player's limits. */
interface Profile {
  /** Ticks from the opponent's hit to moving with intent. */
  reactTicks: number
  /** Swing timing error σ, ticks. */
  timingSigma: number
  /** Where they end up vs where they meant to stand, σ metres. */
  posSigma: number
  /** Chance to misread the depth of a shot, and by how much (m, either way). */
  depthMiss: number
  depthBy: number
  /** Line calls this close (m) to a line are a coin flip. */
  unsureLine: number
  /** Chance to hold-to-charge a swing at a high ball (a lob to smash / clear) and at anything else. */
  chargeHigh: number
  chargeLow: number
  /**
   * The jump / lunge button (default never): smart = only for a shot the plain run can't make in time
   * (lunge) or that passes above the plain reach (jump); spam = whenever the button would jump / lunge.
   */
  ability?: 'never' | 'smart' | 'spam'
}

/**
 * Tuning gauges, not people: "casual" is a first-evening player (late-ish reads, ~150 ms timing
 * spread, misjudges depth now and then); "skilled" is a practised one (~100 ms spread, clean reads).
 */
const casual = {
  reactTicks: 20,
  timingSigma: 9,
  posSigma: 0.3,
  depthMiss: 0.25,
  depthBy: 0.5,
  unsureLine: 0.2,
  chargeHigh: 0.35,
  chargeLow: 0.2,
}

const PROFILES = {
  casual,
  /** Casual who never charges: pure taps (= today's shots). */
  tap: { ...casual, chargeHigh: 0, chargeLow: 0 },
  skilled: {
    reactTicks: 15,
    timingSigma: 6,
    posSigma: 0.25,
    depthMiss: 0,
    depthBy: 0,
    unsureLine: 0.2,
    chargeHigh: 0.75,
    chargeLow: 0.3,
  },
  /** Casual who learned the ability: presses it only when the plain swing can't get there. */
  casualSmart: { ...casual, ability: 'smart' },
  /** Casual who presses the ability at every shot it would jump / lunge for, instead of swinging. */
  casualSpam: { ...casual, ability: 'spam' },
} satisfies Record<string, Profile>

const SERVE_AT = 40
const BASE_Z = 3.2

interface HumanMem {
  /** Tick of the opponent shot the plan is for (-1 = none). */
  planFor: number
  play: boolean
  target: { x: number; z: number }
  err: number
  contactAt: number
  swung: boolean
  /** Ticks to hold the swing button before the release (0 = a tap); pressed = charge sent. */
  hold: number
  pressed: boolean
  /** A tap in progress: the tick its button comes up (−1 = none). */
  releaseAt: number
  /** The ability press this shot is waiting for (smart: from the plan; spam: the first chance), or null. */
  act: Strike | null
  /** Tick to press it (−1 = not yet scheduled). */
  actAt: number
  rng: { seed: number }
}

const newHuman = (seed: number): HumanMem => ({
  planFor: -1,
  play: false,
  target: { x: 0, z: 0 },
  err: 0,
  contactAt: -1,
  swung: false,
  hold: 0,
  pressed: false,
  releaseAt: -1,
  act: null,
  actAt: -1,
  rng: { seed: seed ^ 0x5bd1e995 },
})

function gauss(m: HumanMem): number {
  const u = Math.max(1e-9, random(m.rng))
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random(m.rng))
}

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

/** Where to stand: a spot on the flight I can reach in time, as near the comfy height as possible. */
function meet(s: SpState, side: 0 | 1): { x: number; z: number; high: boolean; late: boolean; apex: number } {
  const me = s.players[side]
  Object.assign(scratch.pos, s.shuttle.pos)
  Object.assign(scratch.vel, s.shuttle.vel)
  const land = predictLanding(s.shuttle)
  // Lobs are met high (a smash chance); everything else at chest height.
  let apex = s.shuttle.pos.y
  const speed = MOVE_SPEED / TICK_RATE
  let best = { x: land.pos.x, z: land.pos.z, high: false, late: true, apex: 0 }
  let bestScore = Infinity
  const pts: { x: number; y: number; z: number; t: number }[] = []
  for (let t = 0; t < 400; t++) {
    const { pos } = scratch
    apex = Math.max(apex, pos.y)
    const mine = side === 0 ? pos.z < 0 : pos.z > 0
    if (mine && pos.y >= REACH.minY + 0.2 && pos.y <= REACH.maxY - 0.2)
      pts.push({ x: pos.x, y: pos.y, z: pos.z, t })
    if (stepShuttle(scratch).netHit || scratch.pos.y <= 0) break
  }
  const prefY = apex > 4 ? 2.3 : 1.3
  for (const p of pts) {
    const late = Math.hypot(p.x - me.x, p.z - me.z) / speed + 10 - p.t
    const score = late <= 0 ? Math.abs(p.y - prefY) : 100 + late
    if (score < bestScore) {
      bestScore = score
      best = { x: p.x, z: p.z, high: prefY > 2, late: late > 0, apex }
    }
  }
  return { ...best, apex }
}

function moveTo(s: SpState, side: 0 | 1, to: { x: number; z: number }): SpInput {
  const p = s.players[side]
  const dx = to.x - p.x
  const dz = to.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return { t: 'move', x: 0, z: 0 }
  const k = Math.min(1, d / 0.4) / d
  const v = toWorld(side, dx * k, dz * k)
  return { t: 'move', x: v.x, z: v.z }
}

/** The scripted human's inputs this tick. */
function humanStep(s: SpState, side: 0 | 1, m: HumanMem, H: Profile): SpInput[] {
  const back = side === 0 ? -1 : 1
  const base = { x: 0, z: back * readyDepth(s.court) }
  if (s.phase === 'serve') {
    m.planFor = -1
    m.releaseAt = -1
    if (s.server === side && s.phaseT === SERVE_AT)
      return [{ t: 'swing', x: 0, z: random(m.rng) < 0.4 ? -1 : 0, tick: s.tick }]
    // A press the rally ended on: let go (no swing).
    if (s.players[side].chargeAt !== -1)
      return [
        { t: 'move', x: 0, z: 0 },
        { t: 'charge', cancel: true },
      ]
    return [{ t: 'move', x: 0, z: 0 }]
  }
  if (s.phase !== 'rally') return [{ t: 'move', x: 0, z: 0 }]
  // A tap's button-up (graded at its press).
  if (m.releaseAt >= 0 && s.tick >= m.releaseAt) {
    m.releaseAt = -1
    const kinds = [-1, 0, 1]
    const z = kinds[Math.floor(random(m.rng) * 3)]
    return [moveTo(s, side, m.target), { t: 'swing', x: random(m.rng) * 2 - 1, z, tick: s.tick + 1 }]
  }
  const opp = side === 0 ? 1 : 0
  if (s.shuttle.lastHitter !== opp) return [moveTo(s, side, base)]
  let shot = -1
  for (const e of s.events)
    if ((e.k === 'hit' || e.k === 'serve') && e.side === opp) shot = Math.max(shot, e.tick)
  if (shot < 0 && m.planFor < 0) return [moveTo(s, side, base)]
  if (s.tick < shot + H.reactTicks) return [moveTo(s, side, base)]
  if (shot >= 0 && m.planFor !== shot) {
    m.planFor = shot
    const land = predictLanding(s.shuttle)
    const nearLine =
      Math.abs(Math.abs(land.pos.x) - s.court.halfWidth) < H.unsureLine ||
      Math.abs(Math.abs(land.pos.z) - s.court.halfLen) < H.unsureLine
    m.play = !land.netHit && (nearLine ? random(m.rng) < 0.5 : isIn(land.pos, side, s.court))
    const spot = meet(s, side)
    m.target = { x: spot.x + gauss(m) * H.posSigma, z: spot.z + gauss(m) * H.posSigma }
    if (random(m.rng) < H.depthMiss) m.target.z += (random(m.rng) < 0.5 ? -1 : 1) * H.depthBy
    m.err = Math.round(gauss(m) * H.timingSigma)
    m.contactAt = -1
    m.swung = false
    m.pressed = false
    m.releaseAt = -1
    m.act = null
    m.actAt = -1
    // Smart: a dive for what the run can't make; a jump for a shuttle passing above the plain reach.
    if (H.ability === 'smart') m.act = spot.late ? 'lunge' : spot.apex > REACH.maxY ? 'jump' : null
    // Hold-to-charge: a held press of ~0.2–0.6 s, more often on a high ball.
    m.hold =
      random(m.rng) < (spot.high ? H.chargeHigh : H.chargeLow) ? 12 + Math.floor(random(m.rng) * 24) : 0
  }
  if (!m.play) return [moveTo(s, side, base)]
  const out: SpInput[] = [moveTo(s, side, m.target)]
  if (m.swung) return out
  const me = s.players[side]
  if (H.ability === 'smart' || H.ability === 'spam') {
    const pressed = abilityStep(s, side, m, H)
    if (pressed) {
      out.push(pressed)
      return out
    }
    // Waiting for the planned press: no plain swing meanwhile.
    if (m.actAt >= 0) return out
  }
  // The sim judges this tick's swing at s.tick + 1; track the contact until it passes.
  if (m.contactAt < 0 || m.contactAt > s.tick + 1) {
    const c = findContact(s.shuttle, me, 0, 120)
    if (c) m.contactAt = s.tick + 1 + c.dt
  }
  if (m.hold > 0 && !m.pressed && m.contactAt >= 0 && s.tick + 1 >= m.contactAt - m.err - m.hold) {
    m.pressed = true
    out.push({ t: 'charge', tick: s.tick + 1 })
  }
  if (m.contactAt >= 0 && s.tick + 1 >= m.contactAt - m.err) {
    m.swung = true
    if (m.hold === 0) {
      // A tap: the button goes down on time and comes up 4–7 ticks (~65–115 ms) later.
      out.push({ t: 'charge', tick: s.tick + 1 })
      m.releaseAt = s.tick + 4 + Math.floor(random(m.rng) * 4)
      return out
    }
    const kinds = [-1, 0, 1]
    const z = kinds[Math.floor(random(m.rng) * 3)]
    out.push({ t: 'swing', x: random(m.rng) * 2 - 1, z, tick: s.tick + 1 })
  }
  return out
}

/**
 * What the button would offer from where `me` stands, looked for up to ABILITY.horizon ahead (the player
 * sees the shuttle coming: ability.ts pickAbility itself only offers a move that can still grade):
 * the first tick ahead it is a jump / lunge, and that move's contact `dt` ticks from now; null = a hop.
 */
function foresee(s: SpState, me: { x: number; z: number }, side: 0 | 1): { pick: Strike; dt: number } | null {
  const f: Flight = { pos: { ...s.shuttle.pos }, vel: { ...s.shuttle.vel } }
  const last = ABILITY.horizon - horizonOf('lunge')
  for (let ahead = 0; ahead <= last; ahead++) {
    const pick = pickAbility(f, me, side, s.shuttle.lastHitter, !s.shuttle.pending).k
    if (pick !== 'hop') {
      // Aim at the contact's closest approach (the sim grades it once the press is in range).
      const c = findContact(f, me, 0, ABILITY.horizon - ahead, reachOf(pick))
      return c && { pick, dt: ahead + c.dt }
    }
    if (stepShuttle(f).netHit || f.pos.y <= 0) break
  }
  return null
}

/**
 * The ability press, if due this tick, timed at the strike's contact − its lead with the profile's timing
 * error. Scheduled when the button (ability.ts pickAbility, off cooldown) offers a jump / lunge from where
 * I stand. Smart: only its planned move, and it looks again at the press (the button would hop now, or is
 * cooling → plain swing). Spam: the first jump / lunge offered, pressed on schedule instead of swinging
 * (a hop if the run got there meanwhile).
 */
function abilityStep(s: SpState, side: 0 | 1, m: HumanMem, H: Profile): SpInput | null {
  const me = s.players[side]
  if (m.actAt < 0) {
    if (H.ability === 'smart' && !m.act) return null
    if (me.chargeAt !== -1 || !actReady(me.act, s.tick + 1)) return null
    const seen = foresee(s, me, side)
    if (!seen || (H.ability === 'smart' && seen.pick !== m.act)) return null
    const { pick } = seen
    m.act = pick
    m.actAt = s.tick + 1 + seen.dt - leadOf(pick) - m.err
    m.hold = 0
  }
  if (s.tick + 1 < m.actAt) return null
  // Smart looks again before pressing: already in plain reach (the button would hop) or cooling = swing.
  if (
    H.ability === 'smart' &&
    (!actReady(me.act, s.tick + 1) ||
      pickAbility(s.shuttle, me, side, s.shuttle.lastHitter, !s.shuttle.pending).k !== m.act ||
      (m.act === 'lunge' && !meet(s, side).late))
  ) {
    m.act = null
    m.actAt = -1
    return null
  }
  m.swung = true
  m.actAt = -1
  return { t: 'ability', x: random(m.rng) * 2 - 1, z: 0, tick: s.tick + 1 }
}

interface BalanceStats {
  humanWon: boolean
  points: [number, number]
  /** Shots per point. */
  shots: number[]
  seconds: number
  speeds: Partial<Record<ShotKind, number[]>>
}

/** One match: scripted human (side 0) vs the computer at `level`, on the `size` court. */
function humanVsBot(H: Profile, level: Level, seed: number, size: CourtSize = 'normal'): BalanceStats {
  const s = createState([{ id: 'me', name: 'Me', slot: 0, ready: true, connected: true }], seed, {
    solo: level,
    court: size,
  })
  const m = newHuman(seed)
  const st: BalanceStats = { humanWon: false, points: [0, 0], shots: [], seconds: 0, speeds: {} }
  let lastId = s.nextEventId - 1
  let shots = 0
  while (s.phase !== 'over' && s.tick < 20 * 60 * TICK_RATE) {
    const inputs: InputEvent<SpInput>[] = humanStep(s, 0, m, H).map((input) => ({ player: 'me', input }))
    game.tick(s, inputs)
    for (const e of s.events) {
      if (e.id <= lastId) continue
      if (e.k === 'serve') shots = 1
      else if (e.k === 'hit') {
        shots++
        // The launch speed (one drag step already applied this tick).
        ;(st.speeds[e.shot] ??= []).push(Math.hypot(s.shuttle.vel.x, s.shuttle.vel.y, s.shuttle.vel.z))
      } else if (e.k === 'point') {
        st.points[e.side]++
        st.shots.push(shots)
      }
    }
    lastId = s.nextEventId - 1
  }
  st.humanWon = s.winner === 0
  st.seconds = s.tick / TICK_RATE
  return st
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

interface Row {
  win: number
  share: number
  shots: number
  minutes: number
}

/** `n` deterministic matches of profile `H` vs `level` on `size`; launch speeds are pooled into `speeds`. */
function gauge(
  H: Profile,
  level: Level,
  n: number,
  speeds: Partial<Record<ShotKind, number[]>> = {},
  size: CourtSize = 'normal',
): Row {
  let win = 0
  let mine = 0
  let all = 0
  const shots: number[] = []
  const secs: number[] = []
  for (let i = 1; i <= n; i++) {
    const r = humanVsBot(H, level, 1000 * i + 7, size)
    if (r.humanWon) win++
    mine += r.points[0]
    all += r.points[0] + r.points[1]
    shots.push(...r.shots)
    secs.push(r.seconds)
    for (const [k, v] of Object.entries(r.speeds)) (speeds[k as ShotKind] ??= []).push(...v)
  }
  return { win: win / n, share: mine / all, shots: mean(shots), minutes: mean(secs) / 60 }
}

/**
 * Matches per gauge. Deterministic seeds; first-to-11 amplifies small point-share differences, so
 * fewer matches swing win rates by ±10%. ~0.03–0.1 s a match.
 */
const N = 80

// Measured at 973e671 before slice 10 (power swing), N = 80; the power-swing balance band
// ('power swing balance' below) holds every row near these.
// `tap` = casual who never charges.
export const BASELINE = {
  'casual v easy': { win: 0.9875, share: 0.763 },
  'casual v normal': { win: 0.5375, share: 0.512 },
  'casual v hard': { win: 0.05, share: 0.337 },
  'tap v easy': { win: 1, share: 0.76 },
  'tap v normal': { win: 0.425, share: 0.491 },
  'tap v hard': { win: 0.075, share: 0.348 },
  'skilled v easy': { win: 1, share: 0.918 },
  'skilled v normal': { win: 0.9625, share: 0.708 },
  'skilled v hard': { win: 0.625, share: 0.539 },
} satisfies Record<string, { win: number; share: number }>

// Tuning gauges, not truths. Measured at N (task-14 fix 2: proxies charging, taps 4–7 ticks long, reach
// judged from where each side stood): casual wins Easy 99%, Normal 54%, Hard 5%; skilled wins Hard 62.5%.
// The two Hard targets pull apart: point shares sit ~19–22 points apart (casual ~31–35%, skilled
// ~53–55%) for every Hard grade mix tried (task-14 report), so the Hard bands (casual ≥ 5%, skilled ≤ 65%)
// can't both have margin.
describe('balance vs scripted players (tuning gauges)', () => {
  it('casual: beats Easy, about even with Normal, wins vs Hard now and then; even rallies stay short', () => {
    const r = {
      easy: gauge(PROFILES.casual, 'easy', N),
      normal: gauge(PROFILES.casual, 'normal', N),
      hard: gauge(PROFILES.casual, 'hard', N),
    }
    expect(r.easy.win).toBeGreaterThanOrEqual(0.9)
    expect(r.normal.win).toBeGreaterThanOrEqual(0.45)
    expect(r.normal.win).toBeLessThanOrEqual(0.65)
    expect(r.hard.win).toBeGreaterThanOrEqual(0.05)
    expect(r.hard.win).toBeLessThan(r.normal.win)
    // Spec: 4–10 hits a rally between equal players (shots = serve + hits), at most 5 min a match.
    expect(r.normal.shots).toBeLessThanOrEqual(10.5)
    for (const l of ['easy', 'normal', 'hard'] as const) expect(r[l].minutes).toBeLessThanOrEqual(5)
  }, 60_000)

  it('skilled: beats Hard sometimes, not always; smash fastest, then drive, then clear', () => {
    const speeds: Partial<Record<ShotKind, number[]>> = {}
    const hard = gauge(PROFILES.skilled, 'hard', N, speeds)
    expect(hard.win).toBeGreaterThanOrEqual(0.2)
    expect(hard.win).toBeLessThanOrEqual(0.65)
    expect(hard.minutes).toBeLessThanOrEqual(5)
    const avg = (k: ShotKind) => mean(speeds[k] ?? [])
    expect(avg('smash')).toBeGreaterThan(avg('drive'))
    expect(avg('drive')).toBeGreaterThan(avg('clear'))
    if (process.env.BALANCE_LOG)
      console.warn(
        JSON.stringify({
          hard,
          speeds: Object.fromEntries(Object.keys(speeds).map((k) => [k, avg(k as ShotKind)])),
        }),
      )
  }, 60_000)

  it.runIf(process.env.BALANCE_LOG)(
    'logs the full table',
    () => {
      const rows: Record<string, Row> = {}
      for (const [name, H] of Object.entries(PROFILES))
        for (const l of ['easy', 'normal', 'hard'] as const)
          // BALANCE_ONLY=casual-normal (etc.) logs one row.
          if (!process.env.BALANCE_ONLY || process.env.BALANCE_ONLY === `${name}-${l}`)
            rows[`${name} v ${l}`] = gauge(H, l, N)
      console.warn(JSON.stringify(rows, null, 1))
    },
    120_000,
  )
})

/** A skilled defender: reacts this many ticks after the hit, plus this much accel slack. */
const DEF_REACT = 15
const DEF_SLACK = 6

/** Smash contacts (side 0 hitter) × aims: perfect timing, rng zero. */
const SMASH_GRID = [-1.5, 0, 1.5].flatMap((x) =>
  [-1.5, -2.5, -3.5].flatMap((z) =>
    [2.2, 2.6].flatMap((y) => [-1, 0, 1].map((heldX) => ({ from: { x, y, z }, heldX }))),
  ),
)

/** The defender at ready (0, +BASE_Z) can get within reach of some in-reach tick of the flight. */
function reachable(f: Flight): boolean {
  const g: Flight = { pos: { ...f.pos }, vel: { ...f.vel } }
  for (let t = 1; t < 600; t++) {
    if (stepShuttle(g).netHit || g.pos.y <= 0) return false
    const { x, y, z } = g.pos
    if (z <= 0 || y < REACH.minY || y > REACH.maxY) continue
    const run = (MOVE_SPEED * Math.max(0, t - DEF_REACT - DEF_SLACK)) / TICK_RATE
    if (Math.hypot(x, z - BASE_Z) - REACH.radius <= run) return true
  }
  return false
}

/** Ticks until the flight passes the defender's depth (or lands). */
function ticksToDefender(f: Flight): number {
  const g: Flight = { pos: { ...f.pos }, vel: { ...f.vel } }
  let t = 0
  while (t < 600 && g.pos.y > 0 && g.pos.z < BASE_Z) {
    if (stepShuttle(g).netHit) break
    t++
  }
  return t
}

const smashFlights = (charge: number): Flight[] =>
  SMASH_GRID.map(({ from, heldX }) => ({
    pos: { ...from },
    vel: launchFor('smash', 'perfect', from, shotTarget('smash', 0, heldX), () => 0, charge),
  }))

/** Gauge rows, computed once per profile × level (deterministic). */
const rowCache = new Map<string, Row>()
const rowOf = (name: keyof typeof PROFILES, level: Level): Row => {
  const key = `${name} v ${level}`
  let r = rowCache.get(key)
  if (!r) rowCache.set(key, (r = gauge(PROFILES[name], level, N)))
  return r
}
const LEVELS = ['easy', 'normal', 'hard'] as const

describe('power swing balance', () => {
  it('a full-charge Perfect smash is returnable by a well-placed defender (not an auto-win)', () => {
    const full = smashFlights(1)
    const tap = smashFlights(0)
    const share = (fs: Flight[]) => fs.filter(reachable).length / fs.length
    if (process.env.BALANCE_LOG)
      console.warn(
        JSON.stringify({
          returnable: { full: share(full), tap: share(tap) },
          ticksToDefender: { full: mean(full.map(ticksToDefender)), tap: mean(tap.map(ticksToDefender)) },
        }),
      )
    // A flat 0.6 bar fails even a tap (wide aims beat a reacting defender), so: a smash at the
    // defender is always reachable, and power costs at most 40% of the tap's reachable cases.
    const centre = full.filter((_, i) => SMASH_GRID[i].heldX === 0)
    expect(share(centre)).toBe(1)
    expect(share(full)).toBeGreaterThanOrEqual(0.6 * share(tap))
    expect(share(tap)).toBeGreaterThanOrEqual(share(full))
    expect(mean(full.map(ticksToDefender))).toBeLessThan(mean(tap.map(ticksToDefender)) - 2)
  })

  it('tap-only play stays viable vs every level', () => {
    const b = (l: Level) => BASELINE[`tap v ${l}`]
    const r = Object.fromEntries(LEVELS.map((l) => [l, rowOf('tap', l)])) as Record<Level, Row>
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ tap: r }))
    expect(r.easy.win).toBeGreaterThanOrEqual(Math.max(0.85, b('easy').win - 0.1))
    expect(r.normal.win).toBeGreaterThanOrEqual(b('normal').win - 0.1)
    expect(r.hard.win).toBeGreaterThanOrEqual(b('hard').win - 0.05)
    for (const l of LEVELS) expect(Math.abs(r[l].share - b(l).share)).toBeLessThanOrEqual(0.05)
  }, 60_000)

  it('AI win rate per difficulty stays in today’s band (casual + skilled)', () => {
    for (const name of ['casual', 'skilled'] as const)
      for (const l of LEVELS) {
        const r = rowOf(name, l)
        const b = BASELINE[`${name} v ${l}`]
        if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ [`${name} v ${l}`]: r }))
        expect(Math.abs(r.win - b.win), `${name} v ${l} win`).toBeLessThanOrEqual(0.1)
        expect(Math.abs(r.share - b.share), `${name} v ${l} share`).toBeLessThanOrEqual(0.05)
      }
  }, 90_000)
})

/** Matches per size gauge (sanity bars, not tuning bands). */
const N_SIZE = 40

// Bigger courts = more running for both sides: casual should still beat Easy and still lose to Hard.
describe('court size sanity gauges', () => {
  for (const size of ['large', 'xl'] as const)
    it(`${size}: casual still beats Easy, Hard still beats casual, matches end`, () => {
      const easy = gauge(PROFILES.casual, 'easy', N_SIZE, {}, size)
      const hard = gauge(PROFILES.casual, 'hard', N_SIZE, {}, size)
      if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ size, easy, hard }))
      expect(easy.win).toBeGreaterThanOrEqual(0.75)
      expect(hard.win).toBeLessThanOrEqual(0.5)
      for (const r of [easy, hard]) expect(r.minutes).toBeLessThanOrEqual(6)
    }, 60_000)
})

/** Jump-smash contacts: SMASH_GRID's spots and aims, met above the plain reach. */
const JUMP_GRID = SMASH_GRID.filter(({ from }) => from.y === 2.2).flatMap(({ from, heldX }) =>
  [3.0, 3.4].map((y) => ({ from: { ...from, y }, heldX })),
)

/** Lunge saves (side 0): low contacts all over the back court, every aim. */
const LUNGE_GRID = [-1.5, 0, 1.5].flatMap((x) =>
  [-1, -2, -3, -4, -5].flatMap((z) =>
    [0.3, 0.55, 0.8].flatMap((y) => [-1, 0, 1].map((heldX) => ({ from: { x, y, z }, heldX }))),
  ),
)

describe('jump / lunge balance', () => {
  it('the ability helps when used well, and is not always-best', () => {
    const plain = rowOf('casual', 'normal')
    const smart = gauge(PROFILES.casualSmart, 'normal', N)
    const spam = gauge(PROFILES.casualSpam, 'normal', N)
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ plain, smart, spam }))
    expect(smart.win).toBeGreaterThanOrEqual(plain.win) // worth learning
    expect(smart.win).toBeLessThanOrEqual(plain.win + 0.15) // not a cheat code
    expect(spam.win).toBeLessThan(smart.win) // pressing it always is worse
    expect(spam.share).toBeLessThanOrEqual(plain.share + 0.02) // spam ≈ no better than never
  }, 90_000)

  it('a Perfect jump-smash is returnable by a well-placed defender', () => {
    const jump = JUMP_GRID.map(({ from, heldX }) => {
      const shot = abilityShot('jump', { x: heldX, z: 0 }, 'perfect')
      return {
        heldX,
        f: {
          pos: { ...from },
          vel: launchFor(shot.kind, shot.grade, from, shotTarget(shot.kind, 0, heldX), () => 0, shot.charge),
        } as Flight,
      }
    })
    const share = (fs: Flight[]) => fs.filter(reachable).length / fs.length
    const all = jump.map((j) => j.f)
    if (process.env.BALANCE_LOG)
      console.warn(JSON.stringify({ jumpReturnable: share(all), tap: share(smashFlights(0)) }))
    expect(abilityShot('jump', { x: 0, z: 0 }, 'perfect')).toEqual({
      kind: 'smash',
      grade: 'perfect',
      charge: ABILITY.jump.charge,
    })
    expect(share(jump.filter((j) => j.heldX === 0).map((j) => j.f))).toBe(1)
    expect(share(all)).toBeGreaterThanOrEqual(0.6 * share(smashFlights(0)))
  })

  it('a lunge lift gives the opponent a smash chance', () => {
    let smashable = 0
    for (const { from, heldX } of LUNGE_GRID) {
      const shot = abilityShot('lunge', { x: heldX, z: 0 }, 'perfect')
      const g: Flight = {
        pos: { ...from },
        vel: launchFor(shot.kind, shot.grade, from, shotTarget(shot.kind, 0, heldX), () => 0.5, shot.charge),
      }
      for (let t = 0; t < 600; t++) {
        if (stepShuttle(g).netHit || g.pos.y <= 0) break
        if (g.pos.z > 0 && g.pos.y >= REACH.smashY && g.pos.y <= REACH.maxY) {
          smashable++
          break
        }
      }
    }
    if (process.env.BALANCE_LOG)
      console.warn(JSON.stringify({ lungeSmashable: smashable / LUNGE_GRID.length }))
    expect(smashable / LUNGE_GRID.length).toBeGreaterThanOrEqual(0.7)
  })
})
