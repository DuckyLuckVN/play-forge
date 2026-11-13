// Match simulation: host-authoritative, pure data in/out, JSON-serialisable.
// Side 0 owns z < 0, side 1 owns z > 0. Inputs are view-relative (x = screen right, z = toward the net).
import { random } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import {
  abilityShot,
  acting,
  cutCooldown,
  diveAllowed,
  freeSwing,
  holdsRacket,
  actMoveMul,
  actReady,
  landTick,
  leadOf,
  pickAbility,
  reachOf,
  slideEnd,
  slideStep,
  strikeFrom,
  type AbilityKind,
  type Act,
  type Strike,
  type Want,
} from './ability'
import { botStep, newBotMemory, readyDepth, type BotMemory } from './ai'
import { CHARGE, chargeOf } from './charge'
import { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld } from './court'
import { t } from './i18n'
import { courtSizeOf, type CourtSize } from './courtsize'
import { courtFor, flipServe, MAX_SEATS, modeOf, seatOf, serverOf } from './doubles'
import { COURT, DT, settleOnFloor, stepShuttle, type CourtDims, type Flight, type Vec3 } from './physics'
import { hitPower, perfectWindowOf, POWER_SWING, pressureOf, recoveryAfter } from './power'
import { isAvailable, nextAvailable, PRESETS as PRESET_TABLE } from './presets'
import { award, serveBox, winner } from './rules'
import { bonkVictims, stunned } from './stun'
import {
  chooseShot,
  launchFor,
  launchShot,
  pickContact,
  shotTarget,
  type ContactCandidate,
  type Grade,
  type ShotKind,
} from './shots'
import { noteBonk, noteHit, notePoint, noteServe, type TallyStats } from './tally'

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
/** Ticks in the serve phase before the server short-serves automatically (an idle human server; bots serve after ai.ts BOT_SERVE_TICKS). Long enough to read the menu / tutorial. */
export const SERVE_TIMEOUT = 3600
/** A scheduled hit whiffs if the swinger is further than its reach radius (REACH / ability.ts reachOf) + this from the shuttle. */
const PENDING_SLACK = 0.3
const EVENT_TICKS = 60
/** Lag fairness: a guest's swing is judged up to this many ticks back (~117 ms). */
export const MAX_REWIND = 7
/** Covers MAX_REWIND + WINDOW.pastGrace (12) + margin. */
const HISTORY_TICKS = 24
/** Character looks (presets.ts rows); `pick` inputs are clamped to 0..PRESETS−1. */
export const PRESETS = PRESET_TABLE.length
/** chargeAt of a press that already swung as a tap (tapOnPress): its release only ends it. */
export const TAPPED = -2

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
  /** `tick` = the history tick on the swinger's screen (world.ts swingTick); none = judged now (no rewind). */
  | { t: 'swing'; x: number; z: number; tick?: number }
  /**
   * Swing button down: start charging (the swing itself goes out on release). `tick` = the history tick
   * on the presser's screen, like a swing's (a tap is graded at the press). `cancel` = let go without
   * swinging (focus lost). A swing with no charge before it is a tap (charge 0): older clients still work.
   */
  | { t: 'charge'; cancel?: boolean; tick?: number }
  | { t: 'pick'; preset: number }
  /**
   * An ability press (ability.ts). `k` = the Jump / Dive button's forced move ('jump' | 'lunge'); none =
   * the one-button press (older clients, the computer): the shuttle picks a jump smash, a lunge or a hop.
   * `x, z` = held direction (aims the strike, like a swing's; a dive also goes that way); `tick` = the
   * presser's screen tick (rewind-clamped like a swing's). Older hosts ignore `k` (auto pick).
   */
  | { t: 'ability'; x: number; z: number; tick?: number; k?: Want; auto?: boolean }

export interface SpPlayer {
  id: string
  name: string
  kind: 'human' | 'ai'
  side: 0 | 1
  /** Position in the team (doubles.ts seatOf); always 0 in 1v1. */
  slot: 0 | 1
  x: number
  z: number
  vx: number
  vz: number
  /** Held direction, view-relative, length ≤ 1. */
  move: { x: number; z: number }
  /** Tick of the last swing. */
  swingAt: number
  /**
   * Host tick the swing button press arrived (charging until the release swing; the hold is counted in
   * arrival ticks, so a stamped tick never adds charge); −1 = not charging; TAPPED = the press already
   * swung as a tap.
   */
  chargeAt: number
  /** Tick the post-swing recovery slowdown ends (moves at POWER_SWING.recoveryMoveMul until then); −1 = none. */
  recoverUntil: number
  /** The press's tick on the presser's screen (rewind-clamped): where a tap is graded. −1 = none. */
  pressAt: number
  /**
   * The last ability press (ability.ts): the air / floor lock, the cooldown and the body's arc all
   * derive from it and the tick. null = none since the serve set-up.
   */
  act: Act | null
  /**
   * Host tick of the last racket bonk on this player (stun.ts); −1 = none since the serve set-up. The
   * lock (no move / swing / ability) and the immunity after it derive from it and the tick.
   */
  stunAt: number
  preset: number
  level?: Level
  /** AI seats: the bot's cached plan (see ai.ts). */
  bot?: BotMemory
  /** 2v2 human seat in its reconnect grace: the computer drives it until they return. */
  away?: boolean
}

export type SpEvent = { id: number; tick: number } &
  /** charge: the swing's hold-to-charge power 0..1 (absent = 0). */
  (
    | {
        k: 'hit'
        side: 0 | 1
        grade: Grade
        shot: ShotKind
        charge?: number
        power?: number
        act?: Strike
        by?: string
      }
    /** An ability press took effect (a jump / lunge also swings: a hit or whiff follows). */
    | { k: 'act'; side: 0 | 1; act: AbilityKind; by?: string }
    /** The feet are back on the floor (ability.ts landTick). */
    | { k: 'actLand'; side: 0 | 1; act: AbilityKind; by?: string }
    | { k: 'whiff'; side: 0 | 1; by?: string }
    /**
     * A racket swing stunned a player: `side` / `who` = the stunned one's side / player id, `by` = the
     * swinger's player id (`id` is the event's own).
     */
    | { k: 'bonk'; side: 0 | 1; who: string; by: string }
    | { k: 'land'; x: number; z: number; in: boolean }
    | { k: 'net' }
    | { k: 'point'; side: 0 | 1 }
    | { k: 'serve'; side: 0 | 1; shot?: ShotKind; by?: string }
  )
