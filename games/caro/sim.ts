import { random, type RngState } from '@forge/core/rng'
import type { GameDefinition, GameOptions, InputEvent, PlayerInfo } from '@forge/net/session'
import { chooseMove, type Level } from './ai'
import { t } from './i18n'
import { emptyBoard, findWin, isFull, makesFour, opponent, type Mark, type Rule, type Side } from './rules'

/** Simulation steps per second. Turn-based, so this only sets timer and input latency. */
export const TICK_RATE = 10
export const AI_ID = 'ai'
/** Undos per player in an offline game. Enough to forgive a slip, not enough to brute-force. */
export const UNDOS = 3
/** Ticks the computer "thinks" before moving, so its stones don't snap down instantly. */
const AI_THINK = [5, 9] as const
/** Ticks between the winning move and the results screen, so the win can be seen. */
export const CELEBRATE_TICKS = 15

export type Opponent = Level | 'local'

/** Who plays a colour. Pass-and-play gives both colours to the same player id. */
export interface Seat {
  id: string
  name: string
  /** Lobby slot (for colours); -1 for the computer. */
  slot: number
  kind: 'human' | 'ai'
}

export type CaroInput = { t: 'move'; cell: number } | { t: 'undo' } | { t: 'resign' }

export type CaroEvent =
  | { type: 'place'; cell: number; side: Side; auto?: boolean }
  /** The move left its side one stone from winning. */
  | { type: 'four'; side: Side }
  | { type: 'undo'; cells: number[] }
  | { type: 'win'; side: Side }
  | { type: 'draw' }
  | { type: 'timeout'; side: Side }
  | { type: 'resign'; side: Side }

export type EndReason = 'five' | 'draw' | 'left' | 'resign'

export interface CaroState {
  size: number
  rule: Rule
  /** Announce fours (sound, ring, callout). Off for players who'd rather spot them. */
  hints: boolean
  board: Mark[]
  /** [X, O]; X moves first. */
  seats: [Seat, Seat]
  turn: Side
  /** Cells in the order they were played. */
  moves: number[]
  level: Level
  /** Offline games only: undos left, per side. */
  undos: [number, number]
  /** Ticks per turn; 0 = no timer. */
  turnTicks: number
  /** Ticks left this turn (when timed). */
  clock: number
  /** Ticks until the computer moves. */
  think: number
  over: boolean
  winner: Side | 0
  reason: EndReason | null
  /** The five (or more) that won. */
  line: number[]
  /** Tick at which a finished game hands over to the results screen. */
  endsAt: number
  tick: number
  rng: RngState
  events: CaroEvent[]
}

export const BOARD_SIZES: Record<string, number> = { '15': 15, '19': 19 }
export const TIMERS: Record<string, number> = { off: 0, '30': 30, '15': 15 }

const seatOf = (p: PlayerInfo): Seat => ({ id: p.id, name: p.name, slot: p.slot, kind: 'human' })

export function createState(players: PlayerInfo[], seed: number, options: GameOptions = {}): CaroState {
  const size = BOARD_SIZES[options.size] ?? 15
  const solo = (options.solo as Opponent) ?? 'normal'
  const rng = { seed }
  let seats: [Seat, Seat]
  if (players.length >= 2) {
    // Online: a coin flip decides who plays X (and so moves first).
    const [a, b] = players.slice(0, 2).map(seatOf)
    seats = random(rng) < 0.5 ? [a, b] : [b, a]
  } else if (solo === 'local') {
    seats = [seatOf(players[0]), { ...seatOf(players[0]), slot: 1 }]
  } else {
    // Against the computer the player always starts: it keeps Easy friendly
    // and Hard fair (moving first is a real advantage in five-in-a-row).
    seats = [seatOf(players[0]), { id: AI_ID, name: t('Computer'), slot: -1, kind: 'ai' }]
  }
  const turnTicks = (TIMERS[options.timer] ?? 0) * TICK_RATE
  const offline = players.length < 2
  return {
    size,
    rule: options.rule === 'blocked' ? 'blocked' : 'free',
    hints: options.hints !== 'off',
    board: emptyBoard(size),
    seats,
    turn: 1,
    moves: [],
    level: solo === 'local' ? 'normal' : solo,
    undos: offline ? [UNDOS, UNDOS] : [0, 0],
    turnTicks,
    clock: turnTicks,
    think: 0,
    over: false,
    winner: 0,
    reason: null,
    line: [],
    endsAt: 0,
    tick: 0,
    rng,
    events: [],
  }
}

export const seatOfSide = (state: CaroState, side: Side) => state.seats[side - 1]
export const isHotseat = (state: CaroState) => state.seats[0].id === state.seats[1].id
export const vsComputer = (state: CaroState) => state.seats[1].kind === 'ai'

/** The side `player` is allowed to move right now, or 0. */
function sideToMove(state: CaroState, player: string): Side | 0 {
  return seatOfSide(state, state.turn).id === player ? state.turn : 0
}

