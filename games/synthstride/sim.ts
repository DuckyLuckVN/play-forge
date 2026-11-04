// Synthstride simulation: pure, seeded, 60 ticks a second, 1–4 dancers.
// A beat clock drives everything. Strikes are scheduled onto future beats and
// warned ahead; the soundtrack is played from the beat clock, so music,
// warnings and strikes never drift apart. The song loops verse → build-up →
// drop (see song.ts); drops score double.
//
// Multiplayer: in 'shared' mode everyone dances on one board; in 'race' mode
// each dancer has their own board (same seed, so the same song and, until
// fairness choices differ, the same hazards). The match ends only when every
// dancer is out; the highest score wins.
//
// Network: the sim runs on the host. Moves can carry the tick the player
// pressed on their own screen (`right@1234.5:7`, with a sequence number), so
// a guest's timing is judged as they saw it and their hits are decided from
// where they were by their own clock (up to MAX_LAG ticks, 250 ms, back).

import { random, randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { tierAt } from '@forge/reflex'
import { addCombo, comboMultiplier, createVitals, damage, regen, type Vitals } from '@forge/reflex/vitals'
import { neighbours, remap, stepFrom, tileAt, type Step } from './grid'
import { t } from './i18n'
import { chainPath, isNext, type Note } from './notes'
import { dangerByBeat, makePattern, pickKind, survivable, type Strike, type StrikePlan } from './patterns'
import { bpmAt, isTempo, sectionAt, type Section, type Tempo } from './song'

export type { Note } from './notes'
export type { Strike, StrikeKind } from './patterns'
export type { Section, Tempo } from './song'

export type Mode = 'shared' | 'race'
const isMode = (v: unknown): v is Mode => v === 'shared' || v === 'race'

/**
 * A step (optionally timed: `right@<tick>:<seq>`), the skill, or
 * `lat<ticks>`: this player's calibrated timing offset (sent once at start).
 */
export type StrideInput = Step | `${Step}@${number}:${number}` | 'overdrive' | `lat${number}`

export const TICK_RATE = 60
export const MAX_PLAYERS = 4
/** Move timing: within this many ticks of a beat is Perfect (≈ 83 ms) / Good (≈ 150 ms). */
export const PERFECT_TICKS = 5
export const GOOD_TICKS = 9
/** Strikes hurt from this many ticks after they land (a late step out still escapes)… */
export const STRIKE_GRACE = 6
/** …for this long. */
export const STRIKE_ACTIVE = 8
/** Largest calibrated timing offset (12 ticks = 200 ms). */
export const MAX_LATENCY = 12
/**
 * Furthest back a timed move may claim: the network round trip we compensate
 * (250 ms covers most phones and long-distance rooms).
 */
export const MAX_LAG = 15

export const TIER_TICKS = 20 * TICK_RATE
export const MAX_TIER = 9
/** Boards grow from 4×4 to 5×5 at this tier. */
export const GROW_TIER = 4
export const MAX_HEARTS = 3
export const INVULN_TICKS = 60
export const REGEN_TICKS = 40 * TICK_RATE
export const OVERDRIVE_COST = 8
export const OVERDRIVE_BEATS = 8
export const DEATH_TICKS = 120
export const GROOVE_PER = 8
export const MAX_GROOVE = 4
/** Position history kept per dancer for late (timed) hit checks. */
const TRAIL_TICKS = 40

/** Notes score more the further along their chain; a full chain pays a bonus. */
export const POINTS = { perfect: 10, good: 5, note: 20, noteOnBeat: 10, chain: 30, dodge: 15 }

/** Chance a beat brings a new pattern (per board). */
export function densityAt(tier: number, section: Section): number {
  const base = 0.45 + (0.4 * Math.min(tier, MAX_TIER)) / MAX_TIER
  return section === 'build' ? base * 0.5 : section === 'drop' ? Math.min(0.95, base + 0.15) : base
}

export type Rating = 'perfect' | 'good' | 'off'

export type StrideEvent =
  | { type: 'beat'; beat: number }
  | { type: 'offbeat'; beat: number }
  | { type: 'section'; section: Section }
  | { type: 'tier'; tier: number; bpm: number }
  | { type: 'move'; p: string; from: number; to: number; rating: Rating | null; points: number }
  /** Tried to step into a hole. */
  | { type: 'bump'; p: string; tile: number }
  | { type: 'warn'; b: number; id: number; lead: number }
  | { type: 'strike'; b: number; id: number }
  | { type: 'hit'; p: string }
  | { type: 'dodge'; p: string; points: number }
  | { type: 'note'; p: string; b: number; tile: number; points: number; index: number; length: number }
  | { type: 'chain'; p: string; points: number; length: number }
  | { type: 'noteSpawn'; b: number; tiles: number[] }
  | { type: 'charged'; p: string }
  | { type: 'overdrive'; p: string }
  | { type: 'overdriveEnd'; p: string }
  | { type: 'multiplier'; p: string; mult: number }
  | { type: 'grooveLost'; p: string }
  | { type: 'heal'; p: string }
  | { type: 'grow'; b: number; n: number }
  | { type: 'die'; p: string }
  | { type: 'over' }

export interface StrideStats {
  perfects: number
  goods: number
  notes: number
  chains: number
  dodges: number
  topBpm: number
}

export interface Board {
  id: number
  /** Size (n × n). */
  n: number
  /** Waiting for the board to clear before growing. */
  growPending: boolean
  strikes: Strike[]
  notes: Note[]
  rng: RngState
  nextId: number
  /** Everyone on it is out: nothing more happens here. */
  closed: boolean
}

export interface Dancer {
  id: string
  slot: number
  board: number
  /** Tile index (row * n + col). */
  pos: number
  movedAt: number
  /** Beat whose timing window was already used by a rated move. */
  ratedBeat: number
  /** Calibrated timing offset in ticks, applied to ratings only. */
  latency: number
  /** Recent network delay of this dancer's timed moves (ticks, ≤ MAX_LAG). */
  lag: number
  /** Last timed move processed (clients use it to settle their prediction). */
  seq: number
  /** Where they stood since when (by their own clock), newest last. */
  trail: { at: number; pos: number }[]
  vitals: Vitals
  charge: number
  overdriveUntil: number
  score: number
  stats: StrideStats
  diedAt: number | null
}

export interface StrideState {
  tick: number
  tempo: Tempo
  mode: Mode
  tier: number
  bpm: number
  /** Beats so far (the first is 0) and progress to the next, 0..1. */
  beat: number
  phase: number
  lastBeatTick: number
  section: Section
  dancers: Dancer[]
  boards: Board[]
  events: StrideEvent[]
  /** Everyone is out: the match ends at this tick (after the last death plays out). */
  endAt: number | null
  over: boolean
}

/** Starting tiles by seat, spread around the middle. */
function startTile(slot: number, n: number): number {
  const spots =
    n >= 5
      ? [
          [1, 2],
          [3, 2],
          [2, 1],
          [2, 3],
        ]
      : [
          [1, 2],
          [2, 1],
          [1, 1],
          [2, 2],
        ]
  const [c, r] = spots[slot % spots.length]
  return tileAt(c, r, n)
}

function newBoard(id: number, n: number, seed: number): Board {
  return { id, n, growPending: false, strikes: [], notes: [], rng: { seed }, nextId: 1, closed: false }
}

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): StrideState {
  const tempo: Tempo = isTempo(options.tempo) ? options.tempo : 'normal'
  const mode: Mode = isMode(options.mode) ? options.mode : 'shared'
  const bpm = bpmAt(0, MAX_TIER, tempo)
  const seats = players.length ? players.slice(0, MAX_PLAYERS) : [{ id: 'p0', slot: 0 } as PlayerInfo]
  const shared = mode === 'shared' || seats.length === 1
  // A crowded shared floor starts at 5×5.
  const n = shared && seats.length >= 3 ? 5 : 4
  const boards = shared ? [newBoard(0, n, seed)] : seats.map((_, i) => newBoard(i, n, seed))
  const dancers: Dancer[] = seats.map((p, i) => {
    const board = shared ? 0 : i
    const pos = startTile(shared ? i : 0, n)
    return {
      id: p.id,
      slot: p.slot ?? i,
      board,
      pos,
      movedAt: -Infinity,
      ratedBeat: -99,
      latency: 0,
      lag: 0,
      seq: 0,
      trail: [{ at: 0, pos }],
      vitals: createVitals(MAX_HEARTS),
      charge: 0,
      overdriveUntil: -1,
      score: 0,
      stats: { perfects: 0, goods: 0, notes: 0, chains: 0, dodges: 0, topBpm: bpm },
      diedAt: null,
    }
  })
  return {
    tick: 0,
    tempo,
    mode: shared ? 'shared' : 'race',
    tier: 0,
    bpm,
    beat: -1,
    // The first beat lands a moment after the start.
    phase: 0.5,
    lastBeatTick: -Infinity,
    section: 'intro',
    dancers,
    boards,
    events: [],
    endAt: null,
    over: false,
  }
}