// `by` on hit / whiff / serve / act / actLand: the player's id (always set by the sim; optional for old fixtures).

/**
 * Whether an event with an actor (hit / whiff / serve / act / actLand) is the local player's: by player id
 * when both the id and the event's `by` are known (a teammate shares the side), else by side (old events,
 * spectators).
 */
export function isOwnEvent(e: { side: 0 | 1; by?: string }, side: 0 | 1, id?: string): boolean {
  return id !== undefined && e.by !== undefined ? e.by === id : e.side === side
}
type EventBody = SpEvent extends infer E ? (E extends SpEvent ? Omit<E, 'id' | 'tick'> : never) : never

export interface SpState {
  tick: number
  phase: 'serve' | 'rally' | 'point' | 'over'
  /** Ticks spent in the current phase. */
  phaseT: number
  /** 2 (1v1: side 0, side 1) or MAX_SEATS (2v2: index = room seat, doubles.ts seatOf). */
  players: SpPlayer[]
  /** The host-chosen court (room option `court`, courtsize.ts); sent in `st` so guests predict on it. */
  court: CourtDims
  shuttle: Flight & {
    lastHitter: -1 | 0 | 1
    /** Power 0..1 of the last hit (power.ts hitPower; 0 at serve). */
    power: number
    /** The last hit was a power smash: the receiver's Perfect window shrinks (power.ts perfectWindowOf). */
    pressured: boolean
    /** A connected swing whose contact tick is still ahead. aimX = held view-relative x at the swing. */
    pending: null | {
      atTick: number
      /** The swinger's player id. */
      id: string
      /** The swinger's side (team). */
      side: 0 | 1
      kind: ShotKind
      grade: Grade
      aimX: number
      /** Hold-to-charge power 0..1 (charge.ts). */
      charge: number
      /**
       * Tick the flight launches from: the contact tick, no earlier than the swinger's screen tick when
       * the swing resolved (now − lag, lag ≤ MAX_REWIND). Before now = a lag-compensated hit, launched
       * from history there and fast-forwarded; = atTick for every computer / unlagged / future contact.
       */
      fromTick: number
      /** Struck by a jump / lunge (its reach box; absent = a plain swing). */
      act?: Strike
    }
  }
  score: [number, number]
  server: 0 | 1
  /** Per side: the slot that serves when that side serves (doubles rotation, doubles.ts flipServe); 1v1 [0, 0]. */
  serveSlot: [0 | 1, 0 | 1]
  /** The level of seats played by the computer, also a 2v2 seat a human leaves. */
  aiLevel: Level
  winner: -1 | 0 | 1
  /** Last EVENT_TICKS ticks of events; renderers dedupe by id. */
  events: SpEvent[]
  nextEventId: number
  /**
   * For the results screen: shots in this rally (serve + hits), the longest finished rally, Perfect hits
   * per side, and each player's tally (tally.ts; optional fields).
   */
  stats: { shots: number; longest: number; perfect: [number, number] } & TallyStats
  /** Seeded rng state (mulberry32 seed). Host-only. */
  rng: number
  /**
   * Host-only: shuttle flight and each player's position (indexed like `players`) as of each of the last
   * HISTORY_TICKS ticks (for swing rewind: reach is judged from where the swinger stood then).
   */
  history: { tick: number; pos: Vec3; vel: Vec3; who: { x: number; z: number }[] }[]
}

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0)

/** The player due to serve: the serving side's `serveSlot` player (1v1: the side's only player). Every side always has one; players[0] only satisfies the type. */
export function serverPlayer(state: SpState): SpPlayer {
  return serverOf(state.players, state.server, state.serveSlot) ?? state.players[0]
}

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
export function clampDir(x: unknown, z: unknown): { x: number; z: number } {
  const fx = finite(x) ? x : 0
  const fz = finite(z) ? z : 0
  const len = Math.hypot(fx, fz)
  return len > 1 ? { x: fx / len, z: fz / len } : { x: fx, z: fz }
}

/**
 * Run speed share for a player: 0 while stunned (stun.ts, wins over everything); recoveryMoveMul after a
 * full-charge swing, CHARGE.moveMul while charging; during an ability's air / floor lock the lower of
 * that and actMoveMul (a lock always wins).
 */
export const speedMulOf = (
  p: Pick<SpPlayer, 'chargeAt' | 'recoverUntil'> & { act?: Act | null; stunAt?: number },
  tick: number,
): number => {
  if (stunned(p.stunAt ?? -1, tick)) return 0
  const base = tick < p.recoverUntil ? POWER_SWING.recoveryMoveMul : p.chargeAt >= 0 ? CHARGE.moveMul : 1
  const act = p.act ?? null
  return acting(act, tick) ? Math.min(base, actMoveMul(act, tick)) : base
}

/**
 * Movement integration: velocity eases toward move × MOVE_SPEED × speedMul (full speed in ~ACCEL_TICKS
 * ticks), position stays on the player's own half (NET_MARGIN from the net, OUT_MARGIN past the lines).
 * Lines are `court`'s (the match's state.court). Mutates p. Shared with guest prediction.
 */
export function stepPlayer(
  p: Pick<SpPlayer, 'side' | 'x' | 'z' | 'vx' | 'vz' | 'move'>,
  dt: number,
  speedMul = 1,
  court: CourtDims = COURT,
  push?: { x: number; z: number },
): void {
  const top = MOVE_SPEED * speedMul
  const want = toWorld(p.side, p.move.x * top, p.move.z * top)
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
  // A dive's slide (ability.ts slideStep) on top of the run (which a lunge locks to 0).
  p.x += p.vx * dt + (push?.x ?? 0)
  p.z += p.vz * dt + (push?.z ?? 0)
  const xMax = court.halfWidth + OUT_MARGIN
  if (Math.abs(p.x) > xMax) {
    p.x = Math.sign(p.x) * xMax
    p.vx = 0
  }
  const zMin = p.side === 0 ? -court.halfLen - OUT_MARGIN : NET_MARGIN
  const zMax = p.side === 0 ? -NET_MARGIN : court.halfLen + OUT_MARGIN
  if (p.z < zMin || p.z > zMax) {
    p.z = Math.min(zMax, Math.max(zMin, p.z))
    p.vz = 0
  }
}