function place(state: CaroState, cell: number, auto = false) {
  const side = state.turn
  state.board[cell] = side
  state.moves.push(cell)
  state.events.push({ type: 'place', cell, side, auto })
  const line = findWin(state.board, state.size, cell, state.rule)
  if (line) return finish(state, side, 'five', line)
  if (isFull(state.board)) return finish(state, 0, 'draw')
  if (state.hints && makesFour(state.board, state.size, cell, state.rule))
    state.events.push({ type: 'four', side })
  state.turn = opponent(side)
  state.clock = state.turnTicks
  if (seatOfSide(state, state.turn).kind === 'ai') {
    state.think = AI_THINK[0] + Math.floor(random(state.rng) * (AI_THINK[1] - AI_THINK[0] + 1))
  }
}

function finish(state: CaroState, winner: Side | 0, reason: EndReason, line: number[] = []) {
  state.over = true
  state.winner = winner
  state.reason = reason
  state.line = line
  state.endsAt = state.tick + CELEBRATE_TICKS
  state.events.push(winner ? { type: 'win', side: winner } : { type: 'draw' })
}

/**
 * Undo for offline games. Against the computer it takes back the player's
 * last move and the computer's answer, so it's the player's turn again.
 */
function undo(state: CaroState, player: string) {
  const hotseat = isHotseat(state)
  const human: Side = hotseat ? opponent(state.turn) : 1
  if (state.seats[0].id !== player || state.undos[human - 1] <= 0) return
  // Against the computer: back to the player's last move. Pass-and-play: one move.
  const count = hotseat ? 1 : state.turn === 1 ? 2 : 1
  if (state.moves.length < count) return
  const cells = state.moves.splice(-count)
  for (const c of cells) state.board[c] = 0
  state.undos[human - 1]--
  state.turn = hotseat ? human : 1
  state.think = 0
  state.clock = state.turnTicks
  state.events.push({ type: 'undo', cells })
}

const validCell = (state: CaroState, cell: unknown): cell is number =>
  Number.isInteger(cell) && (cell as number) >= 0 && (cell as number) < state.board.length

export function step(state: CaroState, inputs: InputEvent<CaroInput>[]): CaroState {
  if (state.over) {
    // Celebrating: let the strike-through play before the results screen.
    if (state.tick < state.endsAt) {
      state.events = []
      state.tick++
    }
    return state
  }
  state.events = []
  state.tick++
  const movesBefore = state.moves.length
  for (const { player, input } of inputs) {
    if (state.over) break
    // Inputs come from the network: check everything.
    if (input?.t === 'move') {
      if (!sideToMove(state, player) || !validCell(state, input.cell) || state.board[input.cell]) continue
      place(state, input.cell)
    } else if (input?.t === 'undo') {
      if (state.undos.some((n) => n > 0)) undo(state, player)
    } else if (input?.t === 'resign') {
      const side = state.seats.findIndex((s) => s.id === player && s.kind === 'human')
      if (side < 0 || isHotseat(state)) continue
      state.events.push({ type: 'resign', side: (side + 1) as Side })
      finish(state, opponent((side + 1) as Side), 'resign')
    }
  }
  if (state.over) return state

  const seat = seatOfSide(state, state.turn)
  if (seat.kind === 'ai') {
    if (--state.think <= 0)
      place(state, chooseMove(state.board, state.size, state.turn, state.rule, state.level, state.rng))
  } else if (state.turnTicks > 0 && state.moves.length === movesBefore && --state.clock <= 0) {
    // Out of time: a quick move is made for you, so the game keeps going.
    const side = state.turn
    state.events.push({ type: 'timeout', side })
    place(state, chooseMove(state.board, state.size, side, state.rule, 'easy', state.rng), true)
  }
  return state
}

export const caroGame: GameDefinition<CaroState, CaroInput> = {
  id: 'caro',
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
        { value: 'local', label: t('2 players, 1 device') },
      ],
    },
    {
      id: 'size',
      label: t('Board'),
      default: '15',
      choices: [
        { value: '15', label: '15 × 15' },
        { value: '19', label: '19 × 19' },
      ],
    },
    {
      id: 'rule',
      label: t('Rule'),
      default: 'free',
      choices: [
        { value: 'free', label: t('Five wins') },
        { value: 'blocked', label: t('Blocked ends') },
      ],
    },
    {
      id: 'timer',
      label: t('Turn timer'),
      default: 'off',
      choices: [
        { value: 'off', label: t('Off') },
        { value: '30', label: '30s' },
        { value: '15', label: '15s' },
      ],
    },
    {
      id: 'hints',
      label: t('Four warnings'),
      default: 'on',
      choices: [
        { value: 'on', label: t('On') },
        { value: 'off', label: t('Off') },
      ],
    },
  ],
  minPlayers: 1,
  maxPlayers: 2,
  // Board games don't need a "3, 2, 1".
  countdown: 0,
  setup: createState,
  tick: step,
  isFinished: (state) => state.over && state.tick >= state.endsAt,
  removePlayer(state, id) {
    if (state.over) return
    const side = state.seats.findIndex((s) => s.id === id)
    if (side < 0 || isHotseat(state)) return
    finish(state, opponent((side + 1) as Side), 'left')
  },
}
