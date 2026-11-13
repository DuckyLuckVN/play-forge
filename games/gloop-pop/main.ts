import { formatNumber } from '@forge/core/i18n'
import {
  bestScores,
  bindGestures,
  buttonClass,
  createCanvas2D,
  createGameApp,
  h,
  playMusic,
  playSound,
  prefersTouch,
  setLabel,
  startRenderLoop,
  toast,
  type Session,
} from '@forge'
import { gloopsByColor, inDanger, isGloop } from './grid'
import './gloop-pop.css'
import { t } from './i18n'
import { AutoRepeat, KEYMAP, REPEATS, type Action } from './input'
import { GloopRenderer } from './render'
import { boardOf, gloopGame, isRace, type GloopInput, type GloopState } from './sim'
import { comboWord } from './look'
import { comboSound, FIZZ, FIZZ_PANIC, GLOOP_SOUNDS, matchSound, popSequence, popSound } from './sounds'

const best = bestScores('gloop-pop')
/** Set when the last solo run beat this browser's best (read by `outcome`). */
let newBest = false
/** Seconds between danger beeps while the jar is nearly full. */
const DANGER_EVERY = 1.1

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const PAD_ICONS: Record<Action, string> = {
  left: svg('<path d="m15 5-7 7 7 7"/>'),
  right: svg('<path d="m9 5 7 7-7 7"/>'),
  turnL: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  turnR: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  soft: svg('<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>'),
  drop: svg('<path d="m6 5 6 6 6-6"/><path d="m6 12 6 6 6-6"/><path d="M5 21h14"/>'),
}
const PAD_LABELS: Record<Action, () => string> = {
  left: () => t('Move left'),
  right: () => t('Move right'),
  turnL: () => t('Turn left'),
  turnR: () => t('Turn right'),
  soft: () => t('Drop faster'),
  drop: () => t('Drop'),
}

function mount(session: Session<GloopState, GloopInput>, stage: HTMLElement): () => void {
  const selfId = session.selfId
  const host = h('div', { class: 'gloop-board' })
  const pad = h('div', { class: 'gloop-pad' })
  const root = h('div', { class: 'gloop' }, host, pad)
  stage.append(root)

  const view = createCanvas2D(host, 520, 620, { maxDpr: 2 })
  view.canvas.classList.add('gloop-canvas')
  view.canvas.setAttribute('role', 'img')
  view.canvas.setAttribute('aria-label', t('Gloop jar'))
  const speedKey = () => session.state?.speed ?? 'medium'
  const renderer = new GloopRenderer(view, selfId, () => best.load(speedKey()))

  const mine = () => (session.state ? boardOf(session.state, selfId) : undefined)
  const canAct = () =>
    session.phase === 'playing' && !session.lobby.paused && !session.state?.over && !!mine()

  // ---------- Actions ----------
  const send = (input: GloopInput) => {
    if (canAct()) session.sendInput(input)
  }
  const fire = (a: Action) => {
    switch (a) {
      case 'left':
        return send({ t: 'move', dx: -1 })
      case 'right':
        return send({ t: 'move', dx: 1 })
      case 'turnL':
        return send({ t: 'rot', dir: 1 })
      case 'turnR':
        return send({ t: 'rot', dir: -1 })
      case 'drop':
        return send({ t: 'drop' })
      case 'soft':
        return send({ t: 'soft', on: true })
    }
  }
  const repeat = new AutoRepeat<Action>(fire)
  const press = (a: Action) => (REPEATS.has(a) ? repeat.press(a) : fire(a))
  const release = (a: Action) => {
    if (REPEATS.has(a)) repeat.release(a)
    else if (a === 'soft') send({ t: 'soft', on: false })
  }
  const releaseAll = () => {
    repeat.releaseAll()
    if (canAct()) session.sendInput({ t: 'soft', on: false })
  }

  // ---------- Keyboard ----------
  const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest?.('input, textarea, .pf-overlay')
  const onKeyDown = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code]
    if (!a || typing(e) || !canAct()) return
    e.preventDefault()
    if (e.repeat) return
    press(a)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    const a = KEYMAP[e.code]
    if (a) release(a)
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseAll)

  // ---------- Touch: a game pad under the jar, plus tap to turn / swipe down to drop on the jar ----------
  const padKeys: Action[] = ['left', 'right', 'soft', 'turnL', 'turnR', 'drop']
  for (const a of padKeys) {
    const b = h('button', { class: buttonClass(a === 'drop' ? 'primary' : ''), type: 'button' })
    b.classList.add('gloop-key', `gloop-key-${a}`)
    b.innerHTML = PAD_ICONS[a]
    setLabel(b, PAD_LABELS[a]())
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      b.setPointerCapture?.(e.pointerId)
      press(a)
    })
    const up = () => release(a)
    b.addEventListener('pointerup', up)
    b.addEventListener('pointercancel', up)
    b.addEventListener('lostpointercapture', up)
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    pad.append(b)
  }
  pad.hidden = !prefersTouch()
  const stopGestures = bindGestures(
    {
      onTap: () => fire('turnR'),
      onSwipe: (dir) => {
        if (dir === 'down') fire('drop')
        else if (dir === 'left') fire('left')
        else if (dir === 'right') fire('right')
        else fire('turnL')
      },
    },
    { target: view.canvas, threshold: 24 },
  )

  // ---------- State → sounds ----------
  let wasOver = false
  let dangerAt = 0
  /** Gloops popped by the current capsule (for the combo cheers). */
  let capsuleGloops = 0
  /** Panic music while the bottle is nearly full; it calms down 1.5 s after the danger passes. */
  let panic = false
  let calm = 0
  const offState = session.on('state', (s) => {
    renderer.onState(s)
    const me = boardOf(s, selfId)
    for (const e of s.events) {
      if (e.type === 'attack') {
        if (e.from === selfId) playSound(GLOOP_SOUNDS.send)
        else if (me && me.phase !== 'out' && me.phase !== 'won') playSound(GLOOP_SOUNDS.warn)
        continue
      }
      if (e.p !== selfId) {
        if (e.type === 'out' && isRace(s)) {
          const b = boardOf(s, e.p)
          if (b && !b.left && b.id !== selfId) toast(t("{name}'s jar is full!", { name: b.name }))
        }
        continue
      }
      switch (e.type) {
        case 'move':
          playSound(GLOOP_SOUNDS.move)
          break
        case 'rotate':
          playSound(GLOOP_SOUNDS.rotate)
          break
        case 'blocked':
          playSound(GLOOP_SOUNDS.blocked, 0.7)
          break
        case 'land':
          capsuleGloops = 0
          playSound(e.slam > 1 ? GLOOP_SOUNDS.slam : GLOOP_SOUNDS.land)
          break
        case 'match':
          playSound(matchSound(e.chain))
          break
        case 'pop': {
          playSound(popSound(e.chain))
          playSound(
            popSequence(
              e.chain,
              e.cells.map(([, v]) => isGloop(v)),
            ),
          )
          const popped = e.gloops.reduce((a, n) => a + n, 0)
          if (popped) playSound(GLOOP_SOUNDS.squeak)
          const word = comboWord(capsuleGloops, (capsuleGloops += popped))
          if (word) playSound(comboSound(word))
          if (me?.gloops === 1 && popped) playSound(GLOOP_SOUNDS.lastOne)
          const left = gloopsByColor(me?.cells ?? [])
          if (me && me.gloops > 0 && e.gloops.some((n, c) => n && !left[c])) playSound(GLOOP_SOUNDS.colorDone)
          break
        }
        case 'junk':
          playSound(GLOOP_SOUNDS.junk)
          break
        case 'clear':
          playSound(GLOOP_SOUNDS.clear)
          break
        case 'level':
          playSound(GLOOP_SOUNDS.newJar)
          break
        case 'out':
          playSound(GLOOP_SOUNDS.out)
          break
      }
    }
    if (s.over && !wasOver && me && !isRace(s)) newBest = best.save(me.score, s.speed)
    wasOver = s.over
    if (!canAct()) repeat.releaseAll()
  })
  const offLobby = session.on('lobby', () => repeat.releaseAll())

  const stopRender = startRenderLoop((dt) => {
    renderer.frame(dt)
    const me = mine()
    if (canAct() && me?.phase === 'fall' && inDanger(me.cells)) {
      dangerAt -= dt
      if (dangerAt <= 0) {
        playSound(GLOOP_SOUNDS.danger)
        dangerAt = DANGER_EVERY
      }
    } else dangerAt = 0
    const alive = me && me.phase !== 'out' && me.phase !== 'won'
    if (canAct() && alive && inDanger(me.cells)) {
      calm = 0
      panic = true
      playMusic(FIZZ_PANIC) // cheap when already playing; also wins back from a lobby update
    } else if (panic && ((calm += dt) > 1.5 || !canAct())) {
      panic = false
      if (session.phase === 'playing') playMusic(FIZZ)
    }
  })

  return () => {
    offState()
    offLobby()
    stopGestures()
    stopRender()
    repeat.releaseAll()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', releaseAll)
    view.destroy()
    root.remove()
  }
}

