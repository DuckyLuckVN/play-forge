// Match simulation: host-authoritative, pure data in/out, JSON-serialisable.
// Side 0 owns z < 0, side 1 owns z > 0. Inputs are view-relative (x = screen right, z = toward the net).
import { random } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { botStep, newBotMemory, type BotMemory } from './ai'
import { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld } from './court'
import { t } from './i18n'
import { COURT, DT, stepShuttle, type Flight, type Vec3 } from './physics'
import { award, serveBox, winner } from './rules'
import {
  chooseShot,
  findContact,
  gradeOf,
  launchFor,
  REACH,
  shotTarget,
  WINDOW,
  type Grade,
  type ShotKind,
} from './shots'

export { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld }
export const AI_ID = 'ai'
/** MOVE_SPEED is reached after ~ACCEL_TICKS ticks. */
const ACCEL_TICKS = 6
const ACCEL = MOVE_SPEED / (ACCEL_TICKS * DT)
/** How far past the side/back lines a player may run to chase a shuttle. */
const OUT_MARGIN = 0.8
/** Ticks between the rally's end and the next serve (or the results). */
export const POINT_TICKS = 72
/** Ticks before a player can swing again (stops swing-mashing). */
export const SWING_COOLDOWN = 20
/** Ticks in the serve phase before the server short-serves automatically (idle player / AI). */
export const SERVE_TIMEOUT = 300
/** A scheduled hit whiffs if the swinger is further than REACH.radius + this from the shuttle. */
const PENDING_SLACK = 0.3
const EVENT_TICKS = 60
/** Lag fairness: a guest's swing is judged up to this many ticks back (~117 ms). */
export const MAX_REWIND = 7
/** Covers MAX_REWIND + WINDOW.pastGrace (12) + margin. */
const HISTORY_TICKS = 24
export const PRESETS = 4

/** Serve stance: view-relative offsets from the centre line / behind the short line. */
export const SERVE_X = 0.6
export const SERVE_BACK = 0.5
/** Receiver stance in the diagonal box: view-relative x, metres behind the short line. Short serves land in reach. */
export const RECEIVE_X = 1.0
export const RECEIVE_BACK = 1.2
/** Shuttle held in the server's hand: forward of the body, height. */
const HAND_FWD = 0.35
const HAND_Y = 1.0

export type Level = 'easy' | 'normal' | 'hard'

export type SpInput =
  | { t: 'move'; x: number; z: number }
  /** `tick` = the state tick the guest saw (lag rewind); the host's own swings leave it out (no rewind). */
  | { t: 'swing'; x: number; z: number; tick?: number }
  | { t: 'pick'; preset: number }

export interface SpPlayer {
  id: string
  name: string
  kind: 'human' | 'ai'
  side: 0 | 1
  x: number
  z: number
  vx: number
  vz: number
  /** Held direction, view-relative, length ≤ 1. */
  move: { x: number; z: number }
  /** Tick of the last swing. */
  swingAt: number
  preset: number
  level?: Level
  /** AI seats: the bot's cached plan (see ai.ts). */
  bot?: BotMemory
}

export type SpEvent = { id: number; tick: number } & (
  | { k: 'hit'; side: 0 | 1; grade: Grade; shot: ShotKind }
  | { k: 'whiff'; side: 0 | 1 }
  | { k: 'land'; x: number; z: number; in: boolean }
  | { k: 'net' }
  | { k: 'point'; side: 0 | 1 }
  | { k: 'serve'; side: 0 | 1 }
)
type EventBody = SpEvent extends infer E ? (E extends SpEvent ? Omit<E, 'id' | 'tick'> : never) : never

export interface SpState {
  tick: number
  phase: 'serve' | 'rally' | 'point' | 'over'
  /** Ticks spent in the current phase. */
  phaseT: number
  players: [SpPlayer, SpPlayer]
  shuttle: Flight & {
    lastHitter: -1 | 0 | 1
    /** A connected swing whose contact tick is still ahead. aimX = held view-relative x at the swing. */
    pending: null | { atTick: number; side: 0 | 1; kind: ShotKind; grade: Grade; aimX: number }
  }
  score: [number, number]
  server: 0 | 1
  winner: -1 | 0 | 1
  /** Last EVENT_TICKS ticks of events; renderers dedupe by id. */
  events: SpEvent[]
  nextEventId: number
  /** For the results screen: shots in this rally (serve + hits), the longest finished rally, Perfect hits per side. */
  stats: { shots: number; longest: number; perfect: [number, number] }
  /** Seeded rng state (mulberry32 seed). Host-only. */
  rng: number
  /** Host-only: shuttle flight as of each of the last HISTORY_TICKS ticks (for swing rewind). */
  history: { tick: number; pos: Vec3; vel: Vec3 }[]
}

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0)

