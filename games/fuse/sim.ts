import { random, randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { blastTarget, chooseDir } from './ai'
import {
  bestTier,
  canSlide,
  DIRS,
  emptyCells,
  ROCK,
  ROCK_HP,
  hitRocks,
  slide,
  valueOf,
  type Cells,
  type Dir,
  type Merge,
} from './board'
import { t } from './i18n'

/** Fast enough that a swipe lands at once; the state is small, so 20 Hz is cheap online. */
export const TICK_RATE = 20
export const AI_ID = 'ai'
/** Chance a new tile starts at tier 2 instead of 1. */
export const HIGH_SPAWN = 0.1
/** With rocks on, the first rock drops after this many moves… */
export const ROCK_EVERY = 16
/** …and they come one move sooner every this many moves, down to ROCK_FASTEST. */
export const ROCK_RAMP = 25
export const ROCK_FASTEST = 3
/** …but only when there's room to deal with it. */
const ROCK_MIN_EMPTY = 4
/** Merges that charge one blast. */
export const METER_MAX = 14
export const MAX_BLASTS = 2
export const START_BLASTS = 1
/** Solo only (no rival): enough to forgive a slip. */
export const UNDOS = 2
/** Race: merges in one move that send a rock to every rival. */
export const ATTACK_COMBO = 3
/** Race: making a tile of this tier (128) also sends one. */
export const ATTACK_TIER = 7
const ATTACK_MAX = 2
/** Incoming rocks that land per move. */
const DROP_PER_MOVE = 2
/** New best tiles from this tier (64) are celebrated. */
export const RECORD_TIER = 6
/** Computer rival: ticks between moves (0.45–0.7 s). */
const AI_THINK = [9, 14] as const
/** Ticks between the end and the results screen. */
export const CELEBRATE_TICKS = 25

export type FuseInput = { t: 'move'; dir: Dir } | { t: 'blast'; cell: number } | { t: 'undo' }

interface Snapshot {
  cells: Cells
  score: number
  best: number
  moves: number
  meter: number
  blasts: number
  incoming: number
  /** Move count at which the next rock drops (rocks on). */
  nextRock: number
  rng: RngState
}

export interface Board extends Snapshot {
  id: string
  name: string
  /** Lobby slot (for colours); -1 for the computer. */
  slot: number
  kind: 'human' | 'ai'
  alive: boolean
  /** Left the room mid-game. */
  left: boolean
  undos: number
  /** State before the last move, for undo. */
  prev: Snapshot | null
  /** Ticks until the computer moves. */
  think: number
}

export type FuseEvent =
  | { type: 'move'; p: string; dir: Dir; merges: Merge[]; gained: number; combo: number }
  /** Rocks hit by merges: `cracked` survive with one hit left, `broken` are gone. */
  | { type: 'crumble'; p: string; cracked: number[]; broken: number[] }
  | { type: 'rock'; p: string; cell: number; sent: boolean }
  | { type: 'blast'; p: string; cell: number; rock: boolean }
  | { type: 'record'; p: string; tier: number }
  | { type: 'charged'; p: string }
  | { type: 'attack'; from: string; n: number; cancelled: number }
  | { type: 'stuck'; p: string }
  | { type: 'undo'; p: string }

export interface FuseState {
  size: number
  rocks: boolean
  /** Ticks in a timed game; 0 = until stuck. */
  timeTicks: number
  clock: number
  boards: Board[]
  over: boolean
  /** Winning player id, or null (solo, or a tie). */
  winner: string | null
  endsAt: number
  tick: number
  nextId: number
  events: FuseEvent[]
}

export const SIZES: Record<string, number> = { '4': 4, '5': 5, '6': 6 }
export const TIMES: Record<string, number> = { endless: 0, '3': 3, '5': 5 }

function newBoard(p: Pick<Board, 'id' | 'name' | 'slot' | 'kind'>, size: number, seed: number): Board {
  return {
    ...p,
    cells: Array(size * size).fill(null),
    score: 0,
    best: 0,
    moves: 0,
    meter: 0,
    blasts: START_BLASTS,
    incoming: 0,
    nextRock: ROCK_EVERY,
    rng: { seed },
    alive: true,
    left: false,
    undos: 0,
    prev: null,
    think: 0,
  }
}

const takeId = (s: FuseState) => ++s.nextId

function spawnTile(s: FuseState, b: Board, tier?: number): number {
  const empty = emptyCells(b.cells)
  if (!empty.length) return -1
  const cell = empty[randomInt(b.rng, empty.length)]
  b.cells[cell] = { id: takeId(s), v: tier ?? (random(b.rng) < HIGH_SPAWN ? 2 : 1) }
  return cell
}

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): FuseState {
  const size = SIZES[options.size] ?? 5
  const timeTicks = (TIMES[options.time] ?? 0) * 60 * TICK_RATE
  const s: FuseState = {
    size,
    rocks: options.rocks !== 'off',
    timeTicks,
    clock: timeTicks,
    boards: [],
    over: false,
    winner: null,
    endsAt: 0,
    tick: 0,
    nextId: 0,
    events: [],
  }
  // Everyone gets the same seed, so a race starts from the same tiles.
  for (const p of players.slice(0, 4))
    s.boards.push(newBoard({ id: p.id, name: p.name, slot: p.slot, kind: 'human' }, size, seed))
  if (players.length === 1 && options.rival === 'bot') {
    s.boards.push(newBoard({ id: AI_ID, name: t('Computer'), slot: -1, kind: 'ai' }, size, seed))
  }
  for (const b of s.boards) {
    spawnTile(s, b)
    spawnTile(s, b)
    b.think = AI_THINK[1]
  }
  if (s.boards.length === 1) s.boards[0].undos = UNDOS
  return s
}

