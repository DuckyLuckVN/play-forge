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
  /** Chosen avatar id. Optional: older clients don't send one. */
  avatar?: string
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
  /** Simulation steps per second; can depend on the chosen options. */
  tickRate: number | ((options: GameOptions) => number)
  /** Settings the host picks before a match (speed, board size, …). */
  options?: OptionDef[]
  minPlayers: number
  maxPlayers: number
  /** Seconds of "3, 2, 1" before each match. Default 3; 0 starts at once. */
  countdown?: number
  setup(players: PlayerInfo[], seed: number, options: GameOptions): S
  /** Advance one step. May mutate and return `state`. */
  tick(state: S, inputs: InputEvent<I>[]): S
  isFinished(state: S): boolean
  /**
   * What guests receive each tick (default: the whole state). Leave out
   * host-only bookkeeping to save bandwidth; guests only render, so they must
   * not need it. The host itself always keeps the full state.
   */
  netView?(state: S): unknown
  /** Called on the host when a player is gone for good mid-game. */
  removePlayer?(state: S, playerId: string): void
  /**
   * Opt-in seating: how many seats the room opens for these options, in how
   * many teams (seat s plays for team s % teams), and whether the game fills
   * empty seats with computer players. Default: maxPlayers seats, no teams.
   */
  seating?(options: GameOptions): Seating
}

/** The room's seats for a set of options (see GameDefinition.seating). */
export interface Seating {
  seats: number
  /** With more than one team, players can move to any free seat between matches. */
  teams: number
  /** The game plays empty seats with the computer (the room says so). */
  botFill: boolean
}

/** Chosen value for each option id. */
export type GameOptions = Record<string, string>

export interface OptionDef {
  id: string
  label: string
  choices: { value: string; label: string }[]
  default: string
  /**
   * Only matters while one player is seated (e.g. the computer's level):
   * rooms hide it once a second player sits down. The value is kept.
   */
  aloneOnly?: boolean
  /**
   * Show the option in a room only when this returns true (e.g. the
   * computer's level while any seat is empty). Wins over `aloneOnly`.
   */
  shownWhen?(seated: number, options: GameOptions): boolean
}

/** Fill in defaults and drop unknown or invalid values. */
export function resolveOptions(defs: OptionDef[] = [], chosen: Partial<GameOptions> = {}): GameOptions {
  const out: GameOptions = {}
  for (const d of defs) {
    const v = chosen[d.id]
    out[d.id] = d.choices.some((c) => c.value === v) ? v! : d.default
  }
  return out
}

/** The tick rate a game runs at with the given options. */
export function tickRateOf(def: GameDefinition<any, any>, options: GameOptions): number {
  return typeof def.tickRate === 'function' ? def.tickRate(options) : def.tickRate
}

/** The seating for these options; seats are clamped to [minPlayers, maxPlayers]. */
export function seatingOf(def: GameDefinition<any, any>, options: GameOptions): Seating {
  const s = def.seating?.(options) ?? { seats: def.maxPlayers, teams: 1, botFill: false }
  return { ...s, seats: Math.min(Math.max(s.seats, def.minPlayers), def.maxPlayers) }
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
  /** Settings for the next match; only the host changes them. */
  options: GameOptions
}

/** What a host persists so a reload can reopen the same room. */
export interface RoomSnapshot {
  players: PlayerInfo[]
  round: number
  options?: GameOptions
}

export interface SessionOptions {
  host: boolean
  name: string
  /** Avatar id shown to others; an opaque short token to the session. */
  avatar?: string
  /** Stable id for the local player; keep it across reloads to reclaim a seat. */
  playerId: string
  /** Single-player session on the offline transport. */
  offline?: boolean
  /** Host only: reopen a room after a reload. */
  restore?: RoomSnapshot
  /** Host only: starting options (e.g. the player's last choice). */
  options?: Partial<GameOptions>
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
  /** Client: the host removed us from the room. The session is over. */
  kicked: []
}

// Channel names are kept short: they are sent with every message.
const CH = {
  hello: 'hello',
  bye: 'bye',
  ready: 'ready',
  lobby: 'lobby',
  input: 'in',
  state: 'st',
  kick: 'kick',
  seat: 'seat',
} as const

interface Hello {
  id: string
  name: string
  avatar?: string
}

/** Keep only short slug-like avatar ids; anything else is dropped. */
export function cleanAvatar(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[a-z0-9-]{1,24}$/.test(raw) ? raw : undefined
}

