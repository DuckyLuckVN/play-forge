import type { Phase, ReactionBridge, Session } from '@forge'
import { reactionWheel } from '@forge/social/reaction-wheel'

interface LiveState {
  active: boolean
  offline: boolean
  phase: Phase
  paused: boolean
}

/** Emoji wheel + bubbles run only in an online countdown / match (hidden vs the computer: nobody to see it). */
export function emotesLive(s: LiveState): boolean {
  return s.active && !s.offline && (s.phase === 'countdown' || s.phase === 'playing') && !s.paused
}

/** Mounts the reaction wheel over the court and routes incoming reactions to the 3D bubbles. Returns cleanup. */
export function mountEmotes(
  view: HTMLElement,
  session: Pick<Session<unknown, unknown>, 'offline' | 'phase' | 'lobby' | 'on'>,
  bridge: ReactionBridge,
  court: { react(playerId: string, reactionId: string): boolean },
): () => void {
  const wheel = reactionWheel({ host: view, send: (id) => bridge.send(id) })
  wheel.button.classList.add('sp-rx-btn')
  // Like .sp-cam: the court view takes every pointer as a swing / stick.
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    wheel.button.addEventListener(type, (e) => e.stopPropagation())
  }
  const live = () =>
    emotesLive({
      active: bridge.active,
      offline: session.offline,
      phase: session.phase,
      paused: session.lobby.paused,
    })
  const sync = () => wheel.setEnabled(live())
  sync()
  const offLobby = session.on('lobby', sync)
  const offActive = bridge.onActive(sync)
  const offDraw = bridge.draw((p, r) => {
    if (!live()) return false
    try {
      return court.react(p, r)
    } catch {
      return false
    }
  })
  return () => {
    offLobby()
    offActive()
    offDraw()
    wheel.destroy()
  }
}
