import { Emitter } from '../core/emitter'
import { startTicker } from '../core/loop'
import { randomSeed } from '../core/rng'
import { createHostIdentity, proofMessage, verifyHost, type HostIdentity } from './host-identity'
import { PlayoutBuffer } from './playout'
import { randomId, type Transport } from './transport'

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
  /**
   * A guest input stamped by GameDefinition.inputStamp: its stamp, and how many ticks after its
   * scheduled stamp + offset it was applied (0 = on schedule; > 0 = it came too late for the buffer).
   * Absent on the host's own, unstamped and computer inputs.
   */
  stamp?: number
  late?: number
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
  /**
   * Opt-in input playout buffer: the guest's own step counter an input was sent at (undefined =
   * apply on arrival, as before). The host then applies a guest's stamped inputs at stamp + a
   * per-player offset (fastest recent transit + jitter, engine/net/playout.ts) instead of on arrival,
   * so network jitter no longer moves WHEN they take effect. Stamp every input of a player (or
   * none): a stamped input waits, an unstamped one does not, so mixing them reorders.
   */
  inputStamp?(input: I): number | undefined
  /** Called on the host when a player is gone for good mid-game. */
  removePlayer?(state: S, playerId: string): void
  /** Called on the host mid-game when a player drops (grace window starts) or returns within it. */
  setConnected?(state: S, playerId: string, connected: boolean): void
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

/** The seats the room would open with option `id` set to `value` (setOption refuses fewer than are seated). */
export function seatsIf(
  def: GameDefinition<any, any>,
  options: GameOptions,
  id: string,
  value: string,
): number {
  return seatingOf(def, resolveOptions(def.options, { ...options, [id]: value })).seats
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
  /** The host's public key (see host-identity). Absent until ready, or without WebCrypto. */
  hostKey?: string
}

/** What a host persists so a reload can reopen the same room. */
export interface RoomSnapshot {
  players: PlayerInfo[]
  round: number
  options?: GameOptions
  /** The host's private key, so guests can still verify it after the reload. */
  identity?: JsonWebKey
  /** Player id → seat key, so a reload doesn't reopen seats to anyone. */
  keys?: Record<string, string>
}

export interface SessionOptions {
  host: boolean
  name: string
  /** Avatar id shown to others; an opaque short token to the session. */
  avatar?: string
  /** Stable id for the local player; keep it across reloads to reclaim a seat. */
  playerId: string
  /**
   * Guest: private key that proves `playerId` is ours. Keep it with the id;
   * the host never shares it. Default: a fresh random one.
   */
  playerKey?: string
  /** Guest: the host key pinned before a reload; a new host peer must prove it. */
  hostKey?: string
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
  /** Guest → would-be host: a nonce to sign. */
  prove: 'prove',
  /** Host → guest: { n: nonce, s: signature }. */
  proof: 'proof',
} as const

interface Hello {
  id: string
  name: string
  avatar?: string
  /** Seat key. Optional: older clients don't send one. */
  key?: string
}

