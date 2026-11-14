import { netLog } from './debug'
import type { PeerLink } from './status'
import type { Transport } from './transport'

/**
 * Retrying a direct link that ended up on TURN. A retry (Transport.retryDirect) rejoins the
 * whole WebRTC room: every link moves to the relay for a few seconds and voice blips, so it
 * only runs between matches, at most twice per room, and only for links whose diagnosis
 * (ice-diagnosis.ts) leaves room for a direct link. A same-network, strict NAT or blocked
 * STUN link would just land on TURN again.
 */
export const TURN_RETRY = {
  /** Ms on TURN before the first retry (ICE has long settled by then). */
  firstMs: 20_000,
  /** Ms between the first retry and the second. */
  gapMs: 60_000,
  /** Retries per room. */
  maxRetries: 2,
  /** Up to this many ms added at random, so a room's watchers don't retry in step. */
  jitterMs: 3000,
  /** How often the stats are read. */
  pollMs: 5000,
} as const

/** Pure policy: ticked with the time, whether some link qualifies, and whether now is a quiet moment. */
export class TurnRetry {
  private due = -1
  private retries = 0

  constructor(private readonly random: () => number = Math.random) {}

  tick(now: number, eligible: boolean, idle: boolean): boolean {
    if (this.retries >= TURN_RETRY.maxRetries) return false
    if (!eligible) {
      this.due = -1
      return false
    }
    if (this.due < 0) {
      const wait = this.retries === 0 ? TURN_RETRY.firstMs : TURN_RETRY.gapMs
      this.due = now + wait + this.random() * TURN_RETRY.jitterMs
    }
    if (now < this.due || !idle) return false
    this.retries++
    // Still on TURN after this retry: the next one counts from now.
    this.due = now + TURN_RETRY.gapMs + this.random() * TURN_RETRY.jitterMs
    return true
  }
}

/** Some link is on TURN for no known reason, and we are the pair's side that retries (the lower id). */
export function turnRetryCandidate(selfId: string, peers: readonly PeerLink[]): boolean {
  return peers.some((p) => p.route === 'direct' && p.turn === true && p.why === 'unknown' && selfId < p.id)
}

/** Runs the policy on a transport; `idle`: between matches. Returns a stop function. */
export function startTurnRetry(transport: Transport, idle: () => boolean): () => void {
  const { diagnostics, retryDirect } = transport
  if (!diagnostics || !retryDirect) return () => {}
  const policy = new TurnRetry()
  let stopped = false
  const timer = setInterval(() => {
    void diagnostics.measure().then(() => {
      if (stopped) return
      const eligible = turnRetryCandidate(transport.selfId, diagnostics.snapshot().peers)
      if (!policy.tick(performance.now(), eligible, idle())) return
      netLog('direct: a link is on TURN for no known reason, trying a fresh direct link')
      void retryDirect().catch(() => {})
    })
  }, TURN_RETRY.pollMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
