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
  /** Ms a new peer reached only by the relay waits for a direct / TURN link first (default RELAY_GRACE_MS). */
  relayGraceMs?: number
}

/**
 * Direct first, then TURN, then the relay: a new peer reached only through the relay waits this
 * long for WebRTC (direct and TURN, with retries) before the relay carries the game. Once a peer was
 * linked, a dropped link falls back at once.
 */
export const RELAY_GRACE_MS = 14_000

export function createHybridTransport(
  direct: Transport,
  relay: RelayTransport,
  opts: HybridOptions = {},
): Transport {
  if (direct.selfId !== relay.selfId) throw new Error('hybrid transport: peer ids differ')
  const relayOnly = !!opts.relayOnly
  const graceMs = relayOnly ? 0 : (opts.relayGraceMs ?? RELAY_GRACE_MS)
  const viaDirect = new Set<string>()
  const viaRelay = new Set<string>()
  /** Relay peers the relay may carry: grace over, linked before, or they already use it. */
  const relayReady = new Set<string>()
  /** Peers seen on a direct link this session: a later drop falls back to the relay at once. */
  const linked = new Set<string>()
  const graceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const joinHandlers = new Set<(id: string) => void>()
  const leaveHandlers = new Set<(id: string) => void>()
  const usable = (id: string) => relayReady.has(id) && viaRelay.has(id)
  const known = (id: string) => viaDirect.has(id) || usable(id)
  const routeOf = (id: string): Route | null =>
    !relayOnly && viaDirect.has(id) ? 'direct' : usable(id) ? 'relay' : null
  const clearGrace = (id: string) => {
    clearTimeout(graceTimers.get(id))
    graceTimers.delete(id)
  }
  /** Let the relay carry `id` (joining them if no direct link did). */
  const readyRelay = (id: string, why: string) => {
    clearGrace(id)
    if (relayReady.has(id) || !viaRelay.has(id)) return
    const isNew = !known(id)
    relayReady.add(id)
    netLog('route:', id, 'relay ready', `(${why})`, isNew ? '(joined)' : '')
    if (isNew) joinHandlers.forEach((h) => h(id))
  }

  const media = direct.media && createMediaFollower(direct.media)

  const arrive = (set: Set<string>, id: string, path: Route) => {
    if (path === 'relay') {
      viaRelay.add(id)
      // Linked before (or no grace): the relay may carry them now; else WebRTC gets its head start.
      if (linked.has(id) || graceMs <= 0) readyRelay(id, linked.has(id) ? 'linked before' : 'no grace')
      else if (!graceTimers.has(id))
        graceTimers.set(
          id,
          setTimeout(() => readyRelay(id, 'no direct link in time'), graceMs),
        )
      return
    }
    const isNew = !known(id)
    set.add(id)
    linked.add(id)
    clearGrace(id)
    netLog('route:', id, path, 'up', isNew ? '(joined)' : '')
    if (isNew) joinHandlers.forEach((h) => h(id))
    // After the join handlers: voice may have just sent its stream to this peer itself.
    media?.linked(id)
  }
  const depart = (set: Set<string>, id: string, path: Route) => {
    const wasKnown = known(id)
    if (!set.delete(id)) return
    if (path === 'direct') {
      media?.unlinked(id)
      // Mid-game (or mid-retry): the relay takes over at once (they stay joined, no new join).
      if (viaRelay.has(id)) {
        clearGrace(id)
        relayReady.add(id)
      }
    } else {
      clearGrace(id)
      relayReady.delete(id)
    }
    netLog('route:', id, path, 'down', known(id) ? '(still reachable)' : '(left)')
    if (wasKnown && !known(id)) leaveHandlers.forEach((h) => h(id))
  }

  // A peer left on the relay: try the direct links again now and then (direct-watchdog.ts).
  const watchdog = new DirectWatchdog()
  const watchTimer =
    !relayOnly && direct.retryDirect
      ? setInterval(() => {
          // One side per pair retries (the lower id): a retry rejoins the room, so two at once
          // would each tear down the attempt the other just started.
          const stuck = [...viaRelay].some((id) => !viaDirect.has(id) && direct.selfId < id)
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
      // A message through the relay: that peer already uses it (its grace ran out, or an older
      // page), so follow it now instead of waiting out our own grace.
      const b = relay.on(channel, (data, from) => {
        if (!relayReady.has(from)) readyRelay(from, 'peer already uses it')
        handler(data, from)
      })
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
      snapshot: () => {
        const s = mergeStatus(direct, relay, routeOf)
        // Each player not linked directly (on TURN or the relay): trying, or not (Retry may help).
        const linkedDirectly = (p: PeerLink) => viaDirect.has(p.id) && !p.turn
        const retryable = !relayOnly && !!direct.retryDirect
        return {
          ...s,
          peers: s.peers.map((p) =>
            retryable && !linkedDirectly(p) && (viaDirect.has(p.id) || viaRelay.has(p.id))
              ? { ...p, attempt: s.trying ? ('trying' as const) : ('idle' as const) }
              : p,
          ),
          waiting: graceTimers.size,
        }
      },
      async measure() {
        await Promise.all([direct.diagnostics?.measure(), relay.measure()])
      },
    },
    // By hand (the Network panel's Retry, allowing local network access): the automatic ones start over.
    retryDirect:
      direct.retryDirect &&
      (() => {
        watchdog.restart(performance.now())
        return direct.retryDirect!()
      }),
    leave() {
      if (watchTimer) clearInterval(watchTimer)
      for (const id of [...graceTimers.keys()]) clearGrace(id)
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
