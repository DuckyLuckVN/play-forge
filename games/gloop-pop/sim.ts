import { random, randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { AI_LEVELS, AI_TUNING, choosePlan, type AiLevel, type Plan } from './ai'
import {
  countGloops,
  findMatches,
  fits,
  gravityStep,
  idx,
  isGloop,
  landing,
  lockPiece,
  makeCell,
  pieceCells,
  removeCells,
  SPAWN_X,
  tryMove,
  tryRotate,
  W,
  type Cells,
  type Piece,
} from './grid'
import { t } from './i18n'
import {
  attackSize,
  clearBonus,
  fallTicks,
  gloopPoints,
  makeJar,
  MAX_LEVEL,
  PILL_POINTS,
  randomPair,
  SOFT_TICKS,
  SPEEDS,
  type Speed,
} from './level'

/** Smooth enough for a falling capsule, small enough to send every tick. */
export const TICK_RATE = 30
export const AI_ID = 'ai'
/** Matched cells flash this long before they pop. */
export const POP_TICKS = 10
/** Loose halves fall a row this often. */
export const SETTLE_TICKS = 4
/** Pause before the next capsule. */
export const SPAWN_TICKS = 5
/** Solo: the "jar clear" party before the next level. */
export const CLEAR_TICKS = 75
/** Ticks between the end and the results screen. */
export const CELEBRATE_TICKS = 45
export const START_LEVELS = ['1', '5', '10', '15'] as const

export type GloopInput =
  { t: 'move'; dx: -1 | 1 } | { t: 'rot'; dir: 1 | -1 } | { t: 'drop' } | { t: 'soft'; on: boolean }

export type BoardPhase = 'spawn' | 'fall' | 'pop' | 'settle' | 'clear' | 'out' | 'won'

export interface Stats {
  /** Gloops popped. */
  popped: number
  bestChain: number
  /** Jars cleared. */
  cleared: number
}

export interface Board {
  id: string
  name: string
  /** Lobby slot (for colours); -1 for the computer. */
  slot: number
  kind: 'human' | 'ai'
  cells: Cells
  piece: Piece | null
  next: [number, number]
  phase: BoardPhase
  timer: number
  fall: number
  soft: boolean
  /** 0-based. */
  level: number
  /** Capsules placed in this jar. */
  pieces: number
  gloops: number
  score: number
  /** Within one capsule's pops: rounds (chain), lines, gloops. */
  chain: number
  lines: number
  combo: number
  /** Cells flashing before they pop. */
  popping: number[]
  /** Junk colours on the way (versus). */
  incoming: number[]
  stats: Stats
  rng: RngState
  left: boolean
  /** Computer only: its own dice (so its choices never change the capsule sequence). */
  brain: RngState
  think: number
  plan: Plan | null
}

export type GloopEvent =
  | { type: 'spawn'; p: string }
  | { type: 'move'; p: string }
  | { type: 'rotate'; p: string }
  | { type: 'blocked'; p: string }
  /** `slam`: rows a hard drop fell. `cells`: where the halves landed. */
  | { type: 'land'; p: string; slam: number; cells: number[] }
  | { type: 'match'; p: string; cells: number[]; chain: number }
  | { type: 'pop'; p: string; cells: [number, number][]; chain: number; points: number; gloops: number[] }
  | { type: 'clear'; p: string; level: number; bonus: number }
  | { type: 'level'; p: string; level: number }
  | { type: 'attack'; from: string; n: number }
  | { type: 'junk'; p: string; n: number }
  | { type: 'out'; p: string }
  | { type: 'win'; p: string }

export interface GloopState {
  speed: Speed
  startLevel: number
  ai: AiLevel
  seed: number
  boards: Board[]
  over: boolean
  /** Winning player id; null in solo or a tie. */
  winner: string | null
  endsAt: number
  tick: number
  events: GloopEvent[]
}

export const boardOf = (s: GloopState, id: string) => s.boards.find((b) => b.id === id)
export const isRace = (s: GloopState) => s.boards.length > 1
const alive = (b: Board) => b.phase !== 'out' && b.phase !== 'won'

function newBoard(p: Pick<Board, 'id' | 'name' | 'slot' | 'kind'>, s: GloopState): Board {
  const rng = { seed: s.seed }
  const cells = makeJar(s.startLevel, s.seed)
  return {
    ...p,
    cells,
    piece: null,
    next: randomPair(rng),
    phase: 'spawn',
    timer: SPAWN_TICKS,
    fall: 0,
    soft: false,
    level: s.startLevel,
    pieces: 0,
    gloops: countGloops(cells),
    score: 0,
    chain: 0,
    lines: 0,
    combo: 0,
    popping: [],
    incoming: [],
    stats: { popped: 0, bestChain: 0, cleared: 0 },
    rng,
    left: false,
    brain: { seed: s.seed ^ 0x5bd1e995 },
    think: 0,
    plan: null,
  }
}

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): GloopState {
  const speed = (SPEEDS as readonly string[]).includes(options.speed) ? (options.speed as Speed) : 'medium'
  const start = Number(options.level)
  const s: GloopState = {
    speed,
    startLevel: Math.min(MAX_LEVEL, Math.max(0, (Number.isInteger(start) ? start : 1) - 1)),
    ai: (AI_LEVELS as readonly string[]).includes(options.rival) ? (options.rival as AiLevel) : 'normal',
    seed,
    boards: [],
    over: false,
    winner: null,
    endsAt: 0,
    tick: 0,
    events: [],
  }
  // Same seed for everyone: a race starts from the same jar and the same capsules.
  for (const p of players.slice(0, 4))
    s.boards.push(newBoard({ id: p.id, name: p.name, slot: p.slot, kind: 'human' }, s))
  if (players.length === 1 && options.rival && options.rival !== 'off')
    s.boards.push(newBoard({ id: AI_ID, name: t('Computer'), slot: -1, kind: 'ai' }, s))
  return s
}

