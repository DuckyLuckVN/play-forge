import {
  createCanvas2D,
  createGameApp,
  h,
  icon,
  playSound,
  startRenderLoop,
  theme,
  toast,
  UI_SOUNDS,
  type Session,
} from '@forge'
import './caro.css'
import { t } from './i18n'
import { cellAt, CaroRenderer, INK, layoutFor, tallyKey, toCells, type ViewInput } from './render'
import type { Side } from './rules'
import { caroGame, isHotseat, seatOfSide, type CaroInput, type CaroState } from './sim'
import { CARO_SOUNDS, STUDY } from './sounds'
import { INKS, SharedWhiteboard } from './whiteboard'

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICONS = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  pen: svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/>'),
  eraser: svg('<path d="m7 20-4-4 10-10 7 7-7 7z"/><path d="M7 20h13"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
}

const LEVEL_NAMES = { easy: t('Easy'), normal: t('Normal'), hard: t('Hard') }

/** Display names for X and O from the local player's point of view. */
function seatNames(s: CaroState, selfId: string): [string, string] {
  const hotseat = isHotseat(s)
  return ([1, 2] as Side[]).map((side) => {
    const seat = seatOfSide(s, side)
    if (seat.kind === 'ai') return `${t('Computer')} · ${LEVEL_NAMES[s.level]}`
    if (hotseat) return side === 1 ? t('Player X') : t('Player O')
    return seat.id === selfId ? t('{name} (you)', { name: seat.name }) : seat.name
  }) as [string, string]
}

/** Sides the local player moves. */
function mySides(s: CaroState, selfId: string): Side[] {
  return ([1, 2] as Side[]).filter((side) => {
    const seat = seatOfSide(s, side)
    return seat.kind === 'human' && seat.id === selfId
  })
}

function statusLine(s: CaroState, selfId: string, names: [string, string]): [string, string] {
  if (s.over) {
    if (!s.winner) return [t('Draw! The board is full.'), theme.haze]
    return [t('{name} wins!', { name: names[s.winner - 1] }), theme.yolk]
  }
  const seat = seatOfSide(s, s.turn)
  if (seat.kind === 'ai') return [t('Computer is thinking…'), theme.haze]
  if (isHotseat(s)) return [s.turn === 1 ? t('X to move') : t('O to move'), INK[s.turn]]
  if (seat.id === selfId) return [t('Your turn'), theme.yolk]
  return [t("{name}'s turn", { name: seat.name }), theme.haze]
}

function button(label: string, svgIcon: string, onclick: () => void, extra = ''): HTMLButtonElement {
  const b = h('button', { class: `pf-btn caro-tool ${extra}`.trim(), type: 'button', onclick })
  b.append(icon(svgIcon), h('span', { class: 'caro-tool-label', textContent: label }))
  b.title = label
  b.setAttribute('aria-label', label)
  return b
}

