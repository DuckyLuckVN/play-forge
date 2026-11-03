// Synthstride simulation: pure, seeded, 60 ticks a second.
// A 4×4 grid and a beat clock. Strikes are scheduled onto future beats and
// warned ahead; the soundtrack is played from the `beat` events, so the music,
// warnings and strikes can never drift apart (and they pause together).

import { random, randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, InputEvent, PlayerInfo } from '@forge/net/session'
import { ramp, tierAt } from '@forge/reflex'
import { addCombo, comboMultiplier, createVitals, damage, regen, type Vitals } from '@forge/reflex/vitals'

export type StrideInput = 'up' | 'down' | 'left' | 'right' | 'drop'

export const TICK_RATE = 60
export const N = 4
export const TILES = N * N
/** Move timing: within this many ticks of a beat is Perfect (≈ 83 ms) / Good (≈ 150 ms). */
export const PERFECT_TICKS = 5
export const GOOD_TICKS = 9
/** Strikes hurt from this many ticks after their beat (a late step out still escapes)… */
export const STRIKE_GRACE = 6
/** …for this long. */
export const STRIKE_ACTIVE = 8
/** Music only for the first beats, then the strikes start. */
export const OPENING_BEATS = 8

export const TIER_TICKS = 20 * TICK_RATE
export const MAX_TIER = 9
export const MAX_HEARTS = 3
export const INVULN_TICKS = 60
export const REGEN_TICKS = 40 * TICK_RATE
export const DROP_COST = 8
export const DROP_BEATS = 8
export const DEATH_TICKS = 120
export const GROOVE_PER = 8
export const MAX_MULT = 4
/** Beats a note stays on the board. */
export const NOTE_BEATS = 8

export const POINTS = { perfect: 10, good: 5, note: 25, noteOnBeat: 15, dodge: 15 }

/** Tempo: 100 → 150 BPM. */
export const bpmAt = (tier: number) => Math.round(ramp(tier, MAX_TIER, 100, 150))
/** Chance a beat brings a new strike. */
export const densityAt = (tier: number) => ramp(tier, MAX_TIER, 0.45, 0.85)

export type StrikeKind = 'tiles' | 'row' | 'col' | 'cross' | 'checker'
export interface Strike {
  id: number
  kind: StrikeKind
  tiles: number[]
  /** Beat it was warned on, and the beat it lands on. */
  warnBeat: number
  beat: number
  /** Tick it landed (set on its beat). */
  firedAt?: number
  /** Player stood in it during the warning (escaping = a dodge). */
  threatened?: boolean
  hit?: boolean
}

export interface Note {
  id: number
  tile: number
  until: number
}

export type Rating = 'perfect' | 'good' | 'off'

export type StrideEvent =
  | { type: 'beat'; beat: number }
  | { type: 'move'; from: number; to: number; rating: Rating | null; points: number }
  | { type: 'warn'; id: number; lead: number }
  | { type: 'strike'; id: number }
  | { type: 'hit' }
  | { type: 'dodge'; points: number }
  | { type: 'note'; tile: number; points: number }
  | { type: 'noteSpawn'; tile: number }
  | { type: 'charged' }
  | { type: 'drop' }
  | { type: 'dropEnd' }
  | { type: 'multiplier'; mult: number }
  | { type: 'grooveLost' }
  | { type: 'heal' }
  | { type: 'tier'; tier: number; bpm: number }
  | { type: 'die' }
  | { type: 'over' }

export interface StrideStats {
  perfects: number
  goods: number
  notes: number
  dodges: number
  topBpm: number
}

export interface StrideState {
  tick: number
  rng: RngState
  tier: number
  bpm: number
  /** Beats so far (the first beat is 0) and progress to the next, 0..1. */
  beat: number
  phase: number
  lastBeatTick: number
  score: number
  playerId: string
  /** Tile index (row * N + col). */
  pos: number
  /** Tick of the last move (for the hop animation). */
  movedAt: number
  /** Beat whose timing window was already used by a rated move. */
  ratedBeat: number
  vitals: Vitals
  charge: number
  dropUntil: number
  strikes: Strike[]
  notes: Note[]
  nextId: number
  stats: StrideStats
  events: StrideEvent[]
  diedAt: number | null
  over: boolean
}

