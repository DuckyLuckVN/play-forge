// Shared whiteboard: freehand ink over the board, for pointing at threats,
// planning, or just doodling. Strokes live outside the game state and travel
// peer to peer on their own channel (they are cosmetic and can be large), so
// the host's simulation and the state broadcast stay small.
//
// Coordinates are in board cells (0..size), so every screen agrees.

import type { Transport } from '@forge/net/transport'

/** Ink colours, by index (messages carry the index, never a raw colour). */
// Kept clear of the X (red) and O (blue) inks so notes never look like stones.
export const INKS = ['#1f2a44', '#ff7a1a', '#16a34a', '#a855f7', '#e8b400'] as const
/** Pen widths in cells. */
export const PEN_SIZES = [0.08, 0.16, 0.3] as const

export const MAX_STROKES = 300
export const MAX_POINTS = 800
/** Generous bounds (in cells) for incoming points; the biggest board is 19. */
const BOUND = 24
const CHANNEL = 'wb'
/** How often a stroke in progress is streamed to the others. */
const FLUSH_MS = 50

export interface Stroke {
  id: string
  /** Peer that drew it (only they may undo it). */
  owner: string
  ink: number
  size: number
  /** Flat [x0, y0, x1, y1, …] in cells. */
  pts: number[]
}

type WireStroke = Omit<Stroke, 'owner'>

export type WhiteboardMsg =
  /** New points for a stroke (creates it on first sight). */
  | { k: 'pts'; id: string; ink: number; size: number; pts: number[] }
  | { k: 'undo'; id: string }
  | { k: 'clear' }
  /** Everything so far, for a peer who just arrived. */
  | { k: 'sync'; strokes: WireStroke[] }

const round2 = (v: number) => Math.round(v * 100) / 100

function cleanPoints(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length % 2 !== 0 || raw.length > MAX_POINTS * 2) return null
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < -BOUND || v > BOUND) return null
    out.push(round2(v))
  }
  return out
}

const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 40
const validInk = (i: unknown): i is number =>
  Number.isInteger(i) && (i as number) >= 0 && (i as number) < INKS.length
const validSize = (i: unknown): i is number =>
  Number.isInteger(i) && (i as number) >= 0 && (i as number) < PEN_SIZES.length

/**
 * The strokes and the rules for changing them. Pure data: no DOM, no network.
 * Every change bumps `version`, so a renderer can cache its drawing.
 */
export class Whiteboard {
  strokes: Stroke[] = []
  version = 0

  private find(id: string) {
    return this.strokes.find((s) => s.id === id)
  }

  /** Apply a message from `from` (a peer id, or our own id). Returns whether anything changed. */
  apply(msg: WhiteboardMsg, from: string): boolean {
    switch (msg?.k) {
      case 'pts': {
        const pts = cleanPoints(msg.pts)
        if (!validId(msg.id) || !pts || !pts.length) return false
        const existing = this.find(msg.id)
        if (existing) {
          if (existing.owner !== from) return false
          const room = MAX_POINTS * 2 - existing.pts.length
          if (room <= 0) return false
          existing.pts.push(...pts.slice(0, room))
        } else {
          if (!validInk(msg.ink) || !validSize(msg.size)) return false
          this.strokes.push({ id: msg.id, owner: from, ink: msg.ink, size: msg.size, pts })
          if (this.strokes.length > MAX_STROKES) this.strokes.shift()
        }
        break
      }
      case 'undo': {
        const i = this.strokes.findIndex((s) => s.id === msg.id && s.owner === from)
        if (i < 0) return false
        this.strokes.splice(i, 1)
        break
      }
      case 'clear':
        if (!this.strokes.length) return false
        this.strokes = []
        break
      case 'sync': {
        if (!Array.isArray(msg.strokes)) return false
        let changed = false
        for (const s of msg.strokes.slice(-MAX_STROKES)) {
          const pts = cleanPoints(s?.pts)
          if (!validId(s?.id) || !validInk(s.ink) || !validSize(s.size) || !pts?.length || this.find(s.id))
            continue
          this.strokes.push({ id: s.id, owner: from, ink: s.ink, size: s.size, pts })
          changed = true
        }
        if (this.strokes.length > MAX_STROKES) this.strokes.splice(0, this.strokes.length - MAX_STROKES)
        if (!changed) return false
        break
      }
      default:
        return false
    }
    this.version++
    return true
  }

