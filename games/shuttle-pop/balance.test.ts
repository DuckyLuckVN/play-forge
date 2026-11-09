// Balance vs a "reasonable human": a scripted player with human-ish limits (reacts ~250 ms after the
// opponent's hit, runs to where the shuttle comes down, swings with timing error ~N(0, 6 ticks), picks
// shots at random). Pins the difficulty targets: beats Easy most matches, Normal about even, Hard
// sometimes. Also checks the smash is the fastest shot off the racket.
import { describe, expect, it } from 'vitest'
import { random } from '@forge/core/rng'
import type { InputEvent } from '@forge/net/session'
import { COURT, isIn, predictLanding, stepShuttle, type Flight } from './physics'
import { findContact, REACH, type ShotKind } from './shots'
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

/** The scripted human's limits. */
const HUMAN = {
  /** ~250 ms from the opponent's hit to moving with intent. */
  reactTicks: 15,
  /** Swing timing error σ, ticks (≈ 100 ms). */
  timingSigma: 6,
  /** Where they end up vs where they meant to stand, σ metres. */
  posSigma: 0.25,
  /** Line calls this close (m) to a line are a coin flip. */
  unsureLine: 0.2,
  serveAt: 40,
  baseZ: 3.2,
}

interface HumanMem {
  /** Tick of the opponent shot the plan is for (-1 = none). */
  planFor: number
  play: boolean
  target: { x: number; z: number }
  err: number
  contactAt: number
  swung: boolean
  rng: { seed: number }
}

const newHuman = (seed: number): HumanMem => ({
  planFor: -1,
  play: false,
  target: { x: 0, z: 0 },
  err: 0,
  contactAt: -1,
  swung: false,
  rng: { seed: seed ^ 0x5bd1e995 },
})

function gauss(m: HumanMem): number {
  const u = Math.max(1e-9, random(m.rng))
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random(m.rng))
}

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

/** Where to stand: a spot on the flight I can reach in time, as near the comfy height as possible. */
function meet(s: SpState, side: 0 | 1): { x: number; z: number } {
  const me = s.players[side]
  Object.assign(scratch.pos, s.shuttle.pos)
  Object.assign(scratch.vel, s.shuttle.vel)
  const land = predictLanding(s.shuttle)
  // Lobs are met high (a smash chance); everything else at chest height.
  let apex = s.shuttle.pos.y
  const speed = MOVE_SPEED / TICK_RATE
  let best = { x: land.pos.x, z: land.pos.z }
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
      best = { x: p.x, z: p.z }
    }
  }
  return best
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
function humanStep(s: SpState, side: 0 | 1, m: HumanMem): SpInput[] {
  const back = side === 0 ? -1 : 1
  const base = { x: 0, z: back * HUMAN.baseZ }
  if (s.phase === 'serve') {
    m.planFor = -1
    if (s.server === side && s.phaseT === HUMAN.serveAt)
      return [{ t: 'swing', x: 0, z: random(m.rng) < 0.4 ? -1 : 0, tick: s.tick }]
    return [{ t: 'move', x: 0, z: 0 }]
  }
  if (s.phase !== 'rally') return [{ t: 'move', x: 0, z: 0 }]
  const opp = side === 0 ? 1 : 0
  if (s.shuttle.lastHitter !== opp) return [moveTo(s, side, base)]
  let shot = -1
  for (const e of s.events)
    if ((e.k === 'hit' || e.k === 'serve') && e.side === opp) shot = Math.max(shot, e.tick)
  if (shot < 0 && m.planFor < 0) return [moveTo(s, side, base)]
  if (s.tick < shot + HUMAN.reactTicks) return [moveTo(s, side, base)]
  if (shot >= 0 && m.planFor !== shot) {
    m.planFor = shot
    const land = predictLanding(s.shuttle)
    const nearLine =
      Math.abs(Math.abs(land.pos.x) - COURT.halfWidth) < HUMAN.unsureLine ||
      Math.abs(Math.abs(land.pos.z) - COURT.halfLen) < HUMAN.unsureLine
    m.play = !land.netHit && (nearLine ? random(m.rng) < 0.5 : isIn(land.pos, side))
    const spot = meet(s, side)
    m.target = { x: spot.x + gauss(m) * HUMAN.posSigma, z: spot.z + gauss(m) * HUMAN.posSigma }
    m.err = Math.round(gauss(m) * HUMAN.timingSigma)
    m.contactAt = -1
    m.swung = false
  }
  if (!m.play) return [moveTo(s, side, base)]
  const out: SpInput[] = [moveTo(s, side, m.target)]
  if (m.swung) return out
  const me = s.players[side]
  // The sim judges this tick's swing at s.tick + 1; track the contact until it passes.
  if (m.contactAt < 0 || m.contactAt > s.tick + 1) {
    const c = findContact(s.shuttle, me, 0, 120)
    if (c) m.contactAt = s.tick + 1 + c.dt
  }
  if (m.contactAt >= 0 && s.tick + 1 >= m.contactAt - m.err) {
    m.swung = true
    const kinds = [-1, 0, 1]
    const z = kinds[Math.floor(random(m.rng) * 3)]
    out.push({ t: 'swing', x: random(m.rng) * 2 - 1, z, tick: s.tick + 1 })
  }
  return out
}

