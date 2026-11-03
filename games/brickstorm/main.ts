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
import { coinAmount } from './coin'
import { BOSS, trackFor } from './music'
import { rarityName, t } from './i18n'
import { hoverCursor, inRect, LONG_PRESS_MS, moved, onBoss, toBoard } from './input'
import { Juice, STORM_EXPLAIN, STORM_TEXT } from './juice'
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
  type Save,
} from './save'
import { isPreviewingMusic, shopPanel } from './shop-ui'
import { equippedHero, heroBrowser } from './hero-ui'
import { HeroAvatar, type AvatarContext } from './hero-avatar'
import type { HeroId } from './sim/heroes'
import { breachDamage } from './sim/health'
import { applyHelpers, growBoard, revive, reviveCost, useHelper } from './sim/meta'
import { baseCols, baseRows, dims } from './sim/dims'
import { BOSS_WARN_TURNS } from './sim/boss'
import { boostDetail, GUIDE, guideIdsAt, newlySeen } from './guide'
import { NoticeQueue } from './notices'
import { SaveQueue } from './save-queue'
import {
  ACTIVE_HELPERS,
  boostsPanel,
  guidePanel,
  helpersPanel,
  navPanel,
  closeButton,
  panelHead,
  sample,
  slotStrip,
  statsPanel,
} from './panels'
import { BOOST_ICONS } from './icons'
import {
  BOOSTS,
  boostSlots,
  holdBoost,
  holdCost,
  isInstant,
  pickCost,
  closePicks,
  openPicks,
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
import { comboPower, xpComboMultiplier } from './sim/damage'
import { aimFromPointer } from './sim/physics'
import {
  canRecall,
  createRun,
  drainEvents,
  fire,
  recall,
  restingBall,
  speedMultiplier,
  step,
} from './sim/run'
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
// Just the bag: the wallet already shows in the HUD, the shop and the home screen.
shopBarBtn.append(icon(BAG_ICON))
shopBarBtn.title = t('Shop')
shopBarBtn.setAttribute('aria-label', t('Shop'))
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
const drawerBtn = button(t('Skills & helpers'), () => openDrawer())
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
// 2× density is crisp on any phone; 3× fills 2.25× the pixels every frame for little gain.
const view = createCanvas2D(boardEl, BOARD_W, BOARD_H, { maxDpr: 2 })
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
/** The hero, alive beside the ball. */
const avatar = new HeroAvatar('rookie')
avatar.size = 1.35
renderer.avatar = avatar

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
/** The canvas was last sized mid-animation (its pixel buffer may be stretched). */
let smoothSized = false
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
/** Skill points the player has been told about (a level-up celebration each time it grows). */
let pointsSeen = 0
/** Points shown on the Skills button. */
let drawerPoints = 0
/** How many of the current run's coins are already in the wallet. */
let banked = 0

if (params.has('debug')) Object.assign(window, { __brickstorm: { state: () => run, avatar: () => avatar } })

function setFast(on: boolean) {
  fast = on
  fastBtn.setAttribute('aria-pressed', String(on))
}
setFast(false)

// ---------- Saving ----------
/** Saves are batched into one write when the browser is idle, and flushed when the tab hides or closes. */
const saves = new SaveQueue(() => writeSave(save))
addEventListener('pagehide', () => saves.flush())
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saves.flush()
})

function persist() {
  saves.request()
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

/** Swaps in a whole different save (fresh start, undo): its look and music too, not just its numbers. */
function replaceSave(next: Save) {
  save = next
  leaveRun()
  applyCosmetics()
  playMusic(LOUNGE)
}

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
      saved ? button(t('New run'), confirmNewRun, 'wide') : primary(t('Play'), showHeroes),
      button(t('Heroes'), () => showHeroes(), 'wide'),
      button(t('Shop'), () => showShop(showHome), 'wide'),
      justReset
        ? h(
            'div',
            { class: 'bs-reset-done', role: 'status' },
            h('span', { textContent: t('Progress erased. Fresh start!') }),
            button(t('Undo'), () => {
              const back = undoReset()
              if (back) replaceSave(back)
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
          replaceSave(resetSave())
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
        showHeroes()
      }),
    ),
    'confirm',
  )
}

