import {
  bestScores,
  bindInput,
  createCanvas2D,
  createGameApp,
  playSound,
  smoothState,
  startRenderLoop,
} from '@forge'
import type { Session } from '@forge/net/session'
import { t } from './i18n'
import { DriftRenderer, HEIGHT, WIDTH } from './render'
import { displayScore, phantomDrift, type DriftInput, type DriftState } from './sim'
import { DRIFT_SOUNDS, DRIFT_TRACK } from './sounds'

const best = bestScores('phantom-drift')
/** Set when the last run beat this browser's best (read by `outcome`). */
let newBest = false

const SWIPE = 24

/** Touch / mouse: tap a side or swipe to move, swipe up or tap the ring to go Phantom. */
function bindPointer(canvas: HTMLCanvasElement, send: (i: DriftInput) => void): () => void {
  let start: { x: number; y: number } | null = null
  let swiped = false
  const logical = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * WIDTH, ((e.clientY - r.top) / r.height) * HEIGHT]
  }
  const down = (e: PointerEvent) => {
    start = { x: e.clientX, y: e.clientY }
    swiped = false
  }
  const move = (e: PointerEvent) => {
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return
    if (Math.abs(dx) > Math.abs(dy)) send(dx > 0 ? 'right' : 'left')
    else if (dy < 0) send('phase')
    start = { x: e.clientX, y: e.clientY } // chain swipes in one drag
    swiped = true
  }
  const up = (e: PointerEvent) => {
    if (start && !swiped) {
      const [x, y] = logical(e)
      send(DriftRenderer.meterHit(x, y) ? 'phase' : x < WIDTH / 2 ? 'left' : 'right')
    }
    start = null
  }
  const cancel = () => (start = null)
  canvas.style.touchAction = 'none'
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', cancel)
  return () => {
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointercancel', cancel)
  }
}

function mount(session: Session<DriftState, DriftInput>, stage: HTMLElement): () => void {
  const view = createCanvas2D(stage, WIDTH, HEIGHT, { maxDpr: 2 })
  view.canvas.setAttribute('role', 'img')
  view.canvas.setAttribute('aria-label', t('Phantom Drift rift'))
  const smooth = smoothState(session)
  const renderer = new DriftRenderer(view, smooth)
  newBest = false

  const offState = session.on('state', (s) => {
    renderer.onState(s)
    for (const e of s.events) {
      if (e.type in DRIFT_SOUNDS) playSound(DRIFT_SOUNDS[e.type as keyof typeof DRIFT_SOUNDS])
      if (e.type === 'over') newBest = best.save(displayScore(s))
    }
  })
  const send = (input: DriftInput) => session.sendInput(input)
  const stopKeys = bindInput<DriftInput>(
    {
      keys: {
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
        Space: 'phase',
        ArrowUp: 'phase',
        KeyW: 'phase',
      },
    },
    send,
  )
  const stopPointer = bindPointer(view.canvas, send)
  const stopRender = startRenderLoop((dt) => renderer.frame(dt))
  return () => {
    offState()
    smooth.dispose()
    stopKeys()
    stopPointer()
    stopRender()
    view.destroy()
  }
}

createGameApp<DriftState, DriftInput>({
  def: phantomDrift,
  title: 'Phantom Drift',
  tagline: t('Drift through the rift. Dodge, graze, go Phantom.'),
  controls: t(
    'Move with ←/→ or A/D, swipe, or tap either side. Space, ↑ or swipe up turns you Phantom when the ring is full.',
  ),
  music: DRIFT_TRACK,
  mount,
  scores: (s) => [{ id: s.player.id, score: displayScore(s), out: s.over }],
  outcome(s) {
    const score = displayScore(s).toLocaleString()
    if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
    return {
      headline: t('{score} points. Your best: {best}', { score, best: best.load().toLocaleString() }),
      result: 'done',
    }
  },
})
