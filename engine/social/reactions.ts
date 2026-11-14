import type { Sound } from '../audio/sound'
import { Emitter } from '../core/emitter'
import type { Transport } from '../net/transport'

/** How a reaction moves while it floats up. */
export type ReactionMotion = 'shake' | 'flicker' | 'pop' | 'wobble' | 'beat' | 'spin' | 'peek'

export interface ReactionDef {
  id: string
  /** English name: label for screen readers and the i18n key. */
  name: string
  motion: ReactionMotion
  sound: Sound
  /**
   * Retired from the tray and wheel. Kept so packets from older clients still
   * show (ids are a wire format: never rename or remove one).
   */
  hidden?: boolean
}

export const REACTIONS: readonly ReactionDef[] = [
  {
    id: 'laugh',
    name: 'Laugh',
    motion: 'shake',
    sound: [
      { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.4 },
      { freq: 780, dur: 0.06, wave: 'triangle', vol: 0.4, at: 0.08 },
      { freq: 920, dur: 0.08, wave: 'triangle', vol: 0.4, at: 0.16 },
    ],
  },
  {
    id: 'fire',
    name: 'Fire',
    motion: 'flicker',
    sound: { freq: 1800, to: 400, dur: 0.25, wave: 'noise', vol: 0.4 },
  },
  {
    id: 'gg',
    name: 'Good game',
    motion: 'pop',
    sound: [
      { freq: 523, dur: 0.08, wave: 'square', vol: 0.25 },
      { freq: 784, dur: 0.14, wave: 'square', vol: 0.25, at: 0.08 },
    ],
  },
  {
    id: 'rage',
    name: 'Rage',
    motion: 'shake',
    sound: { freq: 160, to: 110, dur: 0.22, wave: 'sawtooth', vol: 0.3 },
  },
  {
    id: 'cry',
    name: 'Cry',
    motion: 'wobble',
    sound: { freq: 620, to: 330, dur: 0.35, wave: 'sine', vol: 0.4 },
  },
  {
    id: 'clap',
    hidden: true,
    name: 'Clap',
    motion: 'beat',
    sound: [
      { freq: 2400, dur: 0.04, wave: 'noise', vol: 0.5 },
      { freq: 2400, dur: 0.04, wave: 'noise', vol: 0.5, at: 0.12 },
    ],
  },
  {
    id: 'skull',
    name: 'Dead',
    motion: 'spin',
    sound: { freq: 300, to: 140, dur: 0.3, wave: 'square', vol: 0.25 },
  },
  {
    id: 'heart',
    name: 'Love',
    motion: 'beat',
    sound: [
      { freq: 880, dur: 0.07, wave: 'sine', vol: 0.4 },
      { freq: 1175, dur: 0.12, wave: 'sine', vol: 0.4, at: 0.09 },
    ],
  },
  {
    id: 'eyes',
    name: 'Side eye',
    motion: 'peek',
    sound: { freq: 500, to: 700, dur: 0.15, wave: 'triangle', vol: 0.3 },
  },
  {
    id: 'boom',
    hidden: true,
    name: 'Boom',
    motion: 'pop',
    sound: { freq: 900, to: 60, dur: 0.35, wave: 'noise', vol: 0.5 },
  },
  {
    id: 'crown',
    hidden: true,
    name: 'King',
    motion: 'spin',
    sound: [
      { freq: 784, dur: 0.08, wave: 'triangle', vol: 0.35 },
      { freq: 988, dur: 0.08, wave: 'triangle', vol: 0.35, at: 0.08 },
      { freq: 1319, dur: 0.16, wave: 'triangle', vol: 0.35, at: 0.16 },
    ],
  },
  {
    id: 'sweat',
    name: 'Nervous',
    motion: 'wobble',
    sound: { freq: 700, to: 520, dur: 0.18, wave: 'sine', vol: 0.35 },
  },
  {
    id: 'like',
    name: 'Like',
    motion: 'pop',
    sound: [
      { freq: 660, dur: 0.06, wave: 'square', vol: 0.25 },
      { freq: 990, dur: 0.1, wave: 'square', vol: 0.25, at: 0.07 },
    ],
  },
  {
    id: 'dislike',
    name: 'Dislike',
    motion: 'shake',
    sound: [
      { freq: 440, dur: 0.07, wave: 'square', vol: 0.22 },
      { freq: 294, dur: 0.12, wave: 'square', vol: 0.22, at: 0.08 },
    ],
  },
  {
    id: 'haha',
    name: 'Haha',
    motion: 'shake',
    sound: [
      { freq: 880, dur: 0.05, wave: 'triangle', vol: 0.35 },
      { freq: 1046, dur: 0.05, wave: 'triangle', vol: 0.35, at: 0.07 },
      { freq: 880, dur: 0.05, wave: 'triangle', vol: 0.35, at: 0.14 },
      { freq: 1175, dur: 0.08, wave: 'triangle', vol: 0.35, at: 0.21 },
    ],
  },
  {
    id: 'thinking',
    name: 'Thinking',
    motion: 'wobble',
    sound: [
      { freq: 392, dur: 0.12, wave: 'sine', vol: 0.35 },
      { freq: 466, dur: 0.16, wave: 'sine', vol: 0.35, at: 0.16 },
    ],
  },
  // Voice chat helpers: quicker than typing "can't hear you" mid-game.
  {
    id: 'mic-on',
    name: 'Turn on your mic',
    motion: 'beat',
    sound: [
      { freq: 587, dur: 0.07, wave: 'triangle', vol: 0.35 },
      { freq: 880, dur: 0.12, wave: 'triangle', vol: 0.35, at: 0.08 },
    ],
  },
  {
    id: 'mic-off',
    hidden: true,
    name: 'Mute your mic',
    motion: 'shake',
    sound: [
      { freq: 880, dur: 0.07, wave: 'triangle', vol: 0.35 },
      { freq: 587, dur: 0.12, wave: 'triangle', vol: 0.35, at: 0.08 },
    ],
  },
  {
    id: 'hear-me',
    name: 'Can you hear me?',
    motion: 'wobble',
    sound: { freq: 520, to: 780, dur: 0.22, wave: 'sine', vol: 0.4 },
  },
  {
    id: 'cant-hear',
    name: "Can't hear you",
    motion: 'shake',
    sound: [
      { freq: 330, dur: 0.1, wave: 'square', vol: 0.2 },
      { freq: 330, dur: 0.1, wave: 'square', vol: 0.2, at: 0.14 },
    ],
  },
]