/**
 * Server in their box (even own score → right), receiver (the receiving side's serveSlot player) in the
 * diagonal box; 2v2 partners wait on the other half at ready depth. Shuttle in hand.
 */
function resetForServe(state: SpState) {
  const server = state.server
  const { xSign } = serveBox(server, state.score[server])
  const { shortLine, halfWidth } = state.court
  const srv = serverPlayer(state)
  const rcv = serverOf(state.players, other(server), state.serveSlot)
  for (const p of state.players) {
    const pos =
      p === srv
        ? toWorld(p.side, xSign * SERVE_X, -(shortLine + SERVE_BACK))
        : p === rcv
          ? toWorld(p.side, xSign * RECEIVE_X, -(shortLine + RECEIVE_BACK))
          : toWorld(p.side, -xSign * (halfWidth / 2), -readyDepth(state.court))
    p.x = pos.x
    p.z = pos.z
    p.vx = 0
    p.vz = 0
    p.recoverUntil = -1
    p.act = null
    p.stunAt = -1
  }
  state.phase = 'serve'
  state.phaseT = 0
  state.shuttle.lastHitter = -1
  state.shuttle.power = 0
  state.shuttle.pressured = false
  state.shuttle.pending = null
  holdShuttle(state)
}

function holdShuttle(state: SpState) {
  const p = serverPlayer(state)
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
  slot: 0 | 1 = 0,
): SpPlayer => ({
  id,
  name,
  kind,
  side,
  slot,
  x: 0,
  z: 0,
  vx: 0,
  vz: 0,
  move: { x: 0, z: 0 },
  swingAt: -SWING_COOLDOWN,
  chargeAt: -1,
  recoverUntil: -1,
  pressAt: -1,
  act: null,
  stunAt: -1,
  preset: side,
  ...(level ? { level } : {}),
})

const LEVELS: readonly Level[] = ['easy', 'normal', 'hard']

/**
 * 2v2 seats, index = room seat (doubles.ts seatOf): each human in its room seat (a missing / taken /
 * out-of-range seat → the lowest free one; more humans than seats are left out), every empty seat a computer.
 */
