import { Emitter } from '../core/emitter'
import { startTicker } from '../core/loop'
import { randomSeed } from '../core/rng'
import type { Transport } from './transport'

export interface PlayerInfo {
  id: string
  name: string
  /** Stable 0-based seat number, used for colours and spawn points. */
  slot: number
}

export interface InputEvent<I> {
  player: string
  input: I
}

/**
 * Everything a game must provide to run on the session. The simulation is
 * pure data in, data out: it only runs on the host, and its state is
 * broadcast to everyone else, so it must be JSON-serialisable.
 */
export interface GameDefinition<S, I> {
  /** Unique id; also namespaces the game's P2P rooms. */
  id: string
  /** Simulation steps per second. */
  tickRate: number
  minPlayers: number
  maxPlayers: number
  setup(players: PlayerInfo[], seed: number): S
  /** Advance one step. May mutate and return `state`. */
  tick(state: S, inputs: InputEvent<I>[]): S
  isFinished(state: S): boolean
  /** Called on the host when a player disconnects mid-game. */
  removePlayer?(state: S, playerId: string): void
}

export type Phase = 'lobby' | 'playing' | 'finished'

export interface LobbyState {
  hostId: string
  phase: Phase
  players: PlayerInfo[]
}

interface SessionEvents<S> {
  lobby: [LobbyState]
  state: [S]
  hostLeft: []
}

// Channel names are kept short: they are sent with every message.
const CH = { hello: 'hello', lobby: 'lobby', input: 'in', state: 'st' } as const

/**
 * Host-authoritative multiplayer session.
 *
 * - The host owns the lobby and runs the simulation at `tickRate`.
 * - Clients send their inputs to the host and render the snapshots it
 *   broadcasts after every tick.
 * - With an offline transport the same code runs single-player.
 */
export class Session<S, I> {
  readonly selfId: string
  readonly isHost: boolean
  lobby: LobbyState
  state: S | null = null
  /** performance.now() of the last state update; useful for interpolation. */
  lastStateAt = 0

  private events = new Emitter<SessionEvents<S>>()
  private pending: InputEvent<I>[] = []
  private stopTicker: (() => void) | null = null
  private unsubs: (() => void)[] = []

  constructor(
    readonly def: GameDefinition<S, I>,
    readonly transport: Transport,
    opts: { host: boolean; name: string },
  ) {
    this.selfId = transport.selfId
    this.isHost = opts.host
    this.lobby = {
      hostId: opts.host ? this.selfId : '',
      phase: 'lobby',
      players: opts.host ? [{ id: this.selfId, name: opts.name, slot: 0 }] : [],
    }
    const t = transport
    if (opts.host) {
      this.unsubs.push(
        t.onPeerJoin((peer) => t.send(CH.lobby, this.lobby, peer)),
        t.on(CH.hello, (msg: { name: string }, from) => this.addPlayer(from, msg.name)),
        t.on(CH.input, (input: I, from) => this.queueInput(from, input)),
        t.onPeerLeave((peer) => this.removePlayer(peer)),
      )
    } else {
      this.unsubs.push(
        // We don't know which peer is the host yet, so greet everyone;
        // only the host answers.
        t.onPeerJoin((peer) => t.send(CH.hello, { name: opts.name }, peer)),
        t.on(CH.lobby, (lobby: LobbyState, from) => {
          if (this.lobby.hostId && from !== this.lobby.hostId) return
          this.lobby = lobby
          this.events.emit('lobby', lobby)
        }),
        t.on(CH.state, (state: S, from) => {
          if (from !== this.lobby.hostId) return
          this.setState(state)
        }),
        t.onPeerLeave((peer) => {
          if (peer === this.lobby.hostId) this.events.emit('hostLeft')
        }),
      )
    }
  }

  on<K extends keyof SessionEvents<S>>(
    event: K,
    handler: (...args: SessionEvents<S>[K]) => void,
  ): () => void {
    return this.events.on(event, handler)
  }

  get phase(): Phase {
    return this.lobby.phase
  }

  get self(): PlayerInfo | undefined {
    return this.lobby.players.find((p) => p.id === this.selfId)
  }

  get canStart(): boolean {
    return (
      this.isHost &&
      this.lobby.phase !== 'playing' &&
      this.lobby.players.length >= this.def.minPlayers
    )
  }

  /** Send an input for the local player. */
  sendInput(input: I): void {
    if (this.lobby.phase !== 'playing') return
    if (this.isHost) this.queueInput(this.selfId, input)
    else this.transport.send(CH.input, input, this.lobby.hostId)
  }

  /** Host only: start (or restart) a match with everyone in the lobby. */
  start(): void {
    if (!this.canStart) return
    this.pending = []
    this.setState(this.def.setup(this.lobby.players, randomSeed()))
    this.setPhase('playing')
    this.broadcastState()
    this.stopTicker = startTicker(this.def.tickRate, () => this.step())
  }

  dispose(): void {
    this.stopTicker?.()
    this.unsubs.forEach((u) => u())
    this.events.clear()
    this.transport.leave()
  }

  private step() {
    const state = this.def.tick(this.state!, this.pending.splice(0))
    this.setState(state)
    this.broadcastState()
    if (this.def.isFinished(state)) {
      this.stopTicker?.()
      this.stopTicker = null
      this.setPhase('finished')
    }
  }

  private queueInput(player: string, input: I) {
    if (this.lobby.phase === 'playing') this.pending.push({ player, input })
  }

  private addPlayer(id: string, name: string) {
    const { players } = this.lobby
    if (players.some((p) => p.id === id)) return
    if (players.length >= this.def.maxPlayers) {
      // Room is full: they still receive the lobby and spectate.
      this.transport.send(CH.lobby, this.lobby, id)
      return
    }
    let slot = 0
    while (players.some((p) => p.slot === slot)) slot++
    players.push({ id, name: name.slice(0, 16) || 'Player', slot })
    players.sort((a, b) => a.slot - b.slot)
    this.broadcastLobby()
    if (this.state) this.transport.send(CH.state, this.state, id)
  }

  private removePlayer(id: string) {
    const before = this.lobby.players.length
    this.lobby.players = this.lobby.players.filter((p) => p.id !== id)
    if (this.lobby.players.length === before) return
    if (this.state && this.lobby.phase === 'playing') this.def.removePlayer?.(this.state, id)
    this.broadcastLobby()
  }

  private setPhase(phase: Phase) {
    this.lobby.phase = phase
    this.broadcastLobby()
  }

  private broadcastLobby() {
    this.transport.send(CH.lobby, this.lobby)
    this.events.emit('lobby', this.lobby)
  }

  private broadcastState() {
    this.transport.send(CH.state, this.state)
  }

  private setState(state: S) {
    this.state = state
    this.lastStateAt = performance.now()
    this.events.emit('state', state)
  }
}
