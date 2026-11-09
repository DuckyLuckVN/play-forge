import './ui/base.css'
import { playMusic, type Track } from './audio/music'
import { playSound, UI_SOUNDS } from './audio/sound'
import { ARCADE, LOUNGE } from './audio/tracks'
import { celebrate } from './fx/confetti'
import { createBroadcastTransport } from './net/broadcast'
import {
  resolveOptions,
  Session,
  type GameDefinition,
  type GameOptions,
  type LobbyState,
  type PlayerInfo,
  type RoomSnapshot,
} from './net/session'
import { createOfflineTransport, randomId, type Transport } from './net/transport'
import { createTrysteroTransport } from './net/trystero'
import { avatarEl, avatarPicker } from './social/avatar-ui'
import { avatarFor, storedAvatar } from './social/avatars'
import { ReactionLayer, reactionPicker } from './social/reaction-ui'
import { t as ts } from './social/i18n'
import { RoomSocial } from './social/room-social'
import { audioMenu } from './ui/audio-menu'
import { button } from './ui/components'
import { langMenu } from './ui/lang-menu'
import { h, icon, iconButton, toast } from './ui/dom'
import { fullscreenButton } from './ui/fullscreen'
import { t } from './ui/i18n'
import { icons } from './ui/icons'
import { optionPickers } from './ui/options'
import { popover } from './ui/popover'
import { applyTheme, playerColor } from './ui/theme'

