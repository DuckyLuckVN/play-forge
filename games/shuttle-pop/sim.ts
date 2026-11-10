// Match simulation: host-authoritative, pure data in/out, JSON-serialisable.
// Side 0 owns z < 0, side 1 owns z > 0. Inputs are view-relative (x = screen right, z = toward the net).
import { random } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { botStep, newBotMemory, type BotMemory } from './ai'
import { CHARGE, chargeOf } from './charge'
import { MOVE_SPEED, NET_MARGIN, TICK_RATE, toWorld } from './court'
import { t } from './i18n'
import { courtDims, courtSizeOf, type CourtSize } from './courtsize'
import { COURT, DT, settleOnFloor, stepShuttle, type CourtDims, type Flight, type Vec3 } from './physics'
import { hitPower, perfectWindowOf, POWER_SWING, pressureOf, recoveryAfter } from './power'
import { isAvailable, nextAvailable, PRESETS as PRESET_TABLE } from './presets'
import { award, serveBox, winner } from './rules'
import {
  chooseShot,
  launchFor,
  launchShot,
  pickContact,
  REACH,
  shotTarget,
  type ContactCandidate,
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
  preset: number
  level?: Level
  /** AI seats: the bot's cached plan (see ai.ts). */
  bot?: BotMemory
}

export type SpEvent = { id: number; tick: number } &
  /** charge: the swing's hold-to-charge power 0..1 (absent = 0). */
  (
    | { k: 'hit'; side: 0 | 1; grade: Grade; shot: ShotKind; charge?: number; power?: number }
    | { k: 'whiff'; side: 0 | 1 }
    | { k: 'land'; x: number; z: number; in: boolean }
    | { k: 'net' }
    | { k: 'point'; side: 0 | 1 }
    | { k: 'serve'; side: 0 | 1; shot?: ShotKind }
  )
type EventBody = SpEvent extends infer E ? (E extends SpEvent ? Omit<E, 'id' | 'tick'> : never) : never

export interface SpState {
  tick: number
  phase: 'serve' | 'rally' | 'point' | 'over'
  /** Ticks spent in the current phase. */
  phaseT: number
  players: [SpPlayer, SpPlayer]
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
    }
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
  /**
   * Host-only: shuttle flight and each side's position (by side) as of each of the last HISTORY_TICKS
   * ticks (for swing rewind: reach is judged from where the swinger stood then).
   */
  history: { tick: number; pos: Vec3; vel: Vec3; who: [{ x: number; z: number }, { x: number; z: number }] }[]
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
export function clampDir(x: unknown, z: unknown): { x: number; z: number } {
  const fx = finite(x) ? x : 0
  const fz = finite(z) ? z : 0
  const len = Math.hypot(fx, fz)
  return len > 1 ? { x: fx / len, z: fz / len } : { x: fx, z: fz }
}

/** Run speed share for a player: recoveryMoveMul after a full-charge swing, CHARGE.moveMul while charging. */
export const speedMulOf = (p: Pick<SpPlayer, 'chargeAt' | 'recoverUntil'>, tick: number): number =>
  tick < p.recoverUntil ? POWER_SWING.recoveryMoveMul : p.chargeAt >= 0 ? CHARGE.moveMul : 1

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
  p.x += p.vx * dt
  p.z += p.vz * dt
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

