import { describe, expect, it } from 'vitest'
import type { PlayerInfo } from '@forge/net/session'
import { PRESETS } from './presets'
import { boardNote, boardView, tintCss } from './scoreboard'
import { createState, type SpState } from './sim'

const online: PlayerInfo[] = [0, 1].map((i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  slot: i,
  ready: true,
  connected: true,
}))

function match(score: [number, number], server: 0 | 1, phase: SpState['phase'] = 'serve'): SpState {
  const s = createState(online, 1)
  s.score = score
  s.server = server
  s.phase = phase
  return s
}

describe('boardView', () => {
  it('puts the given side on the left (the local player), the other on the right', () => {
    const s = match([3, 7], 0)
    const me = s.players.find((p) => p.side === 1)!
    const v = boardView(s, 1)
    expect(v.left.name).toBe(me.name)
    expect(v.left.score).toBe(7)
    expect(v.right.score).toBe(3)
    expect(v.left.tint).toBe(tintCss(PRESETS[me.preset].tint))
    const w = boardView(s, 0)
    expect(w.left.score).toBe(3)
    expect(w.right.score).toBe(7)
  })

  it('the computer seat shows its translated name', () => {
    const s = createState([online[0]], 1, { solo: 'normal' })
    const ai = s.players.find((p) => p.kind === 'ai')!
    const v = boardView(s, ai.side === 0 ? 1 : 0)
    expect(v.right.name).toBe('Computer')
    expect(v.left.name).toBe('Player 0')
  })

  it('the shuttle icon goes on the server, on whichever side that is', () => {
    expect(boardView(match([0, 0], 0), 0).left.serving).toBe(true)
    expect(boardView(match([0, 0], 0), 0).right.serving).toBe(false)
    expect(boardView(match([0, 0], 0), 1).right.serving).toBe(true)
    expect(boardView(match([0, 0], 1), 1).left.serving).toBe(true)
  })

  it('no serve icon once the match is over', () => {
    const v = boardView(match([11, 4], 0, 'over'), 0)
    expect(v.left.serving || v.right.serving).toBe(false)
  })

  it('match point marks the side one point from winning, only while play is live', () => {
    const v = boardView(match([10, 5], 0, 'rally'), 1)
    expect(v.right.matchPoint).toBe(true)
    expect(v.left.matchPoint).toBe(false)
    expect(v.match).toBe('theirs')
    expect(boardView(match([10, 5], 0, 'serve'), 0).match).toBe('mine')
    // 14–14: both sides are one point from the cap.
    expect(boardView(match([14, 14], 1, 'serve'), 0).match).toBe('both')
    // The point pause and the results don't flash it.
    expect(boardView(match([10, 5], 0, 'point'), 0).match).toBe(null)
    expect(boardView(match([11, 5], 0, 'over'), 0).match).toBe(null)
  })

  it('carries the deuce note', () => {
    expect(boardView(match([12, 12], 0, 'rally'), 0).note).toBe('deuce')
  })
})

describe('boardNote', () => {
  it('deuce from 10-all, until the cap', () => {
    expect(boardNote([9, 9])).toBe(null)
    expect(boardNote([10, 10])).toBe('deuce')
    expect(boardNote([13, 13])).toBe('deuce')
  })

  it('14-all: next point wins', () => {
    expect(boardNote([14, 14])).toBe('cap')
  })

  it('nothing when not level (match point says it) or when the match is won', () => {
    expect(boardNote([11, 10])).toBe(null)
    expect(boardNote([12, 10])).toBe(null)
    expect(boardNote([15, 14])).toBe(null)
  })
})

describe('tintCss', () => {
  it('formats a 24-bit colour as #rrggbb', () => {
    expect(tintCss(0xff8fab)).toBe('#ff8fab')
    expect(tintCss(0x00000f)).toBe('#00000f')
  })
})