function mount(session: Session<CaroState, CaroInput>, stage: HTMLElement): () => void {
  const selfId = session.selfId
  const host = h('div', { class: 'caro-board' })
  const toolbar = h('div', { class: 'caro-toolbar' })
  const root = h('div', { class: 'caro' }, host, toolbar)
  stage.append(root)

  let layout = layoutFor(15)
  const view = createCanvas2D(host, layout.width, layout.height)
  view.canvas.classList.add('caro-canvas')
  view.canvas.setAttribute('role', 'img')
  view.canvas.setAttribute('aria-label', t('Caro board'))
  view.canvas.tabIndex = 0

  const shared = new SharedWhiteboard(session.transport)
  const renderer = new CaroRenderer(view, shared.board)
  const wins = new Map<string, number>()

  const ui: ViewInput = {
    mine: [],
    canPlay: false,
    hover: -1,
    preview: -1,
    cursor: -1,
    pending: -1,
    pen: false,
    wins,
    names: ['', ''],
    status: '',
    statusColor: theme.haze,
  }
  let ink = 0

  const playing = () => session.phase === 'playing' && !session.lobby.paused

  function refresh() {
    const s = session.state
    if (!s) return
    ui.mine = mySides(s, selfId)
    const seat = seatOfSide(s, s.turn)
    ui.canPlay = playing() && !s.over && ui.mine.includes(s.turn) && seat.kind === 'human'
    ui.names = seatNames(s, selfId)
    ;[ui.status, ui.statusColor] = statusLine(s, selfId, ui.names)
    if (session.phase !== 'playing' && !s.over) [ui.status, ui.statusColor] = ['', theme.haze]
    renderToolbar(s)
  }

  // ---------- State → sounds, effects, tallies ----------
  // The host mutates one state object in place, so remember plain values, not the object.
  let wasOver = false
  let lastTurn = 0
  const offState = session.on('state', (s) => {
    if (s.size !== layout.size) layout = layoutFor(s.size)
    renderer.onState(s)
    if (ui.pending >= 0 && (s.board[ui.pending] || s.turn !== lastTurn || s.over)) ui.pending = -1
    const mine = mySides(s, selfId)
    const solo = mine.length === 2 // pass and play: every stone is "mine"
    for (const e of s.events) {
      switch (e.type) {
        case 'place':
          playSound(e.side === 1 ? CARO_SOUNDS.placeX : CARO_SOUNDS.placeO, mine.includes(e.side) ? 1 : 0.75)
          break
        case 'four': {
          const cell = s.moves.at(-1) ?? 0
          if (solo || mine.includes(e.side)) {
            playSound(CARO_SOUNDS.four)
            renderer.say(cell, t('Four!'), INK[e.side])
          } else {
            playSound(mine.length ? CARO_SOUNDS.danger : CARO_SOUNDS.four)
            renderer.say(
              cell,
              mine.length ? t('Watch out!') : t('Four!'),
              mine.length ? theme.coral : INK[e.side],
            )
          }
          break
        }
        case 'win':
          playSound(CARO_SOUNDS.strike)
          break
        case 'undo':
          playSound(CARO_SOUNDS.undo)
          break
        case 'timeout':
          playSound(CARO_SOUNDS.timeout)
          toast(
            mine.includes(e.side) && !solo
              ? t("Time's up! A move was played for you.")
              : t('{name} ran out of time.', { name: seatNames(s, selfId)[e.side - 1] }),
          )
          break
        case 'resign':
          if (!mine.includes(e.side)) toast(t('{name} resigned.', { name: seatNames(s, selfId)[e.side - 1] }))
          break
      }
    }
    // Last five seconds of your own timed turn: a soft tick each second.
    if (
      !s.over &&
      s.turnTicks > 0 &&
      mine.includes(s.turn) &&
      s.clock <= 50 &&
      s.clock > 0 &&
      s.clock % 10 === 0
    )
      playSound(CARO_SOUNDS.clock)
    if (s.over && !wasOver && s.winner) {
      const key = tallyKey(seatOfSide(s, s.winner), s.winner)
      wins.set(key, (wins.get(key) ?? 0) + 1)
    }
    wasOver = s.over
    lastTurn = s.turn
    refresh()
  })

  // A new match wipes the whiteboard on every screen (each peer does it itself).
  let round = session.lobby.round
  const offLobby = session.on('lobby', (lobby) => {
    if (lobby.round !== round) {
      round = lobby.round
      shared.board.reset()
      ui.preview = ui.pending = -1
      resignArmed = false
    }
    refresh()
  })

  // ---------- Moves ----------
  function play(cell: number) {
    const s = session.state
    if (!s || !ui.canPlay || cell < 0) return
    if (s.board[cell]) {
      playSound(UI_SOUNDS.error, 0.6)
      return
    }
    ui.pending = cell
    ui.preview = -1
    session.sendInput({ t: 'move', cell })
  }

  // ---------- Pointer: click to place (tap twice on touch), or draw with the pen ----------
  const toLogical = (e: PointerEvent): [number, number] => {
    const r = view.canvas.getBoundingClientRect()
    return [((e.clientX - r.left) * view.width) / r.width, ((e.clientY - r.top) * view.height) / r.height]
  }
  let drawingPointer = -1

  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return
    const [x, y] = toLogical(e)
    if (ui.pen) {
      e.preventDefault()
      drawingPointer = e.pointerId
      view.canvas.setPointerCapture(e.pointerId)
      const [cx, cy] = toCells(layout, x, y)
      shared.begin(cx, cy, ink, ink === 4 ? 2 : 1)
      playSound(CARO_SOUNDS.pen, 0.5)
      return
    }
    const cell = cellAt(layout, x, y)
    if (cell < 0 || !ui.canPlay) return
    ui.cursor = -1
    // Touch has no hover: the first tap previews, a second tap on the same cell confirms.
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (ui.preview === cell) play(cell)
      else if (!session.state?.board[cell]) {
        ui.preview = cell
        playSound(UI_SOUNDS.click, 0.4)
      }
      return
    }
    play(cell)
  }
  const onMove = (e: PointerEvent) => {
    const [x, y] = toLogical(e)
    if (ui.pen) {
      if (drawingPointer === e.pointerId) {
        // Coalesced events give smooth lines on fast strokes.
        const events = e.getCoalescedEvents?.() ?? [e]
        for (const ce of events.length ? events : [e]) {
          const [lx, ly] = toLogical(ce)
          shared.extend(...toCells(layout, lx, ly))
        }
      }
      return
    }
    if (e.pointerType === 'mouse') ui.hover = cellAt(layout, x, y)
  }
  const onUp = (e: PointerEvent) => {
    if (drawingPointer !== e.pointerId) return
    drawingPointer = -1
    shared.end()
  }
  const onLeave = () => (ui.hover = -1)
  view.canvas.addEventListener('pointerdown', onDown)
  view.canvas.addEventListener('pointermove', onMove)
  view.canvas.addEventListener('pointerup', onUp)
  view.canvas.addEventListener('pointercancel', onUp)
  view.canvas.addEventListener('pointerleave', onLeave)

  // ---------- Keyboard: arrows move a cursor, Enter/Space places, U undo, D pen ----------
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest?.('input, textarea, button, a, .pf-overlay') || !playing()) return
    const s = session.state
    if (!s) return
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }
    if (dirs[e.code]) {
      e.preventDefault()
      if (ui.cursor < 0) ui.cursor = s.moves.at(-1) ?? Math.floor(s.board.length / 2)
      const [dx, dy] = dirs[e.code]
      const x = Math.min(s.size - 1, Math.max(0, (ui.cursor % s.size) + dx))
      const y = Math.min(s.size - 1, Math.max(0, Math.floor(ui.cursor / s.size) + dy))
      ui.cursor = y * s.size + x
      ui.hover = -1
    } else if ((e.code === 'Enter' || e.code === 'Space') && ui.cursor >= 0) {
      e.preventDefault()
      play(ui.cursor)
    } else if (e.code === 'KeyU') undo()
    else if (e.code === 'KeyD') togglePen()
  }
  window.addEventListener('keydown', onKey)

  // ---------- Toolbar ----------
  function undo() {
    const s = session.state
    if (!s || !playing() || !s.undos.some((n) => n > 0)) return
    session.sendInput({ t: 'undo' })
  }
  let resignArmed = false
  let resignTimer: ReturnType<typeof setTimeout> | undefined
  function resign() {
    if (!resignArmed) {
      resignArmed = true
      clearTimeout(resignTimer)
      resignTimer = setTimeout(() => {
        resignArmed = false
        refresh()
      }, 3000)
      refresh()
      return
    }
    resignArmed = false
    session.sendInput({ t: 'resign' })
  }
  function togglePen() {
    ui.pen = !ui.pen
    ui.hover = ui.preview = -1
    playSound(ui.pen ? CARO_SOUNDS.pen : UI_SOUNDS.click, 0.6)
    view.canvas.classList.toggle('pen', ui.pen)
    refresh()
  }

  let toolbarKey = ''
  function renderToolbar(s: CaroState) {
    const offline = session.offline
    const hotseat = isHotseat(s)
    const undoSide: Side = hotseat ? (s.turn === 1 ? 2 : 1) : 1
    const undosLeft = s.undos[undoSide - 1]
    const canUndo = playing() && !s.over && s.moves.length > 0 && undosLeft > 0
    const canResign = playing() && !s.over && !hotseat && mySides(s, selfId).length > 0
    const key = JSON.stringify([
      offline,
      canUndo,
      undosLeft,
      canResign,
      resignArmed,
      ui.pen,
      ink,
      shared.board.strokes.length > 0,
    ])
    if (key === toolbarKey) return
    toolbarKey = key

    const items: HTMLElement[] = []
    if (offline) {
      const u = button(t('Undo ({n})', { n: undosLeft }), ICONS.undo, undo)
      u.disabled = !canUndo
      items.push(u)
    } else if (canResign) {
      items.push(
        button(
          resignArmed ? t('Sure? Tap again') : t('Resign'),
          ICONS.flag,
          resign,
          resignArmed ? 'danger' : '',
        ),
      )
    }
    const pen = button(ui.pen ? t('Done drawing') : t('Draw'), ICONS.pen, togglePen, ui.pen ? 'primary' : '')
    pen.setAttribute('aria-pressed', String(ui.pen))
    items.push(h('span', { class: 'caro-sep' }), pen)
    if (ui.pen) {
      const swatches = h('div', { class: 'caro-inks', role: 'radiogroup' } as never)
      swatches.setAttribute('aria-label', t('Ink colour'))
      INKS.forEach((c, i) => {
        const b = h('button', { class: `caro-ink${i === ink ? ' on' : ''}`, type: 'button' })
        b.style.setProperty('--ink', c)
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(i === ink))
        b.setAttribute('aria-label', i === 4 ? t('Highlighter') : t('Ink {n}', { n: i + 1 }))
        b.onclick = () => {
          ink = i
          playSound(CARO_SOUNDS.pen, 0.5)
          refresh()
        }
        swatches.append(b)
      })
      items.push(swatches)
    }
    const hasInk = shared.board.strokes.length > 0
    const erase = button(t('Erase my last'), ICONS.eraser, () => {
      if (shared.undoMine()) playSound(CARO_SOUNDS.undo, 0.6)
      refresh()
    })
    erase.disabled = !hasInk
    const clear = button(t('Clear drawing'), ICONS.trash, () => {
      shared.clear()
      playSound(CARO_SOUNDS.erase)
      refresh()
    })
    clear.disabled = !hasInk
    items.push(erase, clear)
    toolbar.replaceChildren(...items)
  }

  // Strokes from others change the "has ink" buttons.
  let inkVersion = -1
  const stopRender = startRenderLoop((dt) => {
    if (shared.board.version !== inkVersion) {
      inkVersion = shared.board.version
      if (session.state) renderToolbar(session.state)
    }
    renderer.frame(dt, ui)
  })

  refresh()
  return () => {
    offState()
    offLobby()
    stopRender()
    clearTimeout(resignTimer)
    window.removeEventListener('keydown', onKey)
    shared.dispose()
    view.destroy()
    root.remove()
  }
}