export const boardOf = (s: FuseState, id: string) => s.boards.find((b) => b.id === id)
export const isRace = (s: FuseState) => s.boards.length > 1

const snapshot = (b: Board): Snapshot => ({
  cells: b.cells.map((c) => (c ? { ...c } : null)),
  score: b.score,
  best: b.best,
  moves: b.moves,
  meter: b.meter,
  blasts: b.blasts,
  incoming: b.incoming,
  nextRock: b.nextRock,
  rng: { ...b.rng },
})

/** Points for one move: merged values, multiplied by the combo (×1.5 per extra merge, up to ×3). */
export function movePoints(merges: Merge[]): number {
  const base = merges.reduce((sum, m) => sum + valueOf(m.tier), 0)
  const mult = Math.min(3, 1 + 0.5 * Math.max(0, merges.length - 1))
  return Math.round(base * mult)
}

/** Moves until the next rock: the longer the run, the faster they come. */
export const rockInterval = (moves: number) =>
  Math.max(ROCK_FASTEST, ROCK_EVERY - Math.floor(moves / ROCK_RAMP))

function dropRock(s: FuseState, b: Board, sent: boolean) {
  const cell = spawnTile(s, b, ROCK)
  if (cell >= 0) b.cells[cell]!.hp = ROCK_HP
  if (cell >= 0) s.events.push({ type: 'rock', p: b.id, cell, sent })
}

function move(s: FuseState, b: Board, dir: Dir) {
  const r = slide(b.cells, s.size, dir, () => takeId(s))
  if (!r.moved) return
  if (b.undos > 0) b.prev = snapshot(b)
  b.cells = r.cells
  b.moves++
  const combo = r.merges.length
  const gained = movePoints(r.merges)
  b.score += gained
  s.events.push({ type: 'move', p: b.id, dir, merges: r.merges, gained, combo })

  // Merges crack the rocks beside them.
  const hit = hitRocks(
    b.cells,
    s.size,
    r.merges.map((m) => m.cell),
  )
  if (hit.cracked.length || hit.broken.length) s.events.push({ type: 'crumble', p: b.id, ...hit })

  // Merges charge the blast meter.
  if (b.blasts < MAX_BLASTS) {
    b.meter += combo
    if (b.meter >= METER_MAX) {
      b.meter -= METER_MAX
      b.blasts++
      s.events.push({ type: 'charged', p: b.id })
      if (b.blasts >= MAX_BLASTS) b.meter = 0
    }
  }

  const top = bestTier(b.cells)
  if (top > b.best) {
    if (top >= RECORD_TIER) s.events.push({ type: 'record', p: b.id, tier: top })
    b.best = top
  }

  // Race: big moves send rocks, first cancelling any heading your way.
  if (isRace(s)) {
    let n = Math.min(
      ATTACK_MAX,
      (combo >= ATTACK_COMBO ? 1 : 0) + (r.merges.some((m) => m.tier >= ATTACK_TIER) ? 1 : 0),
    )
    if (n > 0) {
      const cancelled = Math.min(n, b.incoming)
      b.incoming -= cancelled
      n -= cancelled
      for (const o of s.boards) if (o !== b && o.alive) o.incoming += n
      s.events.push({ type: 'attack', from: b.id, n, cancelled })
    }
  }

  spawnTile(s, b)
  for (let i = 0; i < DROP_PER_MOVE && b.incoming > 0; i++) {
    b.incoming--
    dropRock(s, b, true)
  }
  if (s.rocks && b.moves >= b.nextRock && emptyCells(b.cells).length >= ROCK_MIN_EMPTY) {
    dropRock(s, b, false)
    b.nextRock = b.moves + rockInterval(b.moves)
  }
}

