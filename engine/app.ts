import { formatNumber } from './core/i18n'
import { preloadGate } from './core/preload'
import { dismissSplash } from './ui/splash'
import './ui/base.css'
import { playMusic, type Track } from './audio/music'
import { playSound, UI_SOUNDS } from './audio/sound'
import { ARCADE, LOUNGE } from './audio/tracks'
import { celebrate } from './fx/confetti'
import { createBroadcastTransport } from './net/broadcast'
import {
  resolveOptions,
  seatingOf,
  seatsIf,
  Session,
  type GameDefinition,
  type GameOptions,
  type LobbyState,
  type PlayerInfo,
  type RoomSnapshot,
} from './net/session'
import {
  joinFailed,
  joinStep,
  startJoin,
  statusOf,
  stepJoin,
  type JoinPhase,
  type JoinTrack,
  type LinkedPlayer,
} from './net/status'
import { createOfflineTransport, randomId, type Transport } from './net/transport'
import { netLog } from './net/debug'
import { createTrysteroTransport } from './net/trystero'
import { createHybridTransport } from './net/hybrid'
import { GAME_RELAY_URL, relayMode } from './net/net-config'
import { createRelayTransport } from './net/relay'
import { avatarEl, avatarPicker } from './social/avatar-ui'
import { avatarFor, storedAvatar } from './social/avatars'
import { ReactionBridge } from './social/reaction-bridge'
import { ReactionLayer, reactionPicker } from './social/reaction-ui'
import { t as ts } from './social/i18n'
import { RoomSocial } from './social/room-social'
import { clearVoiceRejoin } from './social/voice-state'
import { audioMenu } from './ui/audio-menu'
import { button } from './ui/components'
import { langMenu } from './ui/lang-menu'
import { netStatusButton } from './ui/net-panel'
import { h, icon, iconButton, toast } from './ui/dom'
import { leaderboardTable, type Leaderboard } from './ui/leaderboard'
import { fullscreenButton } from './ui/fullscreen'
import {
  guideButton,
  howToPlayMode,
  markGuideSeen,
  openGuide,
  withPauseRow,
  PAUSE_KEYS,
  type GuideStep,
} from './ui/guide'
import { t } from './ui/i18n'
import { isTyping } from './ui/key-guard'
import { pauseAction } from './ui/pause-keys'
import {
  openTutorial,
  shouldAutoOpen,
  shouldMarkSeen,
  tutorialButton,
  type DeckEnd,
  type TutorialCard,
} from './ui/tutorial'
import { chipLook, scoreLabel } from './ui/scoreline'
import { icons } from './ui/icons'
import { optionPickers } from './ui/options'
import { popover } from './ui/popover'
import { applyTheme, playerColor } from './ui/theme'

export interface Scoreline {
  id: string
  score: number
  /** Chip name for a seat that isn't in the lobby (e.g. the computer). Lobby players keep their own name. */
  name?: string
  /** Colour slot for a seat that isn't in the lobby (lobby players keep their own). Default 0. */
  slot?: number
  /** Avatar id for a seat that isn't in the lobby (e.g. 'robot' for the computer). Default none. */
  avatar?: string
  /** Knocked out / no longer in play. */
  out?: boolean
}

export interface Outcome {
  headline: string
  /** Picks the end-of-match sound (and confetti for a win). */
  result: 'win' | 'lose' | 'draw' | 'done'
}

/** One stat on the solo results screen, e.g. { label: 'Distance', value: '1.2 km' }. */
export interface SummaryRow {
  label: string
  value: string
  /** Stands out (a new best, a standout number). */
  highlight?: boolean
}

/** What the shell hands a game's `mount`. Online rooms only: `reactions.active` is false when offline. */
export interface MountContext {
  reactions: ReactionBridge
}

export interface GameAppOptions<S, I> {
  def: GameDefinition<S, I>
  title: string
  /** One line under the title on the start screen. */
  tagline?: string
  /** How to play, shown on the start and pause screens. Ignored when `guide` is set. */
  controls?: string
  /**
   * How to play as rows of keycaps and mouse / touch icons (see engine/ui/guide.ts). The start and
   * pause screens get a "How to play" button, and the card shows once before the first match (the
   * shell adds a Pause row). Text is translated by the game.
   */
  guide?: GuideStep[]
  /**
   * How to play as step cards (see engine/ui/tutorial). When set, the "How to play" button and the
   * first play open this deck instead of the guide card; the last card links to `guide` (if any).
   * It counts as seen once finished or skipped, not when a match starting closes it. Text is
   * translated by the game.
   */
  tutorial?: TutorialCard[]
  /**
   * Gameplay music. Menus and lobbies use the shared lounge track. `null`: no
   * background music while playing (the game makes its own, e.g. beat-synced).
   */
  music?: Track | null
  /**
   * Called once per session with the stage element to render into. Set up
   * rendering, input and sounds here and return a cleanup function. `ctx`
   * (optional to use): online rooms only; `ctx.reactions.active` is false offline.
   */
  mount(session: Session<S, I>, stage: HTMLElement, ctx: MountContext): () => void
  /** Scores shown in the top bar while playing and on the seats afterwards. */
  scores?(state: S): Scoreline[]
  /**
   * Pop the top-bar chip when a score goes up (default true). Turn off for
   * scores that climb continuously (distance), or the chip never sits still.
   */
  bumpScores?: boolean
  /** End-of-match headline, from the local player's point of view. */
  outcome?(state: S, selfId: string): Outcome
  /** Optional stat grid under the headline on the results screen (solo, and your own in a room). */
  summary?(state: S, selfId: string): SummaryRow[]
  /**
   * Optional end-of-match leaderboard under the headline (solo and rooms): every player ranked with the
   * game's stat columns (engine/ui/leaderboard.ts). Shown above `summary` when both are given.
   */
  leaderboard?(state: S, selfId: string): Leaderboard | null
  /**
   * Show a ranked list (from `scores`, highest first) on a room's results
   * screen. Default false: games with their own winner rules keep the seats only.
   */
  ranking?: boolean
  /** Keys (KeyboardEvent.code) that pause a solo game; default Esc + P (engine/ui/guide.ts PAUSE_KEYS). */
  pauseKeys?: readonly string[]
  /**
   * Heavy setup to finish before play can start (e.g. building a 3D scene and
   * compiling its shaders). Starts at page load; the start buttons show
   * "Loading…" until it settles. A failed preload still lets players in.
   */
  preload?(): Promise<unknown>
  /**
   * Extra controls on the start screen, under the option pickers (e.g. a
   * timing calibration button). Called each time the menu is drawn.
   */
  menuExtras?(): HTMLElement | null
  /**
   * Extra controls in an online room, under the player's name and avatar
   * (e.g. a character picker). Built once per room and kept across redraws,
   * so it may hold its own state; save choices where `mount` can read them.
   */
  roomExtras?(): HTMLElement | null
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const NAME_KEY = 'play-forge:name'
/** How often the joining screen re-checks the connection. */
const JOIN_POLL_MS = 500
/** Relative link from games/<id>/index.html back to the launcher. */
const LAUNCHER_URL = '../../index.html'

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('')
}

