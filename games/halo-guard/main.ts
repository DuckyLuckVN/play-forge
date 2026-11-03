import { bestScores, bindInput, createGameApp, playSound, smoothState, startRenderLoop } from '@forge'
import type { Session } from '@forge/net/session'
import { skillRingHit } from '@forge/reflex/hud2d'
import { t } from './i18n'
import { Moments } from './moments'
import { createView, HEIGHT, laneAt, WIDTH, type GuardView } from './render'
import { displayScore, haloGuard, type GuardInput, type GuardState } from './sim'
import { eventSound, GUARD_SOUNDS, GUARD_TRACK, HEARTBEAT_TICKS } from './sounds'
import { summaryRows } from './stats'

const best = bestScores('halo-guard')
let newBest = false

const LANE_INPUT: GuardInput[] = ['up', 'right', 'down', 'left']
const SWIPE = 24

/**
 * Touch / mouse: press toward a lane (relative to the core) to guard it, at
 * once on pointer-down for the fastest response; swipes work too. The ring is Nova.
 */
function bindPointer(view: GuardView, send: (i: GuardInput) => void): () => void {
  const el = view.surface
  let start: { x: number; y: number } | null = null
  const down = (e: PointerEvent) => {
    const { x, y } = view.point(e.clientX, e.clientY)
    start = { x: e.clientX, y: e.clientY }
    send(skillRingHit(x, y, WIDTH, HEIGHT) ? 'nova' : LANE_INPUT[laneAt(x, y)])
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

function mount(session: Session<GuardState, GuardInput>, stage: HTMLElement): () => void {
  const smooth = smoothState(session)
  const view = createView(stage, smooth, { tap: t('TAP'), perfect: t('perfect') })
  view.surface.setAttribute('role', 'img')
  view.surface.setAttribute('aria-label', t('Halo Guard arena'))
  newBest = false
  let lastBeat = -Infinity
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
      if (m.big) playSound(GUARD_SOUNDS.fanfare)
    }
    if (s.tick < lastBeat) lastBeat = -Infinity
    if (s.vitals.hearts === 1 && s.diedAt === null && s.tick - lastBeat >= HEARTBEAT_TICKS) {
      lastBeat = s.tick
      playSound(GUARD_SOUNDS.heartbeat)
    }
  })
  const send = (input: GuardInput) => session.sendInput(input)
  const stopKeys = bindInput<GuardInput>(
    {
      keys: {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowRight: 'right',
        KeyD: 'right',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        Space: 'nova',
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

createGameApp<GuardState, GuardInput>({
  def: haloGuard,
  title: 'Halo Guard',
  tagline: t('Turn the shield. Parry at the last instant. Let the sparks in.'),
  controls: t(
    'Face a lane with the arrows or WASD, or tap / swipe toward it. Turn just before impact for a perfect parry. Space or the ring fires Nova when full.',
  ),
  music: GUARD_TRACK,
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
