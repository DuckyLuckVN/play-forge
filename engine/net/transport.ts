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