function rand(state: SpState): number {
  const r = { seed: state.rng }
  const v = random(r)
  state.rng = r.seed
  return v
}

function emit(state: SpState, body: EventBody) {
  state.events.push({ id: state.nextEventId++, tick: state.tick, ...body } as SpEvent)
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Finite, length ≤ 1 (no faster diagonals). Junk → 0. */
function clampDir(x: unknown, z: unknown): { x: number; z: number } {
  const fx = finite(x) ? x : 0
  const fz = finite(z) ? z : 0
  const len = Math.hypot(fx, fz)
  return len > 1 ? { x: fx / len, z: fz / len } : { x: fx, z: fz }
}

/**
 * Movement integration: velocity eases toward move × MOVE_SPEED (full speed in ~ACCEL_TICKS ticks),
 * position stays on the player's own half (NET_MARGIN from the net, OUT_MARGIN past the lines).
 * Mutates p. Shared with guest prediction.
 */
export function stepPlayer(p: Pick<SpPlayer, 'side' | 'x' | 'z' | 'vx' | 'vz' | 'move'>, dt: number): void {
  const want = toWorld(p.side, p.move.x * MOVE_SPEED, p.move.z * MOVE_SPEED)
  let dvx = want.x - p.vx
  let dvz = want.z - p.vz
  const dv = Math.hypot(dvx, dvz)
  const maxDv = ACCEL * dt
  if (dv > maxDv) {
    dvx *= maxDv / dv
    dvz *= maxDv / dv
  }
  p.vx += dvx
  p.vz += dvz
  p.x += p.vx * dt
  p.z += p.vz * dt
  const xMax = COURT.halfWidth + OUT_MARGIN
  if (Math.abs(p.x) > xMax) {
    p.x = Math.sign(p.x) * xMax
    p.vx = 0
  }
  const zMin = p.side === 0 ? -COURT.halfLen - OUT_MARGIN : NET_MARGIN
  const zMax = p.side === 0 ? -NET_MARGIN : COURT.halfLen + OUT_MARGIN
  if (p.z < zMin || p.z > zMax) {
    p.z = Math.min(zMax, Math.max(zMin, p.z))
    p.vz = 0
  }
}

/** Server in their box (even own score → right), receiver in the diagonal box; shuttle in hand. */
function resetForServe(state: SpState) {
  const server = state.server
  const { xSign } = serveBox(server, state.score[server])
  for (const p of state.players) {
    const serving = p.side === server
    const pos = serving
      ? toWorld(p.side, xSign * SERVE_X, -(COURT.shortLine + SERVE_BACK))
      : toWorld(p.side, xSign * RECEIVE_X, -(COURT.shortLine + RECEIVE_BACK))
    p.x = pos.x
    p.z = pos.z
    p.vx = 0
    p.vz = 0
  }
  state.phase = 'serve'
  state.phaseT = 0
  state.shuttle.lastHitter = -1
  state.shuttle.pending = null
  holdShuttle(state)
}

function holdShuttle(state: SpState) {
  const p = state.players[state.server]
  const fwd = toWorld(p.side, 0, HAND_FWD)
  const s = state.shuttle
  s.pos.x = p.x + fwd.x
  s.pos.y = HAND_Y
  s.pos.z = p.z + fwd.z
  s.vel.x = 0
  s.vel.y = 0
  s.vel.z = 0
}

const makePlayer = (
  id: string,
  name: string,
  kind: 'human' | 'ai',
  side: 0 | 1,
  level?: Level,
): SpPlayer => ({
  id,
  name,
  kind,
  side,
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  move: { x: 0, z: 0 },
  swingAt: -SWING_COOLDOWN,
  preset: side,
  ...(level ? { level } : {}),
})

const LEVELS: readonly Level[] = ['easy', 'normal', 'hard']

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): SpState {
  const level: Level = LEVELS.includes(options.solo as Level) ? (options.solo as Level) : 'normal'
  const state: SpState = {
    tick: 0,
    phase: 'serve',
    phaseT: 0,
    players: [
      makePlayer(players[0].id, players[0].name, 'human', 0),
      players.length >= 2
        ? makePlayer(players[1].id, players[1].name, 'human', 1)
        : makePlayer(AI_ID, t('Computer'), 'ai', 1, level),
    ],
    shuttle: { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, lastHitter: -1, pending: null },
    score: [0, 0],
    server: 0,
    winner: -1,
    events: [],
    nextEventId: 1,
    stats: { shots: 0, longest: 0, perfect: [0, 0] },
    rng: seed | 0,
    history: [],
  }
  // Online: a coin flip picks the first server. Against the computer the player serves first.
  if (players.length >= 2) state.server = rand(state) < 0.5 ? 0 : 1
  for (const p of state.players) if (p.kind === 'ai') p.bot = newBotMemory(seed, p.side)
  resetForServe(state)
  return state
}

