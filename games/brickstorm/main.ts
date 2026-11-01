import '@forge/ui/base.css'
import './brickstorm.css'
import { playMusic } from '@forge/audio/music'
import { playSound, setMusicDuck, UI_SOUNDS } from '@forge/audio/sound'
import { LOUNGE } from '@forge/audio/tracks'
import { startRenderLoop } from '@forge/core/loop'
import { randomSeed } from '@forge/core/rng'
import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { createCanvas2D } from '@forge/render2d/canvas'
import { audioMenu } from '@forge/ui/audio-menu'
import { langMenu } from '@forge/ui/lang-menu'
import { h, icon, toast } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { applyTheme } from '@forge/ui/theme'
import { bossIntro } from './boss-ui'
import { dangerHint } from './danger-hint'
import { growCard } from './grow-ui'
import { coinAmount, shortCoins } from './coin'
import { BOSS, trackFor } from './music'
import { rarityName, t } from './i18n'
import { toBoard } from './input'
import { Juice } from './juice'
import { BoardRenderer } from './render'
import { ARENAS, type ArenaId } from './arenas'
import {
  bankRun,
  canBank,
  clearRun,
  loadSave,
  recordRun,
  resetSave,
  spend,
  undoReset,
  walletTotal,
  writeSave,
} from './save'
import { isPreviewingMusic, shopPanel } from './shop-ui'
import { applyHelpers, growBoard, revive, reviveCost, useHelper } from './sim/meta'
import { dims } from './sim/dims'
import { boostDetail, GUIDE, newlySeen } from './guide'
import { NoticeQueue } from './notices'
import {
  ACTIVE_HELPERS,
  boostsPanel,
  guidePanel,
  helpersPanel,
  navPanel,
  closeButton,
  panelHead,
  sample,
  statsPanel,
} from './panels'
import { BOOST_ICONS } from './icons'
import {
  BOOSTS,
  boostSlots,
  holdBoost,
  holdCost,
  pickCost,
  skipPick,
  isSynergy,
  needsReplace,
  pickBoost,
  reroll,
  rerollCost,
  slottedBoosts,
  xpToNext,
  xpTotal,
} from './sim/boosts'
import { AIM_MIN, BOARD_H, BOARD_W, boardSize, COLS, MAX_COLS, MAX_ROWS, ROWS, TICK } from './sim/config'
import { aimFromPointer } from './sim/physics'
import { canRecall, createRun, drainEvents, fire, recall, speedMultiplier, step } from './sim/run'
import type { ActiveHelper, BoostId, RunState, StartHelper } from './sim/types'

const CONTROLS = () => t('Drag to aim and release to launch. Keys: ←/→ aim, Space launch, F fast, Esc pause.')
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
pauseBtn.title = t('Pause')
pauseBtn.setAttribute('aria-label', t('Pause'))
const home = h('a', { class: 'pf-btn icon', href: '../../index.html', title: t('All games') })
home.setAttribute('aria-label', t('All games'))
home.append(icon(icons.home))
const BAG_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>'
const shopBarBtn = button('', () => openShopFromBar(), 'icon')
// The wallet rides on the shop button, so players always know what they can spend.
const shopCoins = h('span', { class: 'bs-bar-coins' })
shopBarBtn.append(icon(BAG_ICON), shopCoins)
shopBarBtn.title = t('Shop')
let shownWallet = -1
function updateShopCoins() {
  const total = walletTotal(save, run, banked)
  if (total === shownWallet) return
  shownWallet = total
  shopCoins.replaceChildren(coinAmount(shortCoins(total)))
  shopBarBtn.setAttribute('aria-label', t('Shop ({n} coins)', { n: total }))
}
const guideBtn = button('?', () => openGuideFromBar(), 'icon bs-guide-btn')
guideBtn.title = t('Guide')
guideBtn.setAttribute('aria-label', t('Guide: what bricks and pickups do'))
const bar = h(
  'header',
  { class: 'pf-bar' },
  home,
  h('h1', { class: 'pf-bar-title', textContent: 'Brickstorm' }),
  h('div', { class: 'pf-bar-actions' }, guideBtn, shopBarBtn, pauseBtn, langMenu(), audioMenu()),
)