export interface Scoreline {
  id: string
  score: number
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

export interface GameAppOptions<S, I> {
  def: GameDefinition<S, I>
  title: string
  /** One line under the title on the start screen. */
  tagline?: string
  /** How to play, shown on the start and pause screens. */
  controls?: string
  /**
   * Gameplay music. Menus and lobbies use the shared lounge track. `null`: no
   * background music while playing (the game makes its own, e.g. beat-synced).
   */
  music?: Track | null
  /**
   * Called once per session with the stage element to render into. Set up
   * rendering, input and sounds here and return a cleanup function.
   */
  mount(session: Session<S, I>, stage: HTMLElement): () => void
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
   * Show a ranked list (from `scores`, highest first) on a room's results
   * screen. Default false: games with their own winner rules keep the seats only.
   */
  ranking?: boolean
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
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const NAME_KEY = 'play-forge:name'
const JOIN_HINT_AFTER_MS = 12000
/** Relative link from games/<id>/index.html back to the launcher. */
const LAUNCHER_URL = '../../index.html'

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('')
}

function createTransport(appId: string, room: string): Transport {
  // `?net=local` connects tabs of this browser only (for development).
  const local = new URLSearchParams(location.search).get('net') === 'local'
  return local ? createBroadcastTransport(appId, room) : createTrysteroTransport(appId, room)
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
  const pauseBtn = iconButton(icons.pause, t('Pause'), () => session?.setPaused(true))
  const leaveBtn = iconButton(icons.leave, t('Leave'), () => leave())
  // Reactions, voice and chat: only in online rooms; `social` is set while in one.
  let social: RoomSocial | null = null
  const reactBtn = reactionPicker((id) => social?.reactions.send(id) ?? false)
  const reactionLayer = new ReactionLayer()
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
  const home = h('a', { class: 'pf-btn icon', href: LAUNCHER_URL, title: t('All games') })
  home.setAttribute('aria-label', t('All games'))
  home.append(icon(icons.home))
  const bar = h(
    'header',
    { class: 'pf-bar' },
    home,
    h('h1', { class: 'pf-bar-title', textContent: opts.title }),
    scoresEl,
    h('div', { class: 'pf-bar-actions' }, fan.root, pauseBtn, fullscreenButton(), more.root),
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

  // ---------- Session lifecycle ----------
  let session: Session<S, I> | null = null
  let cleanup: (() => void) | null = null
  let room = ''
  let joinedAt = 0
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
    joinedAt = performance.now()
    lastLobby = snapshot(s.lobby)
    seenTokens.clear()
    seenReady.clear()
    if (!extra.offline) store.save({ playerId, room, host, snapshot: host ? s.snapshot() : undefined })
    const unmount = opts.mount(s, stage)
    // After mount, so the game's key handlers run before chat's Enter shortcut.
    const roomSocial = extra.offline ? null : new RoomSocial(s as Session<unknown, unknown>, reactionLayer)
    social = roomSocial
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
        showMessage(t('The room closed'), t('The host left the room. Create a new room to keep playing.'))
      }),
    ]
    // Re-render to show the "still looking" hint if the host never answers.
    const hintTimer = setTimeout(render, JOIN_HINT_AFTER_MS)
    cleanup = () => {
      clearTimeout(hintTimer)
      offs.forEach((off) => off())
      roomSocial?.dispose()
      social = null
      quickSlot.replaceChildren()
      settingsSlot.replaceChildren()
      unmount()
    }
    if (extra.offline) s.start()
    render()
  }

  function leave() {
    cleanup?.()
    session?.leave()
    session = cleanup = null
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

  // Solo games pause when the tab is hidden, and on Esc / P.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.setPaused(true)
  })
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && session?.offline && session.phase === 'playing')
      session.setPaused(!session.lobby.paused)
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
    pauseBtn.hidden = !(s?.offline && s.phase === 'playing' && !s.lobby.paused)
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
        return show(null)
      case 'playing':
        return s.lobby.paused ? showPaused(s) : show(null)
      case 'finished':
        return s.offline ? showSoloResult(s) : showRoom(s)
      case 'lobby':
        return showRoom(s)
    }
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
    const key = JSON.stringify(lines.map((l) => [l.id, !!l.out]))
    const label = (line: Scoreline) => {
      const p = s!.lobby.players.find((q) => q.id === line.id)
      return `${p?.name ?? t('Gone')} ${line.score}`
    }
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
      lastScores = new Map(lines.map((l) => [l.id, l.score]))
      return
    }
    scoresKey = key
    chipText.clear()
    scoresEl.replaceChildren(
      ...lines.map((line) => {
        const p = s!.lobby.players.find((q) => q.id === line.id)
        const cls = ['pf-chip', line.out && 'out', line.id === s!.selfId && 'self']
        const text = document.createTextNode(label(line))
        chipText.set(line.id, text)
        const chip = h(
          'span',
          { class: cls.filter(Boolean).join(' ') },
          h('span', { class: 'dot' }, p && avatarEl(avatarFor(p))),
          text,
        )
        chip.style.setProperty('--c', playerColor(p?.slot ?? 0))
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
  let loading = !!opts.preload
  const gated = new Map<HTMLButtonElement, string>()
  function gate(...buttons: HTMLButtonElement[]) {
    if (!loading) return
    for (const b of buttons) {
      gated.set(b, b.textContent ?? '')
      b.disabled = true
      b.classList.add('loading')
      b.textContent = t('Loading…')
    }
  }
  opts
    .preload?.()
    .catch((err) => console.warn('Preload failed; starting anyway.', err))
    .finally(() => {
      loading = false
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
        opts.controls && h('p', { class: 'pf-note', textContent: opts.controls }),
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

  function showJoining() {
    const slow = performance.now() - joinedAt >= JOIN_HINT_AFTER_MS - 50
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: t('Joining {room}…', { room }) }),
        h('p', {
          class: 'pf-lede',
          textContent: slow
            ? t("Still looking for this room. Check the code, and make sure the host's game is open.")
            : t('Finding the host. This usually takes a few seconds.'),
        }),
        waitingDots(),
        offlineNote(),
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

  function seats(s: Session<S, I>) {
    const { players, hostId, phase } = s.lobby
    const scores = phase === 'finished' && s.state && opts.scores ? opts.scores(s.state) : []
    const count = Math.min(Math.max(def.maxPlayers, players.length), 8)
    return h(
      'div',
      { class: 'pf-seats' },
      ...Array.from({ length: count }, (_, slot) => {
        const p = players.find((q) => q.slot === slot)
        if (!p)
          return h(
            'div',
            { class: 'pf-seat empty' },
            h('div', { class: 'pf-token' }),
            h('div', { class: 'pf-seat-name', textContent: t('Open') }),
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
          h('div', { class: 'pf-seat-name', textContent: p.name }),
          h('div', {
            class: `pf-seat-status${p.connected && (isHost || p.ready) ? ' ok' : ''}`,
            textContent: status,
          }),
        )
      }),
    )
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
          h('span', { class: 'pf-rank-score', textContent: line.score.toLocaleString() }),
        )
        if (p) row.style.setProperty('--c', playerColor(p.slot))
        return row
      }),
    )
  }

  function showRoom(s: Session<S, I>) {
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
        ready ? 'wide' : 'primary wide',
      )
      action.autofocus = true
    }

    show(
      h(
        'div',
        { class: 'pf-panel wide' },
        outcome
          ? h('p', { class: 'pf-headline', textContent: outcome.headline })
          : h('h2', { class: 'pf-heading', textContent: t('{game} room', { game: opts.title }) }),
        finished && opts.ranking && rankList(s),
        finished && s.state && opts.summary && summaryGrid(opts.summary(s.state, s.selfId)),
        roomCodeBox(),
        seats(s),
        optionPickers(
          def.options ?? [],
          s.lobby.options,
          s.isHost
            ? (id, value) => {
                s.setOption(id, value)
                saveOptions(s.lobby.options)
              }
            : null,
        ),
        h('p', { class: 'pf-note', textContent: note }),
        offlineNote(),
        action,
        button(t('Leave room'), leave, 'quiet'),
      ),
      finished ? `results-${s.lobby.round}` : 'room',
    )
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
        s.state && opts.summary && summaryGrid(opts.summary(s.state, s.selfId)),
        again,
        button(t('Back to menu'), leave, 'quiet'),
      ),
      `solo-result-${s.lobby.round}`,
    )
  }

  function showPaused(s: Session<S, I>) {
    const resume = button(t('Resume'), () => s.setPaused(false), 'primary wide')
    resume.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: t('Paused') }),
        opts.controls && h('p', { class: 'pf-lede', textContent: opts.controls }),
        resume,
        button(t('Quit to menu'), leave, 'quiet'),
      ),
      'paused',
    )
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
    toast(saved.host ? t('Reopening room {room}', { room }) : t('Rejoining room {room}', { room }))
    begin(createTransport(appId, room), saved.host, { restore: saved.host ? saved.snapshot : undefined })
  } else {
    store.save(null)
    showMenu()
  }
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

function listNames(players: PlayerInfo[]): string {
  const names = players.map((p) => p.name)
  if (names.length <= 1) return names.join('')
  const a = names.slice(0, -1).join(', ')
  return t('{a} and {b}', { a, b: names.at(-1)! })
}
