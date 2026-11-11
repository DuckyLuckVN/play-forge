import { describe, expect, it } from 'vitest'
import { smoothState } from './smoothing'

type S = { tick: number; pos: { x: number } }

function fakeSession(isHost: boolean) {
  const listeners = new Set<(s: S) => void>()
  return {
    isHost,
    state: null as S | null,
    tickRate: 60,
    on: (_: 'state', fn: (s: S) => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emit: (s: S) => listeners.forEach((fn) => fn(s)),
  }
}

describe('smoothState', () => {
  it('host: keeps private copies (the host mutates its state in place)', () => {
    const session = fakeSession(true)
    const smooth = smoothState(session as never)
    const live: S = { tick: 1, pos: { x: 1 } }
    session.emit(live)
    live.tick = 2
    live.pos.x = 2
    session.emit(live)
    expect(smooth.prev).toEqual({ tick: 1, pos: { x: 1 } })
    expect(smooth.curr).toEqual({ tick: 2, pos: { x: 2 } })
    expect(smooth.curr).not.toBe(live)
  })

  it('guest: keeps the decoded state as is (no clone per message)', () => {
    const session = fakeSession(false)
    const smooth = smoothState(session as never)
    const a: S = { tick: 1, pos: { x: 1 } }
    const b: S = { tick: 2, pos: { x: 2 } }
    session.emit(a)
    session.emit(b)
    expect(smooth.prev).toBe(a)
    expect(smooth.curr).toBe(b)
  })

  it('stops listening on dispose', () => {
    const session = fakeSession(false)
    const smooth = smoothState(session as never)
    smooth.dispose()
    session.emit({ tick: 9, pos: { x: 0 } })
    expect(smooth.curr).toBeNull()
  })
})
