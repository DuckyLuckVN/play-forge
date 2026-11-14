import { netLog } from './debug'
import { DirectWatchdog } from './direct-watchdog'
import type { RelayTransport } from './relay'
import type { NetStatus, PeerLink, Route } from './status'
import type { MediaChannel, Transport } from './transport'

/**
 * Direct first, relay as fallback. Wraps the WebRTC transport (`direct`) and
 * the relay server client (`relay`, same peer id). Each message to a peer goes
 * one way: browser to browser when that link is up, otherwise through the
 * relay server. So a room works while WebRTC is still connecting, and for
 * players whose networks block it entirely; once a direct link opens, traffic
 * moves to it. Handlers hear both, so it doesn't matter which way the sender chose.
 *
 * A peer joins when the first path reaches it and leaves when the last one
 * drops, so a direct link failing mid-game falls back to the relay without the
 * session noticing. Voice (media) is direct only: it follows peers whose direct
 * link opens late.
 */
export interface HybridOptions {
  /** Debug (`?relay=only`): send and accept game data through the relay only. */
  relayOnly?: boolean
}

export function createHybridTransport(
  direct: Transport,
  relay: RelayTransport,
  opts: HybridOptions = {},
): Transport {
  if (direct.selfId !== relay.selfId) throw new Error('hybrid transport: peer ids differ')
  const relayOnly = !!opts.relayOnly
  const viaDirect = new Set<string>()
  const viaRelay = new Set<string>()
  const joinHandlers = new Set<(id: string) => void>()
  const leaveHandlers = new Set<(id: string) => void>()
  const known = (id: string) => viaDirect.has(id) || viaRelay.has(id)
  const routeOf = (id: string): Route | null =>
    !relayOnly && viaDirect.has(id) ? 'direct' : viaRelay.has(id) ? 'relay' : null

  const media = direct.media && createMediaFollower(direct.media)

  const arrive = (set: Set<string>, id: string, path: Route) => {
    const isNew = !known(id)
    set.add(id)
    netLog('route:', id, path, 'up', isNew ? '(joined)' : '')
    if (isNew) joinHandlers.forEach((h) => h(id))
    // After the join handlers: voice may have just sent its stream to this peer itself.
    if (path === 'direct') media?.linked(id)
  }
  const depart = (set: Set<string>, id: string, path: Route) => {
    if (!set.delete(id)) return
    if (path === 'direct') media?.unlinked(id)
    netLog('route:', id, path, 'down', known(id) ? '(still reachable)' : '(left)')
    if (!known(id)) leaveHandlers.forEach((h) => h(id))
  }

  // A peer left on the relay: try the direct links again now and then (direct-watchdog.ts).
  const watchdog = new DirectWatchdog()
  const watchTimer =
    !relayOnly && direct.retryDirect
      ? setInterval(() => {
          const stuck = [...viaRelay].some((id) => !viaDirect.has(id))
          if (watchdog.tick(performance.now(), stuck)) {
            netLog('direct: still on the relay, trying a fresh direct link')
            void direct.retryDirect!().catch(() => {})
          }
        }, 1000)
      : null

  const offs = [
    direct.onPeerJoin((id) => arrive(viaDirect, id, 'direct')),
    direct.onPeerLeave((id) => depart(viaDirect, id, 'direct')),
    relay.onPeerJoin((id) => arrive(viaRelay, id, 'relay')),
    relay.onPeerLeave((id) => depart(viaRelay, id, 'relay')),
  ]

  return {
    selfId: direct.selfId,
    peers: () => [...new Set([...viaDirect, ...viaRelay])],
    send(channel, data, to) {
      if (to) {
        const route = routeOf(to)
        if (route === 'direct') direct.send(channel, data, to)
        else if (route === 'relay') relay.send(channel, data, to)
        return
      }
      // Everyone: one broadcast over WebRTC, one relay frame for the rest.
      if (!relayOnly && viaDirect.size) direct.send(channel, data)
      relay.sendTo(
        channel,
        data,
        [...viaRelay].filter((id) => routeOf(id) === 'relay'),
      )
    },
    on(channel, handler) {
      const a = direct.on(channel, (data, from) => {
        if (!relayOnly) handler(data, from)
      })
      const b = relay.on(channel, handler)
      return () => {
        a()
        b()
      }
    },
    onPeerJoin(handler) {
      joinHandlers.add(handler)
      return () => joinHandlers.delete(handler)
    },
    onPeerLeave(handler) {
      leaveHandlers.add(handler)
      return () => leaveHandlers.delete(handler)
    },
    media: media?.channel,
    diagnostics: {
      snapshot: () => mergeStatus(direct, relay, routeOf),
      async measure() {
        await Promise.all([direct.diagnostics?.measure(), relay.measure()])
      },
    },
    retryDirect: direct.retryDirect && (() => direct.retryDirect!()),
    leave() {
      if (watchTimer) clearInterval(watchTimer)
      offs.forEach((off) => off())
      joinHandlers.clear()
      leaveHandlers.clear()
      relay.leave()
      direct.leave()
    },
  }
}