function createTransport(appId: string, room: string): Transport {
  // `?net=local` connects tabs of this browser only (for development).
  const local = new URLSearchParams(location.search).get('net') === 'local'
  if (local) return createBroadcastTransport(appId, room)
  const direct = createTrysteroTransport(appId, room)
  const mode = relayMode()
  if (mode === 'off') return direct
  // Same peer id on both paths, so a peer is one peer whichever way it's reached.
  const relay = createRelayTransport(GAME_RELAY_URL, { app: appId, room, id: direct.selfId })
  return createHybridTransport(direct, relay, { relayOnly: mode === 'only' })
}

function storedName(value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(NAME_KEY, value)
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return value ?? ''
  }
}

// ---------- Tab identity & reload recovery ----------
// sessionStorage is per tab and survives reloads, which is exactly the scope
// of "this player in this room". A duplicated tab copies sessionStorage, so
// saved state is only reused when this page load is a reload.

interface SavedRoom {
  playerId: string
  room: string
  host: boolean
  snapshot?: RoomSnapshot
}

const isReload = (() => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav?.type === 'reload'
  } catch {
    return false
  }
})()

function roomStore(gameId: string) {
  const key = `play-forge:room:${gameId}`
  return {
    load(): SavedRoom | null {
      try {
        return JSON.parse(sessionStorage.getItem(key) ?? 'null')
      } catch {
        return null
      }
    },
    save(value: SavedRoom | null) {
      try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value))
        else sessionStorage.removeItem(key)
      } catch {
        // storage unavailable: reload recovery just won't happen
      }
    },
  }
}

/**
 * Standard shell for a game: top bar, start screen (solo / create / join),
 * lobby with seats and ready-up, countdown, pause, results, music and
 * reconnection, all wired to a {@link Session}. Every game gets the same flow,
 * look and sounds.
 */