function showShop(onBack: () => void) {
  show(
    shopPanel(
      () => save,
      // Coins from the shot still flying land in the wallet when it ends.
      () => (run ? Math.max(0, walletTotal(save, run, banked) - save.coins) : 0),
      (next) => {
        save = next
        persist()
        applyCosmetics()
      },
      onBack,
      (id) => juice.heroVoice(id),
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
    skillsKey = ''
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
function showDetail(
  title: string,
  body: string,
  extra: string,
  back: () => void,
  icon?: string | HTMLElement,
) {
  const art = h('span', { class: 'bs-detail-icon' })
  if (typeof icon === 'string') art.innerHTML = icon
  else if (icon) art.append(icon)
  show(
    h(
      'div',
      { class: 'pf-panel bs-detail' },
      panelHead(title, back, icon ? art : null),
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
    `${t(b.name)} · ${t('Lv {n}', { n: run.boosts[id] ?? 0 })}`,
    boostDetail(id, run.boosts[id] ?? 1),
    t('{rarity} skill', { rarity: rarityName(b.rarity) }),
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
      panelHead(t('Skills & helpers'), close),
      s.pendingPicks > 0 &&
        button(
          t('Pick a skill (+{n})', { n: s.pendingPicks }),
          () => {
            close()
            openPickScreen()
          },
          'primary wide',
        ),
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
let skillsKey = ''
let panelsAt = 0
/** The side panels only show on wide screens (see .bs-side in the CSS); on phones they are never built. */
const sidesShown = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 640px)') : null
sidesShown?.addEventListener('change', () => {
  panelsKey = ''
  skillsKey = ''
})
/**
 * Keeps the wide-screen side panels in step with the run. The stats change on
 * every hit, so they refresh at most 4 times a second; the skills and helpers
 * only when they change.
 */
function renderPanels(s: RunState | null, time: number) {
  if (sidesShown && !sidesShown.matches) return
  if (!s) {
    if (panelsKey === 'none') return
    panelsKey = skillsKey = 'none'
    leftSide.replaceChildren()
    rightSide.replaceChildren()
    return
  }
  const key = [
    s.turn,
    s.phase,
    s.combo,
    s.coins,
    s.level,
    Math.floor(s.xp),
    s.ballCount,
    walletTotal(save, s, banked),
    paused,
  ].join('|')
  if (key !== panelsKey && (time - panelsAt >= 0.25 || panelsKey === '' || panelsKey === 'none')) {
    panelsKey = key
    panelsAt = time
    leftSide.replaceChildren(navPanel(openShopFromBar, openGuideFromBar), statsPanel(s, save.bestTurn))
  }
  const skills = [
    JSON.stringify(s.boosts),
    JSON.stringify(save.helpers),
    s.phase === 'aim' && !paused,
    s.doubleVolleys,
    s.bossesBeaten ?? 0,
  ].join('|')
  if (skills === skillsKey) return
  skillsKey = skills
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

/** Kinds on the board the player hasn't read about, recomputed only when the board changes. */
let unseenKey = ''
/**
 * New brick and pickup kinds wear a "NEW" tag (no pop-up); holding one opens
 * its card. The first time any shows up, one hint says how.
 */
function markNewKinds(s: RunState) {
  const key = `${s.turn}|${s.bricks.length}|${s.pickups.length}|${save.seen.length}`
  if (key === unseenKey) return
  unseenKey = key
  const fresh = newlySeen(s, save.seen).filter((id) => GUIDE.some((g) => g.id === id))
  renderer.unseen = new Set(fresh)
  if (fresh.length && !save.seen.includes(HOLD_HINT)) {
    notices.push({
      id: HOLD_HINT,
      title: t('New blocks!'),
      text: t('Hold a block marked NEW to see what it does.'),
    })
    save = { ...save, seen: [...save.seen, HOLD_HINT] }
    persist()
  }
}
const HOLD_HINT = 'hint:hold'

/** The guide card for what the player is holding (a brick's kind and shape, or a pickup); it is no longer new. */
function guideInfo(ids: string[]) {
  const entries = ids.map((id) => GUIDE.find((g) => g.id === id)).filter((g) => !!g)
  if (!entries.length || panel) return
  dragging = false
  save = { ...save, seen: [...new Set([...save.seen, ...ids])] }
  persist()
  showDetail(
    t(entries[0].name),
    entries.map((g) => t(g.text)).join(' '),
    entries.length > 1
      ? entries
          .slice(1)
          .map((g) => t(g.name))
          .join(' · ')
      : '',
    holdRun(),
    sample(entries[0].id),
  )
}

/** "−N ♥ next turn": what the bricks one row above the line would cost if they crash. */
function crashWarning(s: RunState): HTMLElement | null {
  const line = dims(s).dangerRow
  const damage = breachDamage(
    s,
    s.bricks.filter((b) => b.row >= line - 1),
  )
  return damage > 0
    ? h('span', { class: 'bs-danger-hp', textContent: t('−{n} ♥ next turn', { n: damage }) })
    : null
}

/** Events explained the first time they happen, waiting for the next aim. */
const eventCards: Array<{ id: string; title: string; text: string }> = []

/** The first time a storm wave happens, queue a card that explains it (once per save). Boss attacks are on the boss card. */
function queueEventCard(id: string, title: string, text: string) {
  const key = `event:${id}`
  if (save.seen.includes(key) || eventCards.some((c) => c.id === id)) return
  eventCards.push({ id, title, text })
  save = { ...save, seen: [...save.seen, key] }
  persist()
}

/** A card the player reads and closes: the game waits behind it. */
function showEventCard() {
  const card = eventCards.shift()
  if (!card) return
  const back = holdRun()
  show(
    h(
      'div',
      { class: 'pf-panel bs-event' },
      h(
        'div',
        { class: 'bs-event-head' },
        sample(card.id),
        h('h2', { class: 'pf-heading', textContent: card.title }),
      ),
      h('p', { class: 'pf-lede', textContent: card.text }),
      primary(t('Got it'), back),
    ),
    'event',
  )
}

/** Points at a helper (or the shop) when bricks are about to reach the line. */
function updateDanger() {
  const s = run
  // Not over a boss's entrance either: it shows once the boss has landed.
  const hint =
    s && !paused && !panel && !juice.bossArriving && s.turn !== dangerClosedTurn
      ? dangerHint(s, save.helpers)
      : null
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
      crashWarning(s) ?? '',
      h('span', { textContent: t('{name} can save you.', { name }) }),
      button(t('Use {name}', { name }), () => confirmHelper(hint.use), 'primary'),
      close,
    )
  } else {
    dangerEl.replaceChildren(
      h('strong', { textContent: t('Danger!') }),
      crashWarning(s) ?? '',
      h('span', { textContent: t('Helpers like Push Back can save a run.') }),
      button(t('Shop'), openShopFromBar, 'primary'),
      close,
    )
  }
}

/** Shows the current notice, ticking only while the game is in view. */
function updateNotice(dt: number) {
  // A boss's entrance plays with nothing over it: notices wait (their time doesn't run) until it has landed.
  const quiet = juice.bossArriving
  if (run && !paused && !panel && run.phase !== 'pick' && !quiet) notices.update(dt)
  // Hidden behind screens and during the level-up celebration.
  const n =
    run && !panel && !quiet && (run.phase === 'aim' || run.phase === 'volley') ? notices.current : null
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

/** Before a run: choose the hero (or buy one), then helpers. */
function showHeroes() {
  show(
    h(
      'div',
      { class: 'pf-panel wide bs-shop' },
      panelHead(t('Choose your hero'), showHome, wallet()),
      heroBrowser({
        getSave: () => save,
        setSave: (next) => {
          save = next
          persist()
        },
        onPlay: (id) => (save.run ? showHome() : showHelpers(id)),
        onVoice: (id) => juice.heroVoice(id),
      }),
    ),
    'heroes',
  )
}

/** Before a run: switch on owned helpers (Head Start, Lucky Start). */
const START_HELPERS: StartHelper[] = ['headStart', 'luckyStart', 'powerStart', 'goldStart', 'eagleStart']

function showHelpers(hero: HeroId = equippedHero(save)) {
  const owned = START_HELPERS.filter((k) => save.helpers[k] > 0)
  if (!owned.length) return startRun({}, hero)
  const use: Partial<Record<StartHelper, boolean>> = {}
  const LABEL: Record<StartHelper, string> = {
    headStart: t('Head Start: +5 balls'),
    luckyStart: t('Lucky Start: a free skill'),
    powerStart: t('Power Start: Heavy Hitter ×2'),
    goldStart: t('Gold Start: Gold Rush ×2'),
    eagleStart: t('Eagle Start: Eagle Eye'),
  }
  show(
    h(
      'div',
      { class: 'pf-panel' },
      panelHead(t('Use helpers?'), showHeroes),
      ...owned.map((k) => {
        const box = h('input', { type: 'checkbox', onchange: () => (use[k] = box.checked) })
        return h(
          'label',
          { class: 'bs-toggle' },
          box,
          h('span', { textContent: t('{label} (you have {n})', { label: LABEL[k], n: save.helpers[k] }) }),
        )
      }),
      primary(t('Start'), () => startRun(use, hero)),
    ),
    'helpers',
  )
}

/** What the hero reacts to this frame: where the ball is, what is flying, how bad things look. */
function avatarContext(s: RunState): AvatarContext {
  const d = dims(s)
  const flying = s.balls.filter((b) => b.status === 'flying')
  const lead = flying.reduce<(typeof flying)[number] | null>((a, b) => (!a || b.y < a.y ? b : a), null)
  return {
    homeX: s.phase === 'volley' ? (s.nextLaunchX ?? s.launchX) : s.launchX,
    boardW: d.boardW,
    floorY: d.floorY,
    aim: s.phase === 'aim' && !paused && !panel ? aim : null,
    watch: lead ? { x: lead.x, y: lead.y } : null,
    throwing: s.balls.some((b) => b.status === 'queued'),
    danger: s.bricks.some((b) => b.row >= d.dangerRow - 1),
    lowHealth: s.hp / s.maxHp <= 0.3,
    combo: s.phase === 'volley' ? comboPower(s) : 0,
    // The ball sits in the hero's hand between volleys.
    hold: s.phase === 'volley' ? null : { x: s.launchX, ...restingBall(s) },
  }
}

function beginRun(s: RunState) {
  avatar.reset()
  renderer.resetTween()
  avatar.setHero(s.hero)
  justReset = false
  run = s
  overShown = false
  slotsSeen = boostSlots(s)
  pointsSeen = s.pendingPicks
  juice.turn = s.turn
  juice.setXp(s.level, s.xp / xpToNext(s.level), true)
  juice.setCoins(walletTotal(save, s, banked), true)
  juice.setHealth(s.hp, true)
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

function startRun(use: Partial<Record<StartHelper, boolean>>, hero: HeroId = equippedHero(save)) {
  const seed = params.has('seed') ? Number(params.get('seed')) | 0 : randomSeed()
  const s = createRun(seed, hero)
  juice.heroVoice(hero)
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
      h('strong', { textContent: t('New skill slot!') }),
      h('span', { textContent: t('Boss beaten: you can now hold {n} skills.', { n: slots }) }),
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
/** Opens the pick screen to spend a skill point: only between shots, with nothing else open. */
function openPickScreen() {
  if (!run || paused || panel || juice.bossDying || juice.bossArriving || !openPicks(run)) return
  dragging = false
  checkpoint()
  showPick()
}

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
          'Your skill slots are full ({n}/{max}). Pick one to drop for it. Each boss you beat adds a slot.',
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
          card.append(h('small', { textContent: t('Lv {n}', { n: s.boosts[old] ?? 0 }) }))
          return card
        }),
      ),
    ),
    `pick-swap-${id}`,
  )
}

/** Where the held card sat on this pick screen, so it stays in its place (greyed out). */
let heldAt: number | null = null

function showPick() {
  if (!run) return
  const s = run
  // Keys or clicks meant for the volley that just ended must not pick a card
  // the player hasn't seen yet.
  const shownAt = performance.now()
  const settled = () => performance.now() - shownAt >= PICK_GRACE_MS
  // A card held on this screen stays where it was, greyed out, instead of vanishing.
  const away = s.held && !s.choices.includes(s.held) ? s.held : null
  if (!away) heldAt = null
  const ids = [...s.choices]
  if (away) ids.splice(Math.min(heldAt ?? ids.length, ids.length), 0, away)
  const cards = ids.map((id) => {
    const b = BOOSTS[id]
    const stashed = id === away
    const synergy = isSynergy(s, id)
    const held = s.held === id
    const price = pickCost(s, id)
    const bonus = isInstant(id)
    const owned = bonus ? 0 : (s.boosts[id] ?? 0)
    const swap = needsReplace(s, id)
    const art = h('span', { class: 'bs-card-icon' })
    art.innerHTML = BOOST_ICONS[id]
    const card = h(
      'button',
      {
        class: `pf-btn bs-card ${b.rarity}${bonus ? ' bonus' : ''}${synergy ? ' synergy' : ''}${held ? ' held' : ''}${stashed ? ' stashed' : ''}`,
        type: 'button',
        onclick: () => {
          if (!settled() || stashed) return
          if (needsReplace(s, id)) return showSwap(id)
          takeBoost(id)
        },
      },
      // A bonus pays out when taken: a ribbon in the corner (bonuses can't be held, so it's free).
      bonus && h('span', { class: 'bs-ribbon', textContent: t('BONUS') }),
      art,
      // The card leads with what the skill does; tags only when they add something.
      (owned > 0 || synergy || swap || (held && !stashed)) &&
        h(
          'div',
          { class: 'bs-card-meta' },
          owned > 0 &&
            h('span', {
              class: 'bs-tag up',
              textContent: t('Lv {from} → {to}', { from: owned, to: owned + 1 }),
            }),
          synergy && h('span', { class: 'bs-tag synergy', textContent: t('SYNERGY') }),
          held && !stashed && h('span', { class: 'bs-tag held', textContent: t('HELD') }),
          // Taking it frees a slot first: a small badge, explained once above the cards.
          swap &&
            h('span', { class: 'bs-tag swap', textContent: '⇄', title: t('Replaces one of your skills') }),
        ),
      h('strong', { textContent: t(b.name) }),
      // An upgrade says what the next level does; a new skill says what level 1 does.
      h('span', { textContent: owned > 0 ? boostDetail(id, owned + 1, false) : t(b.text) }),
      // Price, with the rarity quietly to its right; a held card says where it went instead.
      stashed
        ? h('div', { class: 'bs-card-foot bs-stashed' }, icon(LOCK_ICON), t('Held for next level-up'))
        : h(
            'div',
            { class: 'bs-card-foot' },
            h('span', { class: price ? 'bs-price' : 'bs-price free' }, price ? coinAmount(price) : t('FREE')),
            h('small', { class: 'bs-rarity', textContent: rarityName(b.rarity) }),
          ),
    )
    card.disabled = stashed || !canPay(price)
    // A lock in the corner: pay to see this boost again at the next level-up (one at a time).
    const name = t(b.name)
    const holding = holdCost(s, id)
    const lock =
      !s.held &&
      !bonus &&
      h(
        'button',
        {
          class: 'bs-lock',
          type: 'button',
          title: t('Hold {name} for your next level-up', { name }),
          onclick: () => {
            if (!settled() || !pay(holding)) return
            heldAt = s.choices.indexOf(id)
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
  const heading = h('h2', {
    class: 'pf-heading',
    textContent: t('Pick a skill'),
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
  rerollBtn.disabled = !token && !canPay(cost)
  // "Later": the point (and these offers) wait for when the player opens the screen again.
  const later = () => {
    closePicks(s)
    checkpoint()
    show(null)
  }
  show(
    h(
      'div',
      { class: 'pf-panel wide bs-pick' },
      h(
        'div',
        { class: 'bs-shop-head' },
        heading,
        s.pendingPicks > 1 && h('span', { class: 'bs-points', textContent: `+${s.pendingPicks}` }),
        wallet(),
        closeButton(later),
      ),
      slotCallout(s),
      slotStrip(s),
      h('div', { class: 'bs-cards' }, ...cards),
      h('div', { class: 'bs-pick-actions' }, rerollBtn, button(t('Later'), later)),
    ),
    `pick-${s.level}-${s.pendingPicks}-${s.rerollsUsed}-${s.holdsUsed ?? 0}`,
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
        growCard('col', s.cols, s.rows, baseCols(s) >= MAX_COLS, () => choose('col')),
        growCard('row', s.cols, s.rows, baseRows(s) >= MAX_ROWS, () => choose('row')),
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
      h('p', {
        class: 'pf-lede',
        textContent: t('Out of health! Clear the 3 lowest rows, heal to half and keep going.'),
      }),
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
      primary(t('Play again'), showHeroes),
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
    acc += dt * speedMultiplier(s, fast) * juice.timeScale
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
    for (const e of drainEvents(s)) {
      juice.handle(e)
      avatar.handle(e)
      // Storms explain themselves: a warning the turn before, then what this wave does.
      if (e.type === 'stormSoon')
        notices.push({
          id: 'storm:soon',
          title: t('⚡ Storm next turn'),
          text: t('A special wave arrives next turn.'),
        })
      // The boss explains itself once, at the first warning; the countdown banner covers the rest.
      if (e.type === 'bossSoon' && e.turns === BOSS_WARN_TURNS)
        notices.push({
          id: 'boss:soon',
          title: t('☠ Boss in {n} turns', { n: e.turns }),
          text: t('No new rows while it lives. Clear the bottom rows and save a helper for the fight.'),
        })
      if (e.type === 'storm') {
        notices.push({ id: `storm:${e.kind}`, title: t(STORM_TEXT[e.kind]), text: t(STORM_EXPLAIN[e.kind]) })
        queueEventCard(`storm:${e.kind}`, t(STORM_TEXT[e.kind]), t(STORM_EXPLAIN[e.kind]))
      }
    }
    if (!paused) avatar.update(dt, avatarContext(s))
    juice.setBossHp(s.boss?.hp ?? null)
    juice.setHealth(s.hp)
    // Boss fights get their own music and a card explaining the boss.
    if (s.phase !== 'over' && !isPreviewingMusic()) playMusic(s.boss ? BOSS : trackFor(save.equipped.music))
    // A new boss waits on the aim screen until the player has read its card. The card opens
    // only once its entrance (the arena opening, the boss landing) has played out in view.
    if (s.boss && s.boss !== bossAnnounced && s.phase === 'aim' && !panel && !paused && !juice.bossArriving) {
      bossAnnounced = s.boss
      show(
        bossIntro(s.boss, () => show(null)),
        'boss',
      )
    }
    juice.setCoins(walletTotal(save, s, banked))
    juice.setComboXp(s.phase === 'volley' ? xpComboMultiplier(comboPower(s)) : 1)
    juice.setXp(s.level, s.xp / xpToNext(s.level))
    const xpNow = xpTotal(s.level, s.xp)
    juice.gainXp(xpNow - xpSeen)
    xpSeen = xpNow
    // The Skills button carries the waiting points too (phones have no side panel).
    if (s.pendingPicks !== drawerPoints) {
      drawerPoints = s.pendingPicks
      drawerBtn.replaceChildren(
        t('Skills & helpers'),
        ...(drawerPoints > 0 ? [h('span', { class: 'bs-points', textContent: `+${drawerPoints}` })] : []),
      )
    }
    // A new skill point: celebrate once the shot is over (after a boss's death has played out). The
    // pick screen waits until the player opens it (the "+N" pill or the Skills button).
    if (s.pendingPicks < pointsSeen) pointsSeen = s.pendingPicks
    else if (s.pendingPicks > pointsSeen && s.phase !== 'volley' && !juice.bossDying && !juice.bossArriving) {
      pointsSeen = s.pendingPicks
      juice.startLevelUp()
    }
    // A run saved on the pick screen comes back to it.
    if (s.phase === 'pick' && !panel && !juice.bossDying) showPick()
    if (s.phase === 'grow' && panel !== 'grow') showGrow()
    // A new kind of event explains itself once, when the player is next aiming.
    if (
      eventCards.length &&
      s.phase === 'aim' &&
      !panel &&
      !paused &&
      !juice.bossDying &&
      !juice.bossArriving
    )
      showEventCard()
    // The knockout plays out first (see Juice.defeatDone).
    if (s.phase === 'over' && !overShown && juice.defeatDone) {
      overShown = true
      finish(s)
    }
  }
  recallBtn.disabled = !(s && canRecall(s))
  setMusicDuck(s && s.phase === 'volley' && !paused ? 0.6 : 1)
  particles.update(dt)
  shake.update(dt)
  juice.update(dt)
  // The arena closing in after a boss plays once the player is back on the board.
  if (s && s.phase === 'aim' && !panel && !paused && !juice.bossDying) juice.releaseArena()
  if (s && s.phase === 'aim') markNewKinds(s)
  updateNotice(dt)
  updateDanger()
  renderPanels(s, time)
  // The board's shown size: eases between sizes while the arena grows for a boss or shrinks after it.
  const d = s ? renderer.shownDims(s, juice) : boardSize(COLS, ROWS)
  const w = Math.round(d.boardW)
  const hgt = Math.round(d.boardH)
  // While it animates, the canvas keeps its pixel buffer (no reallocation every frame); one exact fit after.
  const moving = juice.arenaMoving
  if (view.width !== w || view.height !== hgt) view.setSize(w, hgt, moving)
  else if (smoothSized && !moving) view.setSize(w, hgt)
  smoothSized = moving
  renderer.draw(s, juice, s && s.phase === 'aim' && !paused ? aim : null, time)
  updateCursor()
})

// ---------- Input ----------
/** Where the mouse is over the board (board units), or null (touch, or off the page). */
let mouseAt: [number, number] | null = null
let cursorShown = ''
/** The cursor says what a click would do: aim, open a chip, or (held) read about a block. */
function updateCursor() {
  const chips = { boss: renderer.bossChip, points: renderer.pointsChip }
  const cursor = run && mouseAt ? hoverCursor(run, ...mouseAt, chips, aiming()) : 'default'
  if (cursor === cursorShown) return
  cursorShown = cursor
  view.canvas.style.cursor = cursor
}
document.addEventListener('pointerleave', () => (mouseAt = null))
const boardPoint = (e: PointerEvent) =>
  toBoard(view.canvas.getBoundingClientRect(), e.clientX, e.clientY, view.width, view.height)
const aimAt = (e: PointerEvent) => aimFromPointer(run!.launchX, ...boardPoint(e), restingBall(run!).y)

const aiming = () =>
  !!run && !paused && run.phase === 'aim' && !juice.bossDying && !juice.bossArriving && !juice.arenaMoving

// Aim and launch work from anywhere on the page, so the guide keeps following
// the pointer in the side gutters. Presses on buttons and panels are theirs.
const UI = '.pf-overlay, .pf-bar, .bs-controls, button, a, input'

// The boss card can be read again mid-fight: tap the "☠ Boss" chip in the HUD,
// or hold still on the boss (a quick tap on it still shoots). Holding a special
// brick or a pickup the same way opens its guide card.
let chipPress = false
let bossPress: { at: [number, number]; timer: ReturnType<typeof setTimeout> } | null = null
function cancelBossPress() {
  if (bossPress) clearTimeout(bossPress.timer)
  bossPress = null
}
function reopenBossCard() {
  if (!run?.boss || panel) return
  dragging = false
  show(
    bossIntro(run.boss, () => show(null), true),
    'boss',
  )
}

window.addEventListener('pointerdown', (e) => {
  if (!aiming() || (e.target as Element).closest?.(UI)) return
  const at = boardPoint(e)
  if (inRect(...at, renderer.bossChip) || inRect(...at, renderer.pointsChip)) {
    chipPress = true
    return
  }
  dragging = true
  aim = aimAt(e)
  if (onBoss(run!, ...at)) bossPress = { at, timer: setTimeout(reopenBossCard, LONG_PRESS_MS) }
  else {
    const ids = guideIdsAt(run!, ...at)
    if (ids.length) bossPress = { at, timer: setTimeout(() => guideInfo(ids), LONG_PRESS_MS) }
  }
})
window.addEventListener('pointermove', (e) => {
  mouseAt = e.pointerType === 'mouse' ? boardPoint(e) : null
  if (bossPress && moved(bossPress.at, boardPoint(e))) cancelBossPress()
  if (!aiming() || (!dragging && e.pointerType !== 'mouse')) return
  aim = aimAt(e)
})
window.addEventListener('pointerup', (e) => {
  cancelBossPress()
  if (chipPress) {
    chipPress = false
    const at = boardPoint(e)
    if (aiming() && inRect(...at, renderer.bossChip)) reopenBossCard()
    else if (aiming() && inRect(...at, renderer.pointsChip)) openPickScreen()
    return
  }
  if (!dragging) return
  dragging = false
  if (!aiming()) return
  aim = aimAt(e)
  fire(run!, aim)
})
window.addEventListener('pointercancel', () => {
  dragging = false
  chipPress = false
  cancelBossPress()
})

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return
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
