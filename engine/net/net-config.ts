import type { JoinRoomConfig } from 'trystero'
import type { TurnServer } from './turn'

/**
 * Nostr relays used for matchmaking (peers find each other here; game traffic
 * then goes browser to browser). Every peer connects to all of these, so host
 * and guests always share relays. Picked from Trystero's own defaults
 * (`defaultRelayUrls`), which include dead and rate-limiting relays.
 *
 * To refresh: `npm run probe-relays` tests Trystero's defaults plus this list
 * (two sockets per relay find each other with a real Trystero event, several
 * rounds) and prints the best that delivered every time, ready to paste.
 * Changing the list splits players across versions until both reload; they
 * still meet through our game relay meanwhile. Last checked 2026-11-14.
 */
export const RELAY_URLS: readonly string[] = [
  'wss://relay.notoshi.win',
  'wss://nostr-01.yakihonne.com',
  'wss://relay.guggero.org',
  'wss://relay.snort.social',
  'wss://bucket.coracle.social',
  'wss://nostr.overmind.lol',
  'wss://relay.minibolt.info',
  'wss://relay.ditto.pub',
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
