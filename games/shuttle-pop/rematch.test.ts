// A rematch restarts host ticks at 0 while the smoothing pair still holds the old match's last state
// as `prev`. Guests must not feed that state: it locks the render clock (and the remote/shuttle
// tracks) on the old match's ticks, so other players and the shuttle freeze on the old match's end.
import { describe, expect, it } from 'vitest'
import { sameMatchPrev } from './hud'
import { RemoteTracks } from './remotes'
import { RenderClock } from './renderclock'

type P = { id: string; x: number; z: number; vx: number; vz: number }
const player = (id: string, x = 0): P => ({ id, x, z: 0, vx: 0, vz: 0 })
const state = (tick: number, ...ids: string[]) => ({ tick, players: ids.map((id) => player(id, tick)) })

/** What Court3D.frame feeds a guest's clock and remote tracks each frame. */
function feed(clock: RenderClock, remotes: RemoteTracks, prev: ReturnType<typeof state>, curr: typeof prev) {
  const p = sameMatchPrev(prev, curr)
  clock.onState(p.tick)
  clock.onState(curr.tick)
  remotes.push(p.tick, p.players)
  remotes.push(curr.tick, curr.players)
  clock.update(1 / 60)
}

describe('sameMatchPrev', () => {
  it('keeps prev during normal play', () => {
    const prev = state(10, 'a', 'b')
    expect(sameMatchPrev(prev, state(11, 'a', 'b'))).toBe(prev)
  })

  it('drops prev from an earlier match (ticks went back)', () => {
    const curr = state(0, 'a', 'b')
    expect(sameMatchPrev(state(5000, 'a', 'b'), curr)).toBe(curr)
  })

  it('drops prev when the seats changed (1v1 → 2v2, or a team swap)', () => {
    const curr = state(1, 'a', 'b', 'c', 'd')
    expect(sameMatchPrev(state(0, 'a', 'b'), curr)).toBe(curr)
    const swapped = state(1, 'b', 'a')
    expect(sameMatchPrev(state(0, 'a', 'b'), swapped)).toBe(swapped)
  })
})

describe('guest feed across a rematch', () => {
  it('the render clock and remote tracks follow the new match, not the old final tick', () => {
    const clock = new RenderClock(60)
    const remotes = new RemoteTracks(clock)
    const oldEnd = state(5000, 'a', 'b')
    feed(clock, remotes, state(4999, 'a', 'b'), oldEnd)
    // Rematch: Court3D.reset() clears them; prev is still the old match's last state for a while.
    clock.reset()
    remotes.reset()
    feed(clock, remotes, oldEnd, state(0, 'a', 'b'))
    feed(clock, remotes, state(0, 'a', 'b'), state(1, 'a', 'b'))
    feed(clock, remotes, state(1, 'a', 'b'), state(2, 'a', 'b'))
    expect(clock.newest).toBe(2)
    const out = { x: NaN, z: 0, vx: 0, vz: 0 }
    expect(remotes.sample('b', out)).toBe(true)
    expect(out.x).toBeLessThan(10) // a new-match position, not the old end (x = 5000)
  })
})