/** Server in their box (even own score → right), receiver in the diagonal box; shuttle in hand. */
function resetForServe(state: SpState) {
  const server = state.server
  const { xSign } = serveBox(server, state.score[server])
  const { shortLine } = state.court
  for (const p of state.players) {
    const serving = p.side === server
    const pos = serving
      ? toWorld(p.side, xSign * SERVE_X, -(shortLine + SERVE_BACK))
      : toWorld(p.side, xSign * RECEIVE_X, -(shortLine + RECEIVE_BACK))
    p.x = pos.x
    p.z = pos.z
    p.vx = 0
    p.vz = 0
    p.recoverUntil = -1
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
  chargeAt: -1,
  recoverUntil: -1,
  pressAt: -1,
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
    court: courtDims(courtSizeOf(options.court)),
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
  emit(state, { k: 'serve', side: p.side, shot: kind })
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
) {
  const s = state.shuttle
  const c = s.lastHitter === p.side || s.pending ? null : contactFor(state, p, rewind)
  if (!c) {
    emit(state, { k: 'whiff', side: p.side })
    return
  }
  const kind = chooseShot(held, c.y, c.grade)
  s.pending = {
    atTick: Math.max(c.tick, state.tick),
    side: p.side,
    kind,
    grade: c.grade,
    aimX: held.x,
    charge,
    fromTick: launchTick(c.tick, state.tick - Math.min(MAX_REWIND, Math.max(0, lag))),
  }
  if (s.pending.atTick === state.tick) hit(state)
}

/** The contact a swing `rewind` ticks ago would make (resolveSwing's rules), or null = a whiff. */
function contactFor(
  state: SpState,
  p: SpPlayer,
  rewind: number,
): { tick: number; y: number; grade: Grade } | null {
  const s = state.shuttle
  const swingTick = state.tick - rewind
  return pickContact(
    contactCandidates(state, p, rewind),
    s,
    state.tick,
    p,
    p.side,
    s.lastHitter,
    swingTick,
    state.tick,
    perfectWindowOf(s.pressured),
  )
}

/**
 * contactFor's past candidates: each `history` shuttle position, with `p`'s reach measured from where it
 * saw itself beside that shuttle (its own chibi runs ahead of the shown shuttle by the rewind, a guest's
 * being predicted, so its spot `rewind` ticks later, or now).
 */
export function contactCandidates(state: SpState, p: SpPlayer, rewind: number): ContactCandidate[] {
  const hist = state.history
  return hist.map((h, i) => ({ tick: h.tick, pos: h.pos, at: seenAt(hist, i, rewind, state.tick, p) }))
}

/** `p`'s spot (by side) at tick hist[i].tick + rewind: from the history (contiguous ticks), or now. */
function seenAt(
  hist: SpState['history'],
  i: number,
  rewind: number,
  now: number,
  p: SpPlayer,
): { x: number; z: number } {
  const want = hist[i].tick + rewind
  if (want >= now) return p
  const j = i + rewind
  if (j < hist.length && hist[j].tick === want) return hist[j].who[p.side]
  for (const h of hist) if (h.tick === want) return h.who[p.side]
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
  const p = state.players[pend.side]
  if (sq(s.pos.x - p.x) + sq(s.pos.z - p.z) > sq(REACH.radius + PENDING_SLACK)) {
    s.pending = null
    emit(state, { k: 'whiff', side: pend.side })
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
  emit(state, { k: 'hit', side: pend.side, grade: pend.grade, shot: pend.kind, charge: pend.charge, power })
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
  const hitter = s.lastHitter === -1 ? state.server : s.lastHitter
  const landSide: 0 | 1 = s.pos.z > 0 ? 1 : s.pos.z < 0 ? 0 : other(hitter)
  const { halfWidth, halfLen } = state.court
  const inCourt = Math.abs(s.pos.x) <= halfWidth && Math.abs(s.pos.z) <= halfLen
  emit(state, { k: 'land', x: s.pos.x, z: s.pos.z, in: inCourt })
  scorePoint(state, inCourt && landSide !== hitter ? hitter : other(hitter))
}

function recordHistory(state: SpState) {
  const { pos, vel } = state.shuttle
  const [a, b] = state.players
  state.history.push({
    tick: state.tick,
    pos: { ...pos },
    vel: { ...vel },
    who: [
      { x: a.x, z: a.z },
      { x: b.x, z: b.z },
    ],
  })
  if (state.history.length > HISTORY_TICKS) state.history.splice(0, state.history.length - HISTORY_TICKS)
}

/** May `p` start charging now: in a rally, or the server in the serve (the cooldown may still run). */
export function canCharge(state: SpState, p: SpPlayer): boolean {
  return state.phase === 'rally' || (state.phase === 'serve' && p.side === state.server)
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
 * The computer never wears a human's look: an AI seat on a taken preset moves to the next free one.
 * (Two humans may match; the view tints the far one.)
 */
export function separateAi(state: SpState): void {
  const taken = (n: number) => state.players.some((h) => h.kind === 'human' && h.preset === n)
  for (const q of state.players)
    if (q.kind === 'ai')
      if (!isAvailable(q.preset) || taken(q.preset)) q.preset = nextAvailable(q.preset, taken)
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
    }
  }
  for (const p of state.players) {
    if (state.phase === 'serve' && p.side === state.server) {
      // The server stands still in the box until the serve.
      p.vx = 0
      p.vz = 0
    } else stepPlayer(p, DT, speedMulOf(p, state.tick), state.court)
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
    for (const { p, held, rewind, charge, lag } of swings) {
      if (s.lastHitter !== hitter) emit(state, { k: 'whiff', side: p.side })
      else resolveSwing(state, p, held, rewind, charge, lag)
    }
    for (const p of presses)
      if (s.lastHitter === hitter && !swings.some((w) => w.p === p)) tapOnPress(state, p)
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

export const shuttlePopGame: GameDefinition<SpState, SpInput> = {
  id: 'shuttle-pop',
  tickRate: TICK_RATE,
  options: [
    {
      id: 'solo',
      label: t('Playing alone'),
      aloneOnly: true,
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
