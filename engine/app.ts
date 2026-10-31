import './ui/lobby.css'
import { createBroadcastTransport } from './net/broadcast'
import { Session, type GameDefinition } from './net/session'
import { createOfflineTransport, type Transport } from './net/transport'
import { createTrysteroTransport } from './net/trystero'

/** Distinct colours for player slots 0..7. */
export const PLAYER_COLORS = [
  '#7ee081',
  '#5fb4ff',
  '#ffb454',
  '#ff6fae',
  '#c792ff',
  '#4fe0d2',
  '#ffe066',
  '#ff7a5c',
]

export const playerColor = (slot: number) => PLAYER_COLORS[slot % PLAYER_COLORS.length]

export interface GameAppOptions<S, I> {
  def: GameDefinition<S, I>
  title: string
  subtitle?: string
  /** Element the game renders into; the lobby overlays it. */
  stage: HTMLElement
  /**
   * Called once per session. Set up rendering and input here and return a
   * cleanup function, which runs when the player leaves the room.
   */
  mount(session: Session<S, I>): () => void
  /** Headline shown when a match finishes, e.g. "Alice wins!". */
  resultText?(state: S, session: Session<S, I>): string
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const NAME_KEY = 'play-forge:name'

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('')
}

function createTransport(appId: string, room: string): Transport {
  // `?net=local` connects tabs of this browser only (for development).
  const local = new URLSearchParams(location.search).get('net') === 'local'
  return local ? createBroadcastTransport(appId, room) : createTrysteroTransport(appId, room)
}

function storage(key: string, value?: string): string {
  try {
    if (value !== undefined) localStorage.setItem(key, value)
    return localStorage.getItem(key) ?? ''
  } catch {
    return value ?? ''
  }
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  const { class: cls, ...rest } = props
  if (cls) el.className = cls
  Object.assign(el, rest)
  el.append(...children)
  return el
}

/**
 * Standard shell for a game: menu (solo / create room / join room), lobby,
 * and end-of-match screen, all wired to a {@link Session}.
 */
