/**
 * Why a WebRTC link ended up on TURN instead of direct, from the ICE candidates
 * each side gathered. Browsers' getStats() only keeps the candidates of the pairs
 * still in use, so trystero.ts records the candidate lines as they're exchanged.
 *
 * - same-network: both sides share a public address (same Wi-Fi). Direct then needs
 *   the LAN addresses (hidden behind .local names, gated by local network access),
 *   or a router that loops traffic to its own public address back in (most don't).
 * - strict-self / strict-peer: one socket got a different public port from each STUN
 *   server: a symmetric NAT (mobile data, some offices). Direct links rarely get through.
 * - no-public-self: no public address at all once gathering finished: STUN (UDP) is blocked.
 * - unknown: none of the above; a fresh attempt may still link directly.
 */
export type WhyNotDirect = 'same-network' | 'strict-self' | 'strict-peer' | 'no-public-self' | 'unknown'

export interface Candidate {
  type: string
  address: string
  port: number
  protocol: string
}

/** One ICE candidate line ("candidate:… udp prio addr port typ srflx …"); null if it isn't one. */
export function parseCandidate(line: string): Candidate | null {
  const parts = line.trim().replace(/^a=/, '').split(/\s+/)
  const typ = parts.indexOf('typ')
  if (typ !== 6 || parts.length < 8) return null
  const port = Number(parts[5])
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return { type: parts[7], address: parts[4], port, protocol: parts[2].toLowerCase() }
}

const isPublic = (c: Candidate) => c.protocol === 'udp' && (c.type === 'srflx' || c.type === 'prflx')

/** Public addresses of one side (STUN results). */
const publicAddresses = (side: Candidate[]) => new Set(side.filter(isPublic).map((c) => c.address))

/**
 * A symmetric NAT maps one socket to a new public port per destination. Each local UDP
 * socket (one per network interface) may own one port, so only more ports than sockets count.
 */
function strictNat(side: Candidate[]): boolean {
  const sockets = Math.max(1, side.filter((c) => c.type === 'host' && c.protocol === 'udp').length)
  const ports = new Map<string, Set<number>>()
  for (const c of side.filter((c) => c.type === 'srflx' && c.protocol === 'udp')) {
    const set = ports.get(c.address) ?? new Set<number>()
    set.add(c.port)
    ports.set(c.address, set)
  }
  return [...ports.values()].some((set) => set.size > sockets)
}

/**
 * Why a link isn't direct. `localDone`: our side finished gathering (only then can a
 * missing public address be blamed on our network). The peer's missing public
 * address is never blamed: its late candidates may not have been sent at all.
 */
export function whyNotDirect(local: Candidate[], remote: Candidate[], localDone: boolean): WhyNotDirect {
  const ours = publicAddresses(local)
  for (const address of publicAddresses(remote)) if (ours.has(address)) return 'same-network'
  if (strictNat(local)) return 'strict-self'
  if (strictNat(remote)) return 'strict-peer'
  if (localDone && ours.size === 0) return 'no-public-self'
  return 'unknown'
}

/** "host×2 srflx×1 relay×2" for the debug log (no addresses). */
export function candidateCounts(side: Candidate[]): string {
  const n = new Map<string, number>()
  for (const c of side) n.set(c.type, (n.get(c.type) ?? 0) + 1)
  return [...n].map(([type, count]) => `${type}×${count}`).join(' ') || 'none'
}
