import { clamp01 } from '../fx/tween'
import type { Session } from './session'

export interface Smoothed<S> {
  /** The state before the latest one (null until two have arrived). */
  prev: S | null
  /** The latest state (a private copy, safe to keep). */
  curr: S | null
  /**
   * How far we are from `prev` to `curr`, 0..1, based on time since `curr`
   * arrived. Use it to interpolate positions so movement is smooth even
   * though the simulation runs at a low tick rate.
   */
  alpha(): number
  dispose(): void
}

/**
 * Keeps the last two simulation states so renderers can interpolate between
 * ticks. Works identically on the host and on clients.
 */
export function smoothState<S>(session: Session<S, any>): Smoothed<S> {
  const interval = 1000 / session.def.tickRate
  let receivedAt = 0
  const smoothed: Smoothed<S> = {
    prev: null,
    curr: null,
    alpha: () => clamp01((performance.now() - receivedAt) / interval),
    dispose: () => off(),
  }
  const take = (state: S) => {
    // The host mutates its state in place, so keep our own copies.
    smoothed.prev = smoothed.curr
    smoothed.curr = structuredClone(state)
    receivedAt = performance.now()
  }
  if (session.state) take(session.state)
  const off = session.on('state', take)
  return smoothed
}
