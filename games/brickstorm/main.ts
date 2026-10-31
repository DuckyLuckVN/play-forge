import '@forge/ui/base.css'
import './brickstorm.css'
import { playMusic } from '@forge/audio/music'
import { playSound, setMusicDuck, UI_SOUNDS } from '@forge/audio/sound'
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
import { ARENAS, type ArenaId } from './arenas'
import { bankRun, canBank, clearRun, loadSave, recordRun, spend, writeSave } from './save'
import { shopPanel } from './shop-ui'
import { applyHelpers, growBoard, revive, reviveCost, useHelper } from './sim/meta'
import { dims } from './sim/dims'
import { boostDetail, GUIDE, newlySeen } from './guide'
import { NoticeQueue } from './notices'
import { ACTIVE_HELPERS, boostsPanel, guidePanel, helpersPanel, navPanel, sample, statsPanel } from './panels'
import { BOOST_ICONS } from './icons'
import { BOOSTS, isSynergy, pickBoost, reroll, rerollCost } from './sim/boosts'
import { AIM_MIN, BOARD_H, BOARD_W, boardSize, COLS, MAX_COLS, MAX_ROWS, ROWS, TICK } from './sim/config'
import { aimFromPointer } from './sim/physics'
import { canRecall, createRun, drainEvents, fire, recall, speedMultiplier, step } from './sim/run'
import type { ActiveHelper, BoostId, RunState } from './sim/types'

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
const BAG_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>'
const shopBarBtn = button('', () => openShopFromBar(), 'icon')
shopBarBtn.append(icon(BAG_ICON))
shopBarBtn.title = 'Shop'
shopBarBtn.setAttribute('aria-label', 'Shop')
const guideBtn = button('?', () => openGuideFromBar(), 'icon bs-guide-btn')
guideBtn.title = 'Guide'
guideBtn.setAttribute('aria-label', 'Guide: what bricks and pickups do')
const bar = h(
  'header',
  { class: 'pf-bar' },
  home,
  h('h1', { class: 'pf-bar-title', textContent: 'Brickstorm' }),
  h('div', { class: 'pf-bar-actions' }, guideBtn, shopBarBtn, pauseBtn, audioMenu()),
)

const boardEl = h('div', { class: 'bs-board' })
// Blur after a click so Space launches instead of pressing the button again.
const fastBtn = button('⏩ Fast', () => {
  setFast(!fast)
  fastBtn.blur()
})
const recallBtn = button('Recall', () => {
  if (run) {
    recall(run)
    checkpoint()
  }
  recallBtn.blur()
})
const drawerBtn = button('Boosts & helpers', () => openDrawer())
drawerBtn.classList.add('bs-drawer-btn')
const controls = h('div', { class: 'bs-controls' }, fastBtn, recallBtn, drawerBtn)
// First-seen hints: a card over the middle of the board. Tap to dismiss.
const notices = new NoticeQueue()
const noticeEl = h('button', { class: 'bs-notice', type: 'button', onclick: () => notices.dismiss() })
noticeEl.hidden = true
let noticeShown: object | null = null
const leftSide = h('aside', { class: 'bs-side left' })
const rightSide = h('aside', { class: 'bs-side right' })
const stage = h(
  'main',
  { class: 'pf-stage bs-stage' },
  leftSide,
  h('div', { class: 'bs-center' }, boardEl, controls, noticeEl),
  rightSide,
)
const overlay = h('div', { class: 'pf-overlay' })
document.body.append(h('div', { class: 'pf-shell' }, bar, stage), overlay)

document.addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('.pf-btn')) playSound(UI_SOUNDS.click)
})

// ---------- Game objects ----------
const view = createCanvas2D(boardEl, BOARD_W, BOARD_H)
// Side panels match the board's height (CSS reads --bs-board-h).
new ResizeObserver(() => {
  stage.style.setProperty('--bs-board-h', `${view.canvas.getBoundingClientRect().height}px`)
}).observe(view.canvas)
const particles = new Particles()
const shake = new Shake(8)
const juice = new Juice(particles, shake)
const renderer = new BoardRenderer(view, particles, shake)

const params = new URLSearchParams(location.search)
const loaded = loadSave()
let save = loaded.save
if (loaded.corrupted) toast('Saved progress could not be read. A backup was kept.')
if (loaded.droppedRun) toast('Your last run could not be resumed. Your coins are safe.')

let run: RunState | null = null
let paused = false
let fast = false
let aim: number | null = null
let dragging = false
let acc = 0
let panel = ''
let overShown = false
/** How many of the current run's coins are already in the wallet. */
let banked = 0

