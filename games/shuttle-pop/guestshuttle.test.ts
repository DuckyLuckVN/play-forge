import { describe, expect, it } from 'vitest'
import { GuestShuttle } from './guestshuttle'
import { solveLaunch, type Vec3 } from './physics'
import { RenderClock } from './renderclock'
import { createState, step, type SpState } from './sim'

const DT = 1 / 60

function rally(pos: Vec3, vel: Vec3): SpState {
  const s = createState(
    [
      { id: 'a', name: 'A', slot: 0, ready: true },
      { id: 'b', name: 'B', slot: 1, ready: true },
    ] as never,
    1,
  )
  s.phase = 'rally'
  s.phaseT = 0
  s.shuttle.lastHitter = 0
  s.shuttle.pending = null
  s.shuttle.pos = { ...pos }
  s.shuttle.vel = { ...vel }
  return s
}

/** host[n] = state at tick (start tick + n); host[0] is the initial state. */
function host(s: SpState, n: number): SpState[] {
  const out = [structuredClone(s)]
  for (let i = 0; i < n; i++) {
    step(s, [])
    out.push(structuredClone(s))
  }
  return out
}

const clear = () => {
  const s = rally({ x: 0, y: 1.2, z: -5 }, { x: 0, y: 0, z: 0 })
  s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: 5.5 }, 50, 30)
  return s
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/** Drive one frame per tick (60 Hz); `drop` ticks are never delivered. Returns [drawn, expected] per frame. */
function run(states: SpState[], drop: (tick: number) => boolean) {
  const clock = new RenderClock(60)
  const gs = new GuestShuttle(clock)
  const base = states[0].tick
  const out: { got: Vec3; want: Vec3 }[] = []
  for (let n = 0; n < states.length; n++) {
    const s = states[n]
    if (!drop(s.tick)) {
      clock.onState(s.tick)
      gs.push(s)
    }
    clock.update(DT)
    gs.update(DT)
    const i = Math.floor(clock.tick) - base
    if (n < 4 || i + 1 >= states.length || i < 0) continue
    const want = lerp(states[i].shuttle.pos, states[i + 1].shuttle.pos, clock.tick - Math.floor(clock.tick))
    out.push({ got: { ...gs.pos }, want })
  }
  return out
}

function expectClose(frames: { got: Vec3; want: Vec3 }[]) {
  expect(frames.length).toBeGreaterThan(5)
  for (const { got, want } of frames) {
    expect(got.x).toBeCloseTo(want.x, 9)
    expect(got.y).toBeCloseTo(want.y, 9)
    expect(got.z).toBeCloseTo(want.z, 9)
  }
}

describe('GuestShuttle', () => {
  it('matches the host flight exactly with no jitter', () => {
    expectClose(run(host(clear(), 50), () => false))
  })

  it('extrapolates the exact host flight through a 5-tick gap', () => {
    const states = host(clear(), 50)
    const t0 = states[20].tick
    expectClose(run(states, (t) => t >= t0 && t < t0 + 5))
  })

  it('stops at the floor like the sim', () => {
    const states = host(rally({ x: 0.3, y: 1, z: -2 }, { x: 0.5, y: 0, z: 1 }), 80)
    const landing = states.findIndex((s) => s.shuttle.pos.y === 0 && s.phase === 'point')
    expect(landing).toBeGreaterThan(8)
    const t0 = states[landing - 2].tick
    const frames = run(states, (t) => t >= t0 && t < t0 + 5)
    expectClose(frames)
    expect(Math.min(...frames.map((f) => f.got.y))).toBeGreaterThanOrEqual(0)
    expect(frames[frames.length - 1].got.z).toBeCloseTo(states[landing].shuttle.pos.z, 9)
  })

  it('stops on the net like the sim', () => {
    const states = host(rally({ x: 0, y: 0.8, z: -1.5 }, { x: 0, y: 0.5, z: 12 }), 50)
    const net = states.findIndex((s) => s.events.some((e) => e.k === 'net'))
    expect(net).toBeGreaterThan(2)
    const t0 = states[net - 1].tick
    const frames = run(states, (t) => t >= t0 && t < t0 + 5)
    expectClose(frames)
    expect(Math.max(...frames.map((f) => f.got.z))).toBeLessThan(0)
  })

  it('snaps and holds the newest position outside flight', () => {
    const states = host(clear(), 10)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const serve = structuredClone(states[10])
    serve.phase = 'serve'
    serve.shuttle.pos = { x: 1, y: 1, z: 6 }
    clock.onState(serve.tick)
    gs.push(serve)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
    expect(gs.pos).toEqual(serve.shuttle.pos)
  })

  it('does not run a sample past a later hit', () => {
    const states = host(clear(), 30)
    const hitAt = states[20].tick
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    gs.push(states[10])
    const hit = structuredClone(states[20])
    hit.shuttle.vel = { x: 0, y: 3, z: -20 }
    hit.events = [{ id: 1, tick: hitAt, k: 'hit', side: 1, grade: 'good', shot: 'clear' } as never]
    gs.push(hit)
    clock.onState(hitAt)
    clock.tick = hitAt - 0.5
    gs.update(DT)
    // Frame k = hitAt - 1 comes from the old flight; k = hitAt from the hit sample (no old-path overshoot).
    expect(gs.pos.z).toBeLessThan(states[20].shuttle.pos.z)
  })
})
