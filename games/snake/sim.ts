import type { Direction } from '@forge/core/input'
import { randomInt, type RngState } from '@forge/core/rng'
import type { GameDefinition, InputEvent, PlayerInfo } from '@forge/net/session'

export type Point = [x: number, y: number]

export interface Snake {
  id: string
  name: string
  slot: number
  /** Head first. */
  body: Point[]
  dir: Direction
  /** Buffered turns so quick double-taps (e.g. up then left) both register. */
  turns: Direction[]
  grow: number
  alive: boolean
  score: number
}

/** One-tick events, for sounds and effects on every peer. */
export type SnakeEvent = { type: 'eat' | 'die'; player: string }

export interface SnakeState {
  width: number
  height: number
  tick: number
  rng: RngState
  snakes: Snake[]
  food: Point[]
  over: boolean
  /** Id of the last snake standing in multiplayer; null for a draw or solo. */
  winner: string | null
  /** What happened during the last tick. */
  events: SnakeEvent[]
}

export const SNAKE_INPUTS: Direction[] = ['up', 'down', 'left', 'right']

const DELTA: Record<Direction, Point> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}
const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}
const START_LENGTH = 4
const MAX_BUFFERED_TURNS = 3
const FOOD_GROWTH = 2

export function createState(players: PlayerInfo[], seed: number, width = 32, height = 24): SnakeState {
  const n = players.length
  const snakes = players.map((p, i): Snake => {
    // Alternate sides, facing inwards, each on its own row so no two
    // snakes start on a head-on collision course.
    const leftSide = i % 2 === 0
    const y = Math.floor(((i + 1) * height) / (n + 1))
    const x = leftSide ? START_LENGTH + 1 : width - START_LENGTH - 2
    const dir: Direction = leftSide ? 'right' : 'left'
    const [dx] = DELTA[dir]
    const body = Array.from({ length: START_LENGTH }, (_, k): Point => [x - dx * k, y])
    return { id: p.id, name: p.name, slot: p.slot, body, dir, turns: [], grow: 0, alive: true, score: 0 }
  })
  const state: SnakeState = {
    width,
    height,
    tick: 0,
    rng: { seed },
    snakes,
    food: [],
    over: false,
    winner: null,
    events: [],
  }
  refillFood(state)
  return state
}

function targetFood(state: SnakeState) {
  return Math.max(2, state.snakes.length + 1)
}

function refillFood(state: SnakeState) {
  const occupied = new Set<number>()
  const key = (x: number, y: number) => y * state.width + x
  for (const s of state.snakes) if (s.alive) for (const [x, y] of s.body) occupied.add(key(x, y))
  for (const [x, y] of state.food) occupied.add(key(x, y))
  const free = state.width * state.height - occupied.size
  while (state.food.length < targetFood(state) && free > state.food.length) {
    const x = randomInt(state.rng, state.width)
    const y = randomInt(state.rng, state.height)
    if (occupied.has(key(x, y))) continue
    occupied.add(key(x, y))
    state.food.push([x, y])
  }
}

function queueTurn(snake: Snake, dir: Direction) {
  if (!SNAKE_INPUTS.includes(dir)) return // untrusted input from the network
  const last = snake.turns.at(-1) ?? snake.dir
  if (dir === last || dir === OPPOSITE[last]) return
  if (snake.turns.length < MAX_BUFFERED_TURNS) snake.turns.push(dir)
}

function kill(state: SnakeState, snake: Snake) {
  snake.alive = false
  state.events.push({ type: 'die', player: snake.id })
  // Leave a trail of food behind; skip the head, which may be out of bounds
  // or overlapping another snake.
  snake.body.slice(1).forEach((p, i) => i % 2 === 0 && state.food.push(p))
}

export function step(state: SnakeState, inputs: InputEvent<Direction>[]): SnakeState {
  if (state.over) return state
  state.events = []
  const byId = new Map(state.snakes.map((s) => [s.id, s]))
  for (const { player, input } of inputs) {
    const snake = byId.get(player)
    if (snake?.alive) queueTurn(snake, input)
  }

  const alive = state.snakes.filter((s) => s.alive)

  // 1. Move every snake.
  for (const s of alive) {
    s.dir = s.turns.shift() ?? s.dir
    const [dx, dy] = DELTA[s.dir]
    const [hx, hy] = s.body[0]
    s.body.unshift([hx + dx, hy + dy])
    const foodIndex = state.food.findIndex(([fx, fy]) => fx === hx + dx && fy === hy + dy)
    if (foodIndex >= 0) {
      state.food.splice(foodIndex, 1)
      s.grow += FOOD_GROWTH
      s.score++
      state.events.push({ type: 'eat', player: s.id })
    }
    if (s.grow > 0) s.grow--
    else s.body.pop()
  }

  // 2. Resolve collisions against the post-move board, so following a tail
  //    that just moved away is safe.
  const cells = new Map<number, number>()
  const key = ([x, y]: Point) => y * state.width + x
  for (const s of alive) for (const p of s.body) cells.set(key(p), (cells.get(key(p)) ?? 0) + 1)
  const dead = alive.filter((s) => {
    const [x, y] = s.body[0]
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return true
    // The head itself counts once; any more means it hit a body or another head.
    return cells.get(key(s.body[0]))! > 1
  })
  dead.forEach((s) => kill(state, s))

  // 3. End conditions.
  const remaining = state.snakes.filter((s) => s.alive)
  const multiplayer = state.snakes.length > 1
  if (multiplayer ? remaining.length <= 1 : remaining.length === 0) {
    state.over = true
    state.winner = multiplayer && remaining.length === 1 ? remaining[0].id : null
  }

  refillFood(state)
  state.tick++
  return state
}

/** Moves per second for each speed option. */
export const SPEEDS: Record<string, number> = { slow: 6, normal: 8, fast: 11, turbo: 14 }

export const snakeGame: GameDefinition<SnakeState, Direction> = {
  id: 'snake',
  tickRate: (options) => SPEEDS[options.speed] ?? SPEEDS.normal,
  options: [
    {
      id: 'speed',
      label: 'Speed',
      default: 'normal',
      choices: [
        { value: 'slow', label: 'Slow' },
        { value: 'normal', label: 'Normal' },
        { value: 'fast', label: 'Fast' },
        { value: 'turbo', label: 'Turbo' },
      ],
    },
  ],
  minPlayers: 1,
  maxPlayers: 8,
  setup: (players, seed) => createState(players, seed),
  tick: step,
  isFinished: (state) => state.over,
  removePlayer(state, id) {
    const snake = state.snakes.find((s) => s.id === id)
    if (snake?.alive) kill(state, snake)
  },
}