export function createState(players: PlayerInfo[], seed: number): StrideState {
  return {
    tick: 0,
    rng: { seed },
    tier: 0,
    bpm: bpmAt(0),
    beat: -1,
    // The first beat lands a moment after the start.
    phase: 0.5,
    lastBeatTick: -Infinity,
    score: 0,
    playerId: players[0]?.id ?? 'p0',
    pos: tileAt(1, 2),
    movedAt: -Infinity,
    ratedBeat: -1,
    vitals: createVitals(MAX_HEARTS),
    charge: 0,
    dropUntil: -1,
    strikes: [],
    notes: [],
    nextId: 1,
    stats: { perfects: 0, goods: 0, notes: 0, dodges: 0, topBpm: bpmAt(0) },
    events: [],
    diedAt: null,
    over: false,
  }
}

export const tileAt = (col: number, row: number) => row * N + col
export const colOf = (t: number) => t % N
export const rowOf = (t: number) => Math.floor(t / N)
export const dropActive = (s: StrideState) => s.beat < s.dropUntil
export const mult = (s: StrideState) =>
  comboMultiplier(s.vitals.combo, GROOVE_PER, MAX_MULT) * (dropActive(s) ? 2 : 1)
/** Ticks per beat at the current tempo. */
export const beatTicks = (s: StrideState) => (60 * TICK_RATE) / s.bpm

/** Tiles reachable in one step (or by staying). */
export function neighbours(t: number): number[] {
  const c = colOf(t)
  const r = rowOf(t)
  const out = [t]
  if (c > 0) out.push(t - 1)
  if (c < N - 1) out.push(t + 1)
  if (r > 0) out.push(t - N)
  if (r < N - 1) out.push(t + N)
  return out
}

/** Tiles a pattern covers (random row / column / tiles; `count` for 'tiles'). */
export function patternTiles(kind: StrikeKind, rng: RngState, count = 1): number[] {
  switch (kind) {
    case 'row': {
      const r = randomInt(rng, N)
      return Array.from({ length: N }, (_, c) => tileAt(c, r))
    }
    case 'col': {
      const c = randomInt(rng, N)
      return Array.from({ length: N }, (_, r) => tileAt(c, r))
    }
    case 'cross': {
      const c = randomInt(rng, N)
      const r = randomInt(rng, N)
      const set = new Set<number>()
      for (let i = 0; i < N; i++) {
        set.add(tileAt(i, r))
        set.add(tileAt(c, i))
      }
      return [...set]
    }
    case 'checker': {
      const parity = randomInt(rng, 2)
      return Array.from({ length: TILES }, (_, t) => t).filter((t) => (colOf(t) + rowOf(t)) % 2 === parity)
    }
    case 'tiles': {
      const set = new Set<number>()
      while (set.size < count) set.add(randomInt(rng, TILES))
      return [...set]
    }
  }
}

/** Danger per future beat, from the scheduled strikes (plus an optional extra). */
function dangerByBeat(strikes: Strike[], extra?: Strike): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  for (const st of extra ? [...strikes, extra] : strikes) {
    if (st.firedAt !== undefined) continue
    const set = map.get(st.beat) ?? new Set<number>()
    for (const t of st.tiles) set.add(t)
    map.set(st.beat, set)
  }
  return map
}

/**
 * Can someone on `from` survive every scheduled strike, moving at most one
 * tile per beat? (Real players can do more: this is the conservative bound.)
 * `moved`: they already used this beat's step to get to `from`.
 */
export function survivable(
  from: number,
  nowBeat: number,
  strikes: Strike[],
  extra?: Strike,
  moved = false,
): boolean {
  const danger = dangerByBeat(strikes, extra)
  const last = Math.max(nowBeat, ...danger.keys())
  let reach = new Set([from])
  for (let b = nowBeat + 1; b <= last; b++) {
    const next = new Set<number>(b === nowBeat + 1 && moved ? reach : [])
    if (!(b === nowBeat + 1 && moved)) for (const t of reach) for (const n of neighbours(t)) next.add(n)
    const bad = danger.get(b)
    if (bad) for (const t of bad) next.delete(t)
    if (next.size === 0) return false
    reach = next
  }
  return true
}

