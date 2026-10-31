import { joinRoom, selfId, type DataPayload, type MessageAction } from 'trystero'
import { Emitter } from '../core/emitter'
import type { Transport } from './transport'

/**
 * Internet transport: WebRTC data channels between browsers. Peers find each
 * other through public Nostr relays (handled by Trystero), so no server of our
 * own is needed. Only connection setup goes through relays; game traffic is
 * direct peer to peer.
 */
export function createTrysteroTransport(appId: string, roomId: string): Transport {
  const room = joinRoom({ appId }, roomId)
  const events = new Emitter<{ join: [string]; leave: [string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const actions = new Map<string, MessageAction>()

  room.onPeerJoin = (id) => events.emit('join', id)
  room.onPeerLeave = (id) => events.emit('leave', id)

  const action = (channel: string) => {
    let a = actions.get(channel)
    if (!a) {
      a = room.makeAction(channel)
      a.onMessage = (data, { peerId }) => channels.emit(channel, data, peerId)
      actions.set(channel, a)
    }
    return a
  }

  return {
    selfId,
    peers: () => Object.keys(room.getPeers()),
    send(channel, data, to) {
      void action(channel).send(data as DataPayload, to ? { target: to } : undefined)
    },
    on(channel, handler) {
      action(channel)
      return channels.on(channel, handler)
    },
    onPeerJoin: (h) => events.on('join', h),
    onPeerLeave: (h) => events.on('leave', h),
    leave() {
      events.clear()
      channels.clear()
      void room.leave()
    },
  }
}