function doublesSeats(infos: PlayerInfo[], level: Level): SpPlayer[] {
  const seats: (SpPlayer | undefined)[] = new Array<undefined>(MAX_SEATS).fill(undefined)
  const sit = (info: PlayerInfo, seat: number) => {
    const { side, slot } = seatOf(seat)
    seats[seat] = makePlayer(info.id, info.name, 'human', side, undefined, slot)
  }
  const loose: PlayerInfo[] = []
  for (const info of infos) {
    const seat = info.slot
    if (Number.isInteger(seat) && seat >= 0 && seat < MAX_SEATS && !seats[seat]) sit(info, seat)
    else loose.push(info)
  }
  for (const info of loose) {
    const free = seats.indexOf(undefined)
    if (free >= 0) sit(info, free)
  }
  return seats.map((p, seat) => {
    if (p) return p
    const { side, slot } = seatOf(seat)
    return makePlayer(`${AI_ID}${seat}`, t('Computer'), 'ai', side, level, slot)
  })
}

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): SpState {
  const level: Level = LEVELS.includes(options.solo as Level) ? (options.solo as Level) : 'normal'
  const doubles = modeOf(options.mode) === '2v2'
  const state: SpState = {
    tick: 0,
    phase: 'serve',
    phaseT: 0,
    players: doubles
      ? doublesSeats(players, level)
      : [
          makePlayer(players[0].id, players[0].name, 'human', 0),
          players.length >= 2
            ? makePlayer(players[1].id, players[1].name, 'human', 1)
            : makePlayer(AI_ID, t('Computer'), 'ai', 1, level),
        ],
    court: courtFor(doubles ? '2v2' : '1v1', courtSizeOf(options.court)),
    shuttle: {
      pos: { x: 0, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      lastHitter: -1,
      power: 0,
      pressured: false,
      pending: null,
    },
    score: [0, 0],
    server: 0,
    serveSlot: [0, 0],
    aiLevel: level,
    winner: -1,
    events: [],
    nextEventId: 1,
    stats: { shots: 0, longest: 0, perfect: [0, 0] },
    rng: seed | 0,
    history: [],
  }
  // Online: a coin flip picks the first server. Against the computer the player serves first.
  const humans = state.players.filter((p) => p.kind === 'human')
  if (doubles && humans.length === 1) {
    state.server = humans[0].side
    state.serveSlot[humans[0].side] = humans[0].slot
  } else if (players.length >= 2) state.server = rand(state) < 0.5 ? 0 : 1
  // Seat index: 1v1's computer is index 1 = its side (the same stream as before 2v2).
  state.players.forEach((p, i) => {
    if (p.kind === 'ai') p.bot = newBotMemory(seed, i)
  })
  if (doubles) separateAi(state)
  resetForServe(state)
  return state
}

/** Test helper: both seats are computers (bot vs bot balance runs), on the given court. */
export function setupBots(levelA: Level, levelB: Level, seed: number, size: CourtSize = 'normal'): SpState {
  const seat = (i: number): PlayerInfo => ({
    id: `${AI_ID}${i}`,
    name: t('Computer'),
    slot: i,
    ready: true,
    connected: true,
  })
  const state = createState([seat(0), seat(1)], seed, { court: size })
  state.players.forEach((p, i) => {
    p.kind = 'ai'
    p.level = i === 0 ? levelA : levelB
    p.bot = newBotMemory(seed, p.side)
  })
  return state
}

/** Test helper: all four 2v2 seats are computers (seat i → `ai${i}`, level levels[i]), on the given court. */
export function setupDoubles(
  levels: readonly [Level, Level, Level, Level],
  seed: number,
  size: CourtSize = 'normal',
): SpState {
  const seats = levels.map((_, i): PlayerInfo => ({
    id: `${AI_ID}${i}`,
    name: t('Computer'),
    slot: i,
    ready: true,
    connected: true,
  }))
  const state = createState(seats, seed, { court: size, mode: '2v2' })
  state.players.forEach((p, i) => {
    p.kind = 'ai'
    p.level = levels[i]
    p.bot = newBotMemory(seed, i)
  })
  separateAi(state)
  return state
}

/** The computer's inputs this tick (botStep per AI seat; its plan lives in player.bot). */
function botInputs(state: SpState): InputEvent<SpInput>[] {
  const out: InputEvent<SpInput>[] = []
  state.players.forEach((p, i) => {
    const level = p.kind === 'ai' ? p.level : p.away ? state.aiLevel : undefined
    if (!level) return
    // Seat index = side in 1v1 (the same stream as before 2v2).
    const mem = (p.bot ??= newBotMemory(state.rng, i))
    const rng = () => {
      const r = { seed: mem.rng }
      const v = random(r)
      mem.rng = r.seed
      return v
    }
    for (const input of botStep(state, i, level, mem, rng)) out.push({ player: p.id, input })
  })
  return out
}

function serve(state: SpState, p: SpPlayer, held: { x: number; z: number }) {
  const kind: ShotKind = held.z < -0.5 ? 'serveLong' : 'serveShort'
  const receiver = other(p.side)
  const { xSign } = serveBox(p.side, state.score[p.side])
  // Diagonal: the receiver's box on the same view-relative side as the server's.
  const target = shotTarget(kind, p.side, 0, state.court)
  target.x = toWorld(receiver, xSign * (state.court.halfWidth / 2), 0).x
  const s = state.shuttle
  const v = launchFor(kind, 'perfect', s.pos, target, () => rand(state), 0, state.court)
  s.vel.x = v.x
  s.vel.y = v.y
  s.vel.z = v.z
  s.lastHitter = p.side
  s.power = 0
  s.pressured = false
  s.pending = null
  state.phase = 'rally'
  state.phaseT = 0
  state.stats.shots = 1
  noteServe(state.stats, p.id)
  emit(state, { k: 'serve', side: p.side, shot: kind, by: p.id })
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

/** A press `sincePress` ticks old is graded at its press: a tap (charge 0) within MAX_REWIND of now. */
export function gradesAtPress(sincePress: number, charge: number): boolean {
  return charge === 0 && sincePress >= 0 && sincePress <= MAX_REWIND
}

/** A press at `pressTick` swings at once as a tap when the contact comes within CHARGE.start ticks of it. */
export function tapContact(contactTick: number, pressTick: number): boolean {
  return contactTick <= pressTick + CHARGE.start
}

/** The tick a hit launches from: the contact, or the swinger's screen tick if that is later. */
export function launchTick(contactTick: number, screenTick: number): number {
  return Math.max(contactTick, screenTick)
}

/**
 * Ticks back a release is graded: a tap (charge 0) at its press, if that is within MAX_REWIND of now
 * (else, and for a charged swing, at the release, `releaseRewind` ticks back). Never more than
 * MAX_REWIND. `pressAt` −1 = no press.
 */
export function gradeRewind(
  hostTick: number,
  pressAt: number,
  releaseRewind: number,
  charge: number,
): number {
  const sincePress = hostTick - pressAt
  if (pressAt >= 0 && gradesAtPress(sincePress, charge)) return sincePress
  return Math.min(MAX_REWIND, releaseRewind)
}

/** A human input's rewind (rewindTicks of its screen tick; none = 0); the computer is judged now. */
function humanRewind(state: SpState, p: SpPlayer, tick: number | undefined): number {
  return p.kind === 'human' && tick !== undefined ? rewindTicks(state.tick, tick) : 0
}

/**
 * Resolve a rally swing. `rewind` = ticks the swing happened before now (a guest's lag, rewindTicks;
 * the host's own interpolation; a tap rewinds by sincePress; 0 for the computer's swings). Candidates: in-reach shuttle positions on the swinger's half from `history` (the past)
 * and the forward scan (the future, up to WINDOW.late after the swing). The closest one wins (the past
 * only when strictly closer); dt = contact tick − swing tick, graded by gradeOf (|dt| bands, dt <
 * −pastGrace → whiff). A contact at or before now hits at once; a future one is scheduled as `pending`.
 * `lag` (≤ MAX_REWIND) = how far the swinger's screen ran behind the host when the resolving input was sent
 * (its stamp's rewindTicks; 0 for the computer and unstamped swings): the shot launches from the shuttle
 * at max(contact tick, now − lag) (`fromTick`, from `history`) and is fast-forwarded to now, so a guest's
 * hit flies as if it had no lag; with lag 0 it launches from where the shuttle is now. Past candidates
 * come only from `history`, so it must cover rewind + pastGrace + 1 ticks.
 */
export function resolveSwing(
  state: SpState,
  p: SpPlayer,
  held: { x: number; z: number },
  rewind = 0,
  charge = 0,
  lag = 0,
  act?: Strike,
) {
  const s = state.shuttle
  const c = s.lastHitter === p.side || s.pending ? null : contactFor(state, p, rewind, act)
  if (!c) {
    emit(state, { k: 'whiff', side: p.side, by: p.id })
    return
  }
  // A swing in a Dive's window strikes as a lunge (its box, its shot).
  const k = act ?? freeStrike(state, p, rewind)
  // A jump / lunge plays its own shot (ability.ts abilityShot) instead of the held direction's.
  const shot = k
    ? abilityShot(k, held, c.grade)
    : { kind: chooseShot(held, c.y, c.grade), grade: c.grade, charge }
  s.pending = {
    atTick: Math.max(c.tick, state.tick),
    id: p.id,
    side: p.side,
    kind: shot.kind,
    grade: shot.grade,
    aimX: held.x,
    charge: shot.charge,
    fromTick: launchTick(c.tick, state.tick - Math.min(MAX_REWIND, Math.max(0, lag))),
    ...(k ? { act: k } : {}),
  }
  if (s.pending.atTick === state.tick) hit(state)
}

/**
 * The contact a swing `rewind` ticks ago would make (resolveSwing's rules), or null = a whiff. A jump /
 * lunge (`act`) uses its reach box and is graded `leadOf(act)` ticks after the press (its wind-up). A
 * plain swing in a free move's window (ability.ts freeSwing) uses that move's box (a dive's from its
 * slide end), no lead.
 */
function contactFor(
  state: SpState,
  p: SpPlayer,
  rewind: number,
  act?: Strike,
): { tick: number; y: number; grade: Grade } | null {
  const s = state.shuttle
  const swingTick = state.tick - rewind + leadOf(act)
  // A lunge reaches from where its slide ends (resolved at the press: the whole slide is still ahead).
  const off = act === 'lunge' && p.act ? slideEnd({ x: 0, z: 0 }, p.act.dx, p.act.dz) : null
  const past = contactCandidates(state, p, rewind)
  if (off) for (const c of past) c.at = { x: c.at.x + off.x, z: c.at.z + off.z }
  const free = act ? undefined : freeStrike(state, p, rewind)
  // A Dive's swing: judged from where the slide ends (now + the slide still ahead), like a lunge.
  const dive = free === 'lunge' ? strikeFrom(p, p.act, state.tick) : null
  if (dive) for (const c of past) c.at = dive
  return pickContact(
    past,
    s,
    state.tick,
    dive ?? (off ? { x: p.x + off.x, z: p.z + off.z } : p),
    p.side,
    s.lastHitter,
    swingTick,
    state.tick,
    perfectWindowOf(s.pressured),
    reachOf(act ?? free),
  )
}

/**
 * The strike of a plain swing by `p` (`rewind` ticks old) in its free move's window (ability.ts
 * freeSwing): graded then or arriving now (a short charge is graded at its press, maybe before the move).
 */
function freeStrike(state: SpState, p: SpPlayer, rewind: number): Strike | undefined {
  return freeSwing(p.act, state.tick - rewind) ?? freeSwing(p.act, state.tick)
}

/**
 * contactFor's past candidates: each `history` shuttle position, with `p`'s reach measured from where it
 * saw itself beside that shuttle (its own chibi runs ahead of the shown shuttle by the rewind, a guest's
 * being predicted, so its spot `rewind` ticks later, or now).
 */
export function contactCandidates(state: SpState, p: SpPlayer, rewind: number): ContactCandidate[] {
  const hist = state.history
  const at = seatIndex(state, p)
  return hist.map((h, i) => ({ tick: h.tick, pos: h.pos, at: seenAt(hist, i, rewind, state.tick, p, at) }))
}

/** `p`'s index in `players` (= its index in history `who`); 1v1 = its side. */
const seatIndex = (state: SpState, p: SpPlayer): number => state.players.findIndex((q) => q.id === p.id)

/** `p`'s spot (`who[at]`, at = seatIndex) at tick hist[i].tick + rewind: from the history (contiguous ticks), or now. */
function seenAt(
  hist: SpState['history'],
  i: number,
  rewind: number,
  now: number,
  p: SpPlayer,
  at: number,
): { x: number; z: number } {
  const want = hist[i].tick + rewind
  if (want >= now) return p
  const j = i + rewind
  if (j < hist.length && hist[j].tick === want) return hist[j].who[at] ?? p
  for (const h of hist) if (h.tick === want) return h.who[at] ?? p
  return p
}

/**
 * A rally press whose contact comes before it could charge (within CHARGE.start ticks of the press) is
 * a tap: it swings at once, graded at the press, so the hit lands on time instead of after the
 * button-up. The release then only ends it (TAPPED). Returns whether it swung.
 */
function tapOnPress(state: SpState, p: SpPlayer): boolean {
  const s = state.shuttle
  if (p.chargeAt < 0 || !canSwing(state, p) || s.lastHitter === p.side || s.pending) return false
  const rewind = state.tick - p.pressAt
  const c = contactFor(state, p, rewind)
  if (!c || !tapContact(c.tick, p.pressAt)) return false
  p.swingAt = state.tick
  p.chargeAt = TAPPED
  resolveSwing(state, p, p.move, rewind, 0, rewind) // the press arrived now: its rewind is its lag
  return true
}

/** Fire a scheduled hit; whiff if the swinger ran too far from the shuttle since the swing. */
function firePending(state: SpState) {
  const s = state.shuttle
  const pend = s.pending!
  const p = state.players.find((q) => q.id === pend.id)
  // A lunge reaches from its slide end, even while the dive is still sliding there.
  const at = p && (pend.act === 'lunge' ? strikeFrom(p, p.act, state.tick) : p)
  if (!p || !at || sq(s.pos.x - at.x) + sq(s.pos.z - at.z) > sq(reachOf(pend.act).radius + PENDING_SLACK)) {
    s.pending = null
    emit(state, { k: 'whiff', side: pend.side, by: pend.id })
    return
  }
  hit(state)
}

/**
 * Launch the pending shot. A rewound contact (fromTick < now) launches from the shuttle as history had it
 * at fromTick and is fast-forwarded to now (the flight a lag-free hit would have), so the swinger's own
 * prediction matches; a net / floor touch in the fast-forward scores as in step 4. Otherwise (every AI
 * and on-time hit) it launches from where the shuttle is now.
 */
function hit(state: SpState) {
  const s = state.shuttle
  const pend = s.pending!
  const from = pend.fromTick < state.tick ? state.history.find((h) => h.tick === pend.fromTick) : undefined
  if (from) {
    s.pos.x = from.pos.x
    s.pos.y = from.pos.y
    s.pos.z = from.pos.z
  }
  const target = shotTarget(pend.kind, pend.side, pend.aimX, state.court)
  const { vel: v, gain } = launchShot(
    pend.kind,
    pend.grade,
    s.pos,
    target,
    () => rand(state),
    pend.charge,
    state.court,
  )
  const power = hitPower(pend.grade, gain)
  s.power = power
  s.pressured = pressureOf(pend.kind, power)
  s.vel.x = v.x
  s.vel.y = v.y
  s.vel.z = v.z
  s.lastHitter = pend.side
  s.pending = null
  // A new flight: positions from before the hit are never a (rewound) contact for the other side.
  state.history.length = 0
  state.stats.shots++
  if (pend.grade === 'perfect') state.stats.perfect[pend.side]++
  noteHit(state.stats, pend.id, pend.grade, pend.kind, pend.act)
  // A Perfect hit shortens the hitter's running Jump / Dive cooldown.
  if (pend.grade === 'perfect') cutCooldown(state.players.find((q) => q.id === pend.id)?.act ?? null)
  emit(state, {
    k: 'hit',
    side: pend.side,
    grade: pend.grade,
    shot: pend.kind,
    charge: pend.charge,
    power,
    ...(pend.act ? { act: pend.act } : {}),
    by: pend.id,
  })
  // Fast-forwarded ticks are not written to history: the opponent cannot rewind-hit on them (rare, accepted).
  if (from) for (let t = from.tick; t < state.tick && state.phase === 'rally'; t++) flightStep(state)
}

/** One rally tick of flight: a net hit or a floor touch ends the rally (the point is scored). */
function flightStep(state: SpState): void {
  const s = state.shuttle
  const px = s.pos.x
  const py = s.pos.y
  const pz = s.pos.z
  if (stepShuttle(s).netHit) {
    emit(state, { k: 'net' })
    scorePoint(state, other(s.lastHitter === -1 ? state.server : s.lastHitter))
  } else if (s.pos.y <= 0) {
    // Call the line where it truly touched down, not at the below-floor overshoot.
    settleOnFloor(s.pos, px, py, pz)
    landed(state)
  }
}

function scorePoint(state: SpState, side: 0 | 1) {
  state.score = award(state.score, side)
  state.serveSlot = flipServe(state.serveSlot, state.server, side, state.players.length === MAX_SEATS)
  state.server = side
  state.phase = 'point'
  state.phaseT = 0
  state.shuttle.pending = null
  state.stats.longest = Math.max(state.stats.longest, state.stats.shots)
  state.stats.shots = 0
  notePoint(state.stats, state.players, side)
  emit(state, { k: 'point', side })
}

function landed(state: SpState) {
  const s = state.shuttle
  const hitter = s.lastHitter === -1 ? state.server : s.lastHitter
  const landSide: 0 | 1 = s.pos.z > 0 ? 1 : s.pos.z < 0 ? 0 : other(hitter)
  const { halfWidth, halfLen } = state.court
  const inCourt = Math.abs(s.pos.x) <= halfWidth && Math.abs(s.pos.z) <= halfLen
  emit(state, { k: 'land', x: s.pos.x, z: s.pos.z, in: inCourt })
  scorePoint(state, inCourt && landSide !== hitter ? hitter : other(hitter))
}

function recordHistory(state: SpState) {
  const { pos, vel } = state.shuttle
  state.history.push({
    tick: state.tick,
    pos: { ...pos },
    vel: { ...vel },
    who: state.players.map((p) => ({ x: p.x, z: p.z })),
  })
  if (state.history.length > HISTORY_TICKS) state.history.splice(0, state.history.length - HISTORY_TICKS)
}

/**
 * May `p` start charging now: in a rally, or the server in the serve (the cooldown may still run), and
 * not held by a jump / lunge (ability.ts acting) or a racket stun (stun.ts).
 */
export function canCharge(state: SpState, p: SpPlayer): boolean {
  return (
    (state.phase === 'rally' || (state.phase === 'serve' && p.id === serverPlayer(state).id)) &&
    !holdsRacket(p.act, state.tick) &&
    !stunned(p.stunAt, state.tick)
  )
}

/**
 * May `p` press the ability now: in a rally or the serve, not charging (a rally Dive may start mid-charge:
 * the held swing then hits from the dive), not held by a move or a stun, off cooldown.
 */
export function canAct(state: SpState, p: SpPlayer, want?: Want): boolean {
  return (
    (state.phase === 'rally' || state.phase === 'serve') &&
    (p.chargeAt === -1 || (want === 'lunge' && state.phase === 'rally')) &&
    !acting(p.act, state.tick) &&
    !stunned(p.stunAt, state.tick) &&
    actReady(p.act, state.tick)
  )
}

/**
 * May `p` strike the shuttle now (a jump / lunge, as opposed to a hop): a rally shuttle that is not its
 * own last hit (`hitter` = lastHitter before this tick's swings: one hit this tick can't be struck back),
 * not mid-hit, and past the swing cooldown. The one rule the host's press and the AI's check share.
 */
export function canStrike(
  state: SpState,
  p: SpPlayer,
  hitter: -1 | 0 | 1 = state.shuttle.lastHitter,
): boolean {
  const s = state.shuttle
  return (
    state.phase === 'rally' &&
    s.lastHitter === hitter &&
    s.lastHitter !== p.side &&
    !s.pending &&
    state.tick - p.swingAt >= SWING_COOLDOWN &&
    !stunned(p.stunAt, state.tick)
  )
}

/**
 * Resolve an ability press `rewind` ticks old (≤ MAX_REWIND): the move is picked on the flight as the
 * presser saw it (`history` at now − rewind, else now) from its own spot (seenAt). A jump / lunge commits
 * (lock + cooldown, even when it whiffs) and swings with its reach box; a hop does nothing else.
 * `hitter` = lastHitter before this tick's swings (a shuttle hit this tick can't be struck back).
 * Returns whether it struck (a jump / lunge swings its racket: it can bonk; a hop never does).
 */
function resolveAct(
  state: SpState,
  p: SpPlayer,
  held: { x: number; z: number },
  rewind: number,
  hitter: -1 | 0 | 1,
  want?: Want,
  auto = false,
): boolean {
  const s = state.shuttle
  const hist = state.history
  const i = rewind > 0 ? hist.findIndex((h) => h.tick === state.tick - rewind) : -1
  const flight = i >= 0 ? hist[i] : s
  const at = i >= 0 ? seenAt(hist, i, rewind, state.tick, p, seatIndex(state, p)) : p
  const canHit = canStrike(state, p, hitter)
  // The Jump / Dive buttons force their move in a rally (the serve set-up only hops); a dive goes the held way.
  const forced = state.phase === 'rally' ? want : undefined
  const dir = held.x || held.z ? toWorld(p.side, held.x, held.z) : undefined
  const pick = pickAbility(flight, at, p.side, s.lastHitter, canHit, forced, dir, auto)
  p.act = {
    k: pick.k,
    at: state.tick,
    dx: pick.dx,
    dz: pick.dz,
    ...(pick.empty ? { empty: true } : {}),
    ...(pick.free ? { free: true } : {}),
    ...(pick.free && pick.k === 'lunge' && auto ? { auto: true } : {}),
  }
  emit(state, { k: 'act', side: p.side, act: pick.k, by: p.id })
  // A hop, an empty jump and a Dive (it only slides: the player swings) strike nothing.
  if (pick.k === 'hop' || pick.empty || pick.free) return false
  p.swingAt = state.tick
  resolveSwing(state, p, held, rewind, 0, rewind, pick.k)
  return true
}

/** Ticks before its contact an Auto swing dive swings (inside the Perfect band; a lunge caps it at Good). */
const AUTO_DIVE_LEAD = 4

/**
 * Auto swing dives (Act.auto): once per dive, inside its swing window, the sim swings for the diver as
 * soon as a contact (the dive's reach from the slide end) is AUTO_DIVE_LEAD ticks away or nearer.
 * `hitter` = lastHitter before this tick's swings; swingers join `swung` (bonks).
 */
function autoDiveSwings(state: SpState, hitter: -1 | 0 | 1, swung: SpPlayer[]): void {
  for (const p of state.players) {
    const a = p.act
    if (!a?.auto || p.swingAt >= a.at || !freeSwing(a, state.tick) || swung.includes(p)) continue
    if (!canSwing(state, p) || !canStrike(state, p, hitter)) continue
    const c = contactFor(state, p, 0)
    if (!c || c.tick - state.tick > AUTO_DIVE_LEAD) continue
    p.swingAt = state.tick
    resolveSwing(state, p, p.move, 0, 0, 0)
    swung.push(p)
  }
}

/**
 * Racket bonks (rally only): each of this tick's swingers, in order, stuns every other player in reach
 * now (stun.ts bonkVictims: no rewind, friendly fire on, matched by id) who isn't immune. Runs after all
 * of the tick's swings, so same-tick swings are simultaneous (a mutual bonk stuns both) and a victim
 * stunned this tick is immune to a second swinger. The victim freezes (velocity 0); a held charge is
 * dropped (TAPPED: its button-up never swings). Its act, swingAt and any pending contact are untouched.
 */
function bonks(state: SpState, swung: readonly SpPlayer[]): void {
  for (const p of swung)
    for (const q of bonkVictims(p, state.players, state.tick)) {
      q.stunAt = state.tick
      q.vx = 0
      q.vz = 0
      if (q.chargeAt >= 0) {
        q.chargeAt = TAPPED
        q.pressAt = -1
      }
      emit(state, { k: 'bonk', side: q.side, who: q.id, by: p.id })
      noteBonk(state.stats, p.id)
    }
}

/** Would a swing by `p` resolve now: a rally swing or the server's serve, off cooldown. */
export function canSwing(state: SpState, p: SpPlayer): boolean {
  return canCharge(state, p) && state.tick - p.swingAt >= SWING_COOLDOWN
}

/** A seat's name for display: the computer's is translated now (a language switch updates it). */
export function shownName(p: SpPlayer): string {
  return p.kind === 'ai' ? t('Computer') : p.name
}

/**
 * The computer never wears a human's look, nor an earlier computer's: an AI seat on a taken preset moves
 * to the next free one. (Two humans may match; the view tints the far one.)
 */
export function separateAi(state: SpState, only?: number): void {
  state.players.forEach((q, i) => {
    if (q.kind !== 'ai' || (only !== undefined && i !== only)) return
    // `only`: just this seat re-picks, clear of every other look (humans and computers alike).
    const taken = (n: number) =>
      state.players.some(
        (h, j) => h.preset === n && (only !== undefined ? j !== i : h.kind === 'human' || j < i),
      )
    if (!isAvailable(q.preset) || taken(q.preset)) q.preset = nextAvailable(q.preset, taken)
  })
}

/**
 * Puts player `id` in look `preset` (truncated, clamped to 0..PRESETS−1; a non-number / NaN / ±Infinity
 * is ignored), then separates the computer. A hidden preset (presets.ts AVAILABLE_IDS) maps to the first
 * available one the other human isn't wearing.
 */
export function seedPreset(state: SpState, id: string, preset: number): void {
  const p = state.players.find((q) => q.id === id)
  if (!p || typeof preset !== 'number' || !Number.isFinite(preset)) return
  const want = Math.min(PRESETS - 1, Math.max(0, Math.trunc(preset)))
  p.preset = isAvailable(want)
    ? want
    : nextAvailable(want, (n) => state.players.some((o) => o !== p && o.kind === 'human' && o.preset === n))
  separateAi(state)
}

/** Scratch for a dive's per-tick slide (slideStep). */
const slidePush = { x: 0, z: 0 }

export function step(state: SpState, inputs: InputEvent<SpInput>[]): SpState {
  if (state.phase === 'over') return state
  state.tick++
  state.phaseT++
  state.events = state.events.filter((e) => e.tick > state.tick - EVENT_TICKS)

  // 1. Inputs (from the network: check everything).
  const swings: {
    p: SpPlayer
    held: { x: number; z: number }
    rewind: number
    charge: number
    lag: number
  }[] = []
  const presses: SpPlayer[] = []
  const acts: { p: SpPlayer; held: { x: number; z: number }; rewind: number; want?: Want; auto: boolean }[] =
    []
  for (const { player, input } of [...inputs, ...botInputs(state)]) {
    const p = state.players.find((q) => q.id === player)
    if (!p || !input) continue
    if (input.t === 'move') p.move = clampDir(input.x, input.z)
    // seedPreset checks the (untrusted) preset itself.
    else if (input.t === 'pick') seedPreset(state, p.id, input.preset)
    else if (input.t === 'charge') {
      if (input.cancel === true) p.chargeAt = p.pressAt = -1
      // A repeat press keeps the first start (a press already TAPPED waits for its release); between
      // points / the receiver in the serve: ignored.
      else if (p.chargeAt === -1 && canCharge(state, p)) {
        p.chargeAt = state.tick
        p.pressAt = state.tick - humanRewind(state, p, input.tick)
        presses.push(p)
      }
    } else if (input.t === 'swing') {
      if (p.chargeAt === TAPPED) {
        p.chargeAt = p.pressAt = -1 // the button-up of a press that already swung
        continue
      }
      // The release: the hold is the charge (no press before = a tap), counted from the press's arrival
      // to the release's: stamped ticks can't change it, and a guest who saw FULL gets full.
      const released = humanRewind(state, p, input.tick)
      const charge = p.chargeAt >= 0 ? chargeOf(state.tick - p.chargeAt) : 0
      const rewind = gradeRewind(state.tick, p.chargeAt >= 0 ? p.pressAt : -1, released, charge)
      p.chargeAt = p.pressAt = -1
      // Only swings that resolve (any rally swing, the server's serve) start the cooldown.
      if (!canSwing(state, p) || swings.some((w) => w.p === p)) continue
      p.swingAt = state.tick
      // A full-charge rally swing (hit or whiff) costs a move slowdown; serves don't.
      const recovery = state.phase === 'rally' ? recoveryAfter(charge) : 0
      if (recovery > 0) p.recoverUntil = state.tick + recovery
      swings.push({ p, held: clampDir(input.x, input.z), rewind, charge, lag: released })
    } else if (input.t === 'ability') {
      // One per player per tick; while charging / held / on cooldown / between points: ignored.
      const want = input.k === 'jump' || input.k === 'lunge' ? input.k : undefined
      if (acts.some((a) => a.p === p) || !canAct(state, p, want)) continue
      const held = clampDir(input.x, input.z)
      // The Dive button while moving backward: nothing (no escape dives; no cooldown spent).
      if (want === 'lunge' && state.phase === 'rally' && !diveAllowed(held)) continue
      acts.push({ p, held, rewind: humanRewind(state, p, input.tick), want, auto: input.auto === true })
    }
  }
  const srv = serverPlayer(state)
  for (const p of state.players) {
    if (p.act && state.tick === landTick(p.act))
      emit(state, { k: 'actLand', side: p.side, act: p.act.k, by: p.id })
    if (state.phase === 'serve' && p === srv) {
      // The server stands still in the box until the serve.
      p.vx = 0
      p.vz = 0
    } else {
      const push = p.act ? slideStep(p.act, state.tick - p.act.at, slidePush) : undefined
      stepPlayer(p, DT, speedMulOf(p, state.tick), state.court, push)
    }
  }

  const s = state.shuttle
  // 2. Serve.
  if (state.phase === 'serve') {
    const before = s.lastHitter
    holdShuttle(state)
    const sw = swings.find((w) => w.p === srv)
    if (sw) serve(state, sw.p, sw.held)
    // Nobody stalls the match: an idle server short-serves automatically.
    else if (state.phaseT >= SERVE_TIMEOUT) serve(state, srv, { x: 0, z: 0 })
    // Presses in the serve hop (nothing to strike yet; a serve this tick is the server's own hit).
    for (const a of acts)
      if (canAct(state, a.p, a.want)) resolveAct(state, a.p, a.held, a.rewind, before, a.want, a.auto)
  } else if (state.phase === 'rally') {
    // 3. Swings: who can hit is decided by lastHitter + the shuttle's half, so at most one schedules.
    // A shuttle hit this tick can't be hit back on the same tick (else input order would decide).
    const hitter = s.lastHitter
    // Every racket that swung this tick (whiffs too); bonks are applied once all of them resolved.
    const swung: SpPlayer[] = []
    for (const { p, held, rewind, charge, lag } of swings) {
      swung.push(p)
      if (s.lastHitter !== hitter) emit(state, { k: 'whiff', side: p.side, by: p.id })
      else resolveSwing(state, p, held, rewind, charge, lag)
    }
    for (const p of presses)
      if (s.lastHitter === hitter && !swings.some((w) => w.p === p) && tapOnPress(state, p)) swung.push(p)
    // After swings and taps (a charge pressed this tick wins: canAct re-checked), before a scheduled hit fires.
    for (const a of acts)
      if (canAct(state, a.p, a.want) && resolveAct(state, a.p, a.held, a.rewind, hitter, a.want, a.auto))
        swung.push(a.p)
    autoDiveSwings(state, hitter, swung)
    // A contact already made (pending) still fires below, even if its swinger was just bonked.
    if (swung.length > 0) bonks(state, swung)
    if (s.pending && s.pending.atTick <= state.tick) firePending(state)
  }

  recordHistory(state)

  // 4. Flight, landing, net.
  if (state.phase === 'rally') flightStep(state)
  else if (state.phase === 'point') {
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

/**
 * A human left a 2v2 seat: the computer (state.aiLevel) plays it on as `ai${i}` (the leaver's id no
 * longer drives it), a held charge is dropped; a contact it already made still fires.
 */
function takeSeat(state: SpState, i: number): void {
  const p = state.players[i]
  const id = `${AI_ID}${i}`
  const pend = state.shuttle.pending
  if (pend && pend.id === p.id) pend.id = id
  p.id = id
  p.kind = 'ai'
  p.level = state.aiLevel
  p.bot = newBotMemory(state.rng, i)
  p.move = { x: 0, z: 0 }
  p.chargeAt = p.pressAt = -1
  delete p.away
  // The computer never wears a remaining human's look; the other computers keep theirs.
  separateAi(state, i)
}

/** 2v2: a human seat in its grace window is played by the computer; back on return (a held input is dropped). */
function setAway(state: SpState, id: string, away: boolean): void {
  if (state.players.length !== MAX_SEATS) return
  const p = state.players.find((q) => q.id === id)
  if (!p || p.kind !== 'human' || !!p.away === away) return
  if (away) p.away = true
  else delete p.away
  p.move = { x: 0, z: 0 }
  p.chargeAt = p.pressAt = -1
}

export const shuttlePopGame: GameDefinition<SpState, SpInput> = {
  id: 'shuttle-pop',
  tickRate: TICK_RATE,
  options: [
    {
      id: 'mode',
      label: t('Match'),
      default: '1v1',
      choices: [
        { value: '1v1', label: t('1 vs 1') },
        { value: '2v2', label: t('2 vs 2') },
      ],
    },
    {
      id: 'solo',
      label: t('Computer level'),
      aloneOnly: true,
      // While the computer plays a seat: alone in 1v1, any empty seat in 2v2.
      shownWhen: (n, o) => n <= 1 || (modeOf(o.mode) === '2v2' && n < MAX_SEATS),
      default: 'normal',
      choices: [
        { value: 'easy', label: t('Easy AI') },
        { value: 'normal', label: t('Normal AI') },
        { value: 'hard', label: t('Hard AI') },
      ],
    },
    {
      id: 'court',
      label: t('Court size'),
      default: 'normal',
      choices: [
        { value: 'normal', label: t('Normal') },
        { value: 'large', label: t('Large +15%') },
        { value: 'xl', label: t('XL +30%') },
      ],
    },
  ],
  minPlayers: 1,
  maxPlayers: MAX_SEATS,
  seating: (o) => {
    const doubles = modeOf(o.mode) === '2v2'
    return { seats: doubles ? MAX_SEATS : 2, teams: doubles ? 2 : 1, botFill: doubles }
  },
  countdown: 3,
  setup: createState,
  tick: step,
  isFinished: (state) => state.phase === 'over',
  netView(state) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { history, rng, ...rest } = state
    return rest
  },
  setConnected: (state, id, connected) => setAway(state, id, !connected),
  removePlayer(state, id) {
    if (state.phase === 'over') return
    const i = state.players.findIndex((p) => p.id === id)
    if (i < 0) return
    // 2v2: the computer takes the seat and the match goes on.
    if (state.players.length === MAX_SEATS) return takeSeat(state, i)
    state.winner = other(i as 0 | 1)
    state.phase = 'over'
  },
}
