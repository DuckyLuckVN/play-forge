import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { summaryRows } from './results'
import { shuttlePopGame as game, type SpInput, type SpState } from './sim'

const players: PlayerInfo[] = [0, 1].map((i) => ({
  id: `p${i}`,
  name: `P${i}`,
  slot: i,
  ready: true,
  connected: true,
}))

/** Online match where p1 (side 1) makes one Perfect hit. */
function perfectBySide1(): SpState {
  let s = game.setup(players, 1, {})
  for (let seed = 2; s.server !== 0; seed++) s = game.setup(players, seed, {})
  s.players[1].x = 0
  s.players[1].z = 3
  s.phase = 'rally'
  s.phaseT = 0
  s.shuttle.pos = { x: 0, y: 1.5, z: 3 }
  s.shuttle.vel = { x: 1.2, y: 1, z: 0 }
  s.shuttle.lastHitter = 0
  s.shuttle.pending = null
  for (let i = 0; i < 3; i++) game.tick(s, [])
  const swing: InputEvent<SpInput> = { player: 'p1', input: { t: 'swing', x: 0, z: 0, tick: 0 } }
  game.tick(s, [swing])
  return s
}

describe('summaryRows', () => {
  it('a human on side 1 sees their own Perfect count and the score from their side', () => {
    const s = perfectBySide1()
    expect(s.events.some((e) => e.k === 'hit' && e.side === 1 && e.grade === 'perfect')).toBe(true)
    s.score = [4, 11]
    s.stats.longest = 9
    expect(summaryRows(s, 'p1')).toEqual([
      { label: 'Final score', value: '11–4' },
      { label: 'Longest rally', value: '9 shots' },
      { label: 'Your Perfect hits', value: '1' },
    ])
    expect(summaryRows(s, 'p0')[2]).toEqual({ label: 'Your Perfect hits', value: '0' })
  })

  it('one shot is singular; spectators see both Perfect counts', () => {
    const s = perfectBySide1()
    s.stats.longest = 1
    expect(summaryRows(s, 'watcher')).toEqual([
      { label: 'Final score', value: '0–0' },
      { label: 'Longest rally', value: '1 shot' },
      { label: 'Perfect hits', value: '0–1' },
    ])
  })
})