/** Direct status plus the relay: relayed peers count as connected, with the relay's ping. */
export function mergeStatus(
  direct: Transport,
  relay: RelayTransport,
  routeOf: (id: string) => Route | null,
): NetStatus {
  const base: NetStatus = direct.diagnostics?.snapshot() ?? {
    kind: 'internet',
    relays: [],
    negotiating: 0,
    failures: 0,
    openFailures: 0,
    peers: [],
  }
  const peers = new Map<string, PeerLink>()
  for (const p of base.peers) peers.set(p.id, p)
  for (const id of relay.peers()) if (!peers.has(id)) peers.set(id, { id, state: 'connecting' })
  for (const [id, p] of peers) {
    const route = routeOf(id)
    if (route === 'direct') peers.set(id, { ...p, route })
    else if (route === 'relay') peers.set(id, { id, state: 'connected', route, rttMs: relay.peerRttMs(id) })
  }
  const list = [...peers.values()]
  // Failed direct links don't matter while everyone is reachable one way or another.
  const allReached = list.every((p) => p.state === 'connected')
  return {
    ...base,
    peers: list,
    openFailures: allReached ? 0 : base.openFailures,
    gameRelay: { state: relay.state(), rttMs: relay.serverRttMs() },
  }
}

/**
 * Media over the direct transport for a peer set that changes under it: a
 * stream meant for a peer still on the relay is sent once its direct link
 * opens (again), and streams sent to everyone reach late links too.
 */
function createMediaFollower(media: MediaChannel) {
  const everyone = new Set<MediaStream>()
  const pending = new Map<string, Set<MediaStream>>()
  const sent = new Map<string, Set<MediaStream>>()
  const linked = new Set<string>()
  const mark = (map: Map<string, Set<MediaStream>>, id: string, s: MediaStream) => {
    let set = map.get(id)
    if (!set) map.set(id, (set = new Set()))
    set.add(s)
  }
  return {
    channel: {
      addStream(stream, to) {
        if (!to) {
          everyone.add(stream)
          media.addStream(stream)
          for (const id of linked) mark(sent, id, stream)
        } else if (linked.has(to)) {
          media.addStream(stream, to)
          mark(sent, to, stream)
        } else mark(pending, to, stream)
      },
      removeStream(stream, to) {
        const ids = to ? [to] : [...new Set([...sent.keys(), ...pending.keys()])]
        if (!to) everyone.delete(stream)
        for (const id of ids) {
          pending.get(id)?.delete(stream)
          sent.get(id)?.delete(stream)
        }
        // A peer without a direct link never got it.
        if (!to || linked.has(to)) media.removeStream(stream, to)
      },
      onPeerStream: (handler) => media.onPeerStream(handler),
    } satisfies MediaChannel,
    linked(id: string) {
      linked.add(id)
      const due = new Set([...everyone, ...(pending.get(id) ?? [])])
      pending.delete(id)
      for (const s of due) {
        if (sent.get(id)?.has(s)) continue
        media.addStream(s, id)
        mark(sent, id, s)
      }
    },
    unlinked(id: string) {
      linked.delete(id)
      sent.delete(id)
    },
  }
}
