// Test-only harness for the balance gauges (balance*.test.ts): scripted human players, match runners,
// gauges and shot grids.
// Balance vs a "reasonable human": a scripted player with human-ish limits (reacts ~250 ms after the
// opponent's hit, runs to where the shuttle comes down, swings with timing error ~N(0, 6 ticks), picks
// shots at random). Pins the difficulty targets: beats Easy most matches, Normal about even, Hard
// sometimes. Also checks the smash is the fastest shot off the racket.
import { random } from '@forge/core/rng'
import type { InputEvent } from '@forge/net/session'
import { isIn, predictLanding, stepShuttle, type Flight } from './physics'
import { coverDepth, homeSpot } from './ai'
import { coverSpot, mateOf, takerOf } from './doubles'
import { ABILITY, actReady, horizonOf, leadOf, pickAbility, reachOf, type Strike } from './ability'
import { type CourtSize } from './courtsize'
import { findContact, launchFor, REACH, shotTarget, type ShotKind } from './shots'
import {
  canSwing,
  createState,
  serverPlayer,
  setupDoubles,
  shuttlePopGame as game,
  MOVE_SPEED,
  NET_MARGIN,
  setupBots,
  TICK_RATE,
  toWorld,
  type Level,
  type SpInput,
  type SpPlayer,
  type SpState,
} from './sim'
import { racketHits, stunImmune, stunned } from './stun'
import { acting } from './ability'

/** A scripted player's limits. */
export interface Profile {
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
  /**
   * A net bonker (default off): after its own shot it rushes the net opposite the opponent, and swings
   * at them whenever they're in racket reach and not immune (stun.ts); otherwise plays as the profile.
   */
  bonk?: boolean
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

export const PROFILES = {
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
  /** Casual who tries to bonk the computer: rushes the net after each shot and swings at its body. */
  casualBonker: { ...casual, bonk: true },
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
  /** Doubles: this shot is the teammate's; `target` is the cover spot. */
  cover: boolean
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
  cover: false,
  rng: { seed: seed ^ 0x5bd1e995 },
})

function gauss(m: HumanMem): number {
  const u = Math.max(1e-9, random(m.rng))
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random(m.rng))
}

const scratch: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }

/** Where to stand: a spot on the flight I can reach in time, as near the comfy height as possible. */
function meet(s: SpState, idx: number): { x: number; z: number; high: boolean; late: boolean; apex: number } {
  const me = s.players[idx]
  const side = me.side
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

function moveTo(s: SpState, idx: number, to: { x: number; z: number }): SpInput {
  const p = s.players[idx]
  const dx = to.x - p.x
  const dz = to.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < 0.05) return { t: 'move', x: 0, z: 0 }
  const k = Math.min(1, d / 0.4) / d
  const v = toWorld(p.side, dx * k, dz * k)
  return { t: 'move', x: v.x, z: v.z }
}

/**
 * The scripted human's inputs this tick (seat `idx` in s.players; 1v1: 0). With a teammate it plays like
 * a cooperative partner: takes the shots nearest it (doubles.ts takerOf), else covers the other half.
 */
