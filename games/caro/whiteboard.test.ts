import { describe, expect, it } from 'vitest'
import { createBroadcastTransport } from '@forge/net/broadcast'
import { MAX_POINTS, MAX_STROKES, SharedWhiteboard, Whiteboard, type WhiteboardMsg } from './whiteboard'

const pts = (id: string, p: number[], ink = 0, size = 0): WhiteboardMsg => ({
  k: 'pts',
  id,
  ink,
  size,
  pts: p,
})

describe('Whiteboard', () => {
  it('creates a stroke and appends to it', () => {
    const wb = new Whiteboard()
    expect(wb.apply(pts('a', [1, 1]), 'me')).toBe(true)
    expect(wb.apply(pts('a', [2, 2, 3, 3]), 'me')).toBe(true)
    expect(wb.strokes).toEqual([{ id: 'a', owner: 'me', ink: 0, size: 0, pts: [1, 1, 2, 2, 3, 3] }])
    expect(wb.version).toBe(2)
  })

  it("won't let someone else extend or undo my stroke", () => {
    const wb = new Whiteboard()
    wb.apply(pts('a', [1, 1]), 'me')
    expect(wb.apply(pts('a', [5, 5]), 'them')).toBe(false)
    expect(wb.apply({ k: 'undo', id: 'a' }, 'them')).toBe(false)
    expect(wb.apply({ k: 'undo', id: 'a' }, 'me')).toBe(true)
    expect(wb.strokes).toEqual([])
  })

  it('rejects junk', () => {
    const wb = new Whiteboard()
    const bad: unknown[] = [
      null,
      { k: 'nope' },
      pts('', [1, 1]),
      pts('a', [1]),
      pts('a', []),
      pts('a', [1, NaN]),
      pts('a', [1, 1e9]),
      pts('a', [1, '2' as unknown as number]),
      pts('a', [1, 1], 99),
      pts('a', [1, 1], 0, -1),
      pts('x'.repeat(41), [1, 1]),
      { k: 'sync', strokes: 'no' },
    ]
    for (const m of bad) expect(wb.apply(m as WhiteboardMsg, 'p')).toBe(false)
    expect(wb.strokes).toEqual([])
    expect(wb.version).toBe(0)
  })

  it('caps stroke count and stroke length', () => {
    const wb = new Whiteboard()
    for (let i = 0; i < MAX_STROKES + 5; i++) wb.apply(pts(`s${i}`, [1, 1]), 'me')
    expect(wb.strokes).toHaveLength(MAX_STROKES)
    expect(wb.strokes[0].id).toBe('s5')
    const long = Array(MAX_POINTS * 2).fill(1)
    wb.apply(pts('long', long), 'me')
    wb.apply(pts('long', [2, 2]), 'me')
    expect(wb.strokes.at(-1)!.pts).toHaveLength(MAX_POINTS * 2)
  })

  it('sync merges without duplicates', () => {
    const wb = new Whiteboard()
    wb.apply(pts('a', [1, 1]), 'me')
    const strokes = [
      { id: 'a', ink: 1, size: 1, pts: [9, 9] },
      { id: 'b', ink: 1, size: 1, pts: [2, 2] },
    ]
    expect(wb.apply({ k: 'sync', strokes }, 'them')).toBe(true)
    expect(wb.strokes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(wb.strokes[0].pts).toEqual([1, 1])
    expect(wb.apply({ k: 'sync', strokes }, 'them')).toBe(false)
  })

  it('clear and reset', () => {
    const wb = new Whiteboard()
    expect(wb.apply({ k: 'clear' }, 'me')).toBe(false)
    wb.apply(pts('a', [1, 1]), 'me')
    expect(wb.apply({ k: 'clear' }, 'them')).toBe(true)
    wb.apply(pts('b', [1, 1]), 'me')
    wb.reset()
    expect(wb.strokes).toEqual([])
  })
})

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('SharedWhiteboard', () => {
  it('streams strokes, undo and clear between peers, and catches up a latecomer', async () => {
    const room = Math.random().toString(36).slice(2)
    const a = new SharedWhiteboard(createBroadcastTransport('wb-test', room))
    const b = new SharedWhiteboard(createBroadcastTransport('wb-test', room))
    let c: SharedWhiteboard | null = null
    try {
      // Give the peers a moment to find each other.
      await new Promise((r) => setTimeout(r, 100))
      a.begin(1, 1, 2, 1)
      a.extend(2, 2)
      a.extend(3, 3)
      a.end()
      await until(() => b.board.strokes[0]?.pts.length === 6)
      expect(b.board.strokes[0]).toMatchObject({ ink: 2, size: 1, pts: [1, 1, 2, 2, 3, 3] })

      b.begin(5, 5, 0, 0)
      b.end()
      await until(() => a.board.strokes.length === 2)

      // b can't undo a's stroke: undoMine only touches b's own.
      expect(b.undoMine()).toBe(true)
      await until(() => a.board.strokes.length === 1)
      expect(a.board.strokes[0].pts).toEqual([1, 1, 2, 2, 3, 3])

      c = new SharedWhiteboard(createBroadcastTransport('wb-test', room))
      await until(() => c!.board.strokes.length === 1)

      c.clear()
      await until(() => a.board.strokes.length === 0 && b.board.strokes.length === 0)
    } finally {
      a.dispose()
      b.dispose()
      c?.dispose()
    }
  })
})