export const alive = (d: Dancer) => d.diedAt === null
export const dancerOf = (s: StrideState, id: string) => s.dancers.find((d) => d.id === id)
export const onBoard = (s: StrideState, b: Board) => s.dancers.filter((d) => d.board === b.id)
export const overdriveActive = (s: StrideState, d: Dancer) => s.beat < d.overdriveUntil
export const grooveMult = (d: Dancer) => comboMultiplier(d.vitals.combo, GROOVE_PER, MAX_GROOVE)
/** Points multiplier now: groove ×1..×4, doubled in Overdrive and again in a drop. */
export const mult = (s: StrideState, d: Dancer) =>
  grooveMult(d) * (overdriveActive(s, d) ? 2 : 1) * (s.section === 'drop' ? 2 : 1)
/** Ticks per beat at the current tempo. */
export const beatTicks = (s: Pick<StrideState, 'bpm'>) => (60 * TICK_RATE) / s.bpm

/**
 * Holes that have opened and still block their tiles. They stop blocking on
 * their last unsafe beat, so you can step in to stand there on the next one.
 */
export const openHoles = (s: StrideState, b: Board) =>
  b.strikes.filter((st) => st.kind === 'hole' && st.firedAt !== undefined && s.beat < st.beat + st.hold)

/**
 * Timing of a press at (fractional) tick `at` against the nearest beat, where
 * `now` is the tick `s.phase` belongs to. Inside `step` that is `s.tick`; for a
 * received state (already stepped) it is `s.tick - 1`. Pure, so clients can
 * predict their own ratings.
 */
