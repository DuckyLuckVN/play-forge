import { describe, expect, it } from 'vitest'
import { GuestShuttle, RECONCILE } from './guestshuttle'
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
    // The hit-tick sample was lost; a later one carries the event and the new flight.
    const later = structuredClone(states[25])
    later.shuttle.vel = { x: 0, y: 3, z: -20 }
    later.events = [{ id: 1, tick: hitAt, k: 'hit', side: 1, grade: 'good', shot: 'clear' } as never]
    gs.push(later)
    clock.onState(later.tick)
    clock.tick = hitAt + 2
    gs.update(DT)
    // Without the break check sample 10 would run on past the hit and show the old path here.
    expect(gs.pos.x).toBeCloseTo(later.shuttle.pos.x, 9)
    expect(gs.pos.y).toBeCloseTo(later.shuttle.pos.y, 9)
    expect(gs.pos.z).toBeCloseTo(later.shuttle.pos.z, 9)
  })

  it('a late hit bends onto the new path without a jump', () => {
    const s = clear()
    const states: SpState[] = [structuredClone(s)]
    let hit: SpState['events'][number] | undefined
    for (let i = 0; i < 60; i++) {
      step(s, [])
      states.push(structuredClone(s))
      if (i === 19) {
        // A hit on this tick: flight reverses toward the other end. Events persist a while, like the sim's.
        s.shuttle.lastHitter = 1
        s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: -5.5 }, 40, 30)
        states[states.length - 1] = structuredClone(s)
        hit = { id: 1, tick: s.tick, k: 'hit', side: 1, grade: 'good', shot: 'clear' } as never
      }
      if (hit && i >= 19 && i < 29) states[states.length - 1].events = [hit]
    }
    const hitTick = states[20].tick
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const base = states[0].tick
    let prev: Vec3 | null = null
    let worst = 0
    const recent: number[] = []
    let settled = Infinity
    for (let n = 0; n < states.length; n++) {
      const t = states[n].tick
      // Nothing delivered for the 4 ticks around the hit, then the burst.
      if (t < hitTick - 1 || t > hitTick + 2 || t === hitTick + 3) {
        clock.onState(t)
        gs.push(states[n])
      }
      clock.update(DT)
      gs.update(DT)
      const i = Math.floor(clock.tick) - base
      if (n < 4 || i + 1 >= states.length) continue
      const a = states[i].shuttle.pos
      const b = states[i + 1].shuttle.pos
      const want = lerp(a, b, clock.tick - Math.floor(clock.tick))
      // The old path keeps its speed until the burst, so measure against the fastest recent host segment.
      recent.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / DT)
      if (recent.length > 6) recent.shift()
      const speed = Math.max(...recent)
      if (prev && !gs.snapped) {
        const d = Math.hypot(gs.pos.x - prev.x, gs.pos.y - prev.y, gs.pos.z - prev.z)
        worst = Math.max(worst, d / (speed * DT))
      }
      expect(gs.snapped).toBe(false)
      if (t >= hitTick + 3 + 18)
        settled = Math.min(settled, Math.hypot(gs.pos.x - want.x, gs.pos.y - want.y, gs.pos.z - want.z))
      prev = { ...gs.pos }
    }
    expect(worst).toBeLessThanOrEqual(1.6)
    expect(settled).toBeLessThan(0.02)
  })

  it('a serve placement snaps', () => {
    const states = host(clear(), 10)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    for (const s of states.slice(0, 8)) {
      clock.onState(s.tick)
      gs.push(s)
      clock.update(DT)
      gs.update(DT)
    }
    const serve = structuredClone(states[9])
    serve.phase = 'serve'
    serve.shuttle.pos = { x: 1, y: 1, z: 4 }
    clock.onState(serve.tick)
    gs.push(serve)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
    expect(gs.pos).toEqual(serve.shuttle.pos)
  })

  it('a flight-phase serve event snaps instead of bending', () => {
    const states = host(clear(), 12)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    for (const s of states.slice(0, 8)) {
      clock.onState(s.tick)
      gs.push(s)
      clock.update(DT)
      gs.update(DT)
    }
    const placed = structuredClone(states[10])
    placed.shuttle.pos = { x: 1, y: 1, z: 4 }
    placed.events = [{ id: 2, tick: placed.tick - 1, k: 'serve' } as never]
    clock.onState(placed.tick)
    gs.push(placed)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
    expect(RECONCILE.snap).toBeGreaterThan(0)
  })

  it('shuttle follows a clock resync', () => {
    const states = host(clear(), 200)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const base = states[0].tick
    for (let n = 0; n < 6; n++) {
      clock.onState(states[n].tick)
      gs.push(states[n])
      clock.update(DT)
      gs.update(DT)
    }
    for (let f = 0; f < 120; f++) {
      clock.update(DT)
      gs.update(DT)
    }
    const s = states[130]
    clock.onState(s.tick)
    gs.push(s)
    clock.update(DT)
    gs.update(DT)
    const i = Math.floor(clock.tick) - base
    const want = lerp(states[i].shuttle.pos, states[i + 1].shuttle.pos, clock.tick - Math.floor(clock.tick))
    expect(Math.abs(gs.pos.x - want.x)).toBeLessThan(1e-9)
    expect(Math.abs(gs.pos.y - want.y)).toBeLessThan(1e-9)
    expect(Math.abs(gs.pos.z - want.z)).toBeLessThan(1e-9)
  })
})
