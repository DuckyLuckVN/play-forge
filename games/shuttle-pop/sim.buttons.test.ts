// The Jump / Dive buttons (SpInput ability `k`): forced moves on top of the one-button auto pick.
import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { ABILITY, actReady, pickAbility } from './ability'
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

/** Ticks until a forced dive world +x would strike the drive (its first chance). */
function diveChance(): number {
  const s = wide()
  for (let n = 0; n < 40; n++) {
    const pick = pickAbility(s.shuttle, s.players[0], 0, 1, true, 'lunge', { x: 1, z: 0 })
    if (!pick.empty) return n
    game.tick(s, [])
  }
  throw new Error('no dive chance')
}

describe('Jump / Dive buttons', () => {
  it('a dive the way the shuttle went (view-left = world +x for side 0) saves it', () => {
    const s = wide()
    run(s, diveChance())
    const seen = run(s, 40, [press(-1, 0, 'lunge')])
    expect(seen.find((e) => e.k === 'act')).toMatchObject({ act: 'lunge' })
    expect(s.players[0].act).toMatchObject({ k: 'lunge', dx: 1, dz: 0 })
    expect(s.players[0].act!.empty).toBeUndefined()
    expect(seen.find((e) => e.k === 'hit')).toMatchObject({ side: 0, act: 'lunge', shot: 'clear' })
    expect(s.players[0].x).toBeCloseTo(ABILITY.lunge.slide, 6)
  })

  it("a dive the other way is the player's call: it slides, no swing, the short cooldown", () => {
    const s = wide()
    run(s, diveChance())
    const at = s.tick + 1
    const seen = run(s, 30, [press(1, 0, 'lunge')])
    expect(s.players[0].act).toMatchObject({ k: 'lunge', dx: -1, dz: 0, empty: true })
    expect(seen.some((e) => e.k === 'hit' || e.k === 'whiff')).toBe(false)
    expect(s.players[0].x).toBeCloseTo(-ABILITY.lunge.slide, 6)
    expect(actReady(s.players[0].act, at + ABILITY.hop.cooldown)).toBe(true)
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
