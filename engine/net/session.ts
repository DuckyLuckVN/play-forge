import { Emitter } from '../core/emitter'
import { startTicker } from '../core/loop'
import { randomSeed } from '../core/rng'
import type { Transport } from './transport'

export interface PlayerInfo {
  /** Stable player id: survives reloads and reconnects (not the peer id). */
  id: string
  name: string
  /** Stable 0-based seat number, used for colours and spawn points. */
  slot: number
  /** Ready for the next match. The host is always ready. */
  ready: boolean
  /** False while the player is dropped and may still come back. */
  connected: boolean
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
  /** Called on the host when a player is gone for good mid-game. */
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

/** What a host persists so a reload can reopen the same room. */
export interface RoomSnapshot {
  players: PlayerInfo[]
  round: number
}

export interface SessionOptions {
  host: boolean
  name: string
  /** Stable id for the local player; keep it across reloads to reclaim a seat. */
  playerId: string
  /** Single-player session on the offline transport. */
  offline?: boolean
  /** Host only: reopen a room after a reload. */
  restore?: RoomSnapshot
  /** How long a dropped player keeps their seat. Default 20s. */
  graceMs?: number
  /** How long guests wait for a dropped host. Default 30s. */
  hostWaitMs?: number
}

interface SessionEvents<S> {
  lobby: [LobbyState]
  state: [S]
  /** Client: the host dropped; we are waiting for it to come back. */
  hostLost: []
  /** Client: the host is back (same or reloaded page). */
  hostBack: []
  /** Client: the host did not come back in time. The session is over. */
  hostGone: []
}

// Channel names are kept short: they are sent with every message.
const CH = { hello: 'hello', ready: 'ready', lobby: 'lobby', input: 'in', state: 'st' } as const

interface Hello {
  id: string
  name: string
}

const DEFAULT_COUNTDOWN = 3

/**
 * Host-authoritative multiplayer session.
 *
 * - The host owns the lobby and runs the simulation at `tickRate`.
 * - Clients send their inputs to the host and render the snapshots it
 *   broadcasts after every tick.
 * - Players are identified by a stable id, so someone who reloads or drops
 *   briefly gets their seat (and their snake, car, …) back.
 * - With an offline transport the same code runs single-player.
 */
export class Session<S, I> {
  readonly selfId: string
  readonly isHost: boolean
  readonly offline: boolean
  lobby: LobbyState
  state: S | null = null
  /** performance.now() of the last state update. */
  lastStateAt = 0
  /** Client: whether the host is currently reachable. */
  hostConnected = false

