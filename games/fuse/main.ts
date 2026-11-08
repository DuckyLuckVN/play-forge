import {
  bindGestures,
  createCanvas2D,
  createGameApp,
  h,
  icon,
  playSound,
  startRenderLoop,
  toast,
  UI_SOUNDS,
  type Session,
} from '@forge'
import { bestKey, loadBest, saveBest } from './best'
import type { Dir } from './board'
import './fuse.css'
import { t } from './i18n'
import { cellAt, layoutFor } from './look'
import { FuseRenderer, type ViewInput } from './render'
import { boardOf, fuseGame, isRace, type FuseInput, type FuseState } from './sim'
import { BOUNCE, comboSound, FUSE_SOUNDS, mergeSound, recordSound } from './sounds'

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICONS = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  bomb: svg('<circle cx="11" cy="14" r="7"/><path d="m16 9 2-2"/><path d="M19 3v2M21 5h-2M17.5 3.5l1 1"/>'),
}

function button(label: string, svgIcon: string, onclick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'pf-btn fuse-tool', type: 'button', onclick })
  b.append(icon(svgIcon), h('span', { class: 'fuse-tool-label', textContent: label }))
  b.title = label
  b.setAttribute('aria-label', label)
  return b
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}
const STEP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

/** Set when the last solo run beat this browser's best (read by `outcome`). */
let newBest = false

function mount(session: Session<FuseState, FuseInput>, stage: HTMLElement): () => void {
  const selfId = session.selfId
  const host = h('div', { class: 'fuse-board' })
  const toolbar = h('div', { class: 'fuse-toolbar' })
  const root = h('div', { class: 'fuse' }, host, toolbar)
  stage.append(root)

  const first = layoutFor(5, 0)
  const view = createCanvas2D(host, first.width, first.height, { maxDpr: 2 })
  view.canvas.classList.add('fuse-canvas')
  view.canvas.setAttribute('role', 'img')
  view.canvas.setAttribute('aria-label', t('Fuse board'))
  view.canvas.tabIndex = 0
  const renderer = new FuseRenderer(view, selfId)
  const ui: ViewInput = { armed: false, hover: -1, cursor: -1 }

  const playing = () => session.phase === 'playing' && !session.lobby.paused
  const mine = () => (session.state ? boardOf(session.state, selfId) : undefined)
  const canAct = () => playing() && !session.state?.over && !!mine()?.alive

  // ---------- State → sounds ----------
  // The host mutates one state object in place, so remember plain values, not the object.
  let wasOver = false
  const offState = session.on('state', (s) => {
    renderer.onState(s)
    const me = boardOf(s, selfId)
    for (const e of s.events) {
      const own = 'p' in e ? e.p === selfId : e.from === selfId
      switch (e.type) {
        case 'move': {
          if (!own) break
          playSound(FUSE_SOUNDS.slide)
          const top = e.merges.reduce((m, x) => Math.max(m, x.tier), 0)
          if (top) playSound(mergeSound(top))
          if (e.combo >= 2) playSound(comboSound(top, e.combo))
          break
        }
        case 'record':
          if (own) playSound(recordSound(e.tier))
          break
        case 'crumble':
          if (!own) break
          if (e.broken.length) playSound(FUSE_SOUNDS.smash)
          else playSound(FUSE_SOUNDS.crack)
          break
        case 'rock':
          if (own) playSound(e.sent ? FUSE_SOUNDS.incoming : FUSE_SOUNDS.rockLand)
          break
        case 'blast':
          if (own) playSound(FUSE_SOUNDS.blast)
          break
        case 'charged':
          if (own) playSound(FUSE_SOUNDS.charged)
          break
        case 'attack':
          if (own && e.cancelled) playSound(FUSE_SOUNDS.blocked)
          if (own && e.n) playSound(FUSE_SOUNDS.send)
          break
        case 'undo':
          if (own) playSound(FUSE_SOUNDS.undo)
          break
        case 'stuck': {
          if (own) playSound(FUSE_SOUNDS.stuck)
          else if (isRace(s)) {
            const b = boardOf(s, e.p)
            if (b && !b.left) toast(t('{name} is out of moves.', { name: b.name }))
          }
          break
        }
      }
    }
    if (s.over && !wasOver && me && !isRace(s)) newBest = saveBest(bestKey(s.size, s.rocks), me.score)
    wasOver = s.over
    if (!canAct()) ui.armed = false
    renderToolbar()
  })
  const offLobby = session.on('lobby', () => {
    ui.armed = false
    ui.cursor = -1
    renderToolbar()
  })

  // ---------- Actions ----------
  function slide(dir: Dir) {
    if (!canAct()) return
    ui.armed = false
    ui.cursor = -1
    session.sendInput({ t: 'move', dir })
  }
  function blastAt(cell: number) {
    const b = mine()
    if (!canAct() || !b || cell < 0) return
    if (!b.cells[cell]) {
      playSound(UI_SOUNDS.error, 0.6)
      return
    }
    ui.armed = false
    ui.cursor = -1
    session.sendInput({ t: 'blast', cell })
    renderToolbar()
  }
  function toggleBlast() {
    const b = mine()
    if (!canAct() || !b) return
    if (!ui.armed && b.blasts <= 0) {
      playSound(UI_SOUNDS.error, 0.6)
      return
    }
    ui.armed = !ui.armed
    ui.cursor = -1
    playSound(ui.armed ? FUSE_SOUNDS.arm : UI_SOUNDS.click, 0.7)
    renderToolbar()
  }
  function undo() {
    const b = mine()
    if (!canAct() || !b?.undos || !b.prev) return
    session.sendInput({ t: 'undo' })
  }

  // ---------- Pointer: swipe anywhere on the page (touch or mouse drag) to slide; tap the board to blast ----------
  const toLogical = (x: number, y: number): [number, number] => {
    const r = view.canvas.getBoundingClientRect()
    return [((x - r.left) * view.width) / r.width, ((y - r.top) * view.height) / r.height]
  }
  const stopGestures = bindGestures(
    {
      onSwipe: slide,
      onTap: ({ x, y }) => {
        const r = view.canvas.getBoundingClientRect()
        const onBoard = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
        if (ui.armed && onBoard) blastAt(cellAt(renderer.layout, ...toLogical(x, y)))
      },
    },
    { threshold: 28 },
  )
  view.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') ui.hover = cellAt(renderer.layout, ...toLogical(e.clientX, e.clientY))
  })
  view.canvas.addEventListener('pointerleave', () => (ui.hover = -1))

  // ---------- Keyboard: arrows / WASD slide; B aims a blast (arrows + Enter); U undo ----------
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (target.closest?.('input, textarea, button, a, .pf-overlay') || !playing()) return
    const s = session.state
    if (!s) return
    const dir = KEYS[e.code]
    if (dir) {
      e.preventDefault()
      if (e.repeat) return
      if (!ui.armed) return slide(dir)
      // Aiming: arrows move the crosshair instead.
      if (ui.cursor < 0) ui.cursor = Math.floor((s.size * s.size) / 2)
      const [dx, dy] = STEP[dir]
      const x = Math.min(s.size - 1, Math.max(0, (ui.cursor % s.size) + dx))
      const y = Math.min(s.size - 1, Math.max(0, Math.floor(ui.cursor / s.size) + dy))
      ui.cursor = y * s.size + x
    } else if ((e.code === 'Enter' || e.code === 'Space') && ui.armed) {
      e.preventDefault()
      blastAt(ui.cursor >= 0 ? ui.cursor : ui.hover)
    } else if (e.code === 'KeyB') toggleBlast()
    else if (e.code === 'KeyU') undo()
    else if (e.code === 'Escape' && ui.armed) {
      ui.armed = false
      renderToolbar()
    }
  }
  window.addEventListener('keydown', onKey)

  // ---------- Toolbar ----------
  let toolbarKey = ''
  function renderToolbar() {
    const b = mine()
    const s = session.state
    const act = canAct()
    const key = JSON.stringify([act, ui.armed, b?.blasts, b?.undos, !!b?.prev, s?.boards.length])
    if (key === toolbarKey) return
    toolbarKey = key
    const items: HTMLElement[] = []
    const blast = button(
      ui.armed ? t('Tap a tile to blast') : t('Blast ({n})', { n: b?.blasts ?? 0 }),
      ICONS.bomb,
      toggleBlast,
    )
    blast.disabled = !act || (!ui.armed && !b?.blasts)
    blast.classList.toggle('armed', ui.armed)
    blast.setAttribute('aria-pressed', String(ui.armed))
    items.push(blast)
    if (s && !isRace(s)) {
      const u = button(t('Undo ({n})', { n: b?.undos ?? 0 }), ICONS.undo, undo)
      u.disabled = !act || !b?.undos || !b.prev
      items.push(u)
    }
    toolbar.replaceChildren(...items)
  }

  const stopRender = startRenderLoop((dt) => renderer.frame(dt, ui))
  renderToolbar()
  return () => {
    offState()
    offLobby()
    stopGestures()
    stopRender()
    window.removeEventListener('keydown', onKey)
    view.destroy()
    root.remove()
  }
}