createGameApp<GloopState, GloopInput>({
  def: gloopGame,
  title: 'Gloop Pop',
  tagline: t('Drop fizzy capsules, line up 4 of a colour and pop every gloop in the jar.'),
  guide: [
    {
      action: t('Move'),
      keys: [
        ['Left', 'Right'],
        ['A', 'D'],
      ],
      touch: 'button',
      touchLabel: t('arrows'),
    },
    { action: t('Turn'), keys: [['Up'], ['Z', 'X']], touch: 'tap', touchLabel: t('the jar') },
    { action: t('Drop faster'), keys: [['Down']], hold: true, touch: 'button' },
    { action: t('Drop'), keys: [['Space']], touch: 'swipe', touchLabel: t('down') },
    {
      action: t('4 in a row of one colour pop'),
      note: t('Pop every gloop to clear the jar. Chains score big!'),
      tip: true,
    },
  ],
  music: FIZZ,
  mount,
  scores: (s) =>
    s.boards
      .filter((b) => b.kind === 'human')
      .map((b) => ({ id: b.id, score: b.score, out: b.phase === 'out' })),
  outcome(s, selfId) {
    const me = boardOf(s, selfId)
    if (!isRace(s)) {
      const score = formatNumber(me?.score ?? 0)
      if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
      return {
        headline: t('{score} points. Your best: {best}', { score, best: formatNumber(best.load(s.speed)) }),
        result: 'done',
      }
    }
    if (!s.winner) return { headline: t("It's a tie!"), result: 'draw' }
    const winner = boardOf(s, s.winner)!
    if (winner.id === selfId) return { headline: t('You win!'), result: 'win' }
    if (winner.kind === 'ai') return { headline: t('The computer wins. Rematch?'), result: 'lose' }
    return { headline: t('{name} wins!', { name: winner.name }), result: me ? 'lose' : 'done' }
  },
  summary(s, selfId) {
    const me = boardOf(s, selfId)
    if (!me) return []
    return [
      { label: t('Level'), value: String(me.level + 1) },
      { label: t('Gloops popped'), value: formatNumber(me.stats.popped) },
      { label: t('Best chain'), value: `×${me.stats.bestChain}`, highlight: me.stats.bestChain >= 3 },
      { label: t('Jars cleared'), value: formatNumber(me.stats.cleared) },
    ]
  },
})