function blast(s: FuseState, b: Board, cell: number) {
  const target = b.cells[cell]
  if (b.blasts <= 0 || !target) return
  if (b.undos > 0) b.prev = snapshot(b)
  b.cells[cell] = null
  b.blasts--
  s.events.push({ type: 'blast', p: b.id, cell, rock: target.v === ROCK })
}

function undo(s: FuseState, b: Board) {
  if (b.undos <= 0 || !b.prev) return
  Object.assign(b, b.prev)
  b.prev = null
  b.undos--
  s.events.push({ type: 'undo', p: b.id })
}

/** A board is out when it can't slide, has no blast, and has no undo to fall back on. */
const hasPlay = (s: FuseState, b: Board) =>
  canSlide(b.cells, s.size) || b.blasts > 0 || (b.undos > 0 && !!b.prev)

function checkAlive(s: FuseState, b: Board) {
  if (b.alive && !hasPlay(s, b)) {
    b.alive = false
    s.events.push({ type: 'stuck', p: b.id })
  }
}

function finish(s: FuseState) {
  s.over = true
  s.endsAt = s.tick + CELEBRATE_TICKS
  if (!isRace(s)) return
  const alive = s.boards.filter((b) => b.alive)
  if (!s.timeTicks && alive.length === 1) s.winner = alive[0].id
  else {
    const top = Math.max(...s.boards.map((b) => b.score))
    const leaders = s.boards.filter((b) => b.score === top && !b.left)
    s.winner = leaders.length === 1 ? leaders[0].id : null
  }
}

const validCell = (s: FuseState, cell: unknown): cell is number =>
  Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < s.size * s.size

function aiTurn(s: FuseState, b: Board) {
  if (--b.think > 0) return
  b.think = AI_THINK[0] + randomInt(b.rng, AI_THINK[1] - AI_THINK[0] + 1)
  const dir = chooseDir(b.cells, s.size, b.rng)
  if (dir) move(s, b, dir)
  else if (b.blasts > 0) blast(s, b, blastTarget(b.cells, s.size))
}

export function step(s: FuseState, inputs: InputEvent<FuseInput>[]): FuseState {
  s.events = []
  if (s.over) {
    if (s.tick < s.endsAt) s.tick++
    return s
  }
  s.tick++
  for (const { player, input } of inputs) {
    // Inputs come from the network: check everything.
    const b = boardOf(s, player)
    if (!b || !b.alive || b.kind !== 'human') continue
    if (input?.t === 'move' && DIRS.includes(input.dir)) move(s, b, input.dir)
    else if (input?.t === 'blast' && validCell(s, input.cell)) blast(s, b, input.cell)
    else if (input?.t === 'undo') undo(s, b)
  }
  for (const b of s.boards) if (b.kind === 'ai' && b.alive) aiTurn(s, b)
  for (const b of s.boards) checkAlive(s, b)

  const alive = s.boards.filter((b) => b.alive).length
  if (s.timeTicks && --s.clock <= 0) s.clock = 0
  const ended = isRace(s)
    ? alive === 0 || (s.timeTicks ? s.clock === 0 : alive <= 1)
    : alive === 0 || (s.timeTicks > 0 && s.clock === 0)
  if (ended) finish(s)
  return s
}

export const fuseGame: GameDefinition<FuseState, FuseInput> = {
  id: 'fuse',
  tickRate: TICK_RATE,
  options: [
    {
      id: 'rival',
      label: t('Playing alone'),
      aloneOnly: true,
      default: 'off',
      choices: [
        { value: 'off', label: t('Just me') },
        { value: 'bot', label: t('Race the computer') },
      ],
    },
    {
      id: 'size',
      label: t('Board'),
      default: '5',
      choices: [
        { value: '4', label: '4 × 4' },
        { value: '5', label: '5 × 5' },
        { value: '6', label: '6 × 6' },
      ],
    },
    {
      id: 'rocks',
      label: t('Rocks'),
      default: 'on',
      choices: [
        { value: 'on', label: t('On') },
        { value: 'off', label: t('Off') },
      ],
    },
    {
      id: 'time',
      label: t('Time'),
      default: 'endless',
      choices: [
        { value: 'endless', label: t('Until stuck') },
        { value: '3', label: t('{n} min', { n: 3 }) },
        { value: '5', label: t('{n} min', { n: 5 }) },
      ],
    },
  ],
  minPlayers: 1,
  maxPlayers: 4,
  setup: createState,
  tick: step,
  isFinished: (s) => s.over && s.tick >= s.endsAt,
  removePlayer(s, id) {
    const b = boardOf(s, id)
    if (!b || s.over) return
    b.alive = false
    b.left = true
  },
}
