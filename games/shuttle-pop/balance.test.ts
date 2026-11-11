// Balance checks that need no matches: shot geometry vs a well-placed defender and the stun-lock
// rule. The match-playing gauges are in balance-*.simulation.test.ts (harness: balance.harness.ts).
import { describe, expect, it } from 'vitest'
import {
  JUMP_GRID,
  LUNGE_GRID,
  mean,
  reachable,
  SMASH_GRID,
  smashFlights,
  ticksToDefender,
} from './balance.harness'
import { type InputEvent } from '@forge/net/session'
import { stepShuttle, type Flight } from './physics'
import { launchFor, REACH, shotTarget } from './shots'
import { ABILITY, abilityShot } from './ability'
import { createState, shuttlePopGame as game, SWING_COOLDOWN, type SpInput } from './sim'
import { STUN, stunned } from './stun'

describe('power swing balance', () => {
  it('a full-charge Perfect smash is returnable by a well-placed defender (not an auto-win)', () => {
    const full = smashFlights(1)
    const tap = smashFlights(0)
    const share = (fs: Flight[]) => fs.filter(reachable).length / fs.length
    if (process.env.BALANCE_LOG)
      console.warn(
        JSON.stringify({
          returnable: { full: share(full), tap: share(tap) },
          ticksToDefender: { full: mean(full.map(ticksToDefender)), tap: mean(tap.map(ticksToDefender)) },
        }),
      )
    // A flat 0.6 bar fails even a tap (wide aims beat a reacting defender), so: a smash at the
    // defender is always reachable, and power costs at most 40% of the tap's reachable cases.
    const centre = full.filter((_, i) => SMASH_GRID[i].heldX === 0)
    expect(share(centre)).toBe(1)
    expect(share(full)).toBeGreaterThanOrEqual(0.6 * share(tap))
    expect(share(tap)).toBeGreaterThanOrEqual(share(full))
    expect(mean(full.map(ticksToDefender))).toBeLessThan(mean(tap.map(ticksToDefender)) - 2)
  })
})

describe('jump / lunge balance', () => {
  it('a Perfect jump-smash is returnable by a well-placed defender', () => {
    const jump = JUMP_GRID.map(({ from, heldX }) => {
      const shot = abilityShot('jump', { x: heldX, z: 0 }, 'perfect')
      return {
        heldX,
        f: {
          pos: { ...from },
          vel: launchFor(shot.kind, shot.grade, from, shotTarget(shot.kind, 0, heldX), () => 0, shot.charge),
        } as Flight,
      }
    })
    const share = (fs: Flight[]) => fs.filter(reachable).length / fs.length
    const all = jump.map((j) => j.f)
    if (process.env.BALANCE_LOG)
      console.warn(JSON.stringify({ jumpReturnable: share(all), tap: share(smashFlights(0)) }))
    expect(abilityShot('jump', { x: 0, z: 0 }, 'perfect')).toEqual({
      kind: 'smash',
      grade: 'perfect',
      charge: ABILITY.jump.charge,
    })
    expect(share(jump.filter((j) => j.heldX === 0).map((j) => j.f))).toBe(1)
    expect(share(all)).toBeGreaterThanOrEqual(0.6 * share(smashFlights(0)))
  })

  it('a lunge lift gives the opponent a smash chance', () => {
    let smashable = 0
    for (const { from, heldX } of LUNGE_GRID) {
      const shot = abilityShot('lunge', { x: heldX, z: 0 }, 'perfect')
      const g: Flight = {
        pos: { ...from },
        vel: launchFor(shot.kind, shot.grade, from, shotTarget(shot.kind, 0, heldX), () => 0.5, shot.charge),
      }
      for (let t = 0; t < 600; t++) {
        if (stepShuttle(g).netHit || g.pos.y <= 0) break
        if (g.pos.z > 0 && g.pos.y >= REACH.smashY && g.pos.y <= REACH.maxY) {
          smashable++
          break
        }
      }
    }
    if (process.env.BALANCE_LOG)
      console.warn(JSON.stringify({ lungeSmashable: smashable / LUNGE_GRID.length }))
    expect(smashable / LUNGE_GRID.length).toBeGreaterThanOrEqual(0.7)
  })
})

// Rulings: the computer never aims bonks but can bonk by accident; a bonk is 0.8 s of no move / swing
// and then 2 s of immunity (stun.ts), so at most ~29% of the time stunned in theory.
describe('racket stun balance', () => {
  it('no stun-lock in the sim: a griefer at the net stuns at most once per 168 ticks', () => {
    const GAP = STUN.ticks + STUN.immune
    const s = createState(
      [
        { id: 'a', name: 'A', slot: 0, ready: true, connected: true },
        { id: 'b', name: 'B', slot: 1, ready: true, connected: true },
      ],
      1,
    )
    const [a, b] = s.players
    s.phase = 'rally'
    s.phaseT = 0
    a.x = b.x = 0
    a.z = -0.35
    b.z = 0.35
    const bonks: number[] = []
    let stunnedTicks = 0
    let lastId = s.nextEventId - 1
    for (let i = 0; i < 900; i++) {
      // Aloft over side 0's back court, last hit by side 1: out of everyone's reach, the rally never ends.
      s.shuttle.pos = { x: 0, y: 4, z: -5.5 }
      s.shuttle.vel = { x: 0, y: 0, z: 0 }
      s.shuttle.lastHitter = 1
      s.shuttle.pending = null
      const inputs: InputEvent<SpInput>[] =
        i % SWING_COOLDOWN === 0 ? [{ player: 'b', input: { t: 'swing', x: 0, z: 0 } }] : []
      game.tick(s, inputs)
      expect(s.phase).toBe('rally')
      for (const e of s.events) if (e.id > lastId && e.k === 'bonk' && e.who === 'a') bonks.push(e.tick)
      lastId = s.nextEventId - 1
      if (stunned(a.stunAt, s.tick)) stunnedTicks++
    }
    const gaps = bonks.slice(1).map((t, i) => t - bonks[i])
    const stunnedShare = stunnedTicks / 900
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ griefer: { bonks, gaps, stunnedShare } }))
    expect(bonks.length).toBeGreaterThan(1)
    expect(bonks.length).toBeLessThanOrEqual(Math.ceil(900 / GAP))
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(GAP)
    expect(stunnedShare).toBeLessThanOrEqual(STUN.ticks / GAP + 0.01)
  })
})