/** Seat keys and nonces: short random tokens. */
const cleanToken = (raw: unknown): string | undefined =>
  typeof raw === 'string' && /^[a-z0-9]{8,64}$/.test(raw) ? raw : undefined

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
  /** Host: stamped guest inputs waiting for their tick (inputStamp), per player. */
  private playout = new Map<string, PlayoutBuffer<I>>()
  /** Host: ticks simulated this match (the playout buffers' clock). */
  private simTick = 0
  private dueScratch: I[] = []
  private lateScratch: number[] = []
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
  /** Host: player id → seat key. Private; never in the lobby. */
  private seatKeys = new Map<string, string>()
  /** Host: our key pair, once ready. */
  private identity: HostIdentity | null = null
  /** Client: the host key we trust (pinned from the first host). */
  private pinnedKey: string | null = null
  /** Client: would-be hosts we challenged, by peer. */
  private challenges = new Map<string, { nonce: string; lobby: LobbyState }>()
  private disposed = false

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
      for (const [id, key] of Object.entries(opts.restore?.keys ?? {})) this.seatKeys.set(id, key)
      const identity = this.offline ? Promise.resolve(null) : createHostIdentity(opts.restore?.identity)
      void identity.then((id) => {
        if (!id || this.disposed) return
        this.identity = id
        this.lobby.hostKey = id.pub
        this.broadcastLobby()
      })
      this.unsubs.push(
        // A guest checks we are the host it knew: sign its nonce with our peer id.
        t.on(CH.prove, (raw: unknown, peer) => {
          const nonce = cleanToken(raw)
          if (!nonce) return
          void identity.then(async (id) => {
            if (!id || this.disposed) return
            const s = await id.sign(proofMessage(nonce, t.selfId))
            if (!this.disposed) t.send(CH.proof, { n: nonce, s }, peer)
          })
        }),
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
          if (id) this.queueInput(id, input, true)
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
      this.pinnedKey = opts.hostKey ?? null
      this.hello = {
        id: this.selfId,
        name: opts.name,
        avatar: cleanAvatar(opts.avatar),
        key: cleanToken(opts.playerKey) ?? randomId(16),
      }
      this.unsubs.push(
        // The host sends its lobby to every peer that joins; we greet the host
        // only once we accept that lobby (acceptLobby), so our seat key never
        // reaches other guests. Re-greeting on reconnect reclaims our seat.
        t.on(CH.lobby, (lobby: LobbyState, peer) => {
          if (!lobby || typeof lobby !== 'object') return
          if (this.hostConnected) {
            // One host at a time.
            if (peer === this.hostPeer) this.acceptLobby(peer, lobby)
            return
          }
          // No live host. Without a pinned key (first contact, or a host
          // without WebCrypto) trust whoever answers, as before. Otherwise
          // the newcomer must prove it holds the key (the host reloaded and
          // came back with a new peer id).
          if (!this.pinnedKey) return this.acceptLobby(peer, lobby)
          if (lobby.hostKey !== this.pinnedKey) return
          const pending = this.challenges.get(peer)
          if (pending) return void (pending.lobby = lobby)
          const nonce = randomId(16)
          this.challenges.set(peer, { nonce, lobby })
          t.send(CH.prove, nonce, peer)
        }),
        t.on(CH.proof, (msg: { n?: unknown; s?: unknown }, peer) => {
          const pending = this.challenges.get(peer)
          if (!pending || msg?.n !== pending.nonce || !this.pinnedKey) return
          void verifyHost(this.pinnedKey, proofMessage(pending.nonce, peer), msg.s).then((ok) => {
            if (this.challenges.get(peer) !== pending) return
            this.challenges.delete(peer)
            // ok === null: this browser can't check (no WebCrypto); don't lock it out.
            if (ok !== false && !this.disposed && !this.hostConnected) this.acceptLobby(peer, pending.lobby)
          })
        }),
        t.on(CH.state, (state: S, peer) => {
          if (peer === this.hostPeer) this.setState(state)
        }),
        t.on(CH.kick, (_: unknown, peer) => {
          if (peer === this.hostPeer && this.hostConnected) this.events.emit('kicked')
        }),
        t.onPeerLeave((peer) => {
          this.challenges.delete(peer)
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

  /** Client: the host key we trust; save it to keep trusting only that host after a reload. */
  get hostKey(): string | undefined {
    return this.pinnedKey ?? undefined
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
      ...(this.identity && { identity: this.identity.secret }),
      ...(this.seatKeys.size > 0 && { keys: Object.fromEntries(this.seatKeys) }),
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
    this.hello = { ...this.hello!, ...clean }
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

  /**
   * Mark the local player ready (or not) for the next match. The host's own flag never gates Start
   * (waitingFor skips the host); it shows the others the host is in for a rematch (results screen).
   */
  setReady(ready: boolean): void {
    const self = this.self
    if (!self) return
    if (this.isHost) {
      if (self.ready === ready) return
      self.ready = ready
      this.broadcastLobby()
      return
    }
    if (!this.hostPeer) return
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
    this.playout.clear()
    this.simTick = 0
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
    this.disposed = true
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

  /** Client: follow `peer` as the host and show its lobby. */
  private acceptLobby(peer: string, lobby: LobbyState) {
    const wasLost = this.hostPeer !== null && !this.hostConnected
    const newLink = peer !== this.hostPeer || !this.hostConnected
    this.hostPeer = peer
    this.hostConnected = true
    if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer)
    this.hostGoneTimer = null
    this.challenges.clear()
    // Pin the host key once (it may arrive a moment after the first lobby); it never changes.
    if (!this.pinnedKey && typeof lobby.hostKey === 'string') this.pinnedKey = lobby.hostKey
    this.lobby = lobby
    if (newLink) this.transport.send(CH.hello, this.hello, peer)
    if (wasLost) this.events.emit('hostBack')
    this.events.emit('lobby', lobby)
  }

  private onHello(peer: string, msg: Hello) {
    const id = String(msg?.id ?? '').slice(0, 40)
    const name = cleanName(msg?.name)
    if (!id || id === this.selfId) return
    const avatar = cleanAvatar(msg?.avatar)
    const key = cleanToken(msg?.key)
    const { players } = this.lobby
    const existing = players.find((p) => p.id === id)
    // A known id needs its key. Ids without one (older clients, or restored
    // from an older snapshot) take the first key offered.
    const known = this.seatKeys.get(id)
    if (known && known !== key) return
    if (!known && key) this.seatKeys.set(id, key)

    if (existing) {
      // A returning player (reload / reconnect) reclaims their seat. Refuse a
      // second live connection claiming the same id.
      const liveElsewhere = [...this.playerOfPeer].some(([p, pid]) => pid === id && p !== peer)
      if (existing.connected && liveElsewhere) return
      this.playerOfPeer.set(peer, id)
      clearTimeout(this.dropTimers.get(id))
      this.dropTimers.delete(id)
      const wasAway = !existing.connected
      existing.connected = true
      if (wasAway) this.setConnected(id, true)
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
    this.setConnected(player.id, false)
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

  private setConnected(id: string, connected: boolean) {
    const inMatch = this.lobby.phase === 'playing' || this.lobby.phase === 'countdown'
    if (this.state && inMatch) this.def.setConnected?.(this.state, id, connected)
  }

  private removePlayer(id: string) {
    this.playout.delete(id)
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
    this.simTick++
    this.releaseDue()
    const state = this.def.tick(this.state!, this.pending.splice(0))
    this.setState(state)
    this.broadcastState()
    if (this.def.isFinished(state)) {
      this.stopSimulation()
      // Everyone, host included, readies up again for the rematch.
      for (const p of this.lobby.players) p.ready = false
      this.setPhase('finished')
    }
  }

  private queueInput(player: string, input: I, remote = false) {
    if (this.lobby.phase !== 'playing') return
    const stamp = remote ? this.def.inputStamp?.(input) : undefined
    if (typeof stamp !== 'number' || !Number.isFinite(stamp)) {
      this.pending.push({ player, input })
      return
    }
    let buf = this.playout.get(player)
    if (!buf) this.playout.set(player, (buf = new PlayoutBuffer<I>()))
    buf.push(stamp, input, this.simTick + 1)
  }

  /** Move the stamped inputs due this tick into `pending`. */
  private releaseDue() {
    const due = this.dueScratch
    const late = this.lateScratch
    for (const [player, buf] of this.playout) {
      due.length = late.length = 0
      buf.take(this.simTick, due, late)
      for (let i = 0; i < due.length; i++) {
        const input = due[i]
        this.pending.push({ player, input, stamp: this.def.inputStamp!(input), late: late[i] })
      }
    }
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