if (params.has('debug')) Object.assign(window, { __brickstorm: { state: () => run } })

function setFast(on: boolean) {
  fast = on
  fastBtn.setAttribute('aria-pressed', String(on))
}
setFast(false)

// ---------- Saving ----------
function persist() {
  writeSave(save)
}

/** Banks the run's new coins and snapshots it, at a turn boundary (aim or pick). */
function checkpoint() {
  if (!run || !canBank(run.phase)) return
  ;({ save, banked } = bankRun(save, run, banked))
  persist()
}

function applyCosmetics() {
  renderer.arena = save.equipped.arena.split(':')[1] as ArenaId
  renderer.ball = save.equipped.ball
  renderer.trail = save.equipped.trail
  juice.impact = save.equipped.impact
  document.body.style.background = ARENAS[renderer.arena]?.bottom ?? ''
}
applyCosmetics()

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

const wallet = () => h('span', { class: 'bs-wallet', textContent: `● ${save.coins}` })

function leaveRun() {
  run = null
  notices.clear()
  paused = false
  controls.hidden = true
  pauseBtn.hidden = true
}

function showHome() {
  leaveRun()
  playMusic(LOUNGE)
  const saved = save.run
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h(
        'div',
        { class: 'bs-shop-head' },
        h('h2', { class: 'pf-heading', textContent: 'Brickstorm' }),
        wallet(),
      ),
      h('p', { class: 'pf-lede', textContent: 'Aim, launch, and break the storm.' }),
      save.bestTurn > 0 && h('p', { class: 'bs-best', textContent: `Best turn ${save.bestTurn}` }),
      saved && primary(`Continue · Turn ${saved.state.turn}`, resumeRun),
      saved ? button('New run', confirmNewRun, 'wide') : primary('Play', showHelpers),
      button('Shop', () => showShop(showHome), 'wide'),
      h('p', { class: 'pf-note', textContent: CONTROLS }),
    ),
    'home',
  )
}

function confirmNewRun() {
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Start over?' }),
      h('p', {
        class: 'pf-lede',
        textContent: `Your run at turn ${save.run?.state.turn} will be lost. Coins you earned are kept.`,
      }),
      primary('Start a new run', () => {
        save = clearRun(save)
        persist()
        showHelpers()
      }),
      button('Back', showHome, 'quiet'),
    ),
    'confirm',
  )
}

function showShop(onBack: () => void) {
  show(
    shopPanel(
      () => save,
      (next) => {
        save = next
        persist()
        applyCosmetics()
      },
      onBack,
    ),
    'shop',
  )
}

function inRun() {
  return !!run && (run.phase === 'aim' || run.phase === 'volley')
}

/**
 * Pauses the run for an overlay (shop, guide, details, confirm) and returns a
 * function that puts things back: the game resumes if it was running before.
 */
function holdRun(): () => void {
  const wasPaused = paused
  if (inRun() && !paused) {
    paused = true
    acc = 0
    dragging = false
    checkpoint()
  }
  return () => {
    panelsKey = ''
    // Opened over the pause menu (or another overlay): go back to the pause menu, never a blank paused game.
    if (wasPaused && inRun()) return showPaused()
    paused = wasPaused
    show(null)
  }
}

/** Shop from the top bar or side panel: closing it goes straight back to the game. */
function openShopFromBar() {
  if (inRun()) showShop(holdRun())
  else if (!run) showShop(showHome)
}

function showGuide(onBack: () => void) {
  show(guidePanel(onBack), 'guide')
}

function openGuideFromBar() {
  if (inRun()) showGuide(holdRun())
  else if (!run) showGuide(showHome)
}

/** A small popup explaining a boost or helper. */
function showDetail(title: string, body: string, extra: string, back: () => void, iconHtml?: string) {
  const art = h('span', { class: 'bs-detail-icon' })
  if (iconHtml) art.innerHTML = iconHtml
  show(
    h(
      'div',
      { class: 'pf-panel bs-detail' },
      h(
        'div',
        { class: 'bs-shop-head' },
        h('h2', { class: 'pf-heading', textContent: title }),
        iconHtml ? art : null,
      ),
      h('p', { class: 'pf-lede', textContent: body }),
      extra && h('p', { class: 'bs-side-empty', textContent: extra }),
      primary('Got it', back),
    ),
    `detail-${title}`,
  )
}

function boostInfo(id: BoostId, back = holdRun()) {
  if (!run) return
  const b = BOOSTS[id]
  showDetail(
    `${b.name} ×${run.boosts[id] ?? 0}`,
    boostDetail(id, run.boosts[id] ?? 1),
    `${b.rarity} boost`,
    back,
    BOOST_ICONS[id],
  )
}