  private events = new Emitter<SessionEvents<S>>()
  private pending: InputEvent<I>[] = []
  private stopTicker: (() => void) | null = null
  private countdownTimer: ReturnType<typeof setTimeout> | null = null
  private unsubs: (() => void)[] = []
  private graceMs: number
  // Host: peer id → player id, and seat-expiry timers for dropped players.
  private playerOfPeer = new Map<string, string>()
  private dropTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Client: which peer is the host, and the give-up timer while it's gone.
  private hostPeer: string | null = null
  private hostGoneTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly def: GameDefinition<S, I>,
    readonly transport: Transport,
    opts: SessionOptions,
  ) {
    this.selfId = opts.playerId
    this.isHost = opts.host
    this.offline = opts.offline ?? false
    this.graceMs = opts.graceMs ?? 20000
    const self: PlayerInfo = { id: this.selfId, name: opts.name, slot: 0, ready: true, connected: true }
    this.lobby = {
      hostId: opts.host ? this.selfId : '',
      phase: 'lobby',
      players: opts.host ? [self] : [],
      countdown: 0,
      paused: false,
      round: opts.restore?.round ?? 0,
    }
    const t = transport

    if (opts.host) {
      if (opts.restore) this.restore(opts.restore, self)
      this.unsubs.push(
        t.onPeerJoin((peer) => t.send(CH.lobby, this.lobby, peer)),
        t.on(CH.hello, (msg: Hello, peer) => this.onHello(peer, msg)),
        t.on(CH.ready, (ready: boolean, peer) => this.markReady(peer, ready === true)),
        t.on(CH.input, (input: I, peer) => {
          const id = this.playerOfPeer.get(peer)
          if (id) this.queueInput(id, input)
        }),
        t.onPeerLeave((peer) => this.onPeerLeave(peer)),
      )
    } else {
      const hostWaitMs = opts.hostWaitMs ?? 30000
      const hello: Hello = { id: this.selfId, name: opts.name }
      this.unsubs.push(
        // We don't know which peer is the host, so greet everyone; only the
        // host answers. Re-greeting on reconnect reclaims our seat.
        t.onPeerJoin((peer) => t.send(CH.hello, hello, peer)),
        t.on(CH.lobby, (lobby: LobbyState, peer) => {
          // One host at a time, but accept a new one while ours is gone
          // (the host reloaded and came back with a new peer id).
          if (this.hostConnected && peer !== this.hostPeer) return
          const wasLost = this.hostPeer !== null && !this.hostConnected
          this.hostPeer = peer
          this.hostConnected = true
          if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer)
          this.hostGoneTimer = null
          this.lobby = lobby
          if (wasLost) this.events.emit('hostBack')
          this.events.emit('lobby', lobby)
        }),
        t.on(CH.state, (state: S, peer) => {
          if (peer === this.hostPeer) this.setState(state)
        }),
        t.onPeerLeave((peer) => {
          if (peer !== this.hostPeer || !this.hostConnected) return
          this.hostConnected = false
          this.events.emit('hostLost')
          this.hostGoneTimer = setTimeout(() => this.events.emit('hostGone'), hostWaitMs)
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

  /** Connected players who have not readied up (the host never counts). */
  get waitingFor(): PlayerInfo[] {
    return this.lobby.players.filter((p) => p.connected && !p.ready && p.id !== this.lobby.hostId)
  }

  /** Players who dropped and may still come back. */
  get reconnecting(): PlayerInfo[] {
    return this.lobby.players.filter((p) => !p.connected)
  }

  get canStart(): boolean {
    const { phase, players } = this.lobby
    return (
      this.isHost &&
      (phase === 'lobby' || phase === 'finished') &&
      players.length >= this.def.minPlayers &&
      this.waitingFor.length === 0 &&
      this.reconnecting.length === 0
    )
  }

  /** What the host should save to reopen this room after a reload. */
  snapshot(): RoomSnapshot {
    return { players: this.lobby.players.map((p) => ({ ...p })), round: this.lobby.round }
  }

  /** Mark the local player ready (or not) for the next match. */
  setReady(ready: boolean): void {
    const self = this.self
    if (this.isHost || !self || !this.hostPeer) return
    self.ready = ready // optimistic; the host's lobby update confirms it
    this.transport.send(CH.ready, ready, this.hostPeer)
    this.events.emit('lobby', this.lobby)
  }

  /** Send an input for the local player. */
  sendInput(input: I): void {
    if (this.lobby.phase !== 'playing' || this.lobby.paused) return
    if (this.isHost) this.queueInput(this.selfId, input)
    else if (this.hostPeer && this.hostConnected) this.transport.send(CH.input, input, this.hostPeer)
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
    if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer)
    this.dropTimers.forEach(clearTimeout)
    this.unsubs.forEach((u) => u())
    this.events.clear()
    this.transport.leave()
  }

  // ---------- Host ----------

  private restore(snapshot: RoomSnapshot, self: PlayerInfo) {
    const others = snapshot.players
      .filter((p) => p.id !== self.id)
      .map((p) => ({ ...p, ready: false, connected: false }))
    self.slot = snapshot.players.find((p) => p.id === self.id)?.slot ?? 0
    this.lobby.players = [self, ...others].sort((a, b) => a.slot - b.slot)
    for (const p of others) this.scheduleDrop(p.id)
  }

  private onHello(peer: string, msg: Hello) {
    const id = String(msg?.id ?? '').slice(0, 40)
    const name = String(msg?.name ?? '').trim().slice(0, 16) || 'Player'
    if (!id || id === this.selfId) return
    const { players } = this.lobby
    const existing = players.find((p) => p.id === id)

    if (existing) {
      // A returning player (reload / reconnect) reclaims their seat. Refuse a
      // second live connection claiming the same id.
      const liveElsewhere = [...this.playerOfPeer].some(([p, pid]) => pid === id && p !== peer)
      if (existing.connected && liveElsewhere) return
      this.playerOfPeer.set(peer, id)
      clearTimeout(this.dropTimers.get(id))
      this.dropTimers.delete(id)
      existing.connected = true
      existing.name = name
    } else {
      this.playerOfPeer.set(peer, id)
      if (players.length >= this.def.maxPlayers) {
        // Room is full: they still receive the lobby and watch.
        if (this.state) this.transport.send(CH.state, this.state, peer)
        this.transport.send(CH.lobby, this.lobby, peer)
        return
      }
      let slot = 0
      while (players.some((p) => p.slot === slot)) slot++
      players.push({ id, name, slot, ready: false, connected: true })
      players.sort((a, b) => a.slot - b.slot)
    }
    // State first, so the lobby (e.g. a results screen) can render with it.
    if (this.state) this.transport.send(CH.state, this.state, peer)
    this.broadcastLobby()
  }

  private onPeerLeave(peer: string) {
    const id = this.playerOfPeer.get(peer)
    this.playerOfPeer.delete(peer)
    const player = id && this.lobby.players.find((p) => p.id === id)
    if (!player) return
    player.connected = false
    this.scheduleDrop(player.id)
    this.broadcastLobby()
  }

  private scheduleDrop(id: string) {
    clearTimeout(this.dropTimers.get(id))
    this.dropTimers.set(
      id,
      setTimeout(() => {
        this.dropTimers.delete(id)
        this.removePlayer(id)
      }, this.graceMs),
    )
  }

  private removePlayer(id: string) {
    const before = this.lobby.players.length
    this.lobby.players = this.lobby.players.filter((p) => p.id !== id)
    if (this.lobby.players.length === before) return
    const inMatch = this.lobby.phase === 'playing' || this.lobby.phase === 'countdown'
    if (this.state && inMatch) this.def.removePlayer?.(this.state, id)
    this.broadcastLobby()
  }

  private markReady(peer: string, ready: boolean) {
    const id = this.playerOfPeer.get(peer)
    const player = this.lobby.players.find((p) => p.id === id)
    if (!player || player.ready === ready) return
    player.ready = ready
    this.broadcastLobby()
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