createGameApp<CaroState, CaroInput>({
  def: caroGame,
  title: 'Caro',
  tagline: t('Five in a row on notebook paper. Beat the computer, a friend beside you, or anyone online.'),
  controls: t(
    'Click a square to play (on a phone, tap twice). Arrow keys and Enter work too. Press D to draw on the board, U to undo.',
  ),
  music: STUDY,
  mount,
  outcome(state, selfId) {
    const names = seatNames(state, selfId)
    if (!state.winner) return { headline: t('Draw!'), result: 'draw' }
    const winner = seatOfSide(state, state.winner)
    if (isHotseat(state))
      return { headline: t('{name} wins!', { name: names[state.winner - 1] }), result: 'win' }
    if (winner.id === selfId) {
      const headline =
        state.reason === 'left'
          ? t('Your opponent left. You win!')
          : state.reason === 'resign'
            ? t('Your opponent resigned. You win!')
            : t('Five in a row. You win!')
      return { headline, result: 'win' }
    }
    if (winner.kind === 'ai') return { headline: t('The computer got five. Try again!'), result: 'lose' }
    const loser = seatOfSide(state, state.winner === 1 ? 2 : 1)
    if (loser.id !== selfId) return { headline: t('{name} wins!', { name: winner.name }), result: 'done' }
    return { headline: t('{name} wins!', { name: winner.name }), result: 'lose' }
  },
})