function helperInfo(id: ActiveHelper, back = holdRun()) {
  const a = ACTIVE_HELPERS.find((x) => x.id === id)!
  showDetail(
    `${a.name} ×${save.helpers[id]}`,
    `${a.text}.`,
    'Use it while aiming, from the Helpers panel.',
    back,
  )
}

/** Tapping a helper asks first: helpers are bought with coins. */
function confirmHelper(id: ActiveHelper, back = holdRun(), onCancel = back) {
  const a = ACTIVE_HELPERS.find((x) => x.id === id)!
  show(
    h(
      'div',
      { class: 'pf-panel bs-detail' },
      h('h2', { class: 'pf-heading', textContent: `Use ${a.name}?` }),
      h('p', { class: 'pf-lede', textContent: `${a.text}.` }),
      h('p', {
        class: 'bs-side-empty',
        textContent: `You have ${save.helpers[id]}. Using one leaves ${save.helpers[id] - 1}.`,
      }),
      primary('Use it', () => {
        back()
        useActiveHelper(id)
      }),
      button('Cancel', onCancel, 'quiet'),
    ),
    `confirm-${id}`,
  )
}

/** Phone: stats, boosts and helpers in a drawer over the paused game. */
function openDrawer() {
  if (!run) return
  const close = holdRun()
  const s = run
  const reopen = () => {
    close()
    openDrawer()
  }
  show(
    h(
      'div',
      { class: 'pf-panel wide bs-shop' },
      statsPanel(s, save.bestTurn),
      boostsPanel(s, (id) => boostInfo(id, reopen)),
      helpersPanel(
        save.helpers,
        s.phase === 'aim',
        (id) => confirmHelper(id, close, reopen),
        (id) => helperInfo(id, reopen),
      ),
      primary('Close', close),
    ),
    'drawer',
  )
}

function useActiveHelper(id: ActiveHelper) {
  if (!run || save.helpers[id] <= 0 || !useHelper(run, id)) return
  save.helpers = { ...save.helpers, [id]: save.helpers[id] - 1 }
  checkpoint()
  persist()
  panelsKey = ''
}

let panelsKey = ''
let panelsAt = 0
/** Keeps the wide-screen side panels in step with the run (throttled). */
function renderPanels(s: RunState | null, time: number) {
  const key = s
    ? [
        s.turn,
        s.phase,
        s.combo,
        s.coins,
        s.level,
        Math.floor(s.xp),
        s.ballCount,
        JSON.stringify(s.boosts),
        JSON.stringify(save.helpers),
        paused,
      ].join('|')
    : 'none'
  if (key === panelsKey || time - panelsAt < 0.15) return
  panelsKey = key
  panelsAt = time
  if (!s) {
    leftSide.replaceChildren()
    rightSide.replaceChildren()
    return
  }
  leftSide.replaceChildren(navPanel(openShopFromBar, openGuideFromBar), statsPanel(s, save.bestTurn))
  rightSide.replaceChildren(
    boostsPanel(s, (id) => boostInfo(id)),
    helpersPanel(
      save.helpers,
      s.phase === 'aim' && !paused,
      (id) => confirmHelper(id),
      (id) => helperInfo(id),
    ),
  )
}

/** Tells the player about brick and pickup kinds the first time they appear. */
function announceNewKinds(s: RunState) {
  const fresh = newlySeen(s, save.seen)
  if (!fresh.length) return
  for (const id of fresh) {
    const g = GUIDE.find((e) => e.id === id)
    if (g) notices.push({ id, title: `New: ${g.name}`, text: g.text })
  }
  save = { ...save, seen: [...save.seen, ...fresh] }
  persist()
}

/** Shows the current notice, ticking only while the game is in view. */
function updateNotice(dt: number) {
  if (run && !paused && !panel) notices.update(dt)
  const n = run && !panel ? notices.current : null
  if (n !== noticeShown) {
    noticeShown = n
    noticeEl.hidden = !n
    if (n) {
      noticeEl.replaceChildren(
        sample(n.id),
        h('span', {}, h('strong', { textContent: n.title }), h('span', { textContent: n.text })),
        h('i', { class: 'bs-notice-time' }),
      )
      noticeEl.setAttribute('aria-label', `${n.title}. ${n.text} Tap to close.`)
    }
  }
  if (n) noticeEl.style.setProperty('--left', String(1 - notices.progress))
}

