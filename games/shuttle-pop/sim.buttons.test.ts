// The Jump / Dive buttons (SpInput ability `k`): forced moves on top of the one-button auto pick.
import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { ABILITY, actMoveMul, actReady, pickAbility, reachOf } from './ability'
import { findContact } from './shots'
import { shuttlePopGame as game, type SpEvent, type SpInput, type SpState } from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))
const press = (x: number, z: number, k?: unknown): InputEvent<SpInput> => ({
  player: 'p0',
  input: { t: 'ability', x, z, ...(k ? { k } : {}) } as SpInput,
})

function duel(): SpState {
  for (let seed = 1; ; seed++) {
    const s = game.setup(players(2), seed, {})
    if (s.server === 0) return s
  }
}

/** p0 at (0, −2.83); a low drive passing 1.8 m to world +x (p1 hit last). */
function wide(): SpState {
  const s = duel()
  s.players[0].x = 0
  s.players[0].z = -2.83
  s.phase = 'rally'
  s.phaseT = 0
  s.shuttle.pos = { x: 1.8, y: 0.9, z: -1 }
  s.shuttle.vel = { x: 0, y: 0.6, z: -8 }
  s.shuttle.lastHitter = 1
  s.shuttle.pending = null
  return s
}

function run(s: SpState, ticks: number, first: InputEvent<SpInput>[] = []): SpEvent[] {
  const seen: SpEvent[] = []
  for (let i = 0; i < ticks; i++) {
    game.tick(s, i === 0 ? first : [])
    for (const e of s.events) if (e.tick === s.tick) seen.push(e)
  }
  return seen
}

/** Ticks until a dive world +x lands with the drive in the dive reach within the glide (its first chance). */
function diveChance(): number {
  const s = wide()
  const end = { x: ABILITY.dive.slide, z: s.players[0].z }
  for (let n = 0; n < 40; n++) {
    if (findContact(s.shuttle, end, 0, ABILITY.dive.glide, reachOf('lunge'))) return n
    game.tick(s, [])
  }
  throw new Error('no dive chance')
}

describe('Jump / Dive buttons', () => {
  it('Dive never swings by itself: it slides ABILITY.dive.slide the held way, no hit / whiff', () => {
    const s = wide()
    run(s, diveChance())
    const seen = run(s, 40, [press(-1, 0, 'lunge')])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'lunge' })
    expect(s.players[0].act).toMatchObject({ k: 'lunge', dx: 1, dz: 0, free: true })
    expect(seen.some((e) => e.k === 'hit' || e.k === 'whiff')).toBe(false)
    expect(s.players[0].x).toBeCloseTo(ABILITY.dive.slide, 6)
  })

  it('a dive then a swing (J) saves the far drive with the dive reach', () => {
    const s = wide()
    run(s, diveChance())
    run(s, 4, [press(-1, 0, 'lunge')])
    const seen = run(s, 40, [{ player: 'p0', input: { t: 'swing', x: 0, z: 0 } }])
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'lunge', shot: 'clear' })
  })

  it('Shift while charging (holding J) still dives; the charge is kept for the swing', () => {
    const s = wide()
    run(s, diveChance() - 3)
    run(s, 2, [{ player: 'p0', input: { t: 'charge' } }])
    expect(s.players[0].chargeAt).toBeGreaterThanOrEqual(0)
    run(s, 4, [press(-1, 0, 'lunge')])
    expect(s.players[0].act).toMatchObject({ k: 'lunge', free: true })
    expect(s.players[0].chargeAt).toBeGreaterThanOrEqual(0)
    const seen = run(s, 40, [{ player: 'p0', input: { t: 'swing', x: 0, z: 0 } }])
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'lunge' })
  })

  it('without the dive the far drive is out of a plain swing (the dive is what saves it)', () => {
    const s = wide()
    run(s, diveChance() + 4)
    const seen = run(s, 40, [{ player: 'p0', input: { t: 'swing', x: 0, z: 0 } }])
    expect(seen.some((e) => e.k === 'hit')).toBe(false)
  })

  it('a dive cools down ABILITY.dive.cooldown, hit or not', () => {
    const s = wide()
    run(s, diveChance())
    const at = s.tick + 1
    run(s, 2, [press(1, 0, 'lunge')])
    expect(actReady(s.players[0].act, at + ABILITY.dive.cooldown - 1)).toBe(false)
    expect(actReady(s.players[0].act, at + ABILITY.dive.cooldown)).toBe(true)
  })

  it('no dive while moving backward (away from the net): ignored, no cooldown spent', () => {
    const s = wide()
    run(s, 2, [press(0, -1, 'lunge')])
    expect(s.players[0].act).toBeNull()
    run(s, 2, [press(0.9, -0.3, 'lunge')]) // mostly sideways: still dives
    expect(s.players[0].act).toMatchObject({ k: 'lunge', free: true })
  })

  it('after the slide the diver is slowed, easing back to full speed (never stuck)', () => {
    const s = wide()
    run(s, 1, [press(-1, 0, 'lunge')])
    const at = s.players[0].act!.at
    const { glide, floor, slow } = ABILITY.dive
    const mul = (e: number) => actMoveMul(s.players[0].act, at + e)
    expect(mul(glide - 1)).toBe(0) // the slide drives the body
    expect(mul(glide)).toBeCloseTo(slow)
    expect(mul(glide + floor / 2)).toBeGreaterThan(slow)
    expect(mul(glide + floor / 2)).toBeLessThan(1)
    expect(mul(glide + floor)).toBe(1)
  })

  it('a jump with nothing high is an empty jump (no whiff), not a hop', () => {
    const s = wide()
    const seen = run(s, 5, [press(0, 0, 'jump')])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'jump' })
    expect(s.players[0].act).toMatchObject({ k: 'jump', empty: true })
    expect(seen.some((e) => e.k === 'whiff' || e.k === 'hit')).toBe(false)
  })

  it('no `k` (older clients, the computer) keeps the auto pick; junk `k` is ignored', () => {
    for (const k of [undefined, 'fly', 7]) {
      const s = wide()
      const auto = pickAbility(s.shuttle, s.players[0], 0, 1, true)
      run(s, 2, [press(1, 0, k)])
      expect(s.players[0].act).toMatchObject({ k: auto.k, dx: auto.dx, dz: auto.dz })
      expect(s.players[0].act!.empty).toBeUndefined()
    }
  })

  it('in the serve set-up the buttons only hop (the server never dives out of the box)', () => {
    const s = duel()
    const { x, z } = s.players[0]
    run(s, 3, [press(0, 1, 'lunge')])
    expect(s.players[0].act?.k).toBe('hop')
    expect(s.players[0]).toMatchObject({ x, z })
  })
})