function humanStep(s: SpState, idx: number, m: HumanMem, H: Profile): SpInput[] {
  const me = s.players[idx]
  const side = me.side
  const mate = mateOf(s.players, me)
  const base = homeSpot(s, me, mate)
  if (s.phase === 'serve') {
    m.planFor = -1
    m.releaseAt = -1
    if (serverPlayer(s) === me && s.phaseT === SERVE_AT)
      return [{ t: 'swing', x: 0, z: random(m.rng) < 0.4 ? -1 : 0, tick: s.tick }]
    // A press the rally ended on: let go (no swing).
    if (me.chargeAt !== -1)
      return [
        { t: 'move', x: 0, z: 0 },
        { t: 'charge', cancel: true },
      ]
    return [{ t: 'move', x: 0, z: 0 }]
  }
  if (s.phase !== 'rally') return [{ t: 'move', x: 0, z: 0 }]
  const opp = side === 0 ? 1 : 0
  if (H.bonk) {
    const them = s.players.find((q) => q.side === opp)!
    // Swing at the body (no button held, no tap in progress): the sim judges it at s.tick + 1.
    if (
      me.chargeAt === -1 &&
      m.releaseAt < 0 &&
      racketHits(me, them) &&
      !stunImmune(them.stunAt, s.tick + 1) &&
      canSwing({ ...s, tick: s.tick + 1 }, me)
    )
      return [
        { t: 'move', x: 0, z: 0 },
        { t: 'swing', x: 0, z: 0, tick: s.tick + 1 },
      ]
  }
  // A tap's button-up (graded at its press).
  if (m.releaseAt >= 0 && s.tick >= m.releaseAt) {
    m.releaseAt = -1
    const kinds = [-1, 0, 1]
    const z = kinds[Math.floor(random(m.rng) * 3)]
    return [moveTo(s, idx, m.target), { t: 'swing', x: random(m.rng) * 2 - 1, z, tick: s.tick + 1 }]
  }
  if (H.bonk && s.shuttle.lastHitter === side) {
    // After my own shot: to the net, opposite the opponent.
    const lim = s.court.halfWidth
    const x = Math.max(-lim, Math.min(lim, s.players.find((q) => q.side === opp)!.x))
    return [moveTo(s, idx, { x, z: (side === 0 ? -1 : 1) * (NET_MARGIN + 0.05) })]
  }
  if (s.shuttle.lastHitter !== opp) return [moveTo(s, idx, base)]
  let shot = -1
  for (const e of s.events)
    if ((e.k === 'hit' || e.k === 'serve') && e.side === opp) shot = Math.max(shot, e.tick)
  if (shot < 0 && m.planFor < 0) return [moveTo(s, idx, base)]
  if (s.tick < shot + H.reactTicks) return [moveTo(s, idx, base)]
  if (shot >= 0 && m.planFor !== shot) {
    m.planFor = shot
    m.cover = false
    const land = predictLanding(s.shuttle)
    const nearLine =
      Math.abs(Math.abs(land.pos.x) - s.court.halfWidth) < H.unsureLine ||
      Math.abs(Math.abs(land.pos.z) - s.court.halfLen) < H.unsureLine
    m.play = !land.netHit && (nearLine ? random(m.rng) < 0.5 : isIn(land.pos, side, s.court))
    const spot = meet(s, idx)
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
    // Doubles: leave it to a nearer teammate and cover the other half (after the draws above: 1v1 unchanged).
    if (m.play && mate) {
      const busy = (p: SpPlayer) => stunned(p.stunAt, s.tick) || acting(p.act, s.tick)
      const taker = takerOf(s.players, side, land.pos, busy)
      if (taker && taker !== me) {
        m.play = false
        m.cover = true
        const landX = toWorld(side, land.pos.x, land.pos.z).x
        m.target = coverSpot(s.court, side, landX, toWorld(side, me.x, me.z).x, coverDepth(s.court))
      }
    }
  }
  if (!m.play) return [moveTo(s, idx, m.cover ? m.target : base)]
  const out: SpInput[] = [moveTo(s, idx, m.target)]
  if (m.swung) return out
  if (H.ability === 'smart' || H.ability === 'spam') {
    const pressed = abilityStep(s, idx, m, H)
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
function abilityStep(s: SpState, idx: number, m: HumanMem, H: Profile): SpInput | null {
  const me = s.players[idx]
  const side = me.side
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
      (m.act === 'lunge' && !meet(s, idx).late))
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
  /** Racket bonks (either way). */
  bonks: number
}

/** One match: scripted human (side 0) vs the computer at `level`, on the `size` court. */
function humanVsBot(H: Profile, level: Level, seed: number, size: CourtSize = 'normal'): BalanceStats {
  const s = createState([{ id: 'me', name: 'Me', slot: 0, ready: true, connected: true }], seed, {
    solo: level,
    court: size,
  })
  const m = newHuman(seed)
  const st: BalanceStats = { humanWon: false, points: [0, 0], shots: [], seconds: 0, speeds: {}, bonks: 0 }
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
      } else if (e.k === 'bonk') st.bonks++
    }
    lastId = s.nextEventId - 1
  }
  st.humanWon = s.winner === 0
  st.seconds = s.tick / TICK_RATE
  return st
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

export interface Row {
  win: number
  share: number
  shots: number
  minutes: number
  /** Points played and racket bonks (either way) over the gauge. */
  points: number
  bonks: number
}

/** `n` deterministic matches of profile `H` vs `level` on `size`; launch speeds are pooled into `speeds`. */
export function gauge(
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
  let bonks = 0
  for (let i = 1; i <= n; i++) {
    const r = humanVsBot(H, level, 1000 * i + 7, size)
    if (r.humanWon) win++
    mine += r.points[0]
    all += r.points[0] + r.points[1]
    shots.push(...r.shots)
    secs.push(r.seconds)
    bonks += r.bonks
    for (const [k, v] of Object.entries(r.speeds)) (speeds[k as ShotKind] ??= []).push(...v)
  }
  return { win: win / n, share: mine / all, shots: mean(shots), minutes: mean(secs) / 60, points: all, bonks }
}

/**
 * Matches per gauge. Deterministic seeds; first-to-11 amplifies small point-share differences, so
 * fewer matches swing win rates by ±10%. ~0.03–0.1 s a match.
 */