/** Names are trimmed and capped at 16 characters; a blank one becomes "Player". */
export function cleanName(raw: unknown): string {
  return (
    String(raw ?? '')
      .trim()
      .slice(0, 16) || 'Player'
  )
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
  /** A guest's greeting: sent to every peer that joins, and again on profile changes. */
  private hello: Hello | null = null
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
    const avatar = cleanAvatar(opts.avatar)
    if (avatar) self.avatar = avatar
    this.lobby = {
      hostId: opts.host ? this.selfId : '',
      phase: 'lobby',
      players: opts.host ? [self] : [],
      countdown: 0,
      paused: false,
      round: opts.restore?.round ?? 0,
      options: resolveOptions(def.options, opts.restore?.options ?? opts.options),
    }
    const t = transport

    if (opts.host) {
      if (opts.restore) this.restore(opts.restore, self)
      this.unsubs.push(
        t.onPeerJoin((peer) => t.send(CH.lobby, this.lobby, peer)),
        t.on(CH.hello, (msg: Hello, peer) => this.onHello(peer, msg)),
        t.on(CH.ready, (ready: boolean, peer) => this.markReady(peer, ready === true)),
        // A guest asks to move: only its own player, checked by applySeat.
        t.on(CH.seat, (seat: unknown, peer) => {
          const id = this.playerOfPeer.get(peer)
          if (id) this.applySeat(id, seat)
        }),
        t.on(CH.input, (input: I, peer) => {
          const id = this.playerOfPeer.get(peer)
          if (id) this.queueInput(id, input)
        }),
        t.onPeerLeave((peer) => this.onPeerLeave(peer)),
        // Left on purpose: free the seat now instead of holding it.
        t.on(CH.bye, (_: unknown, peer) => {
          const id = this.playerOfPeer.get(peer)
          this.playerOfPeer.delete(peer)
          if (!id) return
          clearTimeout(this.dropTimers.get(id))
          this.dropTimers.delete(id)
          this.removePlayer(id)
        }),
      )
    } else {
      const hostWaitMs = opts.hostWaitMs ?? 30000
      this.hello = { id: this.selfId, name: opts.name, avatar: cleanAvatar(opts.avatar) }
      this.unsubs.push(
        // We don't know which peer is the host, so greet everyone; only the
        // host answers. Re-greeting on reconnect reclaims our seat.
        t.onPeerJoin((peer) => t.send(CH.hello, this.hello, peer)),
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
        t.on(CH.kick, (_: unknown, peer) => {
          if (peer === this.hostPeer && this.hostConnected) this.events.emit('kicked')
        }),
        t.onPeerLeave((peer) => {
          if (peer !== this.hostPeer || !this.hostConnected) return
          this.hostConnected = false
          this.events.emit('hostLost')
          this.hostGoneTimer = setTimeout(() => this.events.emit('hostGone'), hostWaitMs)
        }),
        // The host closed the room on purpose: no point waiting for it.
        t.on(CH.bye, (_: unknown, peer) => {
          if (peer !== this.hostPeer) return
          this.hostConnected = false
          if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer)
          this.hostGoneTimer = null
          this.events.emit('hostGone')
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

  /**
   * The transport peer id of a player we have a direct link with: for the host
   * any connected guest, for a guest only the host. Used by the Network panel.
   */
  peerOf(playerId: string): string | undefined {
    if (!this.isHost)
      return playerId === this.lobby.hostId && this.hostConnected ? (this.hostPeer ?? undefined) : undefined
    for (const [peer, id] of this.playerOfPeer) if (id === playerId) return peer
    return undefined
  }

  /** What the host should save to reopen this room after a reload. */
  snapshot(): RoomSnapshot {
    return {
      players: this.lobby.players.map((p) => ({ ...p })),
      round: this.lobby.round,
      options: { ...this.lobby.options },
    }
  }

  /** Steps per second for the current options. */
  get tickRate(): number {
    return tickRateOf(this.def, this.lobby.options)
  }

  /** Host only, between matches: change a game option for everyone. */
  setOption(id: string, value: string): void {
    const { phase } = this.lobby
    if (!this.isHost || (phase !== 'lobby' && phase !== 'finished')) return
    const next = resolveOptions(this.def.options, { ...this.lobby.options, [id]: value })
    if (next[id] === this.lobby.options[id]) return
    // Fewer seats than seated players: refused. Otherwise players past the
    // last seat move to the lowest free ones.
    const { seats } = seatingOf(this.def, next)
    const { players } = this.lobby
    if (players.length > seats) return
    for (const p of players) if (p.slot >= seats) p.slot = this.freeSeat()
    players.sort((a, b) => a.slot - b.slot)
    this.lobby.options = next
    this.broadcastLobby()
  }

  /**
   * Between matches, in a game with teams: move the local player to a free
   * seat. The host applies it; a guest asks the host, which checks it.
   */
  moveSeat(seat: number): void {
    if (this.isHost) this.applySeat(this.selfId, seat)
    else if (this.hostPeer && this.hostConnected) this.transport.send(CH.seat, seat, this.hostPeer)
  }

  /**
   * Change the local player's name and avatar (e.g. from the room). A guest
   * re-sends its hello, which the host already treats as a profile update, so
   * older hosts understand it too.
   */
  setProfile(name: string, avatar: string | undefined): void {
    const clean = { name: cleanName(name), avatar: cleanAvatar(avatar) }
    if (this.isHost) {
      const self = this.self
      if (!self) return
      self.name = clean.name
      if (clean.avatar) self.avatar = clean.avatar
      else delete self.avatar
      this.broadcastLobby()
      return
    }
    this.hello = { id: this.selfId, ...clean }
    if (this.hostPeer) this.transport.send(CH.hello, this.hello, this.hostPeer)
  }

  /**
   * Host: remove a player from the room at once (no reconnect grace), also
   * mid-match. They are told, and may join again with the code.
   */
  kick(playerId: string): void {
    if (!this.isHost || playerId === this.selfId) return
    if (!this.lobby.players.some((p) => p.id === playerId)) return
    for (const [peer, id] of [...this.playerOfPeer]) {
      if (id !== playerId) continue
      this.transport.send(CH.kick, true, peer)
      // Forget the link: their ready / inputs no longer count (a new hello seats them again).
      this.playerOfPeer.delete(peer)
    }
    clearTimeout(this.dropTimers.get(playerId))
    this.dropTimers.delete(playerId)
    this.removePlayer(playerId)
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
    this.setState(this.def.setup(this.lobby.players, randomSeed(), this.lobby.options))
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

  /**
   * Leave on purpose: tell the others (the host frees our seat at once;
   * guests of a leaving host stop waiting), then disconnect.
   */
  leave(): void {
    if (this.offline) return this.dispose()
    this.transport.send(CH.bye, true)
    // Give the goodbye a moment to go out before closing connections.
    this.teardown()
    setTimeout(() => this.transport.leave(), 250)
  }

  /** Disconnect without saying goodbye (like a closed tab or lost network). */
  dispose(): void {
    this.teardown()
    this.transport.leave()
  }

  private teardown() {
    this.stopSimulation()
    if (this.countdownTimer) clearTimeout(this.countdownTimer)
    if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer)
    this.dropTimers.forEach(clearTimeout)
    this.unsubs.forEach((u) => u())
    this.events.clear()
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
    const name = cleanName(msg?.name)
    if (!id || id === this.selfId) return
    const avatar = cleanAvatar(msg?.avatar)
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
      if (avatar) existing.avatar = avatar
      else delete existing.avatar
    } else {
      this.playerOfPeer.set(peer, id)
      if (players.length >= seatingOf(this.def, this.lobby.options).seats) {
        // Room is full: they still receive the lobby and watch.
        if (this.state) this.transport.send(CH.state, this.netState(), peer)
        this.transport.send(CH.lobby, this.lobby, peer)
        return
      }
      const slot = this.freeSeat()
      players.push({ id, name, slot, ready: false, connected: true, ...(avatar && { avatar }) })
      players.sort((a, b) => a.slot - b.slot)
    }
    // State first, so the lobby (e.g. a results screen) can render with it.
    if (this.state) this.transport.send(CH.state, this.netState(), peer)
    this.broadcastLobby()
  }

  /** The lowest seat nobody sits in. */
  private freeSeat(): number {
    let slot = 0
    while (this.lobby.players.some((p) => p.slot === slot)) slot++
    return slot
  }

  private applySeat(playerId: string, seat: unknown) {
    const { phase, players, options } = this.lobby
    if (phase !== 'lobby' && phase !== 'finished') return
    const { seats, teams } = seatingOf(this.def, options)
    if (teams <= 1 || !Number.isInteger(seat)) return
    const to = seat as number
    if (to < 0 || to >= seats || players.some((p) => p.slot === to)) return
    const player = players.find((p) => p.id === playerId)
    if (!player) return
    player.slot = to
    players.sort((a, b) => a.slot - b.slot)
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
    this.stopTicker = startTicker(this.tickRate, () => this.step())
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
    this.transport.send(CH.state, this.netState())
  }

  /** The state as guests get it (see GameDefinition.netView). */
  private netState() {
    return this.state && this.def.netView ? this.def.netView(this.state) : this.state
  }

  private setState(state: S) {
    this.state = state
    this.lastStateAt = performance.now()
    this.events.emit('state', state)
  }
}