/** Before a run: switch on owned helpers (Head Start, Lucky Start). */
function showHelpers() {
  const owned = (['headStart', 'luckyStart'] as const).filter((k) => save.helpers[k] > 0)
  if (!owned.length) return startRun({ headStart: false, luckyStart: false })
  const use = { headStart: false, luckyStart: false }
  const LABEL = { headStart: 'Head Start: +5 balls', luckyStart: 'Lucky Start: a free boost' }
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Use helpers?' }),
      ...owned.map((k) => {
        const box = h('input', { type: 'checkbox', onchange: () => (use[k] = box.checked) })
        return h(
          'label',
          { class: 'bs-toggle' },
          box,
          h('span', { textContent: `${LABEL[k]} (you have ${save.helpers[k]})` }),
        )
      }),
      primary('Start', () => startRun(use)),
      button('Back', showHome, 'quiet'),
    ),
    'helpers',
  )
}

function beginRun(s: RunState) {
  run = s
  overShown = false
  juice.turn = s.turn
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

function startRun(use: { headStart: boolean; luckyStart: boolean }) {
  const seed = params.has('seed') ? Number(params.get('seed')) | 0 : randomSeed()
  const s = createRun(seed)
  for (const k of ['headStart', 'luckyStart'] as const) {
    if (use[k] && save.helpers[k] > 0) save.helpers = { ...save.helpers, [k]: save.helpers[k] - 1 }
    else use[k] = false
  }
  applyHelpers(s, use)
  banked = 0
  beginRun(s)
  checkpoint()
}

function resumeRun() {
  if (!save.run) return
  banked = save.run.banked
  beginRun(structuredClone(save.run.state))
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
    const synergy = isSynergy(s, id)
    const art = h('span', { class: 'bs-card-icon' })
    art.innerHTML = BOOST_ICONS[id]
    const card = h(
      'button',
      {
        class: `pf-btn bs-card ${b.rarity}${synergy ? ' synergy' : ''}`,
        type: 'button',
        onclick: () => {
          if (!settled()) return
          pickBoost(s, id)
          checkpoint()
          if (s.phase === 'pick') showPick()
          else show(null)
        },
      },
      synergy && h('em', { class: 'bs-ribbon', textContent: 'SYNERGY' }),
      art,
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
  const token = save.helpers.reroll > 0
  const cost = rerollCost(s)
  const rerollBtn = button(
    token ? `Reroll (use 1 of ${save.helpers.reroll} tokens)` : `Reroll (● ${cost})`,
    () => {
      if (!settled()) return
      checkpoint() // bank this run's coins so they can be spent
      if (save.helpers.reroll > 0) {
        save.helpers = { ...save.helpers, reroll: save.helpers.reroll - 1 }
      } else {
        const paid = spend(save, cost)
        if (!paid) return
        save = paid
      }
      reroll(s)
      checkpoint()
      showPick()
    },
    'quiet',
  )
  rerollBtn.disabled = !token && save.coins + (s.coins - banked) < cost
  show(
    h(
      'div',
      { class: 'pf-panel wide' },
      h('div', { class: 'bs-shop-head' }, heading, wallet()),
      h('div', { class: 'bs-cards' }, ...cards),
      rerollBtn,
    ),
    `pick-${s.level}-${s.pendingPicks}-${s.rerollsUsed}`,
  )
}

/** Every 50 turns: the player chooses how the board grows. */
function showGrow() {
  if (!run) return
  const s = run
  // Like the pick screen: ignore clicks meant for the volley that just ended.
  const shownAt = performance.now()
  const choose = (axis: 'col' | 'row') => {
    if (performance.now() - shownAt < PICK_GRACE_MS) return
    growBoard(s, axis)
    checkpoint()
    if (s.phase !== 'pick') show(null)
  }
  const col = button(`+1 column (${s.cols} → ${s.cols + 1})`, () => choose('col'), 'primary wide')
  col.autofocus = true
  col.disabled = s.cols >= MAX_COLS
  const row = button(`+1 row (${s.rows} → ${s.rows + 1})`, () => choose('row'), 'wide')
  row.disabled = s.rows >= MAX_ROWS
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'The storm grows!' }),
      h('p', {
        class: 'pf-lede',
        textContent: 'Make the board bigger. A column gives your balls more room; a row gives you more time.',
      }),
      col,
      row,
    ),
    'grow',
  )
}

function pause() {
  if (!run || paused || (run.phase !== 'aim' && run.phase !== 'volley')) return
  paused = true
  acc = 0
  dragging = false
  checkpoint()
  showPaused()
}