export const N = 80

// Measured at 973e671 before slice 10 (power swing), N = 80; the power-swing balance band
// ('power swing balance', balance-power.simulation.test.ts) holds every row near these.
// `tap` = casual who never charges. Re-measured after the 2026-11-12 AI retune (the computer always swings;
// its misses are visible whiffs / Late floaters; ai.ts LEVELS): every row still inside its band, e.g.
// casual 0.988 / 0.525 / 0.087 win and 0.721 / 0.504 / 0.343 share v easy / normal / hard (N = 80), with
// longer rallies (casual shots per point 3.63 / 5.90 / 6.03, was 3.48 / 5.69 / 5.86).
// Normal rows re-measured for the 2026-11-13 bot retune (dive saves, smash defence, whiff 0.15: asked
// to be a bit tougher); the rest are unchanged.
export const BASELINE = {
  'casual v easy': { win: 0.9875, share: 0.763 },
  'casual v normal': { win: 0.3875, share: 0.464 },
  'casual v hard': { win: 0.05, share: 0.337 },
  'tap v easy': { win: 1, share: 0.76 },
  'tap v normal': { win: 0.3625, share: 0.458 },
  'tap v hard': { win: 0.075, share: 0.348 },
  'skilled v easy': { win: 1, share: 0.918 },
  'skilled v normal': { win: 0.95, share: 0.673 },
  'skilled v hard': { win: 0.625, share: 0.539 },
} satisfies Record<string, { win: number; share: number }>

/** A skilled defender: reacts this many ticks after the hit, plus this much accel slack. */
const DEF_REACT = 15
const DEF_SLACK = 6

/** Smash contacts (side 0 hitter) × aims: perfect timing, rng zero. */
export const SMASH_GRID = [-1.5, 0, 1.5].flatMap((x) =>
  [-1.5, -2.5, -3.5].flatMap((z) =>
    [2.2, 2.6].flatMap((y) => [-1, 0, 1].map((heldX) => ({ from: { x, y, z }, heldX }))),
  ),
)

