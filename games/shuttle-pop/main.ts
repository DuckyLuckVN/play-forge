import { createGameApp, h, landscapeGuard, smoothState, type Session } from '@forge'
import { ARCADE } from '@forge/audio/tracks'
import { webglAvailable } from '@forge/render3d'
import './shuttle-pop.css'
import { t } from './i18n'
import { TouchPad } from './hud'
import { bindInput } from './input'
import { loadPreset, pickerStrip } from './picker'
import { GuestPredictor } from './predict'
import { Court3D, type LocalSwing } from './render3d'
import { scoreText, summaryRows } from './results'
import { winner } from './rules'
import {
  canCharge,
  canSwing,
  createState,
  seedPreset,
  shownName,
  shuttlePopGame,
  TAPPED,
  type SpInput,
  type SpState,
} from './sim'
import { swingTick } from './world'

/** Built and warmed while the menu shows, then reused by every match. */
let court: Court3D | null = null
/** This page's player id while it hosts (setup runs on the host only, after mount). */
let hostId: string | null = null
async function preload(): Promise<void> {
  if (!webglAvailable()) return
  const view = new Court3D()
  await view.warm()
  court = view
}

function mount(session: Session<SpState, SpInput>, stage: HTMLElement): () => void {
  if (!court) {
    const note = h('p', { class: 'sp-nogl', textContent: t('Shuttle Pop needs WebGL to run.') })
    stage.append(note)
    return () => note.remove()
  }
  hostId = session.isHost ? session.selfId : null
  const smooth = smoothState(session)
  let onSwing: ((what: LocalSwing) => void) | null = null
  // sendInput drops inputs during the countdown and while paused.
  const live = () => session.phase === 'playing' && !session.lobby.paused
  // Online guests predict their own player (the host and vs-computer already see their state at once).
  const predictor = session.isHost || session.offline ? null : new GuestPredictor()
  const detach = court.attach(stage, smooth, session.selfId, (cb) => (onSwing = cb), predictor, live)
  court.surface.setAttribute('role', 'img')
  court.surface.setAttribute('aria-label', t('Badminton court'))

  // The last state's view of our seat: may it charge (rally / own serve), would a swing count (also off
  // cooldown)? Else the sim ignores it.
  const seatCan = (can: typeof canSwing) => {
    const s = smooth.curr
    const me = s?.players.find((p) => p.id === session.selfId)
    return !!s && !!me && can(s, me)
  }
  const send = (input: SpInput) => {
    // Animate our own swing button this frame (not when the session or the sim would drop it); the
    // prediction slows with the charge and moves with exactly the moves the host gets.
    if (input.t === 'charge') {
      if (input.cancel) {
        predictor?.setCharging(false)
        onSwing?.('cancel')
      } else if (live() && seatCan((s, me) => canCharge(s, me) && me.chargeAt !== TAPPED)) {
        // (A press already swung as a tap waits for its button-up: e.g. a resync while still held.)
        predictor?.setCharging(true)
        onSwing?.('charge')
      } else return // the host would ignore it: don't send (no slow-down disagreement with the prediction)
    } else if (input.t === 'swing') {
      predictor?.setCharging(false)
      // A press that already swung as a tap (sim tapOnPress): its button-up is no second swing.
      const counts = live() && seatCan((s, me) => canSwing(s, me) && me.chargeAt !== TAPPED)
      onSwing?.(counts ? 'swing' : 'cancel')
    } else if (input.t === 'move' && live()) predictor?.setMove(input.x, input.z)
    session.sendInput(input)
  }
  // Touch: floating stick (left) + swing button (bottom-right), over the court.
  const pad = new TouchPad()
  court.surface.append(pad.root)
  // Every human swing carries the tick on screen (the host rewinds up to MAX_REWIND): a guest's covers
  // its lag, the host's own its interpolation (0–1 ticks), so both sides get screen-aligned timing.
  const seen = () => (smooth.curr ? swingTick(smooth.curr.tick, smooth.alpha()) : undefined)
  const input = bindInput(court.surface, send, seen, pad)
  // Our character on every play start (inputs are dropped before). The host's look is already seeded
  // in setup; a guest's shows from "Go!". Idempotent, so resumes may resend it.
  const pick = () => session.sendInput({ t: 'pick', preset: loadPreset() })
  // Phones play in landscape. Upright: the rotate card covers the court and held controls let go;
  // vs the computer also pauses (like a hidden tab: Resume from the pause screen after rotating).
  // Online play can't pause, so it keeps running under the card.
  // Only during a match: the room lobby and the results stay usable upright.
  let portrait = false
  // A microtask later: at "Go!" the session emits 'playing' before it starts its ticker, so a
  // pause from inside that lobby event would be undone by the ticker starting after it.
  // TODO(engine): Session.start()/runCountdown() call setPhase('playing') (which emits 'lobby') and
  // only then startSimulation(), which starts the ticker without checking lobby.paused. A
  // setPaused(true) from a lobby listener at "Go!" therefore leaves the lobby paused but the sim
  // running. Fix in engine/net/session.ts (start the ticker before announcing 'playing', or have
  // startSimulation honour `paused`), add a session regression test, then drop this microtask.
  // Not changed here: reordering Session touches every game.
  const pauseIfUpright = () =>
    queueMicrotask(() => {
      if (portrait && session.offline && live()) session.setPaused(true)
    })
  let offGuard: (() => void) | null = null
  const guardMatch = () => {
    const inMatch = session.phase === 'countdown' || session.phase === 'playing'
    if (inMatch && !offGuard) {
      offGuard = landscapeGuard(stage, (upright) => {
        portrait = upright
        if (!upright) return
        input.release()
        pauseIfUpright()
      })
    } else if (!inMatch && offGuard) {
      offGuard()
      offGuard = null
      portrait = false
    }
  }
  guardMatch()
  // While playing, the stage takes every touch (no page scroll / pinch zoom around the court).
  stage.classList.toggle('sp-playing', live())
  const noPinch = (e: Event) => {
    if (live()) e.preventDefault()
  }
  // iOS Safari pinch-zooms despite touch-action; its gesture events must be cancelled (non-passive).
  document.addEventListener('gesturestart', noPinch, { passive: false })
  // Play starting or resuming: re-send the held keys (a key held through "Go!" moves you, one let
  // go during a pause stops you) and our character.
  let wasLive = live()
  if (wasLive) pick()
  const offLobby = session.on('lobby', () => {
    guardMatch()
    // Countdown ended (or resumed) while upright: straight back to paused.
    pauseIfUpright()
    const now = live()
    stage.classList.toggle('sp-playing', now)
    if (now && !wasLive) {
      input.resync()
      pick()
    }
    // Paused or over: drop the stick and the button (a finger held through the pause can't stick).
    if (!now && wasLive) input.release()
    wasLive = now
  })
  return () => {
    hostId = null
    offLobby()
    offGuard?.()
    document.removeEventListener('gesturestart', noPinch)
    stage.classList.remove('sp-playing')
    input.stop()
    pad.root.remove()
    detach()
    smooth.dispose()
  }
}