const boardEl = h('div', { class: 'bs-board' })
// Blur after a click so Space launches instead of pressing the button again.
const fastBtn = button(t('⏩ Fast'), () => {
  setFast(!fast)
  fastBtn.blur()
})
const recallBtn = button(t('Recall'), () => {
  if (run) {
    recall(run)
    checkpoint()
  }
  recallBtn.blur()
})
const drawerBtn = button(t('Boosts & helpers'), () => openDrawer())
drawerBtn.classList.add('bs-drawer-btn')
const controls = h('div', { class: 'bs-controls' }, fastBtn, recallBtn, drawerBtn)
// First-seen hints: a card over the middle of the board. Tap to dismiss.
const notices = new NoticeQueue()
const noticeEl = h('button', { class: 'bs-notice', type: 'button', onclick: () => notices.dismiss() })
noticeEl.hidden = true
/** "Danger! Use Push Back" when bricks near the line; closed for the rest of that turn. */
const dangerEl = h('div', { class: 'bs-danger', role: 'alert' })
dangerEl.hidden = true
let dangerShown = ''
let dangerClosedTurn = -1
let noticeShown: object | null = null
const leftSide = h('aside', { class: 'bs-side left' })
const rightSide = h('aside', { class: 'bs-side right' })
const stage = h(
  'main',
  { class: 'pf-stage bs-stage' },
  leftSide,
  h('div', { class: 'bs-center' }, boardEl, controls, noticeEl, dangerEl),
  rightSide,
)
const overlay = h('div', { class: 'pf-overlay' })
document.body.append(h('div', { class: 'pf-shell' }, bar, stage), overlay)

document.addEventListener('click', (e) => {
  if ((e.target as Element).closest?.('.pf-btn')) playSound(UI_SOUNDS.click)
})

// ---------- Game objects ----------
const view = createCanvas2D(boardEl, BOARD_W, BOARD_H)
// Side panels match the board's height; the notice card its width (CSS reads --bs-board-h/w).
new ResizeObserver(() => {
  const box = view.canvas.getBoundingClientRect()
  stage.style.setProperty('--bs-board-h', `${box.height}px`)
  stage.style.setProperty('--bs-board-w', `${box.width}px`)
}).observe(view.canvas)
const particles = new Particles()
const shake = new Shake(8)
const juice = new Juice(particles, shake)
const renderer = new BoardRenderer(view, particles, shake)

const params = new URLSearchParams(location.search)
const loaded = loadSave()
let save = loaded.save
if (loaded.corrupted) toast(t('Saved progress could not be read. A backup was kept.'))
if (loaded.droppedRun) toast(t('Your last run could not be resumed. Your coins are safe.'))

let run: RunState | null = null
let paused = false
let fast = false
let aim: number | null = null
let dragging = false
let acc = 0
let panel = ''
let overShown = false
/** The boss the notice card last explained. */
let bossAnnounced: object | null = null
/** Boost slots the player has been shown; more means a boss just gave one. */
let slotsSeen = 0
/** A fresh start just happened: the home screen offers to undo it. */
let justReset = false
/** The run's total XP last frame, for the "+N XP" tally. */
let xpSeen = 0
/** The level-up celebration for the current pick has started. */
let pickIntro = false
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

