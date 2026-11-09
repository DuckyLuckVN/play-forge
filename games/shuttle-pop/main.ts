import { createGameApp, h, smoothState, type Session } from '@forge'
import { webglAvailable } from '@forge/render3d'
import './shuttle-pop.css'
import { t } from './i18n'
import { bindInput } from './input'
import { Court3D } from './render3d'
import { winner } from './rules'
import { shuttlePopGame, type SpInput, type SpState } from './sim'

/** Built and warmed while the menu shows, then reused by every match. */
let court: Court3D | null = null
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
  const smooth = smoothState(session)
  let onSwing: (() => void) | null = null
  const detach = court.attach(stage, smooth, session.selfId, (cb) => (onSwing = cb))
  court.surface.setAttribute('role', 'img')
  court.surface.setAttribute('aria-label', t('Badminton court'))

  const send = (input: SpInput) => {
    // Animate our own swing this frame (sendInput drops it while paused, so skip that too).
    if (input.t === 'swing' && session.phase === 'playing' && !session.lobby.paused) onSwing?.()
    session.sendInput(input)
  }
  const stopInput = bindInput(court.surface, send, () => smooth.curr?.tick ?? 0)
  return () => {
    stopInput()
    detach()
    smooth.dispose()
  }
}

/** The final score from `selfId`'s side (side 0 first for spectators), e.g. "11–7". */
function scoreText(s: SpState, selfId: string): string {
  const me = s.players.find((p) => p.id === selfId)
  const [a, b] = me?.side === 1 ? [s.score[1], s.score[0]] : s.score
  return `${a}–${b}`
}

createGameApp<SpState, SpInput>({
  def: shuttlePopGame,
  title: 'Shuttle Pop',
  tagline: t('Chibi badminton. Time your swing for a Perfect, smash the high ones.'),
  controls: t(
    'Move with WASD or the arrow keys. Swing with Space, J or a click. Hold forward as you swing to smash or drive, back to clear, nothing to drop; left or right aims.',
  ),
  preload,
  mount,
  // The shell names chips from the lobby, so only human seats (the full scoreboard is in the HUD).
  scores: (s) =>
    s.players.filter((p) => p.kind === 'human').map((p) => ({ id: p.id, score: s.score[p.side] })),
  outcome(s, selfId) {
    const score = scoreText(s, selfId)
    const me = s.players.find((p) => p.id === selfId)
    const won = s.players[s.winner === 1 ? 1 : 0]
    if (!me) return { headline: t('{name} wins!', { name: won.name }), result: 'done' }
    if (won === me) {
      // The match ended before anyone reached the target: the other side left.
      if (winner(s.score) === null) return { headline: t('Your opponent left. You win!'), result: 'win' }
      return { headline: t('You win {score}!', { score }), result: 'win' }
    }
    if (won.kind === 'ai')
      return { headline: t('The computer wins {score}. Rematch?', { score }), result: 'lose' }
    return { headline: t('{name} wins {score}.', { name: won.name, score }), result: 'lose' }
  },
  summary: (s, selfId) => [{ label: t('Final score'), value: scoreText(s, selfId) }],
})