/** Test helper: both seats are computers (bot vs bot balance runs). */
export function setupBots(levelA: Level, levelB: Level, seed: number): SpState {
  const seat = (i: number): PlayerInfo => ({
    id: `${AI_ID}${i}`,
    name: t('Computer'),
    slot: i,
    ready: true,
    connected: true,
  })
  const state = createState([seat(0), seat(1)], seed)
  state.players.forEach((p, i) => {
    p.kind = 'ai'
    p.level = i === 0 ? levelA : levelB
    p.bot = newBotMemory(seed, p.side)
  })
  return state
}

/** The computer's inputs this tick (botStep per AI seat; its plan lives in player.bot). */
function botInputs(state: SpState): InputEvent<SpInput>[] {
  const out: InputEvent<SpInput>[] = []
  for (const p of state.players) {
    if (p.kind !== 'ai' || !p.level) continue
    const mem = (p.bot ??= newBotMemory(state.rng, p.side))
    const rng = () => {
      const r = { seed: mem.rng }
      const v = random(r)
      mem.rng = r.seed
      return v
    }
    for (const input of botStep(state, p.side, p.level, mem, rng)) out.push({ player: p.id, input })
  }
  return out
}

function serve(state: SpState, p: SpPlayer, held: { x: number; z: number }) {
  const kind: ShotKind = held.z < -0.5 ? 'serveLong' : 'serveShort'
  const receiver = other(p.side)
  const { xSign } = serveBox(p.side, state.score[p.side])
  // Diagonal: the receiver's box on the same view-relative side as the server's.
  const target = shotTarget(kind, p.side, 0)
  target.x = toWorld(receiver, xSign * (COURT.halfWidth / 2), 0).x
  const s = state.shuttle
  const v = launchFor(kind, 'perfect', s.pos, target, () => rand(state))
  s.vel.x = v.x
  s.vel.y = v.y
  s.vel.z = v.z
  s.lastHitter = p.side
  s.pending = null
  state.phase = 'rally'
  state.phaseT = 0
  state.stats.shots = 1
  emit(state, { k: 'serve', side: p.side })
}

/** The half a shuttle position belongs to for `side` hitting it (z = 0 goes to the non-last-hitter). */
function onHalf(z: number, side: 0 | 1, lastHitter: -1 | 0 | 1): boolean {
  if (z === 0) return lastHitter !== side
  return side === 0 ? z < 0 : z > 0
}

const sq = (n: number) => n * n

/**
 * How many ticks before `hostTick` a swing stamped `inputTick` happened: clamped to [0, MAX_REWIND], so a
 * bad clock or a tampered tick never rewinds further, and a tick from the future is no head start.
 */
export function rewindTicks(hostTick: number, inputTick: number): number {
  if (!finite(inputTick)) return 0
  return Math.min(MAX_REWIND, Math.max(0, Math.round(hostTick - inputTick)))
}

/**
 * Resolve a rally swing. `rewind` = ticks the swing happened before now (a guest's lag, rewindTicks;
 * 0 for the host's own and the computer's swings). Candidates: in-reach shuttle positions on the swinger's half from `history` (the past)
 * and the forward scan (the future, up to WINDOW.late after the swing). The closest one wins (the past
 * only when strictly closer); dt = contact tick − swing tick, graded by gradeOf (|dt| bands, dt <
 * −pastGrace → whiff). A contact at or before now hits at once from the current position; a future one
 * is scheduled as `pending`. Past candidates come only from `history`, so it must cover
 * rewind + pastGrace + 1 ticks.
 */