// ---------- One jar's state machine ----------

function spawn(s: GloopState, b: Board) {
  const [a, c] = b.next
  const piece: Piece = { x: SPAWN_X, y: 0, r: 0, a, b: c }
  b.next = randomPair(b.rng)
  b.plan = null
  b.think = AI_TUNING[s.ai].delay * 2
  if (!fits(b.cells, piece)) return knockOut(s, b)
  b.piece = piece
  b.phase = 'fall'
  b.fall = fallTicks(s.speed, b.level, b.pieces)
  s.events.push({ type: 'spawn', p: b.id })
}

function knockOut(s: GloopState, b: Board) {
  b.phase = 'out'
  b.piece = null
  b.soft = false
  s.events.push({ type: 'out', p: b.id })
}

function lock(s: GloopState, b: Board, slam: number) {
  const p = b.piece!
  b.piece = null
  b.pieces++
  b.chain = b.lines = b.combo = 0
  const cells = pieceCells(p)
    .filter((c) => c.y >= 0)
    .map((c) => idx(c.x, c.y))
  s.events.push({ type: 'land', p: b.id, slam, cells })
  if (!lockPiece(b.cells, p)) return knockOut(s, b)
  checkMatches(s, b)
}

/** After anything lands: pop what lines up, or move on. */
function checkMatches(s: GloopState, b: Board) {
  const m = findMatches(b.cells)
  if (!m.cells.length) return endResolve(s, b)
  b.chain++
  b.lines += m.lines
  b.stats.bestChain = Math.max(b.stats.bestChain, b.chain)
  b.popping = m.cells
  b.phase = 'pop'
  b.timer = POP_TICKS
  s.events.push({ type: 'match', p: b.id, cells: m.cells, chain: b.chain })
}

function pop(s: GloopState, b: Board) {
  const cells = b.popping.map((i): [number, number] => [i, b.cells[i]])
  const gloops = removeCells(b.cells, b.popping)
  b.popping = []
  let points = 0
  for (const [, v] of cells) {
    if (isGloop(v)) points += gloopPoints(++b.combo, s.speed)
    else points += PILL_POINTS * b.chain
  }
  const killed = gloops.reduce((x, y) => x + y, 0)
  b.score += points
  b.gloops -= killed
  b.stats.popped += killed
  s.events.push({ type: 'pop', p: b.id, cells, chain: b.chain, points, gloops })
  if (b.gloops <= 0) return clearJar(s, b)
  b.phase = 'settle'
  b.timer = SETTLE_TICKS
}

