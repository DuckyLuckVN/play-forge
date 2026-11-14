import type { JoinRoomConfig } from 'trystero'
import type { TurnServer } from './turn'

/**
 * Nostr relays used for matchmaking (peers find each other here; game traffic
 * then goes browser to browser). Pinned instead of Trystero's 29 defaults,
 * where several are down or accept events without delivering them, and every
 * peer connects to all of these so host and guests always share relays.
 *
 * To refresh: run a publish/subscribe probe against candidate relays (one
 * socket subscribes to a random topic, another publishes a Trystero-style
 * event to it; keep relays that deliver within a few seconds on repeated
 * runs), then keep 6–8 working ones here. Last checked 2026-11-10.
 */
export const RELAY_URLS: readonly string[] = [
  'wss://nostr.chaima.info',
  'wss://relay.layer.systems',
  'wss://relay.degmods.com',
  'wss://relay.routstr.com',
  'wss://nostr.rblb.it',
  'wss://relay.nostrmap.net',
  'wss://relay.agentry.com',
  'wss://nostr.stakey.net',
]

/**
 * Trystero room config for a game: the pinned relays, plus TURN servers when we
 * have a login (see turn.ts). `relayOnly` forces every WebRTC link through TURN
 * (`?turn=only`, for testing that TURN works).
 */
export function roomConfig(appId: string, turn: TurnServer[] = [], relayOnly = false): JoinRoomConfig {
  return {
    // Trystero 0.27 speaks a new protocol: its own namespace, so pages still on 0.26 don't half-meet it
    // (players on different versions still play through our relay, which keeps the plain appId).
    appId: `${appId}/t27`,
    // With explicit urls Trystero connects to every one (redundancy only
    // applies when it picks from its defaults).
    relayConfig: { urls: [...RELAY_URLS] },
    ...(turn.length ? { turnConfig: turn } : {}),
    ...(turn.length && relayOnly ? { rtcConfig: { iceTransportPolicy: 'relay' as const } } : {}),
  }
}

/**
 * Our game relay server (server/relay, on the home server behind the
 * Cloudflare Tunnel): the fallback path when two browsers can't link
 * directly. Override with VITE_GAME_RELAY_URL (e.g. ws://localhost:8080 for
 * `npm run relay`); an empty string means no relay (direct WebRTC only, as
 * before). The dev server has none unless set: the real relay only accepts
 * the published sites.
 */
export const GAME_RELAY_URL: string =
  import.meta.env.VITE_GAME_RELAY_URL ?? (import.meta.env.DEV ? '' : 'wss://relay.haonguyen.dev')

/**
 * `?relay=` in the page URL, for testing: `off` skips the relay server,
 * `only` sends all game data through it (WebRTC still carries voice).
 * Anything else: direct first, relay as fallback.
 */
export type RelayMode = 'auto' | 'off' | 'only'

export function relayMode(
  search: string = typeof location !== 'undefined' ? location.search : '',
): RelayMode {
  if (!GAME_RELAY_URL) return 'off'
  const v = new URLSearchParams(search).get('relay')
  return v === 'off' || v === 'only' ? v : 'auto'
}