export function resolveSwing(state: SpState, p: SpPlayer, held: { x: number; z: number }, rewind = 0) {
  const s = state.shuttle
  if (s.lastHitter === p.side || s.pending) {
    emit(state, { k: 'whiff', side: p.side })
    return
  }
  const swingTick = state.tick - rewind
  let bestD = Infinity
  let bestTick = 0
  let bestY = 0
  for (const h of state.history) {
    if (h.tick >= state.tick || h.pos.y < REACH.minY || h.pos.y > REACH.maxY) continue
    if (!onHalf(h.pos.z, p.side, s.lastHitter)) continue
    const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z)
    if (d <= REACH.radius && d < bestD) {
      bestD = d
      bestTick = h.tick
      bestY = h.pos.y
    }
  }
  const c = findContact(s, p, 0, Math.max(0, swingTick + WINDOW.late - state.tick))
  if (c && onHalf(c.pos.z, p.side, s.lastHitter)) {
    const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z)
    if (d <= bestD) {
      bestD = d
      bestTick = state.tick + c.dt
      bestY = c.pos.y
    }
  }
  const grade = bestD === Infinity ? null : gradeOf(bestTick - swingTick)
  if (!grade) {
    emit(state, { k: 'whiff', side: p.side })
    return
  }
  const kind = chooseShot(held, bestY, grade)
  s.pending = { atTick: Math.max(bestTick, state.tick), side: p.side, kind, grade, aimX: held.x }
  if (s.pending.atTick === state.tick) hit(state)
}

/** Fire a scheduled hit; whiff if the swinger ran too far from the shuttle since the swing. */
function firePending(state: SpState) {
  const s = state.shuttle
  const pend = s.pending!
  const p = state.players[pend.side]
  if (sq(s.pos.x - p.x) + sq(s.pos.z - p.z) > sq(REACH.radius + PENDING_SLACK)) {
    s.pending = null
    emit(state, { k: 'whiff', side: pend.side })
    return
  }
  hit(state)
}

function hit(state: SpState) {
  const s = state.shuttle
  const pend = s.pending!
  const target = shotTarget(pend.kind, pend.side, pend.aimX)
  const v = launchFor(pend.kind, pend.grade, s.pos, target, () => rand(state))
  s.vel.x = v.x
  s.vel.y = v.y
  s.vel.z = v.z
  s.lastHitter = pend.side
  s.pending = null
  // A new flight: positions from before the hit are never a (rewound) contact for the other side.
  state.history.length = 0
  state.stats.shots++
  if (pend.grade === 'perfect') state.stats.perfect[pend.side]++
  emit(state, { k: 'hit', side: pend.side, grade: pend.grade, shot: pend.kind })
}

function scorePoint(state: SpState, side: 0 | 1) {
  state.score = award(state.score, side)
  state.server = side
  state.phase = 'point'
  state.phaseT = 0
  state.shuttle.pending = null
  state.stats.longest = Math.max(state.stats.longest, state.stats.shots)
  state.stats.shots = 0
  emit(state, { k: 'point', side })
}

function landed(state: SpState) {
  const s = state.shuttle
  s.pos.y = 0
  const hitter = s.lastHitter === -1 ? state.server : s.lastHitter
  const landSide: 0 | 1 = s.pos.z > 0 ? 1 : s.pos.z < 0 ? 0 : other(hitter)
  const inCourt = Math.abs(s.pos.x) <= COURT.halfWidth && Math.abs(s.pos.z) <= COURT.halfLen
  emit(state, { k: 'land', x: s.pos.x, z: s.pos.z, in: inCourt })
  scorePoint(state, inCourt && landSide !== hitter ? hitter : other(hitter))
}

function recordHistory(state: SpState) {
  const { pos, vel } = state.shuttle
  state.history.push({ tick: state.tick, pos: { ...pos }, vel: { ...vel } })
  if (state.history.length > HISTORY_TICKS) state.history.splice(0, state.history.length - HISTORY_TICKS)
}

/**
 * The computer never wears a human's look: an AI seat on a taken preset moves to the next free one.
 * (Two humans may match; the view tints the far one.)
 */
export function separateAi(state: SpState): void {
  const taken = (n: number) => state.players.some((h) => h.kind === 'human' && h.preset === n)
  for (const q of state.players)
    if (q.kind === 'ai')
      for (let i = 0; i < PRESETS && taken(q.preset); i++) q.preset = (q.preset + 1) % PRESETS
}

/** Puts player `id` in look `preset` (clamped to 0..PRESETS−1), then separates the computer. */
export function seedPreset(state: SpState, id: string, preset: number): void {
  const p = state.players.find((q) => q.id === id)
  if (!p) return
  p.preset = Math.min(PRESETS - 1, Math.max(0, Math.trunc(preset)))
  separateAi(state)
}

