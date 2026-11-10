import {
  CLOSE,
  RELAY_LIMITS,
  parseClientMessage,
  type RelayJoin,
  type ServerMessage,
} from '../../engine/net/relay-protocol.ts'

/**
 * The relay's rooms and routing, without any networking: main.ts feeds it
 * sockets and frames. Time is passed in, so tests drive it directly.
 */

/** What the hub needs from a WebSocket. */
export interface HubSocket {
  send(text: string): void
  close(code: number, reason: string): void
}

export type Limits = { -readonly [K in keyof typeof RELAY_LIMITS]: number }

/** Messages and bytes allowed per second, refilled continuously up to a burst. */
export class TokenBucket {
  private rate: number
  private burst: number
  private tokens: number
  private at: number
  constructor(rate: number, burst: number, now: number) {
    this.rate = rate
    this.burst = burst
    this.tokens = burst
    this.at = now
  }
  take(cost: number, now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate)
    this.at = now
    if (this.tokens < cost) return false
    this.tokens -= cost
    return true
  }
}

interface Member {
  socket: HubSocket
  address: string
  messages: TokenBucket
  bytes: TokenBucket
  dropped: number
}

interface Room {
  members: Map<string, Member>
  /** Peer id → its key, and until when it is held after the socket left (Infinity while connected). */
  owners: Map<string, { key: string; until: number }>
}

/** Counters for /metrics and /healthz. */
export interface HubStats {
  rooms: number
  sockets: number
  messagesIn: number
  bytesIn: number
  messagesOut: number
  dropped: number
  malformed: number
  rejected: Record<string, number>
}

export interface Connection {
  /** One text frame from the client. */
  message(text: string, now: number): void
  /** The socket closed (either side). */
  closed(now: number): void
}

export class RelayHub {
  private rooms = new Map<string, Room>()
  private perAddress = new Map<string, number>()
  private sockets = 0
  private counters = { messagesIn: 0, bytesIn: 0, messagesOut: 0, dropped: 0, malformed: 0 }
  private rejected: Record<string, number> = {}

  private limits: Limits

  constructor(limits: Limits = { ...RELAY_LIMITS }) {
    this.limits = limits
  }

  /**
   * A socket asks to join a room. Returns its connection, or null after
   * closing the socket with the reason (room full, id taken, ...).
   */
  open(socket: HubSocket, join: RelayJoin, address: string, now: number): Connection | null {
    const L = this.limits
    const reject = (code: number, reason: string) => {
      this.rejected[reason] = (this.rejected[reason] ?? 0) + 1
      socket.close(code, reason)
      return null
    }
    if (this.sockets >= L.maxSockets) return reject(CLOSE.limit, 'server full')
    if ((this.perAddress.get(address) ?? 0) >= L.maxSocketsPerAddress)
      return reject(CLOSE.limit, 'too many sockets')

    const roomKey = `${join.app}#${join.room}`
    let room = this.rooms.get(roomKey)
    if (room) this.expire(room, now)
    if (!room) {
      if (this.rooms.size >= L.maxRooms) {
        this.sweep(now)
        if (this.rooms.size >= L.maxRooms) return reject(CLOSE.limit, 'server full')
      }
      room = { members: new Map(), owners: new Map() }
      this.rooms.set(roomKey, room)
    }

    const owner = room.owners.get(join.id)
    if (owner && owner.key !== join.key)
      return this.dropIfEmpty(roomKey, room, reject(CLOSE.idTaken, 'id taken'))
    const previous = room.members.get(join.id)
    if (!previous && room.members.size >= L.maxPeersPerRoom)
      return this.dropIfEmpty(roomKey, room, reject(CLOSE.limit, 'room full'))

    // Same id and key: a reconnect whose old socket the server hasn't noticed is dead yet.
    if (previous) {
      this.forget(previous)
      previous.socket.close(CLOSE.idTaken, 'replaced')
    }
    const member: Member = {
      socket,
      address,
      messages: new TokenBucket(L.messagesPerSecond, L.messageBurst, now),
      bytes: new TokenBucket(L.bytesPerSecond, L.byteBurst, now),
      dropped: 0,
    }
    this.sockets++
    this.perAddress.set(address, (this.perAddress.get(address) ?? 0) + 1)
    room.owners.set(join.id, { key: join.key, until: Infinity })
    const others = [...room.members.keys()].filter((id) => id !== join.id)
    room.members.set(join.id, member)
    this.post(socket, { t: 'hi', peers: others })
    if (!previous)
      for (const id of others) this.post(room.members.get(id)!.socket, { t: 'join', id: join.id })

    let gone = false
    return {
      message: (text, t) => {
        if (gone || room.members.get(join.id) !== member) return
        this.onMessage(room, join.id, member, text, t)
      },
      closed: (t) => {
        if (gone) return
        gone = true
        // Replaced by a newer socket with the same id: that one carries on.
        if (room.members.get(join.id) !== member) return
        this.forget(member)
        room.members.delete(join.id)
        room.owners.set(join.id, { key: join.key, until: t + L.idHoldMs })
        for (const m of room.members.values()) this.post(m.socket, { t: 'leave', id: join.id })
      },
    }
  }

  /** Drop rooms with no one in them whose ids are no longer held. Call every minute or so. */
  sweep(now: number): void {
    for (const [key, room] of this.rooms) {
      this.expire(room, now)
      if (!room.members.size && !room.owners.size) this.rooms.delete(key)
    }
  }

  stats(): HubStats {
    return { rooms: this.rooms.size, sockets: this.sockets, ...this.counters, rejected: { ...this.rejected } }
  }

  /** Close every socket (server shutting down). */
  closeAll(): void {
    for (const room of this.rooms.values())
      for (const m of room.members.values()) m.socket.close(CLOSE.shutdown, 'restarting')
  }

  private onMessage(room: Room, from: string, member: Member, text: string, now: number) {
    const size = text.length
    this.counters.messagesIn++
    this.counters.bytesIn += size
    if (
      size > this.limits.maxMessageBytes ||
      !member.messages.take(1, now) ||
      !member.bytes.take(size, now)
    ) {
      this.counters.dropped++
      if (++member.dropped > this.limits.maxDropped) member.socket.close(CLOSE.limit, 'flooding')
      return
    }
    const msg = parseClientMessage(text)
    if (!msg) {
      this.counters.malformed++
      return
    }
    if (msg.t === 'ping') {
      this.post(member.socket, { t: 'pong', n: msg.n })
      return
    }
    // `from` is set here, never taken from the client.
    const out = JSON.stringify({ t: 'msg', from, ch: msg.ch, d: msg.d } satisfies ServerMessage)
    const targets = msg.to ? new Set(msg.to) : room.members.keys()
    for (const id of targets) {
      if (id === from) continue
      const m = room.members.get(id)
      if (!m) continue
      m.socket.send(out)
      this.counters.messagesOut++
    }
  }

  private post(socket: HubSocket, msg: ServerMessage) {
    socket.send(JSON.stringify(msg))
    this.counters.messagesOut++
  }

  private forget(member: Member) {
    this.sockets--
    const n = (this.perAddress.get(member.address) ?? 1) - 1
    if (n > 0) this.perAddress.set(member.address, n)
    else this.perAddress.delete(member.address)
  }

  private expire(room: Room, now: number) {
    for (const [id, o] of room.owners) if (o.until <= now) room.owners.delete(id)
  }

  private dropIfEmpty(key: string, room: Room, result: null): null {
    if (!room.members.size && !room.owners.size) this.rooms.delete(key)
    return result
  }
}