/** Every id a client accepts, hidden ones included. */
export const REACTION_IDS: readonly string[] = REACTIONS.map((r) => r.id)
/** The tray, in order: thumbs and love first, then faces, then the voice helpers. */
export const TRAY_REACTIONS: readonly string[] = [
  'like',
  'dislike',
  'heart',
  'fire',
  'laugh',
  'haha',
  'thinking',
  'gg',
  'rage',
  'cry',
  'skull',
  'eyes',
  'sweat',
  'mic-on',
  'hear-me',
  'cant-hear',
]
/** Reaction wheel slots, clockwise from the top: the tray's first 8 (no voice helpers). */
export const WHEEL_REACTIONS: readonly string[] = TRAY_REACTIONS.slice(0, 8)
export const reactionDef = (id: string) => REACTIONS.find((r) => r.id === id)

/** Sliding-window limit: at most `max` hits per `windowMs`. */
export class RateLimiter {
  private hits: number[] = []
  constructor(
    readonly max: number,
    readonly windowMs: number,
    private now: () => number = () => Date.now(),
  ) {}

  /** Records a hit and returns true if it is within the limit. */
  take(): boolean {
    const t = this.now()
    this.hits = this.hits.filter((h) => t - h < this.windowMs)
    if (this.hits.length >= this.max) return false
    this.hits.push(t)
    return true
  }
}

/** Sending: a quick burst is fine (that's the fun), a stream is not. */
export const SEND_LIMIT = { max: 3, windowMs: 2000 }
/** Receiving: a little looser than sending, to forgive network jitter. */
export const RECEIVE_LIMIT = { max: 5, windowMs: 2000 }

const CHANNEL = 'rx'

interface Packet {
  /** Sender's player id (not the peer id, which other games don't map). */
  p: string
  /** Reaction id. */
  r: string
}

export interface ReactionHubOptions {
  /** Ignore reactions from anyone who isn't a known player (or spectator). */
  isKnown(playerId: string): boolean
  now?: () => number
}

/**
 * Sends and receives emoji reactions on their own channel, outside the game
 * state. Purely cosmetic: a dropped or blocked reaction never affects play.
 */
export class ReactionHub {
  private events = new Emitter<{ reaction: [playerId: string, reactionId: string] }>()
  private sendLimit: RateLimiter
  private receiveLimits = new Map<string, RateLimiter>()
  private off: () => void

  constructor(
    private transport: Transport,
    readonly selfId: string,
    private opts: ReactionHubOptions,
  ) {
    const now = opts.now ?? (() => Date.now())
    this.sendLimit = new RateLimiter(SEND_LIMIT.max, SEND_LIMIT.windowMs, now)
    this.off = transport.on(CHANNEL, (msg: Packet) => {
      const p = typeof msg?.p === 'string' ? msg.p : ''
      const r = typeof msg?.r === 'string' ? msg.r : ''
      if (!p || p === this.selfId || !REACTION_IDS.includes(r) || !this.opts.isKnown(p)) return
      let limit = this.receiveLimits.get(p)
      if (!limit)
        this.receiveLimits.set(p, (limit = new RateLimiter(RECEIVE_LIMIT.max, RECEIVE_LIMIT.windowMs, now)))
      if (limit.take()) this.events.emit('reaction', p, r)
    })
  }

  /** Send a reaction; shown locally at once. False if unknown or rate-limited. */
  send(reactionId: string): boolean {
    if (!REACTION_IDS.includes(reactionId) || !this.sendLimit.take()) return false
    this.transport.send(CHANNEL, { p: this.selfId, r: reactionId } satisfies Packet)
    this.events.emit('reaction', this.selfId, reactionId)
    return true
  }

  on(handler: (playerId: string, reactionId: string) => void): () => void {
    return this.events.on('reaction', handler)
  }

  dispose(): void {
    this.off()
    this.events.clear()
  }
}