createGameApp<FuseState, FuseInput>({
  def: fuseGame,
  title: 'Fuse',
  tagline: t('Slide, fuse, chase huge numbers. Smash rocks, chain combos, race your friends.'),
  controls: t(
    'Swipe or use the arrow keys to slide every tile. Two equal tiles fuse into one. Merges next to a rock crack it. B (or the bomb button) blasts one tile. U undoes.',
  ),
  music: BOUNCE,
  mount,
  scores: (s) =>
    s.boards.filter((b) => b.kind === 'human').map((b) => ({ id: b.id, score: b.score, out: !b.alive })),
  outcome(s, selfId) {
    const me = boardOf(s, selfId)
    if (!isRace(s)) {
      const score = (me?.score ?? 0).toLocaleString()
      if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
      const best = loadBest(bestKey(s.size, s.rocks)).toLocaleString()
      return { headline: t('{score} points. Your best: {best}', { score, best }), result: 'done' }
    }
    if (!s.winner) return { headline: t("It's a tie!"), result: 'draw' }
    const winner = boardOf(s, s.winner)!
    if (winner.id === selfId) return { headline: t('You win the race!'), result: 'win' }
    if (winner.kind === 'ai') return { headline: t('The computer wins. Rematch?'), result: 'lose' }
    return { headline: t('{name} wins!', { name: winner.name }), result: me ? 'lose' : 'done' }
  },
})
