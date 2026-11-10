import type { JoinRoomConfig } from 'trystero'

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

/** Trystero room config for a game: the pinned relays. */
export function roomConfig(appId: string): JoinRoomConfig {
  return {
    appId,
    // With explicit urls Trystero connects to every one (redundancy only
    // applies when it picks from its defaults).
    relayConfig: { urls: [...RELAY_URLS] },
  }
}
