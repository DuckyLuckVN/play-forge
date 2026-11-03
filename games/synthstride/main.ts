import { bestScores, bindInput, createGameApp, playSound, smoothState, startRenderLoop } from '@forge'
import type { Session } from '@forge/net/session'
import { skillRingHit } from '@forge/reflex/hud2d'
import { t } from './i18n'
import { Moments } from './moments'
import { createView, HEIGHT, WIDTH, type StrideView } from './render'
import { displayScore, synthstride, type StrideInput, type StrideState } from './sim'
import { eventSound, STRIDE_SOUNDS } from './sounds'
import { summaryRows } from './stats'

const best = bestScores('synthstride')
let newBest = false

const SWIPE = 24

/** Touch: swipe to step (chain swipes in one drag); tap the ring for the Drop. */
function bindPointer(view: StrideView, send: (i: StrideInput) => void): () => void {
  const el = view.surface
  let start: { x: number; y: number } | null = null
  const down = (e: PointerEvent) => {
    const { x, y } = view.point(e.clientX, e.clientY)
    if (skillRingHit(x, y, WIDTH, HEIGHT)) {
      send('drop')
      start = null
      return
    }
    start = { x: e.clientX, y: e.clientY }
  }
  const move = (e: PointerEvent) => {
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return
    send(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    start = { x: e.clientX, y: e.clientY }
  }
  const end = () => (start = null)
  el.style.touchAction = 'none'
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', end)
    el.removeEventListener('pointercancel', end)
  }
}

function mount(session: Session<StrideState, StrideInput>, stage: HTMLElement): () => void {
  const smooth = smoothState(session)
  const view = createView(stage, smooth, {
    tap: t('TAP'),
    rating: { perfect: t('PERFECT'), good: t('GOOD'), off: t('OFF BEAT') },
  })
  view.surface.setAttribute('role', 'img')
  view.surface.setAttribute('aria-label', t('Synthstride dance floor'))
  newBest = false
  const moments = new Moments(best.load(), t)

  const offState = session.on('state', (s) => {
    view.onState(s)
    for (const e of s.events) {
      const sound = eventSound(e, s)
      if (sound) playSound(sound)
      if (e.type === 'over') {
        newBest = best.save(displayScore(s))
        moments.setBest(best.load())
      }
    }
    for (const m of moments.update(s)) {
      view.banner(m)
      if (m.big) playSound(STRIDE_SOUNDS.fanfare)
    }
  })
  const send = (input: StrideInput) => session.sendInput(input)
  const stopKeys = bindInput<StrideInput>(
    {
      keys: {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
        Space: 'drop',
      },
    },
    send,
  )
  const stopPointer = bindPointer(view, send)
  const stopRender = startRenderLoop((dt) => view.frame(dt))
  return () => {
    offState()
    smooth.dispose()
    stopKeys()
    stopPointer()
    stopRender()
    view.destroy()
  }
}

createGameApp<StrideState, StrideInput>({
  def: synthstride,
  title: 'Synthstride',
  tagline: t('Step to the beat. Dodge what lands on it.'),
  controls: t(
    'Step with the arrows or WASD, or swipe. Moves on the beat score and build your groove. Glowing tiles strike on the beat. Space or the ring starts the Drop when full.',
  ),
  // The soundtrack is played from the game's own beats (see sounds.ts).
  music: null,
  mount,
  scores: (s) => [{ id: s.playerId, score: displayScore(s), out: s.over }],
  outcome(s) {
    const score = displayScore(s).toLocaleString()
    if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
    return {
      headline: t('{score} points. Your best: {best}', { score, best: best.load().toLocaleString() }),
      result: 'done',
    }
  },
  summary: (s) => summaryRows(s, t),
})