/** The defender at ready (0, +BASE_Z) can get within reach of some in-reach tick of the flight. */
export function reachable(f: Flight): boolean {
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
export function ticksToDefender(f: Flight): number {
  const g: Flight = { pos: { ...f.pos }, vel: { ...f.vel } }
  let t = 0
  while (t < 600 && g.pos.y > 0 && g.pos.z < BASE_Z) {
    if (stepShuttle(g).netHit) break
    t++
  }
  return t
}

export const smashFlights = (charge: number): Flight[] =>
  SMASH_GRID.map(({ from, heldX }) => ({
    pos: { ...from },
    vel: launchFor('smash', 'perfect', from, shotTarget('smash', 0, heldX), () => 0, charge),
  }))

/** Gauge rows, computed once per profile × level (deterministic). */
const rowCache = new Map<string, Row>()
export const rowOf = (name: keyof typeof PROFILES, level: Level): Row => {
  const key = `${name} v ${level}`
  let r = rowCache.get(key)
  if (!r) rowCache.set(key, (r = gauge(PROFILES[name], level, N)))
  return r
}
export const LEVELS = ['easy', 'normal', 'hard'] as const

/** Matches per size gauge (sanity bars, not tuning bands). */
export const N_SIZE = 40

/** Jump-smash contacts: SMASH_GRID's spots and aims, met above the plain reach. */
export const JUMP_GRID = SMASH_GRID.filter(({ from }) => from.y === 2.2).flatMap(({ from, heldX }) =>
  [3.0, 3.4].map((y) => ({ from: { ...from, y }, heldX })),
)

/** Lunge saves (side 0): low contacts all over the back court, every aim. */
export const LUNGE_GRID = [-1.5, 0, 1.5].flatMap((x) =>
  [-1, -2, -3, -4, -5].flatMap((z) =>
    [0.3, 0.55, 0.8].flatMap((y) => [-1, 0, 1].map((heldX) => ({ from: { x, y, z }, heldX }))),
  ),
)

/** Bot v bot matches for the bonk-rarity gauge. */
export const N_BOTS = 20

/** `n` bot v bot matches at `level`: points played and racket bonks (either way). */
export function botBonks(level: Level, n: number): { points: number; bonks: number } {
  const r = { points: 0, bonks: 0 }
  for (let i = 1; i <= n; i++) {
    const s = setupBots(level, level, 1000 * i + 7)
    let lastId = s.nextEventId - 1
    while (s.phase !== 'over' && s.tick < 20 * 60 * TICK_RATE) {
      game.tick(s, [])
      for (const e of s.events) {
        if (e.id <= lastId) continue
        if (e.k === 'point') r.points++
        else if (e.k === 'bonk') r.bonks++
      }
      lastId = s.nextEventId - 1
    }
  }
  return r
}

/** Matches per doubles gauge (sanity bars, not tuning bands). */
export const N_DUBS = 40

export interface DubsRow {
  /** Side 0's match win rate and point share. */
  win: number
  share: number
  points: number
  /** Shots per point. */
  shots: number
  /** Side 0's hits by the scripted human ('me') over all side-0 hits (0 when no human). */
  humanShare: number
  /** Share of rally side-ticks with both teammates of a side < 1.0 m apart. */
  close: number
  /** Racket bonks on a teammate (swinger and victim on one side) and on an opponent. */
  friendly: number
  foes: number
}

/** `n` doubles matches from `make(seed)`, side 0's 'me' (if any) driven by profile `H`. */
function dubsGauge(make: (seed: number) => SpState, n: number, H?: Profile): DubsRow {
  const r = {
    win: 0,
    points0: 0,
    points: 0,
    shots: 0,
    mine: 0,
    team: 0,
    rally: 0,
    close: 0,
    friendly: 0,
    foes: 0,
  }
  for (let i = 1; i <= n; i++) {
    const seed = 1000 * i + 7
    const s = make(seed)
    const me = s.players.findIndex((p) => p.id === 'me')
    const m = newHuman(seed)
    const sideOf = new Map(s.players.map((p) => [p.id, p.side]))
    let lastId = s.nextEventId - 1
    let shots = 0
    while (s.phase !== 'over' && s.tick < 20 * 60 * TICK_RATE) {
      const inputs: InputEvent<SpInput>[] =
        me >= 0 && H ? humanStep(s, me, m, H).map((input) => ({ player: 'me', input })) : []
      game.tick(s, inputs)
      if (s.phase === 'rally')
        for (const side of [0, 1] as const) {
          const [a, b] = s.players.filter((p) => p.side === side)
          if (!b) continue
          r.rally++
          if (Math.hypot(a.x - b.x, a.z - b.z) < 1) r.close++
        }
      for (const e of s.events) {
        if (e.id <= lastId) continue
        if (e.k === 'serve') shots = 1
        else if (e.k === 'hit') {
          shots++
          if (e.side === 0) {
            r.team++
            if (e.by === 'me') r.mine++
          }
        } else if (e.k === 'point') {
          r.points++
          if (e.side === 0) r.points0++
          r.shots += shots
        } else if (e.k === 'bonk') {
          if (sideOf.get(e.by) === e.side) r.friendly++
          else r.foes++
        }
      }
      lastId = s.nextEventId - 1
    }
    if (s.winner === 0) r.win++
  }
  return {
    win: r.win / n,
    share: r.points0 / r.points,
    points: r.points,
    shots: r.shots / r.points,
    humanShare: r.mine / Math.max(1, r.team),
    close: r.close / Math.max(1, r.rally),
    friendly: r.friendly,
    foes: r.foes,
  }
}

/** Scripted human 'me' at seat 0 + the computer at seat 2 vs the computer at seats 1, 3, all at `level`. */
const teamVsBots = (level: Level) => (seed: number) =>
  createState([{ id: 'me', name: 'Me', slot: 0, ready: true, connected: true }], seed, {
    mode: '2v2',
    solo: level,
  })
const allBots = (level: Level) => (seed: number) => setupDoubles([level, level, level, level], seed)

const dubsCache = new Map<string, DubsRow>()
export const dubsOf = (name: keyof typeof PROFILES | 'bots', level: Level): DubsRow => {
  const key = `${name} v ${level}`
  let r = dubsCache.get(key)
  if (!r)
    dubsCache.set(
      key,
      (r =
        name === 'bots'
          ? dubsGauge(allBots(level), N_DUBS)
          : dubsGauge(teamVsBots(level), N_DUBS, PROFILES[name])),
    )
  if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ [`2v2 ${key}`]: r }))
  return r
}

const bots1v1 = new Map<Level, DubsRow>()
/** The same runner on 1v1 bot matches (rally length reference). */
export const bots1v1Of = (level: Level): DubsRow => {
  let r = bots1v1.get(level)
  if (!r) bots1v1.set(level, (r = dubsGauge((seed) => setupBots(level, level, seed), N_DUBS)))
  return r
}

/** Every human + AI row the doubles gauges read. */
export const HUMAN_ROWS = [
  ['skilled', 'easy'],
  ['skilled', 'normal'],
  ['skilled', 'hard'],
  ['casual', 'easy'],
  ['casual', 'normal'],
  ['tap', 'normal'],
] as const
