import { createGameApp, h, smoothState, type Session } from '@forge'
import { ARCADE } from '@forge/audio/tracks'
import { webglAvailable } from '@forge/render3d'
import './shuttle-pop.css'
import { t } from './i18n'
import { bindInput } from './input'
import { loadPreset, pickerStrip } from './picker'
import { Court3D } from './render3d'
import { scoreText, summaryRows } from './results'
import { winner } from './rules'
import { createState, seedPreset, shuttlePopGame, type SpInput, type SpState } from './sim'

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
  let onSwing: (() => void) | null = null
  const detach = court.attach(stage, smooth, session.selfId, (cb) => (onSwing = cb))
  court.surface.setAttribute('role', 'img')
  court.surface.setAttribute('aria-label', t('Badminton court'))

  // sendInput drops inputs during the countdown and while paused.
  const live = () => session.phase === 'playing' && !session.lobby.paused
  const send = (input: SpInput) => {
    // Animate our own swing this frame (not when the session would drop it).
    if (input.t === 'swing' && live()) onSwing?.()
    session.sendInput(input)
  }
  const input = bindInput(court.surface, send, () => smooth.curr?.tick ?? 0)
  // Our character on every play start (inputs are dropped before). The host's look is already seeded
  // in setup; a guest's shows from "Go!". Idempotent, so resumes may resend it.
  const pick = () => session.sendInput({ t: 'pick', preset: loadPreset() })
  // Play starting or resuming: re-send the held keys (a key held through "Go!" moves you, one let
  // go during a pause stops you) and our character.
  let wasLive = live()
  if (wasLive) pick()
  const offLobby = session.on('lobby', () => {
    const now = live()
    if (now && !wasLive) {
      input.resync()
      pick()
    }
    wasLive = now
  })
  return () => {
    hostId = null
    offLobby()
    input.stop()
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
    'Move with WASD or the arrow keys. Swing with Space, J or a click. Hold forward as you swing to smash or drive, back to clear, nothing to drop; left or right aims.',
  ),
  // Stock upbeat gameplay loop.
  music: ARCADE,
  preload,
  mount,
  menuExtras: pickerStrip,
  // Both seats; `name` labels the computer's chip (lobby players keep their lobby name).
  // The computer's chip gets its own colour slot and the robot avatar (it isn't in the lobby).
  scores: (s) =>
    s.players.map((p) =>
      p.kind === 'ai'
        ? { id: p.id, score: s.score[p.side], name: p.name, slot: 1, avatar: 'robot' }
        : { id: p.id, score: s.score[p.side], name: p.name },
    ),
  outcome(s, selfId) {
    const score = scoreText(s, selfId)
    const me = s.players.find((p) => p.id === selfId)
    const won = s.players[s.winner === 1 ? 1 : 0]
    if (!me) return { headline: t('{name} wins!', { name: won.name }), result: 'done' }
    if (won === me) {
      // Over without a winning score: removePlayer ended it because the other side left.
      if (winner(s.score) === null) return { headline: t('Your opponent left. You win!'), result: 'win' }
      return { headline: t('You win {score}!', { score }), result: 'win' }
    }
    if (won.kind === 'ai')
      return { headline: t('The computer wins {score}. Rematch?', { score }), result: 'lose' }
    return { headline: t('{name} wins {score}.', { name: won.name, score }), result: 'lose' }
  },
  summary: summaryRows,
})