export function step(state: SpState, inputs: InputEvent<SpInput>[]): SpState {
  if (state.phase === 'over') return state
  state.tick++
  state.phaseT++
  state.events = state.events.filter((e) => e.tick > state.tick - EVENT_TICKS)

  // 1. Inputs (from the network: check everything).
  const swings: { p: SpPlayer; held: { x: number; z: number }; rewind: number }[] = []
  for (const { player, input } of [...inputs, ...botInputs(state)]) {
    const p = state.players.find((q) => q.id === player)
    if (!p || !input) continue
    if (input.t === 'move') p.move = clampDir(input.x, input.z)
    else if (input.t === 'pick') {
      if (finite(input.preset)) seedPreset(state, p.id, input.preset)
    } else if (input.t === 'swing') {
      // Only swings that resolve (any rally swing, the server's serve) start the cooldown.
      const live = state.phase === 'rally' || (state.phase === 'serve' && p.side === state.server)
      if (!live || state.tick - p.swingAt < SWING_COOLDOWN || swings.some((w) => w.p === p)) continue
      p.swingAt = state.tick
      // Guests stamp the tick they saw; the host's own swings and the computer's are judged now.
      const rewind = p.kind === 'human' && input.tick !== undefined ? rewindTicks(state.tick, input.tick) : 0
      swings.push({ p, held: clampDir(input.x, input.z), rewind })
    }
  }
  for (const p of state.players) {
    if (state.phase === 'serve' && p.side === state.server) {
      // The server stands still in the box until the serve.
      p.vx = 0
      p.vz = 0
    } else stepPlayer(p, DT)
  }

  const s = state.shuttle
  // 2. Serve.
  if (state.phase === 'serve') {
    holdShuttle(state)
    const sw = swings.find((w) => w.p.side === state.server)
    if (sw) serve(state, sw.p, sw.held)
    // Nobody stalls the match: an idle server short-serves automatically.
    else if (state.phaseT >= SERVE_TIMEOUT) serve(state, state.players[state.server], { x: 0, z: 0 })
  } else if (state.phase === 'rally') {
    // 3. Swings: who can hit is decided by lastHitter + the shuttle's half, so at most one schedules.
    // A shuttle hit this tick can't be hit back on the same tick (else input order would decide).
    const hitter = s.lastHitter
    for (const { p, held, rewind } of swings) {
      if (s.lastHitter !== hitter) emit(state, { k: 'whiff', side: p.side })
      else resolveSwing(state, p, held, rewind)
    }
    if (s.pending && s.pending.atTick <= state.tick) firePending(state)
  }

  recordHistory(state)

  // 4. Flight, landing, net.
  if (state.phase === 'rally') {
    if (stepShuttle(s).netHit) {
      emit(state, { k: 'net' })
      scorePoint(state, other(s.lastHitter === -1 ? state.server : s.lastHitter))
    } else if (s.pos.y <= 0) landed(state)
  } else if (state.phase === 'point') {
    // Let it fall (e.g. off the net tape) for the renderer; no more faults.
    if (s.pos.y > 0) {
      stepShuttle(s)
      if (s.pos.y <= 0) {
        s.pos.y = 0
        s.vel.x = s.vel.y = s.vel.z = 0
      }
    } else {
      s.vel.x = s.vel.y = s.vel.z = 0
    }
    // 5. Next serve or the end.
    if (state.phaseT >= POINT_TICKS) {
      const w = winner(state.score)
      if (w === null) resetForServe(state)
      else {
        state.winner = w
        state.phase = 'over'
      }
    }
  }
  return state
}

export const shuttlePopGame: GameDefinition<SpState, SpInput> = {
  id: 'shuttle-pop',
  tickRate: TICK_RATE,
  options: [
    {
      id: 'solo',
      label: t('Playing alone'),
      default: 'normal',
      choices: [
        { value: 'easy', label: t('Easy AI') },
        { value: 'normal', label: t('Normal AI') },
        { value: 'hard', label: t('Hard AI') },
      ],
    },
  ],
  minPlayers: 1,
  maxPlayers: 2,
  countdown: 3,
  setup: createState,
  tick: step,
  isFinished: (state) => state.phase === 'over',
  netView(state) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { history, rng, ...rest } = state
    return rest
  },
  removePlayer(state, id) {
    if (state.phase === 'over') return
    const side = state.players.findIndex((p) => p.id === id)
    if (side < 0) return
    state.winner = other(side as 0 | 1)
    state.phase = 'over'
  },
}