export function rateAt(s: Pick<StrideState, 'bpm' | 'phase' | 'beat'>, now: number, at: number) {
  const bt = beatTicks(s)
  const last = now - s.phase * bt
  let best = { off: Infinity, beat: s.beat }
  for (const k of [-1, 0, 1]) {
    const off = Math.abs(at - (last + k * bt))
    if (off < best.off) best = { off, beat: s.beat + k }
  }
  const rating: Rating = best.off <= PERFECT_TICKS ? 'perfect' : best.off <= GOOD_TICKS ? 'good' : 'off'
  return { rating, beat: best.beat }
}

/** Where a dancer stood during [from, to) by their own clock (from their trail). */
export function positionsDuring(d: Pick<Dancer, 'trail'>, from: number, to: number): Set<number> {
  const out = new Set<number>()
  const trail = d.trail
  for (let i = 0; i < trail.length; i++) {
    const start = trail[i].at
    const end = i + 1 < trail.length ? trail[i + 1].at : Infinity
    if (start < to && end > from) out.add(trail[i].pos)
  }
  return out
}

function addStrikes(s: StrideState, b: Board, plans: StrikePlan[], lead: number) {
  const group = plans.length > 1 ? b.nextId : undefined
  for (const p of plans) {
    const st: Strike = { ...p, id: b.nextId++, group }
    b.strikes.push(st)
    s.events.push({ type: 'warn', b: b.id, id: st.id, lead })
  }
}

/** On a beat: maybe warn a new pattern, if it leaves a way through for everyone on the board. */
function scheduleStrike(s: StrideState, b: Board) {
  if (s.section === 'intro' || b.growPending || b.closed || random(b.rng) >= densityAt(s.tier, s.section))
    return
  // One-beat warnings only at higher tiers, and never at very high tempo.
  const lead = s.tier >= 6 && s.bpm <= 150 && random(b.rng) < 0.35 ? 1 : 2
  const offBeat = s.tier >= 7 && random(b.rng) < 0.3
  const level = s.tier + (s.section === 'drop' ? 2 : 0)
  const here = onBoard(s, b).filter(alive)
  for (let attempt = 0; attempt < 5; attempt++) {
    const plans = makePattern(pickKind(level, b.rng), b.rng, b.n, s.beat, s.beat + lead, offBeat)
    const all = [...b.strikes, ...plans]
    // Fair from where each dancer stands and from anywhere one step away (they may be mid-move).
    const fair = here.every((d) =>
      neighbours(d.pos, b.n).every((t) => survivable(t, s.beat, all, b.n, t !== d.pos)),
    )
    if (!fair) continue
    addStrikes(s, b, plans, lead)
    return
  }
}

