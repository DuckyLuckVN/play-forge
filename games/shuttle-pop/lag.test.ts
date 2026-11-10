import { afterEach, describe, expect, it, vi } from 'vitest'
import { smoothState } from '@forge/net/smoothing'
import type { Session } from '@forge/net/session'
import { solveLaunch, type Vec3 } from './physics'
import { createState, step, type SpState } from './sim'
import { GuestShuttle } from './guestshuttle'
import { RenderClock } from './renderclock'
import { interpShuttle } from './world'

const TICK_MS = 1000 / 60

/** Fake time (ms) the harness drives performance.now / the frame loop with. */
const clock = { now: 0 }

/** A rally state mid-clear: shuttle in flight from the near side toward the far baseline. */
function rallyFlight(): SpState {
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
  s.shuttle.pos = { x: 0, y: 1.2, z: -5 }
  s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: 5.5 }, 50, 30)
  return s
}

/** n host states after each step (clones: the sim mutates in place). */
function hostTicks(state: SpState, n: number): SpState[] {
  const out: SpState[] = []
  for (let i = 0; i < n; i++) {
    step(state, [])
    out.push(structuredClone(state))
  }
  return out
}

/** Arrival time (ms) per tick: tick time + base latency + seeded jitter; monotone (ordered channel). */
function arrivals(ticks: number[], seed: number, baseMs = 40, jitterMs = 25): number[] {
  let x = seed >>> 0 || 1
  const rnd = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296
  let last = -Infinity
  return ticks.map((t) => (last = Math.max(last, (t * 1000) / 60 + baseMs + rnd() * jitterMs)))
}

interface View {
  deliver(s: SpState): void
  /** Draw position and the host tick it shows (fractional). */
  draw(): { pos: Vec3; tick: number }
}

interface Frame {
  pos: Vec3
  tick: number
}

/** Walk frames at frameHz (7 ms phase offset); deliver arrived states; record the drawn position. */
function render(states: SpState[], arr: number[], frameHz: number, view: View): Frame[] {
  const dt = 1000 / frameHz
  const end = arr[arr.length - 1]
  const frames: Frame[] = []
  let next = 0
  for (let t = arr[0] + 7; t <= end; t += dt) {
    clock.now = t
    while (next < states.length && arr[next] <= t) view.deliver(states[next++])
    const f = view.draw()
    frames.push({ pos: { ...f.pos }, tick: f.tick })
  }
  return frames
}

/** Per-frame displacement / (host speed x frame dt); `backward` = frames moving against host velocity. */
function smoothness(
  frames: Frame[],
  flight: SpState[],
): { maxRatio: number; minRatio: number; backward: number } {
  const frameMs = (flight.length * TICK_MS) / Math.max(1, frames.length)
  let maxRatio = 0
  let minRatio = Infinity
  let backward = 0
  for (let i = 3; i < frames.length - 3; i++) {
    const a = frames[i - 1].pos
    const b = frames[i].pos
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    // Host speed at the tick this frame actually shows.
    const v =
      flight[Math.max(0, Math.min(flight.length - 1, Math.round(frames[i].tick - flight[0].tick)))].shuttle
        .vel
    const speed = Math.hypot(v.x, v.y, v.z)
    const ratio = Math.hypot(d.x, d.y, d.z) / (speed * (frameMs / 1000))
    maxRatio = Math.max(maxRatio, ratio)
    minRatio = Math.min(minRatio, ratio)
    if (d.x * v.x + d.y * v.y + d.z * v.z < 0) backward++
  }
  return { maxRatio, minRatio, backward }
}

/** Today's guest path: real smoothState + interpShuttle(prev, curr, alpha). */
function legacyView(): View {
  let emit: (s: SpState) => void = () => {}
  const session = {
    state: null,
    tickRate: 60,
    on: (_: string, fn: (s: SpState) => void) => ((emit = fn), () => {}),
  } as unknown as Session<SpState, never>
  const sm = smoothState(session)
  const out = { x: 0, y: 0, z: 0 }
  return {
    deliver: (s) => emit(s),
    draw: () => {
      if (!sm.prev || !sm.curr) return { pos: sm.curr ? sm.curr.shuttle.pos : out, tick: sm.curr?.tick ?? 0 }
      const alpha = sm.alpha()
      return {
        pos: interpShuttle(sm.prev.shuttle.pos, sm.curr.shuttle.pos, alpha, out).pos,
        tick: sm.prev.tick + alpha,
      }
    },
  }
}

/** The new guest path: RenderClock + GuestShuttle (one clock update per frame, fake-time dt). */
function guestView(): View {
  const rc = new RenderClock(60)
  const gs = new GuestShuttle(rc)
  let last = NaN
  return {
    deliver: (s) => {
      rc.onState(s.tick)
      gs.push(s)
    },
    draw: () => {
      rc.update(Number.isNaN(last) ? 0 : (clock.now - last) / 1000)
      last = clock.now
      gs.update(0)
      return { pos: gs.pos, tick: rc.tick }
    },
  }
}

describe('guest shuttle smoothness under jitter', () => {
  afterEach(() => vi.restoreAllMocks())

  it.fails('legacy guest interpolation stays smooth under 25 ms jitter (documents the rubber-band)', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const flight = hostTicks(rallyFlight(), 60)
    const m = smoothness(
      render(
        flight,
        arrivals(
          flight.map((s) => s.tick),
          1,
        ),
        60,
        legacyView(),
      ),
      flight,
    )
    expect(m.maxRatio).toBeLessThanOrEqual(1.6)
    expect(m.minRatio).toBeGreaterThanOrEqual(0.4)
    expect(m.backward).toBe(0)
  })

  it.each([60, 120])('GuestShuttle stays smooth under 25 ms jitter at %i Hz', (frameHz) => {
    vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
    const flight = hostTicks(rallyFlight(), 60)
    const ticks = flight.map((s) => s.tick)
    for (let seed = 1; seed <= 5; seed++) {
      const m = smoothness(render(flight, arrivals(ticks, seed), frameHz, guestView()), flight)
      expect(m.maxRatio, `seed ${seed}`).toBeLessThanOrEqual(1.6)
      expect(m.minRatio, `seed ${seed}`).toBeGreaterThanOrEqual(0.4)
      expect(m.backward, `seed ${seed}`).toBe(0)
    }
  })
})
