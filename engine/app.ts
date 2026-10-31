import './ui/base.css'
import { isMuted, onMutedChange, playSound, setMuted, UI_SOUNDS } from './audio/sound'
import { createBroadcastTransport } from './net/broadcast'
import { Session, type GameDefinition, type LobbyState, type PlayerInfo } from './net/session'
import { createOfflineTransport, type Transport } from './net/transport'
import { createTrysteroTransport } from './net/trystero'
import { h, icon, toast } from './ui/dom'
import { icons } from './ui/icons'
import { applyTheme, playerColor } from './ui/theme'

export { PLAYER_COLORS, playerColor } from './ui/theme'

export interface Scoreline {
  id: string
  score: number
  /** Knocked out / no longer in play. */
  out?: boolean
}

export interface Outcome {
  headline: string
  /** Picks the end-of-match sound. */
  result: 'win' | 'lose' | 'draw' | 'done'
}

export interface GameAppOptions<S, I> {
  def: GameDefinition<S, I>
  title: string
  /** One line under the title on the start screen. */
  tagline?: string
  /** How to play, shown on the start and pause screens. */
  controls?: string
  /**
   * Called once per session with the stage element to render into. Set up
   * rendering, input and sounds here and return a cleanup function.
   */
  mount(session: Session<S, I>, stage: HTMLElement): () => void
  /** Scores shown in the top bar while playing and on the seats afterwards. */
  scores?(state: S): Scoreline[]
  /** End-of-match headline, from the local player's point of view. */
  outcome?(state: S, selfId: string): Outcome
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

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? '?'

/**
 * Standard shell for a game: top bar, start screen (solo / create / join),
 * lobby with seats and ready-up, countdown, pause and results, all wired to
 * a {@link Session}. Every game gets the same flow, look and sounds.
 */
export function createGameApp<S, I>(opts: GameAppOptions<S, I>): void {
  const { def } = opts
  const appId = `play-forge/${def.id}`
  applyTheme()
  document.title = `${opts.title} · Play Forge`

  // ---------- Shell ----------
  const scoresEl = h('div', { class: 'pf-bar-scores' })
  const pauseBtn = barButton(icons.pause, 'Pause', () => session?.setPaused(true))
  const soundBtn = barButton('', '', () => setMuted(!isMuted()))
  const leaveBtn = barButton(icons.leave, 'Leave', () => leave())
  const home = h('a', { class: 'pf-btn icon', href: LAUNCHER_URL, title: 'All games' })
  home.setAttribute('aria-label', 'All games')
  home.append(icon(icons.home))
  const bar = h(
    'header',
    { class: 'pf-bar' },
    home,
    h('h1', { class: 'pf-bar-title', textContent: opts.title }),
    scoresEl,
    h('div', { class: 'pf-bar-actions' }, pauseBtn, soundBtn, leaveBtn),
  )
  const stage = h('main', { class: 'pf-stage' })
  const overlay = h('div', { class: 'pf-overlay' })
  const countdownEl = h('div', { class: 'pf-countdown' })
  countdownEl.setAttribute('aria-live', 'assertive')
  document.body.append(h('div', { class: 'pf-shell' }, bar, stage), overlay, countdownEl)

  const syncSound = () => {
    soundBtn.replaceChildren(icon(isMuted() ? icons.soundOff : icons.soundOn))
    const label = isMuted() ? 'Turn sound on' : 'Turn sound off'
    soundBtn.title = label
    soundBtn.setAttribute('aria-label', label)
  }
  syncSound()
  onMutedChange(syncSound)

  // Every button in the shell clicks.
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest?.('.pf-btn')) playSound(UI_SOUNDS.click)
  })

  // ---------- Session lifecycle ----------
  let session: Session<S, I> | null = null
  let cleanup: (() => void) | null = null
  let room = ''
  let joinedAt = 0
  type LobbySnapshot = { hostId: string; phase: string; countdown: number; players: PlayerInfo[] }
  let lastLobby: LobbySnapshot | null = null
  const snapshot = (l: LobbyState): LobbySnapshot => ({ ...l, players: l.players.map((p) => ({ ...p })) })

  function begin(transport: Transport, host: boolean, offline = false) {
    const name = storedName() || 'Player'
    const s = (session = new Session(def, transport, { host, name, offline }))
    joinedAt = performance.now()
    lastLobby = snapshot(s.lobby)
    const unmount = opts.mount(s, stage)
    const offs = [
      s.on('lobby', (lobby) => {
        react(s, lobby)
        render()
      }),
      s.on('state', () => renderScores()),
      s.on('hostLeft', () => {
        playSound(UI_SOUNDS.leave)
        showMessage('The host left', 'The room closed because the host left. Create a new room to keep playing.')
      }),
    ]
    // Re-render to show the "still looking" hint if the host never answers.
    const hintTimer = setTimeout(render, JOIN_HINT_AFTER_MS)
    cleanup = () => {
      clearTimeout(hintTimer)
      offs.forEach((off) => off())
      unmount()
    }
    if (offline) s.start()
    render()
  }

  function leave() {
    cleanup?.()
    session?.dispose()
    session = cleanup = null
    room = ''
    countdownEl.replaceChildren()
    history.replaceState(null, '', location.pathname + location.search)
    showMenu()
  }

  /** Sounds and toasts for lobby changes. */
  function react(s: Session<S, I>, lobby: LobbyState) {
    const prev = lastLobby!
    lastLobby = snapshot(lobby)

    // Skip toasts for the people already there when we first connect.
    if (!s.offline && prev.hostId) {
      for (const p of lobby.players)
        if (p.id !== s.selfId && !prev.players.some((q) => q.id === p.id)) {
          playSound(UI_SOUNDS.join)
          toast(`${p.name} joined`, playerColor(p.slot))
        }
      for (const p of prev.players)
        if (p.id !== s.selfId && !lobby.players.some((q) => q.id === p.id)) {
          playSound(UI_SOUNDS.leave)
          toast(`${p.name} left`, playerColor(p.slot))
        }
      for (const p of lobby.players) {
        const before = prev.players.find((q) => q.id === p.id)
        if (p.id !== s.selfId && before && !before.ready && p.ready) playSound(UI_SOUNDS.ready)
      }
    }

    if (lobby.phase === 'countdown' && (prev.phase !== 'countdown' || prev.countdown !== lobby.countdown)) {
      playSound(UI_SOUNDS.tick)
      showCount(String(lobby.countdown))
    }
    if (lobby.phase === 'playing' && prev.phase === 'countdown') {
      playSound(UI_SOUNDS.go)
      showCount('Go!')
    }
    if (lobby.phase === 'finished' && prev.phase !== 'finished' && s.state) {
      const result = opts.outcome?.(s.state, s.selfId).result ?? 'done'
      playSound(result === 'win' ? UI_SOUNDS.win : result === 'lose' ? UI_SOUNDS.lose : UI_SOUNDS.join)
    }
  }

  function showCount(text: string) {
    // A fresh element restarts the CSS animation.
    countdownEl.replaceChildren(h('span', { textContent: text }))
  }

  // Pause solo games when the tab is hidden, and on Esc / P.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) session?.setPaused(true)
  })
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && session?.offline && session.phase === 'playing')
      session.setPaused(!session.lobby.paused)
  })

  // ---------- Rendering ----------
  function render() {
    const s = session
    pauseBtn.hidden = !(s?.offline && s.phase === 'playing' && !s.lobby.paused)
    leaveBtn.hidden = !s
    const leaveLabel = s?.offline ? 'Quit to menu' : 'Leave room'
    leaveBtn.title = leaveLabel
    leaveBtn.setAttribute('aria-label', leaveLabel)
    renderScores()
    if (!s) return
    if (!s.isHost && !s.lobby.hostId) return showJoining()
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

  let scoresKey = ''
  function renderScores() {
    const s = session
    const playing = s && (s.phase === 'playing' || s.phase === 'countdown')
    const lines = playing && s.state && opts.scores ? opts.scores(s.state) : []
    const key = JSON.stringify(lines)
    if (key === scoresKey) return
    scoresKey = key
    scoresEl.replaceChildren(
      ...lines.map((line) => {
        const p = s!.lobby.players.find((q) => q.id === line.id)
        const chip = h(
          'span',
          { class: `pf-chip${line.out ? ' out' : ''}${line.id === s!.selfId ? ' self' : ''}` },
          h('span', { class: 'dot' }),
          `${p?.name ?? 'Gone'} ${line.score}`,
        )
        chip.style.setProperty('--c', playerColor(p?.slot ?? 0))
        return chip
      }),
    )
  }

  function show(panel: HTMLElement | null) {
    overlay.hidden = !panel
    overlay.replaceChildren(...(panel ? [panel] : []))
    if (panel) {
      countdownEl.replaceChildren()
      panel.querySelector<HTMLElement>('[autofocus]')?.focus()
    }
  }

  function showMenu(error = '') {
    render()
    const fromLink = /room=([A-Z0-9]+)/i.exec(location.hash)?.[1]?.toUpperCase() ?? ''
    const name = h('input', { class: 'pf-input', value: storedName() || 'Player', maxLength: 16, id: 'pf-name' })
    const saveName = () => storedName(name.value.trim() || 'Player')
    const code = h('input', {
      class: 'pf-input code',
      placeholder: 'CODE',
      maxLength: 5,
      value: fromLink,
      spellcheck: false,
    })
    code.setAttribute('aria-label', 'Room code')
    code.setAttribute('autocapitalize', 'characters')
    const join = () => {
      const c = code.value.trim().toUpperCase()
      if (c.length !== 5) {
        playSound(UI_SOUNDS.error)
        return showMenu('Room codes are 5 characters, like K7QXP.')
      }
      saveName()
      room = c
      history.replaceState(null, '', `#room=${room}`)
      begin(createTransport(appId, room), false)
    }
    code.onkeydown = (e) => {
      if (e.key === 'Enter') join()
    }

    const solo = button('Play solo', () => {
      saveName()
      begin(createOfflineTransport(), true, true)
    })
    const create = button(
      'Create room',
      () => {
        saveName()
        room = newRoomCode()
        history.replaceState(null, '', `#room=${room}`)
        begin(createTransport(appId, room), true)
      },
      'primary',
    )
    const joinBtn = button('Join', join, fromLink ? 'primary' : '')
    if (fromLink) joinBtn.autofocus = true

    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: opts.title }),
        opts.tagline && h('p', { class: 'pf-lede', textContent: opts.tagline }),
        h('label', { class: 'pf-field', htmlFor: 'pf-name' }, 'Your name', name),
        h('div', { class: 'pf-row' }, def.minPlayers <= 1 && solo, create),
        h('div', { class: 'pf-or', textContent: "or join a friend's room" }),
        h('div', { class: 'pf-row' }, code, joinBtn),
        error && h('p', { class: 'pf-note error', textContent: error }),
        opts.controls && h('p', { class: 'pf-note', textContent: opts.controls }),
      ),
    )
  }

  function showJoining() {
    const slow = performance.now() - joinedAt >= JOIN_HINT_AFTER_MS - 50
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: `Joining ${room}…` }),
        h('p', {
          class: 'pf-lede',
          textContent: slow
            ? "Still looking for this room. Check the code, and make sure the host's game is open."
            : 'Finding the host. This usually takes a few seconds.',
        }),
        button('Cancel', leave, 'quiet'),
      ),
    )
  }

  function roomCodeBox() {
    // A file:// link is useless to a friend; they type the code instead.
    const canLink = location.protocol !== 'file:'
    const copy = barButton(icons.copy, 'Copy invite link', async () => {
      await navigator.clipboard?.writeText(location.href).catch(() => {})
      toast('Invite link copied')
    })
    return h(
      'div',
      { class: 'pf-room' },
      h(
        'div',
        { class: 'pf-room-code' },
        h('small', { textContent: canLink ? 'Room code. Share it, or copy the link.' : 'Room code. Share it with friends.' }),
        room,
      ),
      canLink && copy,
    )
  }

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
            h('div', { class: 'pf-seat-name', textContent: 'Open' }),
          )
        const isHost = p.id === hostId
        const score = scores.find((l) => l.id === p.id)
        const token = h('div', { class: 'pf-token', textContent: score ? String(score.score) : initial(p.name) })
        token.style.setProperty('--c', playerColor(p.slot))
        if (isHost || p.ready) {
          const badge = h('span', { class: `pf-badge${isHost ? ' host' : ''}` })
          badge.append(icon(isHost ? icons.crown : icons.check))
          token.append(badge)
        }
        const isSelf = p.id === s.selfId
        const seat = h(
          'div',
          { class: `pf-seat${isSelf ? ' self' : ''}`, title: isSelf ? `${p.name} (you)` : p.name },
          token,
          h('div', { class: 'pf-seat-name', textContent: p.name }),
          h('div', {
            class: `pf-seat-status${isHost || p.ready ? ' ok' : ''}`,
            textContent: isHost ? 'Host' : p.ready ? 'Ready' : 'Not ready',
          }),
        )
        return seat
      }),
    )
  }

  function showRoom(s: Session<S, I>) {
    const finished = s.phase === 'finished'
    const outcome = finished && s.state && opts.outcome?.(s.state, s.selfId)
    const self = s.self
    const waiting = s.waitingFor
    const tooFew = s.lobby.players.length < def.minPlayers

    let note: string
    let action: HTMLButtonElement | false = false
    if (!self) {
      note = 'The room is full, so you are watching. You get a seat when one opens.'
    } else if (s.isHost) {
      note = tooFew
        ? `Waiting for players. ${opts.title} needs at least ${def.minPlayers}.`
        : waiting.length
          ? `Waiting for ${listNames(waiting)} to get ready.`
          : s.lobby.players.length === 1
            ? 'Invite friends with the code, or start on your own.'
            : 'Everyone is ready.'
      action = button(finished ? 'Start rematch' : 'Start game', () => s.start(), 'primary wide')
      action.disabled = !s.canStart
      action.autofocus = s.canStart
    } else {
      const ready = self.ready
      note = ready ? 'Waiting for the host to start.' : 'Get ready so the host can start.'
      action = button(
        ready ? 'Not ready' : "I'm ready",
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
          : h('h2', { class: 'pf-heading', textContent: `${opts.title} room` }),
        roomCodeBox(),
        seats(s),
        h('p', { class: 'pf-note', textContent: note }),
        action,
        button('Leave room', leave, 'quiet'),
      ),
    )
  }

  function showSoloResult(s: Session<S, I>) {
    const outcome = s.state && opts.outcome?.(s.state, s.selfId)
    const again = button('Play again', () => s.start(), 'primary wide')
    again.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('p', { class: 'pf-headline', textContent: outcome ? outcome.headline : 'Game over' }),
        again,
        button('Back to menu', leave, 'quiet'),
      ),
    )
  }

  function showPaused(s: Session<S, I>) {
    const resume = button('Resume', () => s.setPaused(false), 'primary wide')
    resume.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: 'Paused' }),
        opts.controls && h('p', { class: 'pf-lede', textContent: opts.controls }),
        resume,
        button('Quit to menu', leave, 'quiet'),
      ),
    )
  }

  function showMessage(title: string, text: string) {
    const back = button('Back to menu', leave, 'primary wide')
    back.autofocus = true
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h2', { class: 'pf-heading', textContent: title }),
        h('p', { class: 'pf-lede', textContent: text }),
        back,
      ),
    )
  }

  showMenu()
}

function button(text: string, onclick: () => void, variant = ''): HTMLButtonElement {
  return h('button', { class: `pf-btn ${variant}`.trim(), textContent: text, onclick, type: 'button' })
}

function barButton(svg: string, label: string, onclick: () => void): HTMLButtonElement {
  const b = button('', onclick, 'icon')
  if (svg) b.append(icon(svg))
  if (label) {
    b.title = label
    b.setAttribute('aria-label', label)
  }
  return b
}

function listNames(players: PlayerInfo[]): string {
  const names = players.map((p) => p.name)
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