/** Build-ups always bring a long chain; otherwise short ones now and then. */
function maybeChain(s: StrideState, b: Board, sectionStart: boolean) {
  if (s.section === 'intro' || b.growPending || b.closed || b.notes.length) return
  const build = s.section === 'build' && sectionStart
  if (!build && random(b.rng) >= 0.15) return
  const length = build
    ? 4 + randomInt(b.rng, 2)
    : s.tier >= 2
      ? 2 + randomInt(b.rng, 2)
      : 1 + randomInt(b.rng, 2)
  const blocked = new Set(onBoard(s, b).map((d) => d.pos))
  for (const set of dangerByBeat(b.strikes).values()) for (const tile of set) blocked.add(tile)
  const path = chainPath(b.rng, b.n, length, blocked)
  if (!path?.length) return
  const chain = b.nextId++
  const until = s.beat + (build ? 12 : 6 + path.length * 2)
  path.forEach((tile, index) =>
    b.notes.push({ id: b.nextId++, tile, chain, index, length: path.length, until }),
  )
  s.events.push({ type: 'noteSpawn', b: b.id, tiles: path })
}

function gainCharge(s: StrideState, d: Dancer, amount = 1) {
  if (d.charge >= OVERDRIVE_COST) return
  d.charge = Math.min(OVERDRIVE_COST, d.charge + amount)
  if (d.charge === OVERDRIVE_COST) s.events.push({ type: 'charged', p: d.id })
}

function groove(s: StrideState, d: Dancer) {
  const up = addCombo(d.vitals, GROOVE_PER, MAX_GROOVE)
  if (up) s.events.push({ type: 'multiplier', p: d.id, mult: up })
}

/** A step pressed at (fractional) tick `at` by the player's own clock. */
function move(s: StrideState, d: Dancer, dir: Step, at: number) {
  const b = s.boards[d.board]
  const to = stepFrom(d.pos, dir, b.n)
  if (to === d.pos) return
  if (openHoles(s, b).some((h) => h.tiles.includes(to))) {
    s.events.push({ type: 'bump', p: d.id, tile: to })
    return
  }
  const from = d.pos
  d.pos = to
  d.movedAt = s.tick
  d.trail.push({ at: Math.max(at, d.trail.at(-1)!.at), pos: to })
  const { rating, beat } = rateAt(s, s.tick, at - d.latency)
  let shown: Rating | null = null
  let points = 0
  if (rating === 'off') {
    // Off the beat: you still move (dodging comes first), but the groove resets.
    if (d.vitals.combo > 0) s.events.push({ type: 'grooveLost', p: d.id })
    d.vitals.combo = 0
    shown = 'off'
  } else if (beat !== d.ratedBeat) {
    d.ratedBeat = beat
    shown = rating
    groove(s, d)
    points = (rating === 'perfect' ? POINTS.perfect : POINTS.good) * mult(s, d)
    if (rating === 'perfect') d.stats.perfects++
    else d.stats.goods++
  }
  d.score += points
  s.events.push({ type: 'move', p: d.id, from, to, rating: shown, points })
  takeNote(s, d, b, to, rating !== 'off')
}

function takeNote(s: StrideState, d: Dancer, b: Board, tile: number, onBeat: boolean) {
  const note = b.notes.find((n) => n.tile === tile)
  if (!note || !isNext(note, b.notes)) return
  b.notes = b.notes.filter((n) => n !== note)
  const points = (POINTS.note * (note.index + 1) + (onBeat ? POINTS.noteOnBeat : 0)) * mult(s, d)
  d.score += points
  d.stats.notes++
  gainCharge(s, d)
  s.events.push({ type: 'note', p: d.id, b: b.id, tile, points, index: note.index, length: note.length })
  if (note.length > 1 && note.index === note.length - 1) {
    const bonus = POINTS.chain * note.length * mult(s, d)
    d.score += bonus
    d.stats.chains++
    gainCharge(s, d, 2)
    s.events.push({ type: 'chain', p: d.id, points: bonus, length: note.length })
  }
}

const TIMED = /^(up|down|left|right)@(\d+(?:\.\d+)?):(\d+)$/
const LATENCY = /^lat(\d{1,3})$/

