import { Emitter } from '../core/emitter'
import { startTicker } from '../core/loop'
import { randomSeed } from '../core/rng'
import type { Transport } from './transport'

export interface PlayerInfo {
  id: string
  name: string
  /** Stable 0-based seat number, used for colours and spawn points. */
  slot: number
  /** Ready for the next match. The host is always ready. */
  ready: boolean
}

export interface InputEvent<I> {
  player: string
  input: I
}

/**
 * Everything a game must provide to run on the session. The simulation is
 * pure data in, data out: it only runs on the host, and its state is
 * broadcast to everyone else, so it must be JSON-serialisable.
 *
 * To trigger sounds or effects on every peer, put one-tick events in the
 * state (e.g. `state.events = [{ type: 'eat', player }]`, cleared at the
 * start of each tick) and react to them in the renderer.
 */
export interface GameDefinition<S, I> {
  /** Unique id; also namespaces the game's P2P rooms. */
  id: string
  /** Simulation steps per second. */
  tickRate: number
  minPlayers: number
  maxPlayers: number
  /** Seconds of "3, 2, 1" before each match. Default 3; 0 starts at once. */
  countdown?: number
  setup(players: PlayerInfo[], seed: number): S
  /** Advance one step. May mutate and return `state`. */
  tick(state: S, inputs: InputEvent<I>[]): S
  isFinished(state: S): boolean
  /** Called on the host when a player disconnects mid-game. */
  removePlayer?(state: S, playerId: string): void
}

/**
 * lobby → countdown → playing → finished → (countdown → playing → …)
 * `finished` doubles as the lobby for a rematch.
 */
export type Phase = 'lobby' | 'countdown' | 'playing' | 'finished'

export interface LobbyState {
  hostId: string
  phase: Phase
  players: PlayerInfo[]
  /** Seconds left while `phase` is 'countdown'. */
  countdown: number
  /** Only offline (solo) games can pause. */
  paused: boolean
  /** Number of matches started in this room. */
  round: number
}

interface SessionEvents<S> {
  lobby: [LobbyState]
  state: [S]
  hostLeft: []
}

// Channel names are kept short: they are sent with every message.
const CH = { hello: 'hello', ready: 'ready', lobby: 'lobby', input: 'in', state: 'st' } as const

