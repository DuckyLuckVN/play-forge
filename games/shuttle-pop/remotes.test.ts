import { describe, expect, it } from 'vitest'
import { RemoteTracks, type PlayerSample } from './remotes'
import { CLOCK, RenderClock } from './renderclock'

const P = (id: string, x: number, z = 0, vx = 0, vz = 0): PlayerSample => ({ id, x, z, vx, vz })
const out = { x: 0, z: 0, vx: 0, vz: 0 }

function setup() {
  const clock = new RenderClock(60)
  return { clock, tracks: new RemoteTracks(clock) }
}

/** Feed the clock a state at `tick` and advance it by whole frames until it shows `shown`. */
function showAt(clock: RenderClock, tick: number, shown: number) {
  clock.onState(tick)
  clock.tick = shown
}

describe('RemoteTracks', () => {
  it('placement snaps, no glide', () => {
    const { clock, tracks } = setup()
    tracks.push(10, [P('a', 0, -5)])
    tracks.push(11, [P('a', 0, -2)]) // serve set-up: 3 m in one tick
    showAt(clock, 11, 10.4)
    expect(tracks.sample('a', out)).toBe(true)
    expect(out.z).toBe(-2)
    showAt(clock, 11, 11)
    tracks.sample('a', out)
    expect(out.z).toBe(-2)
  })

  it('lerps between the bracketing samples', () => {
    const { clock, tracks } = setup()
    tracks.push(10, [P('a', 0, 0, 1)])
    tracks.push(11, [P('a', 0.1, 0, 1)])
    showAt(clock, 11, 10.5)
    tracks.sample('a', out)
    expect(out.x).toBeCloseTo(0.05)
    expect(out.vx).toBeCloseTo(1)
  })

  it('works for any player count', () => {
    const { clock, tracks } = setup()
    const ids = ['a', 'b', 'c', 'd']
    for (const n of [1, 2, 4]) {
      tracks.reset()
      for (const tick of [1, 2])
        tracks.push(
          tick,
          ids.slice(0, n).map((id, i) => P(id, i + tick * 0.01)),
        )
      showAt(clock, 2, 1.5)
      ids.slice(0, n).forEach((id, i) => {
        expect(tracks.sample(id, out)).toBe(true)
        expect(out.x).toBeCloseTo(i + 0.015)
      })
      if (n < 4) expect(tracks.sample('d', out)).toBe(false)
    }
    tracks.push(3, [P('a', 0), P('b', 1), P('d', 3)])
    expect(tracks.sample('c', out)).toBe(false)
    expect(tracks.sample('unknown', out)).toBe(false)
  })

  it("a leaver's seat renamed mid-match (computer takes it): old id dropped, new id tracked", () => {
    const { clock, tracks } = setup()
    tracks.push(1, [P('a', 0), P('c', 2)])
    tracks.push(2, [P('a', 0), P('ai1', 2.01)])
    showAt(clock, 2, 2)
    expect(tracks.sample('c', out)).toBe(false)
    expect(tracks.sample('ai1', out)).toBe(true)
    expect(out.x).toBeCloseTo(2.01)
    expect(tracks.sample('a', out)).toBe(true)
  })

  it('extrapolation capped', () => {
    const { clock, tracks } = setup()
    tracks.push(10, [P('a', 0, 0, 3)])
    tracks.push(11, [P('a', 0.05, 0, 3)])
    clock.onState(11)
    for (let i = 0; i < 30; i++) clock.update(1 / 60)
    tracks.sample('a', out)
    expect(out.x - 0.05).toBeGreaterThan(0)
    expect(out.x - 0.05).toBeLessThanOrEqual((3 * CLOCK.maxAhead) / 60 + 1e-9)
  })

  it('ignores stale ticks and keeps at most 8 samples', () => {
    const { clock, tracks } = setup()
    for (let t = 1; t <= 20; t++) tracks.push(t, [P('a', t)])
    tracks.push(5, [P('a', 99)])
    showAt(clock, 20, 15.5)
    tracks.sample('a', out)
    expect(out.x).toBeCloseTo(15.5)
    showAt(clock, 20, 3) // older than the ring: oldest kept sample
    tracks.sample('a', out)
    expect(out.x).toBe(13)
  })
})