function applyInput(s: StrideState, d: Dancer, input: StrideInput) {
  if (!alive(d)) return
  if (input === 'overdrive') {
    if (d.charge < OVERDRIVE_COST || overdriveActive(s, d)) return
    d.charge = 0
    d.overdriveUntil = s.beat + OVERDRIVE_BEATS
    s.events.push({ type: 'overdrive', p: d.id })
    return
  }
  if (input === 'up' || input === 'down' || input === 'left' || input === 'right') {
    move(s, d, input, s.tick)
    return
  }
  const timed = TIMED.exec(input)
  if (timed) {
    const seq = Number(timed[3])
    if (seq <= d.seq) return // already handled (or replayed): never twice
    d.seq = seq
    // Trust the player's clock, but never further back than MAX_LAG, nor in the future.
    const at = Math.min(s.tick, Math.max(s.tick - MAX_LAG, Number(timed[2])))
    d.lag = Math.max(d.lag * 0.98, s.tick - at)
    move(s, d, timed[1] as Step, at)
    return
  }
  const lat = LATENCY.exec(input)
  if (lat) d.latency = Math.min(MAX_LATENCY, Number(lat[1]))
}

function grow(s: StrideState, b: Board) {
  const from = b.n
  b.n = 5
  b.growPending = false
  for (const d of onBoard(s, b)) {
    d.pos = remap(d.pos, from, b.n)
    d.trail = [{ at: s.tick, pos: d.pos }]
  }
  for (const note of b.notes) note.tile = remap(note.tile, from, b.n)
  s.events.push({ type: 'grow', b: b.id, n: b.n })
}

function fire(s: StrideState, beat: number) {
  for (const b of s.boards)
    for (const st of b.strikes)
      if (st.beat === beat && st.firedAt === undefined) {
        st.firedAt = s.tick
        s.events.push({ type: 'strike', b: b.id, id: st.id })
      }
}

function onBeat(s: StrideState) {
  s.beat++
  s.lastBeatTick = s.tick
  s.events.push({ type: 'beat', beat: s.beat })
  const section = sectionAt(s.beat)
  const sectionStart = section !== s.section
  if (sectionStart) {
    s.section = section
    s.events.push({ type: 'section', section })
  }
  for (const d of s.dancers)
    if (alive(d) && s.beat === d.overdriveUntil) s.events.push({ type: 'overdriveEnd', p: d.id })
  fire(s, s.beat)
  for (const b of s.boards) {
    b.notes = b.notes.filter((n) => n.until > s.beat)
    if (b.growPending && b.strikes.length === 0) grow(s, b)
    scheduleStrike(s, b)
    maybeChain(s, b, sectionStart)
  }
}

/** Ticks after landing when a strike is settled for this dancer (their timed moves may still come in). */
const settleAt = (st: Strike, d: Dancer) => st.firedAt! + STRIKE_GRACE + STRIKE_ACTIVE + Math.ceil(d.lag)

function updateStrikes(s: StrideState, b: Board) {
  const here = onBoard(s, b).filter(alive)
  for (const st of b.strikes) {
    if (st.firedAt === undefined) {
      for (const d of here) {
        st.threatened ??= []
        if (st.tiles.includes(d.pos) && !st.threatened.includes(d.id)) st.threatened.push(d.id)
      }
      continue
    }
    const from = st.firedAt + STRIKE_GRACE
    const to = from + STRIKE_ACTIVE
    for (const d of here) {
      if (st.settled?.includes(d.id)) continue
      // No real network delay (solo, the host: ≤ 2 ticks): hit the moment you're in it, as before.
      const local = d.lag < 2
      const inNow = local && s.tick >= from && s.tick < to && st.tiles.includes(d.pos)
      if (!inNow && s.tick < settleAt(st, d)) continue
      st.settled ??= []
      st.settled.push(d.id)
      const wasIn = inNow || [...positionsDuring(d, from, to)].some((tile) => st.tiles.includes(tile))
      if (wasIn && !overdriveActive(s, d)) {
        if (damage(d.vitals, s.tick, INVULN_TICKS)) s.events.push({ type: 'hit', p: d.id })
      } else if (st.threatened?.includes(d.id)) {
        const points = POINTS.dodge * mult(s, d)
        d.score += points
        d.stats.dodges++
        gainCharge(s, d)
        s.events.push({ type: 'dodge', p: d.id, points })
      }
    }
  }
  b.strikes = b.strikes.filter((st) => {
    if (st.firedAt === undefined) return true
    const pending = here.some((d) => !st.settled?.includes(d.id))
    const holding = st.hold > 0 && s.beat < Math.ceil(st.beat) + st.hold
    return pending || holding
  })
}

