import '@forge/ui/base.css'
import './brickstorm.css'
import { playMusic } from '@forge/audio/music'
import { playSound, UI_SOUNDS } from '@forge/audio/sound'
import { ARCADE, LOUNGE } from '@forge/audio/tracks'
import { startRenderLoop } from '@forge/core/loop'
import { randomSeed } from '@forge/core/rng'
import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { createCanvas2D } from '@forge/render2d/canvas'
import { audioMenu } from '@forge/ui/audio-menu'
import { h, icon, toast } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { applyTheme } from '@forge/ui/theme'
import { toBoard } from './input'
import { Juice } from './juice'
import { BoardRenderer } from './render'
import { loadSave, recordRun, writeSave } from './save'
import { BOOSTS, pickBoost, reroll } from './sim/boosts'
import { AIM_MIN, BOARD_H, BOARD_W, TICK } from './sim/config'
import { aimFromPointer } from './sim/physics'
import { canRecall, createRun, drainEvents, fire, recall, speedMultiplier, step } from './sim/run'
import type { RunState } from './sim/types'

const CONTROLS = 'Drag to aim and release to launch. Keys: ←/→ aim, Space launch, F fast, Esc pause.'
const AIM_STEP = (1.5 * Math.PI) / 180
/** Never simulate more than this many ticks in one frame. */
const MAX_STEPS = 1200
/** Card clicks are ignored this long after the pick screen opens. */
const PICK_GRACE_MS = 250

applyTheme()
document.title = 'Brickstorm · Play Forge'

// ---------- Shell ----------
const button = (text: string, onclick: () => void, variant = '') =>
  h('button', { class: `pf-btn ${variant}`.trim(), textContent: text, onclick, type: 'button' })

const pauseBtn = button('', () => pause(), 'icon')
pauseBtn.append(icon(icons.pause))
pauseBtn.title = 'Pause'
pauseBtn.setAttribute('aria-label', 'Pause')
const home = h('a', { class: 'pf-btn icon', href: '../../index.html', title: 'All games' })
home.setAttribute('aria-label', 'All games')
home.append(icon(icons.home))
const bar = h(
  'header',
  { class: 'pf-bar' },
  home,
  h('h1', { class: 'pf-bar-title', textContent: 'Brickstorm' }),
  h('div', { class: 'pf-bar-actions' }, pauseBtn, audioMenu()),
)

const boardEl = h('div', { class: 'bs-board' })
// Blur after a click so Space launches instead of pressing the button again.
const fastBtn = button('⏩ Fast', () => {
  setFast(!fast)
  fastBtn.blur()
})
const recallBtn = button('Recall', () => {
  if (run) recall(run)
  recallBtn.blur()
})
const controls = h('div', { class: 'bs-controls' }, fastBtn, recallBtn)
const stage = h('main', { class: 'pf-stage bs-stage' }, boardEl, controls)
const overlay = h('div', { class: 'pf-overlay' })
document.body.append(h('div', { class: 'pf-shell' }, bar, stage), overlay)

document.addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('.pf-btn')) playSound(UI_SOUNDS.click)
})

// ---------- Game objects ----------
const view = createCanvas2D(boardEl, BOARD_W, BOARD_H)
const particles = new Particles()
const shake = new Shake(8)
const juice = new Juice(particles, shake)
const renderer = new BoardRenderer(view, particles, shake)

const params = new URLSearchParams(location.search)
const loaded = loadSave()
let save = loaded.save
if (loaded.corrupted) toast('Saved progress could not be read. A backup was kept.')

let run: RunState | null = null
let paused = false
let fast = false
let aim: number | null = null
let dragging = false
let acc = 0
let panel = ''

if (params.has('debug')) Object.assign(window, { __brickstorm: { state: () => run } })

function setFast(on: boolean) {
  fast = on
  fastBtn.setAttribute('aria-pressed', String(on))
}
setFast(false)

// ---------- Screens ----------
function show(el: HTMLElement | null, key = '') {
  overlay.hidden = !el
  if (!el) {
    panel = ''
    overlay.replaceChildren()
    return
  }
  if (key !== panel) el.classList.add('enter')
  panel = key
  overlay.replaceChildren(el)
  el.querySelector<HTMLElement>('[autofocus]')?.focus({ preventScroll: true })
}

function primary(text: string, onclick: () => void) {
  const b = button(text, onclick, 'primary wide')
  b.autofocus = true
  return b
}

function showHome() {
  run = null
  paused = false
  controls.hidden = true
  pauseBtn.hidden = true
  playMusic(LOUNGE)
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Brickstorm' }),
      h('p', { class: 'pf-lede', textContent: 'Aim, launch, and break the storm.' }),
      save.bestTurn > 0 && h('p', { class: 'bs-best', textContent: `Best turn ${save.bestTurn}` }),
      primary('Play', startRun),
      h('p', { class: 'pf-note', textContent: CONTROLS }),
    ),
    'home',
  )
}

function startRun() {
  const seed = params.has('seed') ? Number(params.get('seed')) | 0 : randomSeed()
  run = createRun(seed)
  juice.turn = 1
  paused = false
  acc = 0
  aim = Math.PI / 2
  setFast(false)
  particles.clear()
  controls.hidden = false
  pauseBtn.hidden = false
  playMusic(ARCADE)
  show(null)
}