const DEFAULT_COUNTDOWN = 3

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
  /** True for single-player sessions on the offline transport. */
  readonly offline: boolean
  lobby: LobbyState
  state: S | null = null
  /** performance.now() of the last state update; useful for interpolation. */
  lastStateAt = 0

  private events = new Emitter<SessionEvents<S>>()
  private pending: InputEvent<I>[] = []
  private stopTicker: (() => void) | null = null
  private countdownTimer: ReturnType<typeof setTimeout> | null = null
  private unsubs: (() => void)[] = []

  constructor(
    readonly def: GameDefinition<S, I>,
    readonly transport: Transport,
    opts: { host: boolean; name: string; offline?: boolean },
  ) {
    this.selfId = transport.selfId
    this.isHost = opts.host
    this.offline = opts.offline ?? false
    this.lobby = {
      hostId: opts.host ? this.selfId : '',
      phase: 'lobby',
      players: opts.host ? [{ id: this.selfId, name: opts.name, slot: 0, ready: true }] : [],
      countdown: 0,
      paused: false,
      round: 0,
    }
    const t = transport
    if (opts.host) {
      this.unsubs.push(
        t.onPeerJoin((peer) => t.send(CH.lobby, this.lobby, peer)),
        t.on(CH.hello, (msg: { name: string }, from) => this.addPlayer(from, String(msg?.name ?? ''))),
        t.on(CH.ready, (ready: boolean, from) => this.markReady(from, ready === true)),
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

  /** Players in the room who have not readied up (the host never counts). */
  get waitingFor(): PlayerInfo[] {
    return this.lobby.players.filter((p) => !p.ready && p.id !== this.lobby.hostId)
  }

  get canStart(): boolean {
    const { phase, players } = this.lobby
    return (
      this.isHost &&
      (phase === 'lobby' || phase === 'finished') &&
      players.length >= this.def.minPlayers &&
      this.waitingFor.length === 0
    )
  }

  /** Mark the local player ready (or not) for the next match. */
  setReady(ready: boolean): void {
    if (this.isHost) return
    const self = this.self
    if (self) self.ready = ready // optimistic; the host's lobby update confirms it
    this.transport.send(CH.ready, ready, this.lobby.hostId)
    this.events.emit('lobby', this.lobby)
  }

  /** Send an input for the local player. */
  sendInput(input: I): void {
    if (this.lobby.phase !== 'playing' || this.lobby.paused) return
    if (this.isHost) this.queueInput(this.selfId, input)
    else this.transport.send(CH.input, input, this.lobby.hostId)
  }

  /** Host only: count down, then start a match with everyone in the room. */
  start(): void {
    if (!this.canStart) return
    this.pending = []
    this.lobby.round++
    this.setState(this.def.setup(this.lobby.players, randomSeed()))
    this.broadcastState()
    this.lobby.paused = false
    this.lobby.countdown = this.def.countdown ?? DEFAULT_COUNTDOWN
    if (this.lobby.countdown > 0) {
      this.setPhase('countdown')
      this.runCountdown()
    } else {
      this.setPhase('playing')
      this.startSimulation()
    }
  }

  /** Offline only: freeze the simulation. */
  setPaused(paused: boolean): void {
    if (!this.offline || this.lobby.phase !== 'playing' || this.lobby.paused === paused) return
    this.lobby.paused = paused
    if (paused) this.stopSimulation()
    else this.startSimulation()
    this.broadcastLobby()
  }

  dispose(): void {
    this.stopSimulation()
    if (this.countdownTimer) clearTimeout(this.countdownTimer)
    this.unsubs.forEach((u) => u())
    this.events.clear()
    this.transport.leave()
  }

  private runCountdown() {
    this.countdownTimer = setTimeout(() => {
      this.lobby.countdown--
      if (this.lobby.countdown > 0) {
        this.broadcastLobby()
        this.runCountdown()
      } else {
        this.setPhase('playing')
        this.startSimulation()
      }
    }, 1000)
  }

  private startSimulation() {
    this.stopTicker = startTicker(this.def.tickRate, () => this.step())
  }

  private stopSimulation() {
    this.stopTicker?.()
    this.stopTicker = null
  }

  private step() {
    const state = this.def.tick(this.state!, this.pending.splice(0))
    this.setState(state)
    this.broadcastState()
    if (this.def.isFinished(state)) {
      this.stopSimulation()
      // Everyone readies up again for the rematch.
      for (const p of this.lobby.players) p.ready = p.id === this.lobby.hostId
      this.setPhase('finished')
    }
  }

  private queueInput(player: string, input: I) {
    if (this.lobby.phase === 'playing') this.pending.push({ player, input })
  }

  private markReady(id: string, ready: boolean) {
    const player = this.lobby.players.find((p) => p.id === id)
    if (!player || player.ready === ready) return
    player.ready = ready
    this.broadcastLobby()
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
    players.push({ id, name: name.trim().slice(0, 16) || 'Player', slot, ready: false })
    players.sort((a, b) => a.slot - b.slot)
    this.broadcastLobby()
    if (this.state) this.transport.send(CH.state, this.state, id)
  }

  private removePlayer(id: string) {
    const before = this.lobby.players.length
    this.lobby.players = this.lobby.players.filter((p) => p.id !== id)
    if (this.lobby.players.length === before) return
    const inMatch = this.lobby.phase === 'playing' || this.lobby.phase === 'countdown'
    if (this.state && inMatch) this.def.removePlayer?.(this.state, id)
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
