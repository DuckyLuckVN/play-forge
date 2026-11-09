import {
  bestScores,
  bindGestures,
  bindInput,
  clamp,
  createGameApp,
  playSound,
  smoothState,
  startRenderLoop,
  type Point,
} from '@forge'
import type { Session } from '@forge/net/session'
import { webglAvailable } from '@forge/render3d'
import { toast } from '@forge/ui/dom'
import './phantom-drift.css'
import { characterStore, perksOf, UnlockWatch, type Character } from './characters'
import { meterHit } from './hud'
import { t } from './i18n'
import { createView2D } from './render'
import { Drift3D } from './render3d'
import { characterPicker } from './picker'
import { createState, displayScore, phantomDrift, type DriftInput, type DriftState } from './sim'
import { DRIFT_TRACK, eventSound, HEARTBEAT_TICKS, MORE_SOUNDS } from './sounds'
import { Moments } from './moments'
import { summaryRows } from './stats'
import type { DriftView } from './view'

const best = bestScores('phantom-drift')
const characters = characterStore()
/** Who plays the next run (picked on the start screen, kept in this browser). */
let character: Character = characters.load(best.load())
/** Characters this run's score unlocked (for the banner and the results). */
const unlocks = new UnlockWatch(best.load())

/** Built and warmed while the menu shows, then reused by every run. */
let drift3d: Drift3D | null = null
async function preload(): Promise<void> {
  if (!webglAvailable()) return
  const view = new Drift3D()
  await view.warm()
  drift3d = view
}
/** Set when the last run beat this browser's best (read by `outcome`). */
let newBest = false

/**
 * Touch / mouse: swipe left/right = one lane, swipe up = Phantom; tap a side to
 * step or the ring to go Phantom; hold = glide to the lane under your finger
 * and follow it (one lane per input, so the normal slide speed still applies).
 */
function bindPointer(view: DriftView, state: () => DriftState | null, send: (i: DriftInput) => void) {
  /** Lane asked for during this hold; null = not following (hold began on the ring). */
  let aim: number | null = null
  const follow = ({ x }: Point) => {
    const s = state()
    if (aim === null || !s) return
    // Screen x split evenly across the lanes: close enough to both views' tracks.
    const p = view.hudPoint(x, 0)
    const want = clamp(Math.floor((p.x / p.w) * s.lanes), 0, s.lanes - 1)
    aim = clamp(aim, 0, s.lanes - 1)
    for (; aim < want; aim++) send('right')
    for (; aim > want; aim--) send('left')
  }
  const onRing = ({ x, y }: Point) => {
    const p = view.hudPoint(x, y)
    return meterHit(p.x, p.y, p.w, p.h)
  }
  return bindGestures(
    {
      onSwipe: (dir) => {
        if (dir === 'left' || dir === 'right') send(dir)
        else if (dir === 'up') send('phase')
      },
      onTap: (pt) => {
        const p = view.hudPoint(pt.x, pt.y)
        send(onRing(pt) ? 'phase' : p.x < p.w / 2 ? 'left' : 'right')
      },
      onHold: (pt) => {
        aim = null
        if (onRing(pt)) return send('phase')
        aim = state()?.player.target ?? null
        follow(pt)
      },
      onHoldMove: follow,
    },
    { target: view.surface },
  )
}

function mount(session: Session<DriftState, DriftInput>, stage: HTMLElement): () => void {
  const smooth = smoothState(session)
  // Full 3D where WebGL2 works; the 2D rift otherwise.
  // The 3D view is built and warmed once (preload); the 2D rift is the fallback.
  const view: DriftView = drift3d
    ? drift3d.attach(stage, smooth, character)
    : createView2D(stage, smooth, character)
  view.surface.setAttribute('role', 'img')
  view.surface.setAttribute('aria-label', t('Phantom Drift rift'))
  newBest = false
  let lastBeat = -Infinity
  let lastTick = -1
  const moments = new Moments(best.load(), t)
  unlocks.reset(best.load())

  const offState = session.on('state', (s) => {
    view.onState(s)
    // A new run (play again): count unlocks from the best so far.
    if (s.tick < lastTick) unlocks.reset(best.load())
    lastTick = s.tick
    for (const e of s.events) {
      const sound = eventSound(e, s)
      if (sound) playSound(sound)
      if (e.type === 'over') {
        newBest = best.save(displayScore(s))
        moments.setBest(best.load())
        for (const c of unlocks.unlocked) toast(t('Unlocked: {name}!', { name: t(c.name) }), c.colors.rim)
      }
    }
    // Crossing an unlock score mid-run: a big moment, right then.
    if (s.diedAt === null)
      for (const c of unlocks.update(displayScore(s))) {
        view.banner({ text: t('Unlocked: {name}!', { name: t(c.name) }), color: c.colors.rim, big: true })
        playSound(MORE_SOUNDS.fanfare)
      }
    for (const m of moments.update(s)) {
      view.banner(m)
      if (m.big) playSound(MORE_SOUNDS.fanfare)
    }
    // Last heart: a heartbeat until you heal (tick-driven, so it pauses too).
    if (s.tick < lastBeat) lastBeat = -Infinity
    if (s.player.hearts === 1 && !s.over && s.tick - lastBeat >= HEARTBEAT_TICKS) {
      lastBeat = s.tick
      playSound(MORE_SOUNDS.heartbeat)
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
  const stopPointer = bindPointer(view, () => session.state, send)
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

createGameApp<DriftState, DriftInput>({
  // Each run starts with the picked character's perks (kept in the state, so
  // the sim stays pure and deterministic).
  def: { ...phantomDrift, setup: (players, seed) => createState(players, seed, perksOf(character)) },
  // The score climbs every moment; the HUD has its own pop.
  bumpScores: false,
  title: 'Phantom Drift',
  tagline: t('Drift through the rift. Dodge, graze, go Phantom.'),
  controls: t(
    'Move with ←/→ or A/D, swipe, tap either side, or hold and slide. Space, ↑ or swipe up turns you Phantom when the ring is full.',
  ),
  music: DRIFT_TRACK,
  preload,
  mount,
  menuExtras: () =>
    characterPicker({
      best: best.load(),
      selected: character,
      onPick(c) {
        character = c
        characters.save(c)
      },
    }),
  scores: (s) => [{ id: s.player.id, score: displayScore(s), out: s.over }],
  outcome(s) {
    const score = displayScore(s).toLocaleString()
    if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
    return {
      headline: t('{score} points. Your best: {best}', { score, best: best.load().toLocaleString() }),
      result: 'done',
    }
  },
  summary: (s) => [
    ...unlocks.unlocked.map((c) => ({ label: t('New ghost'), value: t(c.name), highlight: true })),
    ...summaryRows(s, t),
  ],
})