function showPick() {
  if (!run) return
  const s = run
  // Keys or clicks meant for the volley that just ended must not pick a card
  // the player hasn't seen yet.
  const shownAt = performance.now()
  const settled = () => performance.now() - shownAt >= PICK_GRACE_MS
  const cards = s.choices.map((id) => {
    const b = BOOSTS[id]
    const card = h(
      'button',
      {
        class: `pf-btn bs-card ${b.rarity}`,
        type: 'button',
        onclick: () => {
          if (!settled()) return
          pickBoost(s, id)
          if (s.phase === 'pick') showPick()
          else show(null)
        },
      },
      h('small', { textContent: b.rarity }),
      h('strong', { textContent: b.name }),
      h('span', { textContent: b.text }),
    )
    return card
  })
  const heading = h('h2', {
    class: 'pf-heading',
    textContent: 'Level up! Pick a boost',
    tabIndex: -1,
    autofocus: true,
  })
  show(
    h(
      'div',
      { class: 'pf-panel wide' },
      heading,
      h('div', { class: 'bs-cards' }, ...cards),
      s.rerolls > 0 &&
        button(
          `Reroll (${s.rerolls})`,
          () => {
            if (!settled()) return
            reroll(s)
            showPick()
          },
          'quiet',
        ),
    ),
    `pick-${s.level}-${s.pendingPicks}-${s.rerolls}`,
  )
}

function pause() {
  if (!run || paused || (run.phase !== 'aim' && run.phase !== 'volley')) return
  paused = true
  acc = 0
  dragging = false
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Paused' }),
      h('p', { class: 'pf-lede', textContent: CONTROLS }),
      primary('Resume', resume),
      button('Quit', showHome, 'quiet'),
    ),
    'paused',
  )
}

function resume() {
  paused = false
  show(null)
}

function finish(s: RunState) {
  const before = save.bestTurn
  save = recordRun(save, s.turn, s.bestCombo)
  writeSave(save)
  controls.hidden = true
  pauseBtn.hidden = true
  playMusic(LOUNGE)
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: `Turn ${s.turn}` }),
      s.turn > before && h('p', { class: 'bs-best', textContent: 'NEW BEST!' }),
      h(
        'div',
        { class: 'bs-stats' },
        h('span', { textContent: `Best turn ${save.bestTurn}` }),
        h('span', { textContent: `Best combo ${save.bestCombo}` }),
        h('span', { textContent: `Coins ${s.coins}` }),
      ),
      primary('Play again', startRun),
      button('Home', showHome, 'quiet'),
    ),
    'over',
  )
}

// ---------- Loop ----------
startRenderLoop((dt, time) => {
  const s = run
  if (s && !paused && s.phase === 'volley') {
    acc += dt * speedMultiplier(s, fast)
    for (let n = 0; acc >= TICK && n < MAX_STEPS && s.phase === 'volley'; n++) {
      step(s)
      acc -= TICK
    }
    if (s.phase !== 'volley') acc = 0
  }
  if (s) {
    for (const e of drainEvents(s)) juice.handle(e)
    if (s.phase === 'pick' && !panel.startsWith('pick')) showPick()
    if (s.phase === 'over' && panel !== 'over') finish(s)
  }
  recallBtn.disabled = !(s && canRecall(s))
  particles.update(dt)
  shake.update(dt)
  juice.update(dt)
  renderer.draw(s, juice, s && s.phase === 'aim' && !paused ? aim : null, time)
})

// ---------- Input ----------
const boardPoint = (e: PointerEvent) => toBoard(view.canvas.getBoundingClientRect(), e.clientX, e.clientY)

const aiming = () => !!run && !paused && run.phase === 'aim'

// Aim and launch work from anywhere on the page, so the guide keeps following
// the pointer in the side gutters. Presses on buttons and panels are theirs.
const UI = '.pf-overlay, .pf-bar, .bs-controls, button, a, input'

window.addEventListener('pointerdown', (e) => {
  if (!aiming() || (e.target as Element).closest?.(UI)) return
  dragging = true
  aim = aimFromPointer(run!.launchX, ...boardPoint(e))
})
window.addEventListener('pointermove', (e) => {
  if (!aiming() || (!dragging && e.pointerType !== 'mouse')) return
  aim = aimFromPointer(run!.launchX, ...boardPoint(e))
})
window.addEventListener('pointerup', (e) => {
  if (!dragging) return
  dragging = false
  if (!aiming()) return
  aim = aimFromPointer(run!.launchX, ...boardPoint(e))
  fire(run!, aim)
})
window.addEventListener('pointercancel', () => (dragging = false))

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (paused) resume()
    else pause()
    return
  }
  if (!aiming() && e.code !== 'KeyF') return
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    e.preventDefault()
    const turn = e.code === 'ArrowLeft' ? AIM_STEP : -AIM_STEP
    aim = Math.max(AIM_MIN, Math.min(Math.PI - AIM_MIN, (aim ?? Math.PI / 2) + turn))
  } else if (e.code === 'Space' && !e.repeat) {
    e.preventDefault()
    fire(run!, aim ?? Math.PI / 2)
  } else if (e.code === 'KeyF' && !e.repeat && run) {
    setFast(!fast)
  }
})

// Browsers throttle hidden tabs; pause rather than jump ahead on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause()
})

showHome()