export function createGameApp<S, I>(opts: GameAppOptions<S, I>): void {
  const { def } = opts
  const appId = `play-forge/${def.id}`
  const store = roomStore(def.id)
  applyTheme()
  document.title = `${opts.title} · Play Forge`

  // ---------- Shell ----------
  const scoresEl = h('div', { class: 'pf-bar-scores' })
  // Solo: pauses the match. Online: opens a local menu, the match keeps running (see onlineMenu).
  const pauseBtn = iconButton(icons.pause, t('Pause'), () => {
    if (session?.offline) return session.setPaused(true)
    onlineMenu = true
    render()
  })
  const leaveBtn = iconButton(icons.leave, t('Leave'), () => leave())
  // Reactions, voice and chat: only in online rooms; `social` is set while in one.
  let social: RoomSocial | null = null
  const reactBtn = reactionPicker((id) => social?.reactions.send(id) ?? false)
  const reactionLayer = new ReactionLayer()
  const reactionBridge = new ReactionBridge()
  // Everyday room controls (mic, chat, reactions) and settings (voice, language,
  // sound, leave). Desktop shows them all in the bar; phones put the everyday
  // ones behind a floating button and the settings behind ⋯ (CSS decides).
  const quickSlot = h('div', { class: 'pf-slot' })
  const settingsSlot = h('div', { class: 'pf-slot' })
  const fan = popover(
    {
      button: iconButton(icons.chat, ts('Voice, chat and reactions')),
      label: ts('Voice, chat and reactions'),
      class: 'pf-fan',
      role: 'group',
    },
    quickSlot,
    reactBtn,
  )
  fan.root.classList.add('pf-fan-anchor')
  fan.root.querySelector('button')!.classList.add('pf-fab')
  const more = popover(
    { button: iconButton(icons.more, ts('More')), label: ts('More'), class: 'pf-overflow' },
    settingsSlot,
    langMenu(),
    audioMenu(),
    leaveBtn,
  )
  more.root.classList.add('pf-more-anchor')
  more.root.querySelector('button')!.classList.add('pf-more-btn')
  // Network status: online rooms only (lobby and in a match), host and guests.
  const netBtn = netStatusButton()
  const home = h('a', { class: 'pf-btn icon', href: LAUNCHER_URL, title: t('All games') })
  home.setAttribute('aria-label', t('All games'))
  home.append(icon(icons.home))
  const bar = h(
    'header',
    { class: 'pf-bar' },
    home,
    h('h1', { class: 'pf-bar-title', textContent: opts.title }),
    scoresEl,
    h('div', { class: 'pf-bar-actions' }, fan.root, pauseBtn, netBtn.root, fullscreenButton(), more.root),
  )
  const stage = h('main', { class: 'pf-stage' })
  const overlay = h('div', { class: 'pf-overlay' })
  const countdownEl = h('div', { class: 'pf-countdown' })
  countdownEl.setAttribute('aria-live', 'assertive')
  document.body.append(h('div', { class: 'pf-shell' }, bar, stage), overlay, countdownEl)

  // Every button clicks.
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('.pf-btn')) playSound(UI_SOUNDS.click)
  })

  playMusic(LOUNGE)

  // ---------- Control guide ----------
  const mode = howToPlayMode(opts.guide, opts.controls)
  const pauseKeys = opts.pauseKeys ?? PAUSE_KEYS
  const guide = mode === 'guide' ? withPauseRow(opts.guide!, pauseKeys) : null
  const tutorial = opts.tutorial?.length ? opts.tutorial : null
  /** Closes the first-play help (deck or guide) while it holds back a solo match or sits over a room. */
  let closeFirstHelp: (() => void) | null = null
  /** Closes the deck last opened, with any guide over it (online: closed when the match starts, it swallows keys). */
  let closeOpenHelp: (() => void) | null = null
  /** Opens How to play: the tutorial deck when the game has one, else the guide card ('done' on close). */
  function openHelp(onClose?: (end: DeckEnd) => void): () => void {
    if (!tutorial) return openGuide(guide!, { onClose: () => onClose?.('done') })
    // "Full controls" opens the guide over the deck; closing the deck by code closes it too.
    let closeGuide: (() => void) | undefined
    // Declared before the deck opens: its onClose compares against it.
    let close: (() => void) | null = null
    const closeDeck = openTutorial(tutorial, {
      onClose: (end) => {
        // Forget it once closed, so later renders don't hold (or call) a stale closer.
        if (closeOpenHelp === close) closeOpenHelp = null
        onClose?.(end)
      },
      fullControls: guide ? () => (closeGuide = openGuide(guide)) : undefined,
    })
    const closeAll = () => {
      closeGuide?.()
      closeDeck()
    }
    close = closeAll
    closeOpenHelp = closeAll
    return closeAll
  }
  /** Marks the game seen once the player finished or skipped the help (not when a match closed it). */
  const markSeenOn = (end: DeckEnd) => {
    if (shouldMarkSeen(end)) markGuideSeen(def.id)
  }
  const howToPlay = () =>
    tutorial ? tutorialButton(() => openHelp(markSeenOn)) : guide && guideButton(guide)
  /** Online only: the local menu (Esc / pause button) is open. The match keeps running under it. */
  let onlineMenu = false
  /** The old paragraph, for games that pass `controls` only. */
  const controlsText = (cls: string) => mode === 'text' && h('p', { class: cls, textContent: opts.controls })

  // ---------- Session lifecycle ----------
  let session: Session<S, I> | null = null
  let cleanup: (() => void) | null = null
  /** The room's "you" controls (name, avatar, game extras): built once per session, kept across redraws. */
  let roomSelf: { session: Session<S, I>; el: HTMLElement } | null = null
  let room = ''
  /** Guest: progress of joining the room, until the host's lobby arrives. */
  let joinTrack: JoinTrack | null = null
  let playerId = (isReload && store.load()?.playerId) || randomId()
  let lastLobby: LobbyState | null = null
  const snapshot = (l: LobbyState): LobbyState => ({
    ...l,
    players: l.players.map((p) => ({ ...p })),
    options: { ...l.options },
  })

  // The player's last chosen options, used for solo games and new rooms.
  const optionsKey = `play-forge:options:${def.id}`
  const chosenOptions = (): GameOptions => {
    try {
      return resolveOptions(def.options, JSON.parse(localStorage.getItem(optionsKey) ?? '{}'))
    } catch {
      return resolveOptions(def.options)
    }
  }
  const saveOptions = (options: GameOptions) => {
    try {
      localStorage.setItem(optionsKey, JSON.stringify(options))
    } catch {
      // storage unavailable: the choice still applies to this session
    }
  }

  function begin(
    transport: Transport,
    host: boolean,
    extra: { offline?: boolean; restore?: RoomSnapshot } = {},
  ) {
    const name = storedName() || t('Player')
    const s = (session = new Session(def, transport, {
      host,
      name,
      avatar: storedAvatar(),
      playerId,
      options: chosenOptions(),
      ...extra,
    }))
    lastLobby = snapshot(s.lobby)
    seenTokens.clear()
    seenReady.clear()
    if (!extra.offline) store.save({ playerId, room, host, snapshot: host ? s.snapshot() : undefined })
    const unmount = opts.mount(s, stage, { reactions: reactionBridge })
    // After mount, so the game's key handlers run before chat's Enter shortcut.
    const roomSocial = extra.offline
      ? null
      : new RoomSocial(s as Session<unknown, unknown>, reactionLayer, (p, r) => reactionBridge.claim(p, r), {
          gameId: def.id,
          room,
        })
    social = roomSocial
    reactionBridge.attach(roomSocial?.reactions ?? null)
    quickSlot.replaceChildren(...(roomSocial?.quick ?? []))
    settingsSlot.replaceChildren(...(roomSocial?.settings ?? []))
    const offs = [
      s.on('lobby', (lobby) => {
        react(s, lobby)
        roomSocial?.refresh()
        if (s.isHost && !s.offline) store.save({ playerId, room, host: true, snapshot: s.snapshot() })
        render()
      }),
      s.on('state', () => {
        renderScores()
        // A late first state (after rejoining) completes the results screen.
        if (s.phase === 'finished' && !overlay.querySelector('.pf-headline')) render()
      }),
      s.on('hostLost', () => {
        playSound(UI_SOUNDS.leave)
        render()
      }),
      s.on('hostBack', () => {
        playSound(UI_SOUNDS.join)
        toast(t('The host is back'))
      }),
      s.on('hostGone', () => {
        store.save(null)
        clearVoiceRejoin(def.id, room)
        showMessage(t('The room closed'), t('The host left the room. Create a new room to keep playing.'))
      }),
      s.on('kicked', () => {
        // Leave first (the host keeps broadcasting lobbies that would redraw the room).
        const code = room
        leave()
        showMessage(t('You were removed'), t('The host removed you from room {room}.', { room: code }))
      }),
    ]
    if (!extra.offline)
      netBtn.attach({
        room,
        isHost: host,
        status: () => statusOf(transport),
        measure: () => transport.diagnostics?.measure() ?? Promise.resolve(),
        linked: () => linkedPlayers(s),
      })
    // Guest: follow the connection until the host answers, so the joining
    // screen can say which step is slow or failed.
    joinTrack = host || extra.offline ? null : startJoin(performance.now())
    const joinTimer: ReturnType<typeof setInterval> | null =
      joinTrack &&
      setInterval(() => {
        if (!followJoin(s)) clearInterval(joinTimer!)
      }, JOIN_POLL_MS)
    cleanup = () => {
      if (joinTimer) clearInterval(joinTimer)
      joinTrack = null
      netBtn.attach(null)
      offs.forEach((off) => off())
      reactionBridge.attach(null)
      roomSocial?.dispose()
      social = null
      quickSlot.replaceChildren()
      settingsSlot.replaceChildren()
      unmount()
    }
    if (extra.offline) {
      // First match of this game: the deck / guide first, the countdown once it's closed.
      if (shouldAutoOpen(def.id, !!(tutorial || guide)))
        closeFirstHelp = openHelp((end) => {
          closeFirstHelp = null
          if (shouldMarkSeen(end)) markGuideSeen(def.id)
          if (session === s && s.phase === 'lobby') s.start()
        })
      else s.start()
    }
    render()
  }

  /** One joining-screen update; false once the host's room has arrived (stop polling). */
  function followJoin(s: Session<S, I>): boolean {
    if (!joinTrack || session !== s || s.lobby.hostId) return false
    const before = joinTrack.phase
    joinTrack = stepJoin(joinTrack, statusOf(s.transport), performance.now())
    if (joinTrack.phase !== before) {
      netLog('joining:', before, '→', joinTrack.phase, statusOf(s.transport))
      render()
    }
    return true
  }

  /** Same room, fresh connection (after a join failed). */
  function retryJoin() {
    const s = session
    if (!s) return
    cleanup?.()
    s.dispose()
    session = cleanup = null
    begin(createTransport(appId, room), false)
  }

  function leave() {
    cleanup?.()
    session?.leave()
    session = cleanup = null
    onlineMenu = false
    closeFirstHelp?.()
    // Left on purpose (or removed): don't rejoin this room's voice next time.
    if (room) clearVoiceRejoin(def.id, room)
    room = ''
    store.save(null)
    countdownEl.replaceChildren()
    history.replaceState(null, '', location.pathname + location.search)
    syncMusic()
    showMenu()
  }

  function syncMusic() {
    const phase = session?.phase
    playMusic(
      phase === 'countdown' || phase === 'playing'
        ? opts.music === undefined
          ? ARCADE
          : opts.music
        : LOUNGE,
    )
  }

  /** Sounds, toasts and effects for lobby changes. */
  function react(s: Session<S, I>, lobby: LobbyState) {
    const prev = lastLobby!
    lastLobby = snapshot(lobby)
    syncMusic()

    // Skip toasts for the people already there when we first connect.
    if (!s.offline && prev.hostId) {
      for (const p of lobby.players) {
        if (p.id === s.selfId) continue
        const before = prev.players.find((q) => q.id === p.id)
        if (!before) {
          playSound(UI_SOUNDS.join)
          toast(t('{name} joined', { name: p.name }), playerColor(p.slot))
        } else if (before.connected && !p.connected) {
          playSound(UI_SOUNDS.leave)
          toast(t('{name} lost connection', { name: p.name }), playerColor(p.slot))
        } else if (!before.connected && p.connected) {
          playSound(UI_SOUNDS.join)
          toast(t('{name} is back', { name: p.name }), playerColor(p.slot))
        } else if (!before.ready && p.ready) {
          playSound(UI_SOUNDS.ready)
        }
      }
      for (const p of prev.players)
        if (p.id !== s.selfId && !lobby.players.some((q) => q.id === p.id)) {
          playSound(UI_SOUNDS.leave)
          toast(t('{name} left', { name: p.name }), playerColor(p.slot))
        }
    }

    // Tell guests when the host changes a setting.
    if (!s.isHost && prev.hostId) {
      for (const d of def.options ?? []) {
        const v = lobby.options?.[d.id]
        if (v && prev.options?.[d.id] && v !== prev.options[d.id]) {
          playSound(UI_SOUNDS.ready)
          toast(`${d.label}: ${d.choices.find((c) => c.value === v)?.label ?? v}`)
        }
      }
    }

    if (lobby.phase === 'countdown' && (prev.phase !== 'countdown' || prev.countdown !== lobby.countdown)) {
      // Online the guide shows in the room (never holding up the match); once one starts it's seen.
      // A tutorial deck's own onClose decides instead (closed by the countdown = not seen).
      if (guide && !tutorial) markGuideSeen(def.id)
      playSound(UI_SOUNDS.tick)
      showCount(String(lobby.countdown))
    }
    if (lobby.phase === 'playing' && prev.phase === 'countdown') {
      playSound(UI_SOUNDS.go)
      showCount(t('Go!'))
    }
    if (lobby.phase === 'finished' && prev.phase !== 'finished' && s.state) {
      const result = opts.outcome?.(s.state, s.selfId).result ?? 'done'
      playSound(result === 'win' ? UI_SOUNDS.win : result === 'lose' ? UI_SOUNDS.lose : UI_SOUNDS.join)
      if (result === 'win') celebrate()
    }
  }

  function showCount(text: string) {
    // A fresh element restarts the CSS animation.
    countdownEl.replaceChildren(h('span', { textContent: text }))
  }

  // Solo games pause when the tab is hidden, and on Esc / P. Online, those keys toggle a local menu
  // (never a pause: the other players keep playing). Bubbling phase: an open deck / guide swallows Esc first.
  // The online menu waits a task, so the game's own key listeners (registered after this one) run first
  // and can claim the key with preventDefault (Fuse: Esc cancels an armed blast).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.setPaused(true)
  })
  const pauseFor = (e: KeyboardEvent, consumed = false) => {
    const s = session
    if (!s) return null
    const hostLost = !s.offline && !s.isHost && !s.hostConnected
    return pauseAction({ key: e.code, pauseKeys, offline: s.offline, phase: s.phase, hostLost, consumed })
  }
  window.addEventListener('keydown', (e) => {
    const s = session
    if (!s || e.repeat || isTyping(e.target)) return
    const action = pauseFor(e)
    if (action === 'toggle-solo') s.setPaused(!s.lobby.paused)
    else if (action === 'toggle-menu') {
      // queueMicrotask would run before the next listener; a timeout runs after the whole dispatch.
      setTimeout(() => {
        if (session !== s || pauseFor(e, e.defaultPrevented) !== 'toggle-menu') return
        onlineMenu = !onlineMenu
        render()
      })
    }
  })
  window.addEventListener('offline', () => {
    if (session && !session.offline) toast(t('You are offline. Reconnecting when the network is back.'))
    render()
  })
  window.addEventListener('online', () => {
    if (session && !session.offline) toast(t('Back online'))
    render()
  })

  // ---------- Rendering ----------
  function render() {
    const s = session
    // The online menu only lives during a match in progress.
    if (!s || s.offline || s.phase !== 'playing') onlineMenu = false
    pauseBtn.hidden = !(s?.phase === 'playing' && (s.offline ? !s.lobby.paused : !onlineMenu))
    leaveBtn.hidden = !s
    // Reactions need someone to see them: online rooms we're seated or watching in.
    fan.root.hidden = !s || s.offline || (!s.isHost && !s.lobby.hostId)
    if (fan.root.hidden) fan.close()
    const leaveLabel = s?.offline ? t('Quit to menu') : t('Leave room')
    leaveBtn.title = leaveLabel
    leaveBtn.setAttribute('aria-label', leaveLabel)
    renderScores()
    if (!s) return
    if (!s.isHost && !s.lobby.hostId) return showJoining()
    if (!s.isHost && !s.hostConnected) return showHostLost()
    switch (s.phase) {
      case 'countdown':
        // A room's first-time guide / any open deck closes when the match starts (it would swallow game keys).
        if (!s.offline) closeHelpOnline()
        return show(null)
      case 'playing':
        if (s.offline) return s.lobby.paused ? showPaused(s) : show(null)
        // How to play opened from the online menu stays open over it.
        if (!onlineMenu) closeHelpOnline()
        return onlineMenu ? showPaused(s) : show(null)
      case 'finished':
        return s.offline ? showSoloResult(s) : showRoom(s)
      case 'lobby':
        // Solo waits in 'lobby' only while the first-play guide is open (over the stage).
        return s.offline ? show(null) : showRoom(s)
    }
  }

  function closeHelpOnline() {
    closeFirstHelp?.()
    closeOpenHelp?.()
  }

  // Chips are rebuilt only when who's shown changes; scores update in place,
  // so a fast-climbing score doesn't make the bar flicker or jump.
  let scoresKey = ''
  let lastScores = new Map<string, number>()
  const chipText = new Map<string, Text>()
  function renderScores() {
    const s = session
    const playing = s && (s.phase === 'playing' || s.phase === 'countdown')
    const lines = playing && s.state && opts.scores ? opts.scores(s.state) : []
    // Runs on every state (60 Hz): a plain string key, no arrays or JSON.
    let key = ''
    for (const l of lines) key += `${l.id}${l.out ? '!' : ''}\u0000`
    const label = (line: Scoreline) => scoreLabel(line, s!.lobby.players)
    if (key === scoresKey) {
      for (const line of lines) {
        const text = chipText.get(line.id)
        if (!text || line.score === lastScores.get(line.id)) continue
        text.data = label(line)
        const bumped = line.score > (lastScores.get(line.id) ?? line.score)
        const chip = text.parentElement
        if (bumped && chip && opts.bumpScores !== false) {
          chip.classList.remove('bump')
          void chip.offsetWidth // restart the animation
          chip.classList.add('bump')
        }
      }
      lastScores.clear()
      for (const l of lines) lastScores.set(l.id, l.score)
      return
    }
    scoresKey = key
    chipText.clear()
    scoresEl.replaceChildren(
      ...lines.map((line) => {
        const look = chipLook(line, s!.lobby.players)
        const cls = ['pf-chip', line.out && 'out', line.id === s!.selfId && 'self']
        const text = document.createTextNode(label(line))
        chipText.set(line.id, text)
        const chip = h(
          'span',
          { class: cls.filter(Boolean).join(' ') },
          h('span', { class: 'dot' }, look.avatar && avatarEl(look.avatar)),
          text,
        )
        chip.style.setProperty('--c', playerColor(look.slot))
        chip.dataset.player = line.id
        if (social?.isSpeaking(line.id)) chip.classList.add('speaking')
        return chip
      }),
    )
    lastScores = new Map(lines.map((l) => [l.id, l.score]))
  }

  let panelKey = ''
  /** Show a panel; it animates in only when the kind of panel changes. */
  function show(panel: HTMLElement | null, key = '') {
    overlay.hidden = !panel
    if (!panel) {
      panelKey = ''
      overlay.replaceChildren()
      return
    }
    const fresh = key !== panelKey
    if (fresh) panel.classList.add('enter')
    panelKey = key
    const keepFocus = !fresh && overlay.contains(document.activeElement)
    overlay.replaceChildren(panel)
    countdownEl.replaceChildren()
    if (!keepFocus) panel.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true })
  }

  // Start buttons wait for the game's preload (see GameAppOptions.preload).
  const preload = preloadGate(opts.preload ? () => opts.preload!() : undefined)
  const gated = new Map<HTMLButtonElement, string>()
  function gate(...buttons: HTMLButtonElement[]) {
    if (!preload.pending) return
    for (const b of buttons) {
      gated.set(b, b.textContent ?? '')
      b.disabled = true
      b.classList.add('loading')
      b.textContent = t('Loading…')
    }
  }
  void preload.whenReady().then(() => {
    for (const [b, label] of gated) {
      b.disabled = false
      b.classList.remove('loading')
      b.textContent = label
    }
    gated.clear()
  })

  function showMenu(error = '') {
    render()
    gated.clear()
    const fromLink = /room=([A-Z0-9]+)/i.exec(location.hash)?.[1]?.toUpperCase() ?? ''
    const name = h('input', {
      class: 'pf-input',
      value: storedName() || t('Player'),
      maxLength: 16,
      id: 'pf-name',
    })
    const saveName = () => storedName(name.value.trim() || t('Player'))
    const code = h('input', {
      class: 'pf-input code',
      placeholder: t('CODE'),
      maxLength: 5,
      value: fromLink,
      spellcheck: false,
    })
    code.setAttribute('aria-label', t('Room code'))
    code.setAttribute('autocapitalize', 'characters')
    const join = () => {
      const c = code.value.trim().toUpperCase()
      if (c.length !== 5) {
        playSound(UI_SOUNDS.error)
        return showMenu(t('Room codes are 5 characters, like K7QXP.'))
      }
      saveName()
      room = c
      playerId = randomId()
      history.replaceState(null, '', `#room=${room}`)
      begin(createTransport(appId, room), false)
    }
    code.onkeydown = (e) => {
      if (e.key === 'Enter') join()
    }

    // Single-player games have no rooms: just a big Play button.
    const online = def.maxPlayers > 1
    const solo = button(
      online ? t('Play solo') : t('Play'),
      () => {
        saveName()
        begin(createOfflineTransport(), true, { offline: true })
      },
      online ? '' : 'primary',
    )
    const create = button(
      t('Create room'),
      () => {
        saveName()
        room = newRoomCode()
        playerId = randomId()
        history.replaceState(null, '', `#room=${room}`)
        begin(createTransport(appId, room), true)
      },
      'primary',
    )
    const joinBtn = button(t('Join'), join, fromLink ? 'primary' : '')
    if (fromLink) joinBtn.autofocus = true
    gate(solo, create, joinBtn)

    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: opts.title }),
        opts.tagline && h('p', { class: 'pf-lede', textContent: opts.tagline }),
        h(
          'div',
          { class: 'pf-identity' },
          avatarPicker(storedAvatar(), (id) => storedAvatar(id)),
          h('label', { class: 'pf-field', htmlFor: 'pf-name' }, t('Your name'), name),
        ),
        menuOptions(),
        opts.menuExtras?.() ?? null,
        h('div', { class: 'pf-row' }, def.minPlayers <= 1 && solo, online && create),
        online && h('div', { class: 'pf-or', textContent: t("or join a friend's room") }),
        online && h('div', { class: 'pf-row' }, code, joinBtn),
        error && h('p', { class: 'pf-note error', textContent: error }),
        howToPlay(),
        controlsText('pf-note'),
      ),
      'menu',
    )
  }

  /** Option pickers on the start screen; redraws in place to keep typed text. */
  function menuOptions() {
    const slot = h('div')
    const draw = () =>
      slot.replaceChildren(
        optionPickers(def.options ?? [], chosenOptions(), (id, value) => {
          saveOptions({ ...chosenOptions(), [id]: value })
          draw()
        }) ?? '',
      )
    draw()
    return def.options?.length ? slot : null
  }

  function offlineNote() {
    return (
      !navigator.onLine &&
      h('p', { class: 'pf-note error', textContent: t('You are offline. Check your connection.') })
    )
  }

  function waitingDots() {
    const dots = h('div', { class: 'pf-dots' }, h('i'), h('i'), h('i'))
    dots.setAttribute('aria-hidden', 'true')
    return dots
  }

  const JOIN_TEXT: Record<JoinPhase, () => string> = {
    servers: () => t('Connecting to the matchmaking servers…'),
    'servers-failed': () =>
      t("Can't reach the matchmaking servers. Check your internet or try another network."),
    looking: () => t('Looking for room {room}…', { room }),
    'not-found': () => t("Couldn't find this room. Check the code, and make sure the host's game is open."),
    connecting: () => t('Found the host, connecting…'),
    blocked: () =>
      t(
        'Found the host, but your networks block a direct connection. Try the same Wi-Fi, or turn off VPN / switch from mobile data.',
      ),
  }

  /** Joining a room: three steps (servers, room, host), each saying when it's slow or failed. */
  function showJoining() {
    const phase = joinTrack?.phase ?? 'servers'
    const failed = joinFailed(phase)
    const at = joinStep(phase)
    const steps = [t('Matchmaking servers'), t('Find the room'), t('Connect to the host')]
    const retry = failed && button(t('Try again'), retryJoin, 'primary wide')
    if (retry) retry.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', {
          class: 'pf-heading',
          textContent: failed ? t("Couldn't join {room}", { room }) : t('Joining {room}…', { room }),
        }),
        h(
          'ol',
          { class: 'pf-join-steps' },
          ...steps.map((label, i) => {
            const state = i < at ? 'done' : i > at ? 'todo' : failed ? 'failed' : 'active'
            const mark =
              state === 'done' ? icon(icons.check) : state === 'failed' ? icon(icons.cross) : h('i')
            return h('li', { class: state }, mark, label)
          }),
        ),
        h('p', { class: `pf-lede${failed ? ' error' : ''}`, textContent: JOIN_TEXT[phase]() }),
        !failed && waitingDots(),
        offlineNote(),
        retry,
        button(t('Cancel'), leave, 'quiet'),
      ),
      'joining',
    )
  }

  function showHostLost() {
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: t('Host disconnected') }),
        h('p', {
          class: 'pf-lede',
          textContent: t('Waiting for them to come back. If they reloaded, this takes a few seconds.'),
        }),
        waitingDots(),
        offlineNote(),
        button(t('Leave room'), leave, 'quiet'),
      ),
      'host-lost',
    )
  }

  function roomCodeBox() {
    // A file:// link is useless to a friend; they type the code instead.
    const canLink = location.protocol !== 'file:'
    const copy = iconButton(icons.copy, t('Copy invite link'), async () => {
      await navigator.clipboard?.writeText(location.href).catch(() => {})
      toast(t('Invite link copied'))
    })
    return h(
      'div',
      { class: 'pf-room' },
      h(
        'div',
        { class: 'pf-room-code' },
        h('small', {
          textContent: canLink
            ? t('Room code. Share it, or copy the link.')
            : t('Room code. Share it with friends.'),
        }),
        room,
      ),
      canLink && copy,
    )
  }

  // Tokens and badges pop in only the first time they appear.
  const seenTokens = new Set<string>()
  const seenReady = new Set<string>()

  /** Host: the player whose "remove?" confirmation is showing in the room. */
  let kickAsk: string | null = null

  /** Host: "Remove Ana from the room?" under the seats, or nothing. */
  function kickConfirm(s: Session<S, I>) {
    const target = s.isHost ? s.lobby.players.find((p) => p.id === kickAsk) : undefined
    if (!target) {
      kickAsk = null
      return null
    }
    const yes = button(
      t('Remove'),
      () => {
        kickAsk = null
        s.kick(target.id)
      },
      'danger',
    )
    const no = button(
      t('Cancel'),
      () => {
        kickAsk = null
        render()
      },
      'quiet',
    )
    return h(
      'div',
      { class: 'pf-kick-ask', role: 'alertdialog' },
      h('p', { textContent: t('Remove {name} from the room?', { name: target.name }) }),
      h('div', { class: 'pf-row' }, no, yes),
    )
  }

  function seats(s: Session<S, I>) {
    const { players, hostId, phase, options } = s.lobby
    const seating = seatingOf(def, options)
    const scores = phase === 'finished' && s.state && opts.scores ? opts.scores(s.state) : []
    const count = Math.min(Math.max(seating.seats, players.length), 8)
    // With teams, a seated player may move to any empty seat between matches.
    const canMove = seating.teams > 1 && !!s.self && (phase === 'lobby' || phase === 'finished')
    const seat = (slot: number) => {
      const p = players.find((q) => q.slot === slot)
      if (!p)
        return h(
          'div',
          { class: 'pf-seat empty' },
          h('div', { class: 'pf-token' }),
          canMove
            ? button(t('Sit here'), () => s.moveSeat(slot), 'sm quiet')
            : h('div', { class: 'pf-seat-name', textContent: t('Open') }),
          seating.botFill && h('div', { class: 'pf-seat-status', textContent: t('Computer plays') }),
        )
      const isHost = p.id === hostId
      const isSelf = p.id === s.selfId
      const score = scores.find((l) => l.id === p.id)
      const token = h(
        'div',
        { class: `pf-token${seenTokens.has(p.id) ? '' : ' pop'}` },
        avatarEl(avatarFor(p)),
        score && h('span', { class: 'pf-token-score', textContent: String(score.score) }),
      )
      seenTokens.add(p.id)
      token.dataset.player = p.id
      if (social?.isSpeaking(p.id)) token.classList.add('speaking')
      token.style.setProperty('--c', playerColor(p.slot))
      if (isHost || p.ready) {
        const badge = h('span', {
          class: `pf-badge${isHost ? ' host' : ''}${seenReady.has(p.id) ? '' : ' pop'}`,
        })
        badge.append(icon(isHost ? icons.crown : icons.check))
        token.append(badge)
        seenReady.add(p.id)
      } else seenReady.delete(p.id)
      const status = !p.connected
        ? t('Reconnecting…')
        : isHost
          ? t('Host')
          : p.ready
            ? t('Ready')
            : t('Not ready')
      return h(
        'div',
        {
          class: `pf-seat${isSelf ? ' self' : ''}${p.connected ? '' : ' away'}`,
          title: isSelf ? t('{name} (you)', { name: p.name }) : p.name,
        },
        token,
        s.isHost &&
          !isSelf &&
          iconButton(icons.cross, t('Remove {name}', { name: p.name }), () => {
            kickAsk = p.id
            render()
          }),
        h('div', { class: 'pf-seat-name', textContent: p.name }),
        h('div', {
          class: `pf-seat-status${p.connected && (isHost || p.ready) ? ' ok' : ''}`,
          textContent: status,
        }),
      )
    }
    const slots = Array.from({ length: count }, (_, slot) => slot)
    if (seating.teams <= 1) return h('div', { class: 'pf-seats' }, ...slots.map(seat))
    // One column per team: seat s plays for team s % teams.
    return h(
      'div',
      { class: 'pf-teams' },
      ...Array.from({ length: seating.teams }, (_, team) =>
        h(
          'div',
          { class: 'pf-team' },
          h('h4', {
            class: 'pf-team-title',
            textContent: t('Team {n}', { n: String.fromCharCode(65 + team) }),
          }),
          h('div', { class: 'pf-seats' }, ...slots.filter((slot) => slot % seating.teams === team).map(seat)),
        ),
      ),
    )
  }

  /** The game's end-of-match leaderboard, if it has one. */
  function boardOf(state: S, selfId: string): HTMLElement | null {
    const lb = opts.leaderboard?.(state, selfId)
    if (!lb) return null
    const players = session?.lobby.players ?? []
    return leaderboardTable(lb, (id) => {
      const p = players.find((q) => q.id === id)
      return p ? avatarFor(p) : undefined
    })
  }

  /** Results ranking: #1 first, each in their seat colour, you highlighted. */
  function rankList(s: Session<S, I>) {
    if (!s.state || !opts.scores) return null
    const lines = [...opts.scores(s.state)].sort((a, b) => b.score - a.score)
    return h(
      'ol',
      { class: 'pf-ranking' },
      ...lines.map((line, i) => {
        const p = s.lobby.players.find((q) => q.id === line.id)
        const row = h(
          'li',
          { class: line.id === s.selfId ? 'self' : '' },
          h('span', { class: 'pf-rank', textContent: `#${i + 1}` }),
          h('span', { class: 'pf-rank-name', textContent: p?.name ?? '?' }),
          h('span', { class: 'pf-rank-score', textContent: formatNumber(line.score) }),
        )
        if (p) row.style.setProperty('--c', playerColor(p.slot))
        return row
      }),
    )
  }

  /** A titled block of the room panel (players / you / game settings). */
  function roomSection(title: string, ...body: (HTMLElement | false | null)[]) {
    return h(
      'section',
      { class: 'pf-room-sec' },
      h('h3', { class: 'pf-room-sec-title', textContent: title }),
      ...body,
    )
  }
  const hint = (text: string) => h('p', { class: 'pf-room-sec-hint', textContent: text })

  /** Name, avatar and the game's room extras for the local player; the same nodes every redraw. */
  function roomSelfControls(s: Session<S, I>): HTMLElement {
    if (roomSelf?.session === s) return roomSelf.el
    const name = h('input', {
      class: 'pf-input',
      value: storedName() || t('Player'),
      maxLength: 16,
      id: 'pf-room-name',
    })
    // Sent on commit (Enter / leaving the field), not per key: each change redraws the room.
    const commit = () => {
      const value = name.value.trim() || t('Player')
      name.value = value
      storedName(value)
      if (value !== s.self?.name) s.setProfile(value, storedAvatar())
    }
    name.onchange = commit
    name.onkeydown = (e) => {
      if (e.key === 'Enter') name.blur()
    }
    const el = h(
      'div',
      { class: 'pf-room-self' },
      h(
        'div',
        { class: 'pf-identity' },
        avatarPicker(
          storedAvatar(),
          (id) => {
            storedAvatar(id)
            s.setProfile(storedName() || t('Player'), id)
          },
          { closeOnPick: true },
        ),
        h('label', { class: 'pf-field', htmlFor: 'pf-room-name' }, t('Your name'), name),
      ),
      opts.roomExtras?.() ?? null,
    )
    roomSelf = { session: s, el }
    return el
  }

  function showRoom(s: Session<S, I>) {
    // Our own controls survive the redraw; keep the field or card the player was using focused.
    const focused = roomSelf?.el.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null
    const finished = s.phase === 'finished'
    const outcome = finished && s.state && opts.outcome?.(s.state, s.selfId)
    const self = s.self
    const waiting = s.waitingFor
    const away = s.reconnecting
    const tooFew = s.lobby.players.length < def.minPlayers

    let note: string
    let action: HTMLButtonElement | false = false
    if (!self) {
      note = t('The room is full, so you are watching. You get a seat when one opens.')
    } else if (s.isHost) {
      note = tooFew
        ? t('Waiting for players. {game} needs at least {n}.', { game: opts.title, n: def.minPlayers })
        : away.length
          ? t('Waiting for {names} to reconnect.', { names: listNames(away) })
          : waiting.length
            ? t('Waiting for {names} to get ready.', { names: listNames(waiting) })
            : s.lobby.players.length === 1
              ? t('Invite friends with the code, or start on your own.')
              : t('Everyone is ready.')
      action = button(finished ? t('Start rematch') : t('Start game'), () => s.start(), 'primary wide')
      action.disabled = !s.canStart
      action.autofocus = s.canStart
    } else {
      const ready = self.ready
      note = ready ? t('Waiting for the host to start.') : t('Get ready so the host can start.')
      action = button(
        ready ? t('Not ready') : t("I'm ready"),
        () => {
          playSound(ready ? UI_SOUNDS.unready : UI_SOUNDS.ready)
          s.setReady(!ready)
        },
        ready ? 'wide' : 'go wide',
      )
      action.autofocus = true
    }

    // A lone host's options only (e.g. the computer's level) hide once a second player sits down;
    // a game's own `shownWhen` rule wins.
    const seated = s.lobby.players.length
    const shownOptions = (def.options ?? []).filter((o) =>
      o.shownWhen ? o.shownWhen(seated, s.lobby.options) : !o.aloneOnly || seated <= 1,
    )
    const settings = optionPickers(
      shownOptions,
      s.lobby.options,
      s.isHost
        ? (id, value) => {
            s.setOption(id, value)
            saveOptions(s.lobby.options)
          }
        : null,
      // A choice with fewer seats than are taken would be refused (setOption): grey it out and say why.
      (id, value, label) => {
        const max = seatsIf(def, s.lobby.options, id, value)
        return seated > max ? t('{choice}: {n} players at most.', { choice: label, n: max }) : null
      },
    )
    show(
      h(
        'div',
        { class: 'pf-panel wide' },
        outcome
          ? h('p', { class: 'pf-headline', textContent: outcome.headline })
          : h('h2', { class: 'pf-heading', textContent: t('{game} room', { game: opts.title }) }),
        finished && opts.ranking && rankList(s),
        finished && s.state && boardOf(s.state, s.selfId),
        finished && s.state && opts.summary && summaryGrid(opts.summary(s.state, s.selfId)),
        roomCodeBox(),
        roomSection(
          t('Players {n}/{max}', { n: s.lobby.players.length, max: seatingOf(def, s.lobby.options).seats }),
          seats(s),
          kickConfirm(s),
        ),
        self && !s.offline && roomSection(t('You'), roomSelfControls(s)),
        settings && roomSection(t('Game settings'), settings, !s.isHost && hint(t('Set by the host'))),
        h(
          'div',
          { class: 'pf-room-actions' },
          h('p', { class: 'pf-note', textContent: note }),
          offlineNote(),
          action,
          h(
            'div',
            { class: 'pf-row' },
            (tutorial || guide) && howToPlay(),
            button(t('Leave room'), leave, 'quiet'),
          ),
        ),
      ),
      finished ? `results-${s.lobby.round}` : 'room',
    )
    if (focused?.isConnected) focused.focus({ preventScroll: true })
    // First time in this game: the deck / guide pops up once over the room (like solo's first play).
    if (!finished && !closeFirstHelp && shouldAutoOpen(def.id, !!(tutorial || guide))) {
      closeFirstHelp = openHelp((end) => {
        closeFirstHelp = null
        if (shouldMarkSeen(end)) markGuideSeen(def.id)
      })
    }
  }

  function showSoloResult(s: Session<S, I>) {
    const outcome = s.state && opts.outcome?.(s.state, s.selfId)
    const again = button(t('Play again'), () => s.start(), 'primary wide')
    again.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('p', { class: 'pf-headline', textContent: outcome ? outcome.headline : t('Game over') }),
        s.state && boardOf(s.state, s.selfId),
        s.state && opts.summary && summaryGrid(opts.summary(s.state, s.selfId)),
        again,
        button(t('Back to menu'), leave, 'quiet'),
      ),
      `solo-result-${s.lobby.round}`,
    )
  }

  /** Solo: the real pause. Online: a local menu over a match that keeps running (no Restart, no pause). */
  function showPaused(s: Session<S, I>) {
    const resume = s.offline
      ? button(t('Resume'), () => s.setPaused(false), 'primary wide')
      : button(t('Back to the game'), closeOnlineMenu, 'primary wide')
    resume.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', {
          class: 'pf-heading',
          textContent: s.offline ? t('Paused') : t('The match is still running'),
        }),
        controlsText('pf-lede'),
        resume,
        howToPlay(),
        button(s.offline ? t('Quit to menu') : t('Leave room'), leave, 'quiet'),
      ),
      s.offline ? 'paused' : 'online-menu',
    )
  }

  function closeOnlineMenu() {
    onlineMenu = false
    render()
  }

  function showMessage(title: string, text: string) {
    const back = button(t('Back to menu'), leave, 'primary wide')
    back.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: title }),
        h('p', { class: 'pf-lede', textContent: text }),
        back,
      ),
      `message-${title}`,
    )
  }

  // After a reload, go straight back into the room this tab was in.
  const saved = store.load()
  const hashRoom = /room=([A-Z0-9]+)/i.exec(location.hash)?.[1]?.toUpperCase()
  if (isReload && saved && saved.room === hashRoom) {
    room = saved.room
    const label = saved.host ? t('Reopening room {room}', { room }) : t('Rejoining room {room}', { room })
    // Mount only after the game's preload (e.g. Shuttle Pop's 3D court), like the start buttons do.
    if (preload.pending) {
      show(
        h('div', { class: 'pf-panel' }, h('h2', { class: 'pf-heading', textContent: label }), waitingDots()),
        'rejoining',
      )
    } else toast(label)
    void preload.whenReady().then(() => {
      begin(createTransport(appId, room), saved.host, { restore: saved.host ? saved.snapshot : undefined })
    })
  } else if (hashRoom?.length === 5 && def.maxPlayers > 1) {
    store.save(null)
    joinFromLink(hashRoom)
  } else {
    store.save(null)
    showMenu()
  }

  /** Opened from an invite link: straight into the room (name, avatar and extras can change there). */
  function joinFromLink(code: string) {
    room = code
    playerId = randomId()
    showJoining()
    void preload.whenReady().then(() => {
      if (room === code && !session) begin(createTransport(appId, room), false)
    })
  }
  // An invite link pasted into this already-open tab only changes the hash (no reload).
  if (def.maxPlayers > 1)
    window.addEventListener('hashchange', () => {
      const code = /room=([A-Z0-9]+)/i.exec(location.hash)?.[1]?.toUpperCase()
      if (code?.length === 5 && !session && room !== code) joinFromLink(code)
    })
  // The first screen is up: fade out the page's loading splash.
  dismissSplash()
}

function summaryGrid(rows: SummaryRow[]): HTMLElement | null {
  if (!rows.length) return null
  return h(
    'dl',
    { class: 'pf-summary' },
    ...rows.map((r) =>
      h(
        'div',
        { class: r.highlight ? 'pf-stat hi' : 'pf-stat' },
        h('dt', { textContent: r.label }),
        h('dd', { textContent: r.value }),
      ),
    ),
  )
}

/** Who the Network panel lists: the host sees every guest, a guest sees the host. */
function linkedPlayers(s: Session<any, any>): LinkedPlayer[] {
  return s.lobby.players
    .filter((p) => p.id !== s.selfId && (s.isHost || p.id === s.lobby.hostId))
    .map((p) => ({ name: p.name, peer: s.peerOf(p.id), connected: p.connected }))
}

function listNames(players: PlayerInfo[]): string {
  const names = players.map((p) => p.name)
  if (names.length <= 1) return names.join('')
  const a = names.slice(0, -1).join(', ')
  return t('{a} and {b}', { a, b: names.at(-1)! })
}
