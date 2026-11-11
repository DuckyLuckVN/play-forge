// The online guest plays its own predicted hit's sound at once (GuestShuttle.predictHit); the host's
// answering `hit` event then arrives ~1 RTT later and must not play it again. HitEcho remembers the one
// prediction and recognises that echo with GuestShuttle's own matching rule (answersPrediction). Host,
// vs-AI and spectators never note a prediction, so every event sound plays as before. A prediction the
// host rejects keeps its already-played sound.
import { answersPrediction, PREDICT, type PredictedHit } from './guestshuttle'
import type { SpEvent } from './sim'

export class HitEcho {
  // Primitive fields only: noted / heard every frame, no allocation.
  private active = false
  private side: 0 | 1 = 0
  private from = 0
  private id: string | undefined = undefined

  /** A prediction whose sound just played: its host `hit` is the echo. */
  note(h: PredictedHit): void {
    this.active = true
    this.side = h.side
    this.from = h.from
    this.id = h.id
  }

  /**
   * Feed every new host event: true exactly once, for the own `hit` answering the noted prediction (its
   * sound already played). An own answering whiff, any serve, or any event past the confirm window
   * forgets the note.
   */
  heard(e: SpEvent): boolean {
    if (!this.active) return false
    if (e.tick > this.from + PREDICT.confirmTicks || e.k === 'serve') {
      this.active = false
      return false
    }
    if (answersPrediction(e, 'hit', this.side, this.from, this.id)) {
      this.active = false
      return true
    }
    if (answersPrediction(e, 'whiff', this.side, this.from, this.id)) this.active = false
    return false
  }

  reset(): void {
    this.active = false
  }
}