  /** Our most recent stroke, if any. */
  lastOf(owner: string): Stroke | undefined {
    for (let i = this.strokes.length - 1; i >= 0; i--)
      if (this.strokes[i].owner === owner) return this.strokes[i]
    return undefined
  }

  /** Forget everything locally (e.g. a new match), without telling anyone. */
  reset(): void {
    if (!this.strokes.length) return
    this.strokes = []
    this.version++
  }
}

/**
 * A whiteboard kept in sync with every peer in the room. Local drawing is
 * applied at once and streamed in small chunks while the pen moves; newcomers
 * get a full copy from everyone already there (duplicates are ignored).
 */
export class SharedWhiteboard {
  readonly board = new Whiteboard()
  private selfId: string
  private current: { id: string; ink: number; size: number; unsent: number[] } | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private unsubs: (() => void)[] = []
  private seq = 0

  constructor(
    private transport: Transport,
    private onChange: () => void = () => {},
  ) {
    this.selfId = transport.selfId
    this.unsubs.push(
      transport.on(CHANNEL, (msg: WhiteboardMsg, from) => {
        if (msg?.k === 'sync' || msg?.k === 'pts' || msg?.k === 'undo' || msg?.k === 'clear')
          if (this.board.apply(msg, from)) this.onChange()
      }),
      transport.onPeerJoin((peer) => {
        if (!this.board.strokes.length) return
        const strokes = this.board.strokes.map(({ id, ink, size, pts }) => ({ id, ink, size, pts }))
        transport.send(CHANNEL, { k: 'sync', strokes } satisfies WhiteboardMsg, peer)
      }),
    )
  }

  get drawing(): boolean {
    return this.current !== null
  }

  /** Start a stroke at (x, y), in cells. */
  begin(x: number, y: number, ink: number, size: number): void {
    this.end()
    const id = `${this.selfId}-${Date.now().toString(36)}-${this.seq++}`
    this.current = { id, ink, size, unsent: [] }
    this.local({ k: 'pts', id, ink, size, pts: [x, y] })
  }

  /** Continue the current stroke. Points closer than a hair to the last are skipped. */
  extend(x: number, y: number): void {
    const c = this.current
    if (!c) return
    const stroke = this.board.strokes.find((s) => s.id === c.id)
    if (!stroke) return
    const n = stroke.pts.length
    if (Math.hypot(x - stroke.pts[n - 2], y - stroke.pts[n - 1]) < 0.04) return
    this.local({ k: 'pts', id: c.id, ink: c.ink, size: c.size, pts: [x, y] }, false)
  }

  end(): void {
    if (!this.current) return
    this.flush()
    this.current = null
  }

  /** Remove our latest stroke. Returns whether there was one. */
  undoMine(): boolean {
    this.end()
    const last = this.board.lastOf(this.selfId)
    if (!last) return false
    this.local({ k: 'undo', id: last.id })
    return true
  }

  clear(): void {
    this.end()
    this.local({ k: 'clear' })
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.unsubs.forEach((u) => u())
  }

  /** Apply locally, then send now (`immediate`) or batched with the stroke's next points. */
  private local(msg: WhiteboardMsg, immediate = true) {
    if (!this.board.apply(msg, this.selfId)) return
    this.onChange()
    if (msg.k === 'pts' && this.current?.id === msg.id) {
      this.current.unsent.push(...msg.pts)
      if (immediate) this.flush()
      else this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS)
      return
    }
    this.transport.send(CHANNEL, msg)
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    const c = this.current
    if (!c || !c.unsent.length) return
    const pts = c.unsent.map(round2)
    c.unsent = []
    this.transport.send(CHANNEL, {
      k: 'pts',
      id: c.id,
      ink: c.ink,
      size: c.size,
      pts,
    } satisfies WhiteboardMsg)
  }
}