function die(s: StrideState, d: Dancer) {
  d.diedAt = s.tick
  d.stats.topBpm = Math.max(d.stats.topBpm, s.bpm)
  s.events.push({ type: 'die', p: d.id })
  const b = s.boards[d.board]
  if (onBoard(s, b).every((o) => !alive(o))) {
    b.closed = true
    b.strikes = []
    b.notes = []
  }
  if (s.dancers.every((o) => !alive(o))) s.endAt = s.tick + DEATH_TICKS - 1
}

export function step(s: StrideState, inputs: InputEvent<StrideInput>[]): StrideState {
  if (s.over) return s
  s.events = []
  if (s.endAt !== null) {
    // Everyone is out: the last death plays out (the music stops), then results.
    if (s.tick >= s.endAt) {
      s.over = true
      s.events.push({ type: 'over' })
    } else s.tick++
    return s
  }
  const tier = tierAt(s.tick, TIER_TICKS, MAX_TIER)
  if (tier > s.tier) {
    s.tier = tier
    s.bpm = bpmAt(tier, MAX_TIER, s.tempo)
    for (const d of s.dancers) if (alive(d)) d.stats.topBpm = Math.max(d.stats.topBpm, s.bpm)
    if (tier >= GROW_TIER) for (const b of s.boards) if (b.n < 5 && !b.closed) b.growPending = true
    s.events.push({ type: 'tier', tier, bpm: s.bpm })
  }
  const before = s.phase
  s.phase += s.bpm / (60 * TICK_RATE)
  if (s.phase >= 1) {
    s.phase -= 1
    onBeat(s)
  } else if (before < 0.5 && s.phase >= 0.5) {
    s.events.push({ type: 'offbeat', beat: s.beat })
    fire(s, s.beat + 0.5)
  }
  for (const { player, input } of inputs) {
    const d = dancerOf(s, player)
    if (d && typeof input === 'string') applyInput(s, d, input)
  }
  for (const b of s.boards) if (!b.closed) updateStrikes(s, b)
  for (const d of s.dancers) {
    if (!alive(d)) continue
    // Keep only the history a late hit check can still need.
    while (d.trail.length > 1 && d.trail[1].at <= s.tick - TRAIL_TICKS) d.trail.shift()
    if (regen(d.vitals, s.tick, REGEN_TICKS)) s.events.push({ type: 'heal', p: d.id })
    if (d.vitals.hearts <= 0) die(s, d)
  }
  s.tick++
  return s
}

/** Highest score first; ties go to whoever lasted longer. */
export function ranking(s: StrideState): Dancer[] {
  return [...s.dancers].sort((a, b) => b.score - a.score || (b.diedAt ?? Infinity) - (a.diedAt ?? Infinity))
}

/**
 * What guests receive each tick: the state without host-only bookkeeping
 * (position trails, random-number state, per-strike hit tracking). Guests only
 * render, so they never need those; this cuts what the host sends.
 */
export function netView(s: StrideState): StrideState {
  return {
    ...s,
    dancers: s.dancers.map(({ trail: _trail, ...d }) => ({ ...d, trail: [] })),
    boards: s.boards.map((b) => ({
      ...b,
      rng: { seed: 0 },
      strikes: b.strikes.map(({ threatened: _t, settled: _s, ...st }) => st),
    })),
  }
}

export const synthstride: GameDefinition<StrideState, StrideInput> = {
  id: 'synthstride',
  tickRate: TICK_RATE,
  minPlayers: 1,
  maxPlayers: MAX_PLAYERS,
  options: [
    {
      id: 'tempo',
      label: t('Tempo'),
      default: 'normal',
      choices: [
        { value: 'chill', label: t('Chill') },
        { value: 'normal', label: t('Normal') },
        { value: 'hyper', label: t('Hyper') },
      ],
    },
    {
      id: 'mode',
      label: t('With friends'),
      default: 'shared',
      choices: [
        { value: 'shared', label: t('Shared floor') },
        { value: 'race', label: t('Own boards') },
      ],
    },
  ],
  setup: (players, seed, options) => createState(players, seed, options),
  netView,
  tick: step,
  isFinished: (s) => s.over,
  // Gone for good mid-match: counts as out, so the match can still end.
  removePlayer(s, id) {
    const d = dancerOf(s, id)
    if (d && alive(d)) die(s, d)
  },
}

export const displayScore = (d: Pick<Dancer, 'score'>) => Math.floor(d.score)