function settle(s: GloopState, b: Board) {
  if (gravityStep(b.cells)) b.timer = SETTLE_TICKS
  else checkMatches(s, b)
}

/** Everything has settled: send junk for a big move, take any junk coming, then the next capsule. */
function endResolve(s: GloopState, b: Board) {
  const n = isRace(s) ? attackSize(b.lines) : 0
  b.chain = b.lines = 0
  if (n) {
    // Junk colours follow the capsule sequence so they're fair, not personal.
    const colors = Array.from({ length: n }, (_, k) => (b.pieces + k) % 3)
    for (const o of s.boards) if (o !== b && alive(o)) o.incoming.push(...colors)
    s.events.push({ type: 'attack', from: b.id, n })
  }
  if (b.incoming.length) return dropJunk(s, b)
  b.phase = 'spawn'
  b.timer = SPAWN_TICKS
}

function dropJunk(s: GloopState, b: Board) {
  const cols = Array.from({ length: W }, (_, x) => x)
  let n = 0
  for (const color of b.incoming.splice(0, W)) {
    const x = cols.splice(randomInt(b.rng, cols.length), 1)[0]
    if (b.cells[idx(x, 0)]) continue
    b.cells[idx(x, 0)] = makeCell(color)
    n++
  }
  b.incoming = []
  s.events.push({ type: 'junk', p: b.id, n })
  b.phase = 'settle'
  b.timer = SETTLE_TICKS
}

function clearJar(s: GloopState, b: Board) {
  const bonus = clearBonus(b.level, s.speed)
  b.score += bonus
  b.stats.cleared++
  b.piece = null
  b.soft = false
  s.events.push({ type: 'clear', p: b.id, level: b.level, bonus })
  if (isRace(s)) {
    b.phase = 'won'
    s.events.push({ type: 'win', p: b.id })
    return
  }
  b.phase = 'clear'
  b.timer = CLEAR_TICKS
}

function nextJar(s: GloopState, b: Board) {
  b.level = Math.min(MAX_LEVEL, b.level + 1)
  b.cells = makeJar(b.level, s.seed + b.stats.cleared)
  b.gloops = countGloops(b.cells)
  b.pieces = 0
  b.incoming = []
  b.phase = 'spawn'
  b.timer = SPAWN_TICKS * 2
  s.events.push({ type: 'level', p: b.id, level: b.level })
}

function gravity(s: GloopState, b: Board) {
  const base = fallTicks(s.speed, b.level, b.pieces)
  const every = b.soft ? Math.min(SOFT_TICKS, base) : base
  b.fall = Math.min(b.fall, every)
  if (--b.fall > 0) return
  b.fall = every
  const down = tryMove(b.cells, b.piece!, 0, 1)
  if (down) b.piece = down
  else lock(s, b, 0)
}

function stepBoard(s: GloopState, b: Board) {
  switch (b.phase) {
    case 'spawn':
      if (--b.timer <= 0) spawn(s, b)
      break
    case 'fall':
      if (b.kind === 'ai') aiTurn(s, b)
      if (b.phase === 'fall') gravity(s, b)
      break
    case 'pop':
      if (--b.timer <= 0) pop(s, b)
      break
    case 'settle':
      if (--b.timer <= 0) settle(s, b)
      break
    case 'clear':
      if (--b.timer <= 0) nextJar(s, b)
      break
  }
}

// ---------- Controls (players and the computer press the same buttons) ----------