const wallet = () => coinAmount(walletTotal(save, run, banked), 'bs-wallet')

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
      h('p', { class: 'pf-lede', textContent: t('Aim, launch, and break the storm.') }),
      save.bestTurn > 0 &&
        h('p', { class: 'bs-best', textContent: t('Best turn {n}', { n: save.bestTurn }) }),
      saved && primary(t('Continue · Turn {n}', { n: saved.state.turn }), resumeRun),
      saved ? button(t('New run'), confirmNewRun, 'wide') : primary(t('Play'), showHelpers),
      button(t('Shop'), () => showShop(showHome), 'wide'),
      justReset
        ? h(
            'div',
            { class: 'bs-reset-done', role: 'status' },
            h('span', { textContent: t('Progress erased. Fresh start!') }),
            button(t('Undo'), () => {
              save = undoReset() ?? save
              justReset = false
              showHome()
            }),
          )
        : button(t('Fresh start…'), confirmFreshStart, 'quiet'),
      h('p', { class: 'pf-note', textContent: CONTROLS() }),
    ),
    'home',
  )
}

/** Erasing everything can't be done by a stray tap: it says what goes and asks first. */
function confirmFreshStart() {
  show(
    h(
      'div',
      { class: 'pf-panel' },
      panelHead(t('Fresh start?'), showHome),
      h('p', {
        class: 'pf-lede',
        textContent: t(
          'This erases all your progress: coins, items, helpers, best scores and your saved run. Language and sound settings stay.',
        ),
      }),
      button(
        t('Erase everything'),
        () => {
          save = resetSave()
          justReset = true
          showHome()
        },
        'wide bs-danger-btn',
      ),
      primary(t('Keep my progress'), showHome),
    ),
    'fresh-start',
  )
}

function confirmNewRun() {
  show(
    h(
      'div',
      { class: 'pf-panel' },
      panelHead(t('Start over?'), showHome),
      h('p', {
        class: 'pf-lede',
        textContent: t('Your run at turn {n} will be lost. Coins you earned are kept.', {
          n: save.run?.state.turn ?? 0,
        }),
      }),
      primary(t('Start a new run'), () => {
        save = clearRun(save)
        persist()
        showHelpers()
      }),
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
      panelHead(title, back, iconHtml ? art : null),
      h('p', { class: 'pf-lede', textContent: body }),
      extra && h('p', { class: 'bs-side-empty', textContent: extra }),
    ),
    `detail-${title}`,
  )
}

function boostInfo(id: BoostId, back = holdRun()) {
  if (!run) return
  const b = BOOSTS[id]
  showDetail(
    `${t(b.name)} ×${run.boosts[id] ?? 0}`,
    boostDetail(id, run.boosts[id] ?? 1),
    t('{rarity} boost', { rarity: rarityName(b.rarity) }),
    back,
    BOOST_ICONS[id],
  )
}

function helperInfo(id: ActiveHelper, back = holdRun()) {
  const a = ACTIVE_HELPERS.find((x) => x.id === id)!
  showDetail(
    `${t(a.name)} ×${save.helpers[id]}`,
    `${t(a.text)}.`,
    t('Use it while aiming, from the Helpers panel.'),
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
      panelHead(t('Use {name}?', { name: t(a.name) }), onCancel),
      h('p', { class: 'pf-lede', textContent: `${t(a.text)}.` }),
      h('p', {
        class: 'bs-side-empty',
        textContent: t('You have {n}. Using one leaves {left}.', {
          n: save.helpers[id],
          left: save.helpers[id] - 1,
        }),
      }),
      primary(t('Use it'), () => {
        back()
        useActiveHelper(id)
      }),
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
      panelHead(t('Boosts & helpers'), close),
      statsPanel(s, save.bestTurn),
      boostsPanel(s, (id) => boostInfo(id, reopen)),
      helpersPanel(
        save.helpers,
        s.phase === 'aim',
        (id) => confirmHelper(id, close, reopen),
        (id) => helperInfo(id, reopen),
      ),
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
        walletTotal(save, s, banked),
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
  leftSide.replaceChildren(
    navPanel(openShopFromBar, openGuideFromBar, walletTotal(save, s, banked)),
    statsPanel(s, save.bestTurn),
  )
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
    if (g) notices.push({ id, title: t('New: {name}', { name: t(g.name) }), text: t(g.text) })
  }
  save = { ...save, seen: [...save.seen, ...fresh] }
  persist()
}