function showPaused() {
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Paused' }),
      h('p', { class: 'pf-lede', textContent: CONTROLS }),
      primary('Resume', resume),
      button('Shop', () => showShop(showPaused), 'wide'),
      button('Guide', () => showGuide(showPaused), 'wide'),
      button('Quit (your run is saved)', showHome, 'quiet'),
    ),
    'paused',
  )
}

function resume() {
  paused = false
  show(null)
}

/** Game over: bank the coins, then offer a revive before the results. */
function finish(s: RunState) {
  ;({ save, banked } = bankRun(save, s, banked))
  save = clearRun(save)
  persist()
  const token = save.helpers.revive > 0
  const cost = reviveCost(s)
  if (!token && save.coins < cost) return showResults(s)
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: 'Continue?' }),
      h('p', { class: 'pf-lede', textContent: 'Clear the 3 lowest rows and keep going.' }),
      h('div', { class: 'bs-shop-head' }, h('span', { textContent: `Turn ${s.turn}` }), wallet()),
      primary(token ? `Revive (use 1 of ${save.helpers.revive} tokens)` : `Revive (● ${cost})`, () => {
        if (save.helpers.revive > 0) save.helpers = { ...save.helpers, revive: save.helpers.revive - 1 }
        else {
          const paid = spend(save, cost)
          if (!paid) return showResults(s)
          save = paid
        }
        revive(s)
        overShown = false
        controls.hidden = false
        pauseBtn.hidden = false
        playMusic(ARCADE)
        checkpoint()
        show(null)
      }),
      button('No thanks', () => showResults(s), 'quiet'),
    ),
    'revive',
  )
}

function showResults(s: RunState) {
  const before = save.bestTurn
  save = recordRun(save, s.turn, s.bestCombo)
  persist()
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
        h('span', { textContent: `Coins earned ${s.coins} · wallet ● ${save.coins}` }),
      ),
      primary('Play again', showHelpers),
      button('Shop', () => showShop(showHome), 'wide'),
      button('Home', showHome, 'quiet'),
    ),
    'over',
  )
}

// ---------- Loop ----------
startRenderLoop((dt, time) => {
  const s = run
  if (s && !paused && s.phase === 'volley' && juice.hitstop === 0) {
    acc += dt * speedMultiplier(s, fast)
    for (let n = 0; acc >= TICK && n < MAX_STEPS && s.phase === 'volley'; n++) {
      step(s)
      acc -= TICK
    }
    if (s.phase !== 'volley') {
      acc = 0
      checkpoint()
    }
  }
  if (s) {
    for (const e of drainEvents(s)) juice.handle(e)
    juice.setCoins(s.coins)
    if (s.phase === 'pick' && !panel.startsWith('pick')) showPick()
    if (s.phase === 'grow' && panel !== 'grow') showGrow()
    if (s.phase === 'over' && !overShown) {
      overShown = true
      finish(s)
    }
  }
  recallBtn.disabled = !(s && canRecall(s))
  setMusicDuck(s && s.phase === 'volley' && !paused ? 0.6 : 1)
  particles.update(dt)
  shake.update(dt)
  juice.update(dt)
  if (s && s.phase === 'aim') announceNewKinds(s)
  updateNotice(dt)
  renderPanels(s, time)
  const d = s ? dims(s) : boardSize(COLS, ROWS)
  if (view.width !== d.boardW || view.height !== d.boardH) view.setSize(d.boardW, d.boardH)
  renderer.draw(s, juice, s && s.phase === 'aim' && !paused ? aim : null, time)
})

// ---------- Input ----------
const boardPoint = (e: PointerEvent) =>
  toBoard(view.canvas.getBoundingClientRect(), e.clientX, e.clientY, view.width, view.height)
const aimAt = (e: PointerEvent) => aimFromPointer(run!.launchX, ...boardPoint(e), dims(run!).floorY)

const aiming = () => !!run && !paused && run.phase === 'aim'

// Aim and launch work from anywhere on the page, so the guide keeps following
// the pointer in the side gutters. Presses on buttons and panels are theirs.
const UI = '.pf-overlay, .pf-bar, .bs-controls, button, a, input'

window.addEventListener('pointerdown', (e) => {
  if (!aiming() || (e.target as Element).closest?.(UI)) return
  dragging = true
  aim = aimAt(e)
})
window.addEventListener('pointermove', (e) => {
  if (!aiming() || (!dragging && e.pointerType !== 'mouse')) return
  aim = aimAt(e)
})
window.addEventListener('pointerup', (e) => {
  if (!dragging) return
  dragging = false
  if (!aiming()) return
  aim = aimAt(e)
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