function pickKind(s: StrideState): { kind: StrikeKind; count: number } {
  const t = s.tier
  const r = random(s.rng)
  if (t >= 5 && r < 0.12) return { kind: 'checker', count: 0 }
  if (t >= 3 && r < 0.27) return { kind: 'cross', count: 0 }
  if (t >= 1 && r < 0.55) return { kind: random(s.rng) < 0.5 ? 'row' : 'col', count: 0 }
  return { kind: 'tiles', count: t >= 2 ? 2 + randomInt(s.rng, 3) : 1 + randomInt(s.rng, 2) }
}

/** On a beat: maybe warn a new strike, if it leaves a way through. */
function scheduleStrike(s: StrideState) {
  if (s.beat < OPENING_BEATS || random(s.rng) >= densityAt(s.tier)) return
  const lead = s.tier >= 6 && random(s.rng) < 0.35 ? 1 : 2
  // Fair from where you stand and from anywhere one step away (you may be mid-move).
  const starts = neighbours(s.pos)
  for (let attempt = 0; attempt < 5; attempt++) {
    const { kind, count } = pickKind(s)
    const strike: Strike = {
      id: s.nextId,
      kind,
      tiles: patternTiles(kind, s.rng, count),
      warnBeat: s.beat,
      beat: s.beat + lead,
    }
    if (!starts.every((t) => survivable(t, s.beat, s.strikes, strike, t !== s.pos))) continue
    s.nextId++
    s.strikes.push(strike)
    s.events.push({ type: 'warn', id: strike.id, lead })
    return
  }
}

function maybeNote(s: StrideState) {
  if (s.beat < 4 || s.notes.length >= 2 || random(s.rng) >= 0.22) return
  const pending = dangerByBeat(s.strikes)
  const busy = new Set([s.pos, ...s.notes.map((n) => n.tile)])
  for (const set of pending.values()) for (const t of set) busy.add(t)
  const free = Array.from({ length: TILES }, (_, t) => t).filter((t) => !busy.has(t))
  if (!free.length) return
  const tile = free[randomInt(s.rng, free.length)]
  s.notes.push({ id: s.nextId++, tile, until: s.beat + NOTE_BEATS })
  s.events.push({ type: 'noteSpawn', tile })
}

function gainCharge(s: StrideState) {
  if (s.charge >= DROP_COST) return
  s.charge++
  if (s.charge === DROP_COST) s.events.push({ type: 'charged' })
}

function groove(s: StrideState) {
  const up = addCombo(s.vitals, GROOVE_PER, MAX_MULT)
  if (up) s.events.push({ type: 'multiplier', mult: up })
}

/** Timing of a move made now, against the nearest beat (and which beat that is). */
export function rateMove(s: StrideState): { rating: Rating; beat: number } {
  const since = s.tick - s.lastBeatTick
  const until = Math.ceil((1 - s.phase) * beatTicks(s))
  const nearNext = until < since
  const off = nearNext ? until : since
  const beat = nearNext ? s.beat + 1 : s.beat
  const rating: Rating = off <= PERFECT_TICKS ? 'perfect' : off <= GOOD_TICKS ? 'good' : 'off'
  return { rating, beat }
}

function move(s: StrideState, input: Exclude<StrideInput, 'drop'>) {
  const c = colOf(s.pos)
  const r = rowOf(s.pos)
  const to =
    input === 'left' && c > 0
      ? s.pos - 1
      : input === 'right' && c < N - 1
        ? s.pos + 1
        : input === 'up' && r > 0
          ? s.pos - N
          : input === 'down' && r < N - 1
            ? s.pos + N
            : s.pos
  if (to === s.pos) return
  const from = s.pos
  s.pos = to
  s.movedAt = s.tick
  const { rating, beat } = rateMove(s)
  let shown: Rating | null = null
  let points = 0
  if (rating === 'off') {
    // Off the beat: you still move (dodging comes first), but the groove resets.
    if (s.vitals.combo > 0) s.events.push({ type: 'grooveLost' })
    s.vitals.combo = 0
    shown = 'off'
  } else if (beat !== s.ratedBeat) {
    s.ratedBeat = beat
    shown = rating
    groove(s)
    points = (rating === 'perfect' ? POINTS.perfect : POINTS.good) * mult(s)
    if (rating === 'perfect') s.stats.perfects++
    else s.stats.goods++
  }
  s.score += points
  s.events.push({ type: 'move', from, to, rating: shown, points })

  const note = s.notes.find((n) => n.tile === to)
  if (note) {
    s.notes = s.notes.filter((n) => n !== note)
    const np = (POINTS.note + (rating !== 'off' ? POINTS.noteOnBeat : 0)) * mult(s)
    s.score += np
    s.stats.notes++
    gainCharge(s)
    s.events.push({ type: 'note', tile: to, points: np })
  }
}

