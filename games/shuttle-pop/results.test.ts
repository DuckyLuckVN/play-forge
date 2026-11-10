import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { outcomeOf, scoreChips, summaryRows } from './results'
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

const doubles = (names: string[], winner: 0 | 1, score: [number, number]): SpState => {
  const infos: PlayerInfo[] = names.map((name, i) => ({
    id: `p${i}`,
    name,
    slot: i,
    ready: true,
    connected: true,
  }))
  const s = game.setup(infos, 3, { mode: '2v2' })
  s.score = score
  s.winner = winner
  s.phase = 'over'
  return s
}

describe('doubles results', () => {
  it('doubles labels team Perfect hits', () => {
    const s = doubles(['Ann'], 0, [11, 5])
    s.stats.perfect = [3, 1]
    expect(summaryRows(s, 'p0')[2]).toEqual({ label: "Your team's Perfect hits", value: '3' })
    expect(summaryRows(s, 'watcher')[2]).toEqual({ label: 'Perfect hits', value: '3–1' })
  })

  it('outcome: your team wins, the other team wins, a spectator sees the winners', () => {
    // Seats A,B,A,B: Ann + Cid on side 0, Bo + Dee on side 1.
    const s = doubles(['Ann', 'Bo', 'Cid', 'Dee'], 0, [11, 7])
    expect(outcomeOf(s, 'p0')).toEqual({ headline: 'Your team wins 11–7!', result: 'win' })
    expect(outcomeOf(s, 'p2')).toEqual({ headline: 'Your team wins 11–7!', result: 'win' })
    expect(outcomeOf(s, 'p1')).toEqual({ headline: 'Ann & Cid win 7–11.', result: 'lose' })
    expect(outcomeOf(s, 'watcher')).toEqual({ headline: 'Ann & Cid win!', result: 'done' })
    // Alone with computers: the computer team is named too.
    const solo = doubles(['Ann'], 1, [8, 11])
    expect(outcomeOf(solo, 'p0')).toEqual({ headline: 'Computer & Computer win 8–11.', result: 'lose' })
  })

  it('1v1 headlines are unchanged', () => {
    const s = game.setup(players, 1, {})
    s.score = [11, 6]
    s.winner = 0
    s.phase = 'over'
    expect(outcomeOf(s, 'p0')).toEqual({ headline: 'You win 11–6!', result: 'win' })
    expect(outcomeOf(s, 'p1')).toEqual({ headline: 'P0 wins 6–11.', result: 'lose' })
    expect(outcomeOf(s, 'watcher')).toEqual({ headline: 'P0 wins!', result: 'done' })
    s.score = [3, 2] // ended early: the other side left
    expect(outcomeOf(s, 'p0')).toEqual({ headline: 'Your opponent left. You win!', result: 'win' })
    const solo = game.setup([players[0]], 1, {})
    solo.score = [4, 11]
    solo.winner = 1
    solo.phase = 'over'
    expect(outcomeOf(solo, 'p0')).toEqual({ headline: 'The computer wins 4–11. Rematch?', result: 'lose' })
  })

  it('score chips: 1v1 as before; 2v2 one chip per human, computers only for a side with no human', () => {
    const solo = game.setup([players[0]], 1, {})
    expect(scoreChips(solo)).toEqual([
      { id: 'p0', score: 0, name: 'P0' },
      { id: 'ai', score: 0, name: 'Computer', slot: 1, avatar: 'robot' },
    ])
    const alone = doubles(['Ann'], 0, [5, 6])
    expect(scoreChips(alone)).toEqual([
      { id: 'p0', score: 5, name: 'Ann' },
      { id: 'ai1', score: 6, name: 'Computer', slot: 1, avatar: 'robot' },
    ])
    const mates = doubles(['Ann', 'Bo'], 0, [2, 3])
    // Ann (seat 0) and Bo (seat 1) are on opposite sides, each with a computer teammate.
    expect(scoreChips(mates).map((c) => [c.id, c.score])).toEqual([
      ['p0', 2],
      ['p1', 3],
    ])
    const full = doubles(['Ann', 'Bo', 'Cid', 'Dee'], 0, [1, 0])
    expect(scoreChips(full).map((c) => c.id)).toEqual(['p0', 'p2', 'p1', 'p3'])
  })
})