function press(s: GloopState, b: Board, input: GloopInput) {
  if (input.t === 'soft') {
    b.soft = input.on === true
    // Pressing down drops a row at once, so it feels instant.
    if (b.soft && b.phase === 'fall') b.fall = 1
    return
  }
  if (b.phase !== 'fall' || !b.piece) return
  const p = b.piece
  if (input.t === 'move' && (input.dx === 1 || input.dx === -1)) {
    const q = tryMove(b.cells, p, input.dx, 0)
    if (q) b.piece = q
    s.events.push({ type: q ? 'move' : 'blocked', p: b.id })
  } else if (input.t === 'rot' && (input.dir === 1 || input.dir === -1)) {
    const q = tryRotate(b.cells, p, input.dir)
    if (q) b.piece = q
    s.events.push({ type: q ? 'rotate' : 'blocked', p: b.id })
  } else if (input.t === 'drop') {
    const q = landing(b.cells, p)
    b.piece = q
    lock(s, b, q.y - p.y)
  }
}

function aiTurn(s: GloopState, b: Board) {
  if (--b.think > 0) return
  const tune = AI_TUNING[s.ai]
  b.think = tune.delay
  const p = b.piece!
  b.plan ??= choosePlan(b.cells, p, s.ai, b.brain, b.next) ?? { x: p.x, r: p.r }
  const plan = b.plan
  if (p.r !== plan.r) press(s, b, { t: 'rot', dir: 1 })
  else if (p.x !== plan.x) press(s, b, { t: 'move', dx: plan.x > p.x ? 1 : -1 })
  else press(s, b, { t: 'drop' })
  // Blocked on the way: just drop it where it is.
  if (b.piece === p && b.phase === 'fall' && random(b.brain) < 0.5) b.plan = { x: p.x, r: p.r }
}

// ---------- The match ----------

function finish(s: GloopState) {
  s.over = true
  s.endsAt = s.tick + CELEBRATE_TICKS
  if (!isRace(s)) return
  const won = s.boards.find((b) => b.phase === 'won')
  const standing = s.boards.filter(alive)
  if (won) s.winner = won.id
  else if (standing.length === 1) s.winner = standing[0].id
  else {
    // Everyone out together: fewest gloops left wins, then points.
    const rank = (b: Board) => -b.gloops * 1e9 + b.score
    const top = Math.max(...s.boards.filter((b) => !b.left).map(rank))
    const leaders = s.boards.filter((b) => !b.left && rank(b) === top)
    s.winner = leaders.length === 1 ? leaders[0].id : null
  }
}

export function step(s: GloopState, inputs: InputEvent<GloopInput>[]): GloopState {
  s.events = []
  if (s.over) {
    if (s.tick < s.endsAt) s.tick++
    return s
  }
  s.tick++
  for (const { player, input } of inputs) {
    // Inputs come from the network: check everything.
    const b = boardOf(s, player)
    if (!b || b.kind !== 'human' || !alive(b) || !input || typeof input !== 'object') continue
    press(s, b, input)
  }
  for (const b of s.boards) if (alive(b)) stepBoard(s, b)

  const standing = s.boards.filter(alive).length
  const someoneWon = s.boards.some((b) => b.phase === 'won')
  if (isRace(s) ? someoneWon || standing <= 1 : standing === 0) finish(s)
  return s
}

export const gloopGame: GameDefinition<GloopState, GloopInput> = {
  id: 'gloop-pop',
  tickRate: TICK_RATE,
  options: [
    {
      id: 'rival',
      label: t('Playing alone'),
      aloneOnly: true,
      default: 'off',
      choices: [
        { value: 'off', label: t('Just me') },
        { value: 'easy', label: t('Computer: easy') },
        { value: 'normal', label: t('Computer: normal') },
        { value: 'hard', label: t('Computer: hard') },
      ],
    },
    {
      id: 'speed',
      label: t('Speed'),
      default: 'medium',
      choices: [
        { value: 'slow', label: t('Slow') },
        { value: 'medium', label: t('Medium') },
        { value: 'fast', label: t('Fast') },
      ],
    },
    {
      id: 'level',
      label: t('Start level'),
      default: '1',
      choices: START_LEVELS.map((v) => ({ value: v, label: v })),
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
    b.left = true
    if (alive(b)) knockOut(s, b)
  },
}