function applyInput(s: StrideState, input: StrideInput) {
  if (input === 'drop') {
    if (s.charge < DROP_COST || dropActive(s)) return
    s.charge = 0
    s.dropUntil = s.beat + DROP_BEATS
    s.events.push({ type: 'drop' })
    return
  }
  if (input === 'up' || input === 'down' || input === 'left' || input === 'right') move(s, input)
}

function onBeat(s: StrideState) {
  s.beat++
  s.lastBeatTick = s.tick
  s.events.push({ type: 'beat', beat: s.beat })
  if (s.beat === s.dropUntil) s.events.push({ type: 'dropEnd' })
  for (const st of s.strikes)
    if (st.beat === s.beat) {
      st.firedAt = s.tick
      s.events.push({ type: 'strike', id: st.id })
    }
  s.notes = s.notes.filter((n) => n.until > s.beat)
  scheduleStrike(s)
  maybeNote(s)
}

function updateStrikes(s: StrideState) {
  for (const st of s.strikes) {
    if (st.firedAt === undefined) {
      if (st.tiles.includes(s.pos)) st.threatened = true
      continue
    }
    const age = s.tick - st.firedAt
    if (age < STRIKE_GRACE || age >= STRIKE_GRACE + STRIKE_ACTIVE || st.hit) continue
    if (st.tiles.includes(s.pos) && !dropActive(s)) {
      st.hit = true
      if (damage(s.vitals, s.tick, INVULN_TICKS)) s.events.push({ type: 'hit' })
    }
  }
  const done = s.strikes.filter(
    (st) => st.firedAt !== undefined && s.tick - st.firedAt >= STRIKE_GRACE + STRIKE_ACTIVE,
  )
  for (const st of done)
    if (st.threatened && !st.hit) {
      const points = POINTS.dodge * mult(s)
      s.score += points
      s.stats.dodges++
      gainCharge(s)
      s.events.push({ type: 'dodge', points })
    }
  if (done.length) s.strikes = s.strikes.filter((st) => !done.includes(st))
}

function stepDying(s: StrideState) {
  if (s.tick - s.diedAt! >= DEATH_TICKS - 1) {
    s.over = true
    s.events.push({ type: 'over' })
  }
  s.tick++
}

export function step(s: StrideState, inputs: InputEvent<StrideInput>[]): StrideState {
  if (s.over) return s
  s.events = []
  if (s.diedAt !== null) {
    stepDying(s)
    return s
  }
  const tier = tierAt(s.tick, TIER_TICKS, MAX_TIER)
  if (tier > s.tier) {
    s.tier = tier
    s.bpm = bpmAt(tier)
    s.stats.topBpm = Math.max(s.stats.topBpm, s.bpm)
    s.events.push({ type: 'tier', tier, bpm: s.bpm })
  }
  s.phase += s.bpm / (60 * TICK_RATE)
  if (s.phase >= 1) {
    s.phase -= 1
    onBeat(s)
  }
  for (const { input } of inputs) applyInput(s, input)
  updateStrikes(s)
  if (regen(s.vitals, s.tick, REGEN_TICKS)) s.events.push({ type: 'heal' })
  if (s.vitals.hearts <= 0) {
    s.diedAt = s.tick
    s.events.push({ type: 'die' })
  }
  s.tick++
  return s
}

export const synthstride: GameDefinition<StrideState, StrideInput> = {
  id: 'synthstride',
  tickRate: TICK_RATE,
  minPlayers: 1,
  maxPlayers: 1,
  setup: (players, seed) => createState(players, seed),
  tick: step,
  isFinished: (s) => s.over,
  removePlayer: () => {},
}

export const displayScore = (s: StrideState) => Math.floor(s.score)