/** Points at a helper (or the shop) when bricks are about to reach the line. */
function updateDanger() {
  const s = run
  const hint = s && !paused && !panel && s.turn !== dangerClosedTurn ? dangerHint(s, save.helpers) : null
  const key = hint ? `${s!.turn}:${'use' in hint ? hint.use : 'shop'}` : ''
  if (key === dangerShown) return
  dangerShown = key
  dangerEl.hidden = !hint
  if (!hint || !s) return
  const close = closeButton(() => {
    dangerClosedTurn = s.turn
    updateDanger()
  })
  if ('use' in hint) {
    const name = t(ACTIVE_HELPERS.find((x) => x.id === hint.use)!.name)
    dangerEl.replaceChildren(
      h('strong', { textContent: t('Danger!') }),
      h('span', { textContent: t('{name} can save you.', { name }) }),
      button(t('Use {name}', { name }), () => confirmHelper(hint.use), 'primary'),
      close,
    )
  } else {
    dangerEl.replaceChildren(
      h('strong', { textContent: t('Danger!') }),
      h('span', { textContent: t('Helpers like Push Back can save a run.') }),
      button(t('Shop'), openShopFromBar, 'primary'),
      close,
    )
  }
}

/** Shows the current notice, ticking only while the game is in view. */
function updateNotice(dt: number) {
  if (run && !paused && !panel && run.phase !== 'pick') notices.update(dt)
  // Hidden behind screens and during the level-up celebration.
  const n = run && !panel && (run.phase === 'aim' || run.phase === 'volley') ? notices.current : null
  if (n !== noticeShown) {
    noticeShown = n
    noticeEl.hidden = !n
    if (n) {
      noticeEl.replaceChildren(
        sample(n.id),
        h('span', {}, h('strong', { textContent: n.title }), h('span', { textContent: n.text })),
        h('i', { class: 'bs-notice-time' }),
      )
      noticeEl.setAttribute('aria-label', `${n.title}. ${n.text} ${t('Tap to close.')}`)
    }
  }
  if (n) noticeEl.style.setProperty('--left', String(1 - notices.progress))
}

/** Before a run: switch on owned helpers (Head Start, Lucky Start). */
const START_HELPERS: StartHelper[] = ['headStart', 'luckyStart', 'powerStart', 'goldStart', 'eagleStart']

function showHelpers() {
  const owned = START_HELPERS.filter((k) => save.helpers[k] > 0)
  if (!owned.length) return startRun({})
  const use: Partial<Record<StartHelper, boolean>> = {}
  const LABEL: Record<StartHelper, string> = {
    headStart: t('Head Start: +5 balls'),
    luckyStart: t('Lucky Start: a free boost'),
    powerStart: t('Power Start: Heavy Hitter ×2'),
    goldStart: t('Gold Start: Gold Rush ×2'),
    eagleStart: t('Eagle Start: Eagle Eye'),
  }
  show(
    h(
      'div',
      { class: 'pf-panel' },
      panelHead(t('Use helpers?'), showHome),
      ...owned.map((k) => {
        const box = h('input', { type: 'checkbox', onchange: () => (use[k] = box.checked) })
        return h(
          'label',
          { class: 'bs-toggle' },
          box,
          h('span', { textContent: t('{label} (you have {n})', { label: LABEL[k], n: save.helpers[k] }) }),
        )
      }),
      primary(t('Start'), () => startRun(use)),
    ),
    'helpers',
  )
}

function beginRun(s: RunState) {
  justReset = false
  run = s
  overShown = false
  slotsSeen = boostSlots(s)
  juice.turn = s.turn
  juice.setXp(s.level, s.xp / xpToNext(s.level), true)
  xpSeen = xpTotal(s.level, s.xp)
  paused = false
  acc = 0
  aim = Math.PI / 2
  setFast(false)
  particles.clear()
  controls.hidden = false
  pauseBtn.hidden = false
  playMusic(trackFor(save.equipped.music))
  show(null)
}