interface BalanceStats {
  humanWon: boolean
  points: [number, number]
  /** Shots per point. */
  shots: number[]
  seconds: number
  speeds: Partial<Record<ShotKind, number[]>>
}

/** One match: scripted human (side 0) vs the computer at `level`. */
function humanVsBot(level: Level, seed: number): BalanceStats {
  const s = createState([{ id: 'me', name: 'Me', slot: 0, ready: true, connected: true }], seed, {
    solo: level,
  })
  const m = newHuman(seed)
  const st: BalanceStats = { humanWon: false, points: [0, 0], shots: [], seconds: 0, speeds: {} }
  let lastId = s.nextEventId - 1
  let shots = 0
  while (s.phase !== 'over' && s.tick < 20 * 60 * TICK_RATE) {
    const inputs: InputEvent<SpInput>[] = humanStep(s, 0, m).map((input) => ({ player: 'me', input }))
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

/** Matches per level (deterministic seeds); ~1/3 s each. */
const N = 30

describe('balance vs a reasonable human', () => {
  it('beats Easy most matches, Normal about even, Hard sometimes; smash fastest, then drive, then clear', () => {
    const rows = {} as Record<Level, { win: number; share: number; shots: number; minutes: number }>
    const speeds: Partial<Record<ShotKind, number[]>> = {}
    for (const level of ['easy', 'normal', 'hard'] as const) {
      let win = 0
      let mine = 0
      let all = 0
      const shots: number[] = []
      const secs: number[] = []
      for (let i = 1; i <= N; i++) {
        const r = humanVsBot(level, 1000 * i + 7)
        if (r.humanWon) win++
        mine += r.points[0]
        all += r.points[0] + r.points[1]
        shots.push(...r.shots)
        secs.push(r.seconds)
        for (const [k, v] of Object.entries(r.speeds)) (speeds[k as ShotKind] ??= []).push(...v)
      }
      rows[level] = { win: win / N, share: mine / all, shots: mean(shots), minutes: mean(secs) / 60 }
    }
    const avg = (k: ShotKind) => mean(speeds[k] ?? [])
    expect(rows.easy.win).toBeGreaterThanOrEqual(0.75)
    expect(rows.normal.win).toBeGreaterThanOrEqual(0.4)
    expect(rows.normal.win).toBeLessThanOrEqual(0.6)
    expect(rows.hard.win).toBeGreaterThanOrEqual(0.1)
    expect(rows.hard.win).toBeLessThan(rows.normal.win)
    // Even matches stay in the spec's 3–5 min.
    for (const l of ['normal', 'hard'] as const) {
      expect(rows[l].minutes).toBeGreaterThanOrEqual(3)
      expect(rows[l].minutes).toBeLessThanOrEqual(5.5)
    }
    expect(avg('smash')).toBeGreaterThan(avg('drive'))
    expect(avg('drive')).toBeGreaterThan(avg('clear'))
  }, 60_000)
})
