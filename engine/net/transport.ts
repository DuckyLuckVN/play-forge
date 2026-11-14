import type { NetDiagnostics } from './status'

/**
 * A transport connects this browser to the other peers in one room.
 * Implementations: Trystero/WebRTC (internet), BroadcastChannel (same-browser
 * tabs, for development), and offline (single player).
 *
 * Payloads must be JSON-serialisable.
 */
export interface Transport {
  readonly selfId: string
  peers(): string[]
  /** Send to one peer (`to`) or broadcast to every peer. */
  send(channel: string, data: unknown, to?: string): void
  /** Returns an unsubscribe function. */
  on(channel: string, handler: (data: any, from: string) => void): () => void
  onPeerJoin(handler: (peerId: string) => void): () => void
  onPeerLeave(handler: (peerId: string) => void): () => void
  leave(): void
  /** Audio/video streams. Optional: only real network transports have it. */
  readonly media?: MediaChannel
  /** Live connection details for the Network panel. Optional: only the internet transport has it. */
  readonly diagnostics?: NetDiagnostics
  /**
   * Try the direct (WebRTC) links again from scratch, e.g. once the browser allows local network
   * access. Optional: only the internet transport has it. Peers stay reachable through the relay.
   */
  retryDirect?(opts?: { turn?: boolean }): Promise<void>
}

/** Sends live media (e.g. voice) to peers. Used by voice chat. */
export interface MediaChannel {
  /** Send to every peer, or only to `to` (e.g. someone who just joined). */
  addStream(stream: MediaStream, to?: string): void
  removeStream(stream: MediaStream, to?: string): void
  /** Returns an unsubscribe function. */
  onPeerStream(handler: (stream: MediaStream, peerId: string) => void): () => void
}

export function randomId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** A transport with no peers: everything stays local. */
export function createOfflineTransport(): Transport {
  return {
    selfId: 'local',
    peers: () => [],
    send() {},
    on: () => () => {},
    onPeerJoin: () => () => {},
    onPeerLeave: () => () => {},
    leave() {},
  }
}