function startRun(use: Partial<Record<StartHelper, boolean>>) {
  const seed = params.has('seed') ? Number(params.get('seed')) | 0 : randomSeed()
  const s = createRun(seed)
  for (const k of START_HELPERS) {
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

/** After a boss: a callout on the pick screen that a boost slot was unlocked (shown once). */
function slotCallout(s: RunState): HTMLElement | null {
  const slots = boostSlots(s)
  if (slots <= slotsSeen) return null
  slotsSeen = slots
  return h(
    'div',
    { class: 'bs-slot-callout', role: 'status' },
    h('span', { class: 'bs-socket-ring' }),
    h(
      'div',
      {},
      h('strong', { textContent: t('New boost slot!') }),
      h('span', { textContent: t('Boss beaten: you can now hold {n} boosts.', { n: slots }) }),
    ),
  )
}

/** Takes an offered boost (dropping `replace` for it when slots are full), then the next screen. */
const LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'

/** Pays `cost` from the wallet (this run's coins are banked first); false if it's short. */
function pay(cost: number): boolean {
  if (cost <= 0) return true
  checkpoint()
  const paid = spend(save, cost)
  if (!paid) return false
  save = paid
  return true
}

const canPay = (cost: number) => walletTotal(save, run, banked) >= cost

/** Pays for and takes an offered boost (dropping `replace` for it when slots are full), then the next screen. */
function takeBoost(id: BoostId, replace?: BoostId) {
  if (!run || !pay(pickCost(run, id))) return
  pickBoost(run, id, replace)
  checkpoint()
  if (run.phase === 'pick') showPick()
  else show(null)
}

/** Slots are full: the player picks which owned boost to drop for `id`, or goes back. */
function showSwap(id: BoostId) {
  if (!run) return
  const s = run
  const owned = slottedBoosts(s.boosts)
  show(
    h(
      'div',
      { class: 'pf-panel wide' },
      panelHead(t('Swap for {name}?', { name: t(BOOSTS[id].name) }), showPick),
      h('p', {
        class: 'pf-lede',
        textContent: t(
          'Your boost slots are full ({n}/{max}). Pick one to drop for it. Each boss you beat adds a slot.',
          { n: owned.length, max: boostSlots(s) },
        ),
      }),
      h(
        'div',
        { class: 'bs-cards' },
        ...owned.map((old) => {
          const b = BOOSTS[old]
          const art = h('span', { class: 'bs-card-icon' })
          art.innerHTML = BOOST_ICONS[old]
          const card = h(
            'button',
            { class: `pf-btn bs-card ${b.rarity}`, type: 'button', onclick: () => takeBoost(id, old) },
            art,
            h('strong', { textContent: t(b.name) }),
            h('span', { textContent: t(b.text) }),
          )
          card.setAttribute(
            'aria-label',
            t('Drop {name} (level {n})', { name: t(b.name), n: s.boosts[old] ?? 0 }),
          )
          card.append(h('small', { textContent: `×${s.boosts[old]}` }))
          return card
        }),
      ),
    ),
    `pick-swap-${id}`,
  )
}

function showPick() {
  if (!run) return
  const s = run
  // Keys or clicks meant for the volley that just ended must not pick a card
  // the player hasn't seen yet.
  const shownAt = performance.now()
  const settled = () => performance.now() - shownAt >= PICK_GRACE_MS
  const holding = holdCost(s)
  const cards = s.choices.map((id) => {
    const b = BOOSTS[id]
    const synergy = isSynergy(s, id)
    const held = s.held === id
    const price = pickCost(s, id)
    const art = h('span', { class: 'bs-card-icon' })
    art.innerHTML = BOOST_ICONS[id]
    const card = h(
      'button',
      {
        class: `pf-btn bs-card ${b.rarity}${synergy ? ' synergy' : ''}${held ? ' held' : ''}`,
        type: 'button',
        onclick: () => {
          if (!settled()) return
          if (needsReplace(s, id)) return showSwap(id)
          takeBoost(id)
        },
      },
      art,
      // One line of labels: rarity, new or a level-up (never reads as a new slot), synergy, held.
      h(
        'div',
        { class: 'bs-card-meta' },
        h('small', { textContent: rarityName(b.rarity) }),
        h('span', {
          class: `bs-tag ${s.boosts[id] ? 'up' : 'new'}`,
          textContent: s.boosts[id]
            ? t('Lv {from} → {to}', { from: s.boosts[id] ?? 0, to: (s.boosts[id] ?? 0) + 1 })
            : t('NEW'),
        }),
        synergy && h('span', { class: 'bs-tag synergy', textContent: t('SYNERGY') }),
        held && h('span', { class: 'bs-tag held', textContent: t('HELD') }),
      ),
      h('strong', { textContent: t(b.name) }),
      h('span', { textContent: t(b.text) }),
      needsReplace(s, id) && h('small', { class: 'bs-swap', textContent: t('Slots full: swap one out') }),
      h('span', { class: 'bs-price' }, price ? coinAmount(price) : t('FREE')),
    )
    card.disabled = !canPay(price)
    // A lock in the corner: pay to see this boost again at the next level-up (one at a time).
    const name = t(b.name)
    const lock =
      !s.held &&
      h(
        'button',
        {
          class: 'bs-lock',
          type: 'button',
          title: t('Hold {name} for your next level-up', { name }),
          onclick: () => {
            if (!settled() || !pay(holding)) return
            holdBoost(s, id)
            checkpoint()
            showPick()
          },
        },
        icon(LOCK_ICON),
        coinAmount(holding),
      )
    if (lock) {
      lock.disabled = !canPay(holding)
      lock.setAttribute('aria-label', t('Hold {name} for your next level-up', { name }))
    }
    return h('div', { class: 'bs-card-wrap' }, card, lock)
  })
  const heldAway = s.held && !s.choices.includes(s.held) ? t(BOOSTS[s.held].name) : null
  const heading = h('h2', {
    class: 'pf-heading',
    textContent: t('Level up! Pick a boost'),
    tabIndex: -1,
    autofocus: true,
  })
  const token = save.helpers.reroll > 0
  const cost = rerollCost(s)
  const rerollBtn = button(
    token ? t('Reroll (use 1 of {n} tokens)', { n: save.helpers.reroll }) : t('Reroll'),
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
    'bs-reroll',
  )
  if (!token) rerollBtn.append(' ', coinAmount(cost))
  rerollBtn.disabled = !token && save.coins + (s.coins - banked) < cost
  const skip = () => settled() && confirmSkip()
  show(
    h(
      'div',
      { class: 'pf-panel wide' },
      h('div', { class: 'bs-shop-head' }, heading, wallet(), closeButton(skip)),
      slotCallout(s),
      h('div', { class: 'bs-cards' }, ...cards),
      heldAway &&
        h(
          'p',
          { class: 'bs-held-note' },
          icon(LOCK_ICON),
          t('{name} is held for your next level-up.', { name: heldAway }),
        ),
      h('div', { class: 'bs-pick-actions' }, rerollBtn, button(t('Skip'), skip)),
    ),
    `pick-${s.level}-${s.pendingPicks}-${s.rerollsUsed}-${s.holdsUsed ?? 0}`,
  )
}

/** Skipping a pick gives up its boost, so ask first. */
function confirmSkip() {
  if (!run) return
  const s = run
  show(
    h(
      'div',
      { class: 'pf-panel' },
      panelHead(t('Skip this level-up?'), showPick),
      h('p', { class: 'pf-lede', textContent: t("You won't get a boost from this level-up.") }),
      button(
        t('Skip'),
        () => {
          skipPick(s)
          checkpoint()
          if (s.phase === 'pick') showPick()
          else show(null)
        },
        'primary wide',
      ),
      button(t('Keep picking'), showPick, 'wide'),
    ),
    'pick-skip',
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
  show(
    h(
      'div',
      { class: 'pf-panel wide' },
      h('h2', { class: 'pf-heading', textContent: t('The storm grows!') }),
      h('p', {
        class: 'pf-lede',
        textContent: t('Choose how the board grows. It stays for the rest of this run.'),
      }),
      h(
        'div',
        { class: 'bs-cards' },
        growCard('col', s.cols, s.rows, s.cols >= MAX_COLS, () => choose('col')),
        growCard('row', s.cols, s.rows, s.rows >= MAX_ROWS, () => choose('row')),
      ),
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
      h('h2', { class: 'pf-heading', textContent: t('Paused') }),
      h('p', { class: 'pf-lede', textContent: CONTROLS() }),
      primary(t('Resume'), resume),
      button(t('Shop'), () => showShop(showPaused), 'wide'),
      button(t('Guide'), () => showGuide(showPaused), 'wide'),
      button(t('Quit (your run is saved)'), showHome, 'quiet'),
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
  const reviveBtn = primary(
    token ? t('Revive (use 1 of {n} tokens)', { n: save.helpers.revive }) : t('Revive'),
    () => {
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
      playMusic(trackFor(save.equipped.music))
      checkpoint()
      show(null)
    },
  )
  if (!token) reviveBtn.append(' ', coinAmount(cost))
  show(
    h(
      'div',
      { class: 'pf-panel' },
      h('h2', { class: 'pf-heading', textContent: t('Continue?') }),
      h('p', { class: 'pf-lede', textContent: t('Clear the 3 lowest rows and keep going.') }),
      h('div', { class: 'bs-shop-head' }, h('span', { textContent: t('Turn {n}', { n: s.turn }) }), wallet()),
      reviveBtn,
      button(t('No thanks'), () => showResults(s), 'quiet'),
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
      h('h2', { class: 'pf-heading', textContent: t('Turn {n}', { n: s.turn }) }),
      s.turn > before && h('p', { class: 'bs-best', textContent: t('NEW BEST!') }),
      h(
        'div',
        { class: 'bs-stats' },
        h('span', { textContent: t('Best turn {n}', { n: save.bestTurn }) }),
        h('span', { textContent: t('Best combo {n}', { n: save.bestCombo }) }),
        h('span', {}, t('Coins earned {n} · wallet', { n: s.coins }), ' ', coinAmount(save.coins)),
      ),
      primary(t('Play again'), showHelpers),
      button(t('Shop'), () => showShop(showHome), 'wide'),
      button(t('Home'), showHome, 'quiet'),
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
    juice.setBossHp(s.boss?.hp ?? null)
    // Boss fights get their own music and a card explaining the boss.
    if (s.phase !== 'over' && !isPreviewingMusic()) playMusic(s.boss ? BOSS : trackFor(save.equipped.music))
    // A new boss waits on the aim screen until the player has read its card.
    if (s.boss && s.boss !== bossAnnounced && s.phase === 'aim' && !panel && !paused) {
      bossAnnounced = s.boss
      show(
        bossIntro(s.boss, () => show(null)),
        'boss',
      )
    }
    juice.setCoins(s.coins)
    juice.setXp(s.level, s.xp / xpToNext(s.level))
    const xpNow = xpTotal(s.level, s.xp)
    juice.gainXp(xpNow - xpSeen)
    xpSeen = xpNow
    // Level up: celebrate for a beat, then open the pick screen.
    if (s.phase !== 'pick') pickIntro = false
    else if (!panel.startsWith('pick')) {
      if (!pickIntro) {
        pickIntro = true
        juice.startLevelUp()
      } else if (juice.levelUpDone) showPick()
    }
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
  updateDanger()
  updateShopCoins()
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
  if (run?.phase === 'pick' && !panel) juice.skipLevelUp()
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
  if (run?.phase === 'pick' && !panel && (e.code === 'Space' || e.code === 'Enter')) juice.skipLevelUp()
  // Esc closes a menu that has a ✕.
  const closeX =
    !overlay.hidden && e.code === 'Escape' && overlay.querySelector<HTMLButtonElement>('.bs-close')
  if (closeX) {
    closeX.click()
    return
  }
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