export function createGameApp<S, I>(opts: GameAppOptions<S, I>): void {
  const { def } = opts
  const appId = `play-forge/${def.id}`
  const overlay = h('div', { class: 'pf-overlay' })
  document.body.append(overlay)

  let session: Session<S, I> | null = null
  let cleanup: (() => void) | null = null
  let room = ''

  const show = (panel: HTMLElement | null) => {
    overlay.hidden = !panel
    overlay.replaceChildren(...(panel ? [panel] : []))
  }

  const leave = () => {
    cleanup?.()
    session?.dispose()
    session = cleanup = null
    room = ''
    history.replaceState(null, '', location.pathname + location.search)
    showMenu()
  }

  const begin = (transport: Transport, host: boolean, name: string, autoStart = false) => {
    const s = (session = new Session(def, transport, { host, name }))
    const unmount = opts.mount(s)
    const offLobby = s.on('lobby', render)
    const offHost = s.on('hostLeft', () => showMessage('The host left the room.'))
    cleanup = () => {
      offLobby()
      offHost()
      unmount()
    }
    if (autoStart) s.start()
    render()
  }

  function render() {
    const s = session
    if (!s) return
    if (s.phase === 'playing') return show(null)
    if (s.phase === 'finished') return showFinished(s)
    showRoom(s)
  }

  function nameField() {
    const input = h('input', {
      class: 'pf-input',
      value: storage(NAME_KEY) || 'Player',
      maxLength: 16,
    })
    const get = () => storage(NAME_KEY, input.value.trim() || 'Player')
    return { el: h('label', { class: 'pf-label' }, 'Your name', input), get }
  }

  function showMenu(error = '') {
    const name = nameField()
    const fromLink = /room=([A-Z0-9]+)/i.exec(location.hash)?.[1] ?? ''
    const code = h('input', {
      class: 'pf-input pf-code',
      placeholder: 'CODE',
      maxLength: 5,
      value: fromLink.toUpperCase(),
    })
    const solo = h('button', { class: 'pf-btn', textContent: 'Play solo' })
    const create = h('button', { class: 'pf-btn primary', textContent: 'Create room' })
    const join = h('button', { class: 'pf-btn primary', textContent: 'Join' })
    const singlePlayer = def.minPlayers <= 1

    solo.onclick = () => begin(createOfflineTransport(), true, name.get(), true)
    create.onclick = () => {
      room = newRoomCode()
      history.replaceState(null, '', `#room=${room}`)
      begin(createTransport(appId, room), true, name.get())
    }
    const doJoin = () => {
      const c = code.value.trim().toUpperCase()
      if (c.length < 4) return code.focus()
      room = c
      history.replaceState(null, '', `#room=${room}`)
      begin(createTransport(appId, room), false, name.get())
    }
    join.onclick = doJoin
    code.onkeydown = (e) => e.key === 'Enter' && doJoin()

    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('h1', { class: 'pf-title', textContent: opts.title }),
        ...(opts.subtitle ? [h('p', { class: 'pf-sub', textContent: opts.subtitle })] : []),
        name.el,
        h('div', { class: 'pf-row' }, ...(singlePlayer ? [solo] : []), create),
        h('div', { class: 'pf-divider', textContent: 'or join a friend' }),
        h('div', { class: 'pf-row' }, code, join),
        ...(error ? [h('p', { class: 'pf-status error', textContent: error })] : []),
      ),
    )
    if (fromLink) join.focus()
  }

  function swatch(color: string) {
    const el = h('span', { class: 'pf-swatch' })
    el.style.background = color
    return el
  }

  function playerList(s: Session<S, I>) {
    return h(
      'ul',
      { class: 'pf-players' },
      ...s.lobby.players.map((p) =>
        h(
          'li',
          {},
          swatch(playerColor(p.slot)),
          p.name,
          h('span', {
            class: 'pf-tag',
            textContent: [p.id === s.lobby.hostId && 'host', p.id === s.selfId && 'you']
              .filter(Boolean)
              .join(' · '),
          }),
        ),
      ),
    )
  }

  function showRoom(s: Session<S, I>) {
    const connected = s.isHost || s.lobby.hostId !== ''
    const copy = h('button', { class: 'pf-btn', textContent: 'Copy invite link' })
    copy.onclick = async () => {
      await navigator.clipboard?.writeText(location.href).catch(() => {})
      copy.textContent = 'Copied!'
    }
    const start = h('button', {
      class: 'pf-btn primary',
      textContent: 'Start game',
      disabled: !s.canStart,
    })
    start.onclick = () => s.start()
    const back = h('button', { class: 'pf-btn ghost', textContent: 'Leave room' })
    back.onclick = leave

    const status = !connected
      ? 'Looking for the host… (this can take a few seconds)'
      : s.isHost
        ? s.canStart
          ? 'Share the code, then start when everyone is in.'
          : `Waiting for players (need ${def.minPlayers})…`
        : 'Waiting for the host to start…'

    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('div', { class: 'pf-label' }, 'Room code'),
        h('div', { class: 'pf-room-code', textContent: room }),
        ...(connected ? [playerList(s)] : []),
        h('p', { class: 'pf-status', textContent: status }),
        h(
          'div',
          { class: 'pf-row' },
          // A file:// link is useless to a friend; they type the code instead.
          ...(location.protocol === 'file:' ? [] : [copy]),
          ...(s.isHost ? [start] : []),
        ),
        back,
      ),
    )
  }

  function showFinished(s: Session<S, I>) {
    const again = h('button', { class: 'pf-btn primary', textContent: 'Play again' })
    again.onclick = () => s.start()
    const back = h('button', { class: 'pf-btn ghost', textContent: room ? 'Leave room' : 'Menu' })
    back.onclick = leave
    const text = s.state && opts.resultText ? opts.resultText(s.state, s) : 'Game over'
    show(
      h(
        'div',
        { class: 'pf-panel' },
        h('p', { class: 'pf-result', textContent: text }),
        ...(room ? [playerList(s)] : []),
        s.isHost
          ? again
          : h('p', { class: 'pf-status', textContent: 'Waiting for the host to start again…' }),
        back,
      ),
    )
    if (s.isHost) again.focus()
  }

  function showMessage(text: string) {
    const back = h('button', { class: 'pf-btn primary', textContent: 'Back to menu' })
    back.onclick = leave
    show(h('div', { class: 'pf-panel' }, h('p', { class: 'pf-result', textContent: text }), back))
  }

  showMenu()
}
