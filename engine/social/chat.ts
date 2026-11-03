import { Emitter } from '../core/emitter'
import { randomId, type Transport } from '../net/transport'
import { RateLimiter } from './reactions'

export const CHAT_MAX_LENGTH = 200
/** Kept per room, in memory only. */
export const CHAT_HISTORY_KEPT = 100
/** What the host sends to someone who joins late. */
export const CHAT_HISTORY_SHARED = 30
export const CHAT_SEND_LIMIT = { max: 5, windowMs: 5000 }
export const CHAT_RECEIVE_LIMIT = { max: 8, windowMs: 5000 }

const CHANNEL = 'tx'

export interface ChatMessage {
  id: string
  playerId: string
  /** Sender's name when sent; the UI prefers their current name if seated. */
  name: string
  text: string
  mine: boolean
}

/** One message on the wire. */
interface WireMessage {
  id: string
  p: string
  n: string
  t: string
}
type Packet = ({ k: 'm' } & WireMessage) | { k: 'h'; m: WireMessage[] }

/** Plain one-line text: no control characters, trimmed, capped. */
export function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  let out = ''
  for (const ch of raw) {
    const code = ch.charCodeAt(0)
    const control = code < 0x20 || code === 0x7f
    if (!control) out += ch
    else if (!out.endsWith(' ')) out += ' '
  }
  return out.trim().slice(0, CHAT_MAX_LENGTH).trim()
}

function parseWire(raw: unknown): WireMessage | null {
  const r = raw as Partial<WireMessage> | null
  if (!r || typeof r !== 'object') return null
  const id = typeof r.id === 'string' ? r.id.slice(0, 24) : ''
  const p = typeof r.p === 'string' ? r.p.slice(0, 40) : ''
  const t = cleanText(r.t)
  if (!id || !p || !t) return null
  return { id, p, n: cleanText(r.n).slice(0, 16) || 'Player', t }
}

export interface ChatHubOptions {
  selfId: string
  /** Our current name, sent with each message. */
  selfName(): string
  /** Live messages only count from players in the room. */
  isKnown(playerId: string): boolean
  /** Only the host shares history with newcomers. */
  isHost(): boolean
  now?: () => number
}

export type SendResult = 'ok' | 'empty' | 'limited'

/**
 * Text chat for one room, on its own channel. Messages are plain text (the
 * UI must render them with textContent). No server: history lives in the
 * host's memory, which sends the recent part to players who join later.
 */
export class ChatHub {
  private events = new Emitter<{ message: [ChatMessage, boolean] }>()
  private log: ChatMessage[] = []
  private seen = new Set<string>()
  private sendLimit: RateLimiter
  private receiveLimits = new Map<string, RateLimiter>()
  private gotHistory = false
  private offs: (() => void)[]
  private now: () => number

  constructor(
    private transport: Transport,
    private opts: ChatHubOptions,
  ) {
    this.now = opts.now ?? (() => Date.now())
    this.sendLimit = new RateLimiter(CHAT_SEND_LIMIT.max, CHAT_SEND_LIMIT.windowMs, this.now)
    this.offs = [
      transport.on(CHANNEL, (raw: Packet) => this.receive(raw)),
      transport.onPeerJoin((peer) => {
        if (!this.opts.isHost() || !this.log.length) return
        const m = this.log
          .slice(-CHAT_HISTORY_SHARED)
          .map((x) => ({ id: x.id, p: x.playerId, n: x.name, t: x.text }))
        transport.send(CHANNEL, { k: 'h', m } satisfies Packet, peer)
      }),
    ]
  }

  messages(): readonly ChatMessage[] {
    return this.log
  }

  send(text: string): SendResult {
    const t = cleanText(text)
    if (!t) return 'empty'
    if (!this.sendLimit.take()) return 'limited'
    const wire: WireMessage = {
      id: randomId(10),
      p: this.opts.selfId,
      n: cleanText(this.opts.selfName()) || 'Player',
      t,
    }
    this.transport.send(CHANNEL, { k: 'm', ...wire } satisfies Packet)
    this.add(wire, false)
    return 'ok'
  }

  /** `fromHistory` is true for messages sent before we joined. */
  on(handler: (message: ChatMessage, fromHistory: boolean) => void): () => void {
    return this.events.on('message', handler)
  }

  dispose(): void {
    this.offs.forEach((off) => off())
    this.events.clear()
  }

  private receive(raw: Packet) {
    if (!raw || typeof raw !== 'object') return
    if (raw.k === 'h') {
      // Once per room, before anything else would make the order confusing.
      if (this.gotHistory || !Array.isArray(raw.m)) return
      this.gotHistory = true
      for (const w of raw.m.slice(-CHAT_HISTORY_SHARED)) {
        const m = parseWire(w)
        if (m) this.add(m, true)
      }
      return
    }
    if (raw.k !== 'm') return
    const m = parseWire(raw)
    if (!m || m.p === this.opts.selfId || !this.opts.isKnown(m.p)) return
    let limit = this.receiveLimits.get(m.p)
    if (!limit) {
      limit = new RateLimiter(CHAT_RECEIVE_LIMIT.max, CHAT_RECEIVE_LIMIT.windowMs, this.now)
      this.receiveLimits.set(m.p, limit)
    }
    if (limit.take()) this.add(m, false)
  }

  private add(w: WireMessage, fromHistory: boolean) {
    if (this.seen.has(w.id)) return
    this.seen.add(w.id)
    const msg: ChatMessage = { id: w.id, playerId: w.p, name: w.n, text: w.t, mine: w.p === this.opts.selfId }
    this.log.push(msg)
    if (this.log.length > CHAT_HISTORY_KEPT) this.log.shift()
    this.events.emit('message', msg, fromHistory)
  }
}