createGameApp<SpState, SpInput>({
  // The host's stored look is in the state from the countdown on (no pop at "Go!").
  def: {
    ...shuttlePopGame,
    setup(players, seed, options) {
      const state = createState(players, seed, options)
      if (hostId) seedPreset(state, hostId, loadPreset())
      return state
    },
  },
  title: 'Shuttle Pop',
  // Same line as the launcher card.
  tagline: t(
    'Chibi badminton. Time your swing for a Perfect, smash on high balls. Play the computer or a friend online.',
  ),
  controls: t(
    'Move with WASD or the arrow keys. Swing with Space, J or a click: tap for a quick swing, or hold to charge a power shot and let go to hit (you move slower while charging). Hold forward as you swing to smash or drive, back to clear, nothing to drop; left or right aims. On a phone: drag on the left side to move, tap or hold the racket button to swing; the stick direction picks the shot the same way.',
  ),
  // Stock upbeat gameplay loop.
  music: ARCADE,
  preload,
  mount,
  menuExtras: pickerStrip,
  // Both seats; `name` labels the computer's chip, translated at display time (lobby players keep their lobby name).
  // The computer's chip gets its own colour slot and the robot avatar (it isn't in the lobby).
  scores: (s) =>
    s.players.map((p) =>
      p.kind === 'ai'
        ? { id: p.id, score: s.score[p.side], name: shownName(p), slot: 1, avatar: 'robot' }
        : { id: p.id, score: s.score[p.side], name: p.name },
    ),
  outcome(s, selfId) {
    const score = scoreText(s, selfId)
    const me = s.players.find((p) => p.id === selfId)
    const won = s.players[s.winner === 1 ? 1 : 0]
    if (!me) return { headline: t('{name} wins!', { name: shownName(won) }), result: 'done' }
    if (won === me) {
      // Over without a winning score: removePlayer ended it because the other side left.
      if (winner(s.score) === null) return { headline: t('Your opponent left. You win!'), result: 'win' }
      return { headline: t('You win {score}!', { score }), result: 'win' }
    }
    if (won.kind === 'ai')
      return { headline: t('The computer wins {score}. Rematch?', { score }), result: 'lose' }
    return { headline: t('{name} wins {score}.', { name: shownName(won), score }), result: 'lose' }
  },
  summary: summaryRows,
})
