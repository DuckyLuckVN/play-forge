import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { leaderboardOf, outcomeOf, scoreChips } from './results'
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
  it('outcome: your team wins, the other team wins, a spectator sees the winners', () => {
    // Seats A,B,A,B: Ann + Cid on side 0, Bo + Dee on side 1.
    const s = doubles(['Ann', 'Bo', 'Cid', 'Dee'], 0, [11, 7])
    expect(outcomeOf(s, 'p0')).toEqual({ headline: 'Your team wins 11–7!', result: 'win' })
    expect(outcomeOf(s, 'p2')).toEqual({ headline: 'Your team wins 11–7!', result: 'win' })
    expect(outcomeOf(s, 'p1')).toEqual({ headline: 'Ann & Cid win 7–11.', result: 'lose' })
    expect(outcomeOf(s, 'watcher')).toEqual({ headline: 'Ann & Cid win!', result: 'done' })
    // Alone with computers: the computer team is named too.
    const solo = doubles(['Ann'], 1, [8, 11])
    expect(outcomeOf(solo, 'p0')).toEqual({ headline: 'The computer wins 8–11. Rematch?', result: 'lose' })
    // A spectator sees one name for the all-computer team, singular verb.
    expect(outcomeOf(solo, 'watcher')).toEqual({ headline: 'Computer wins!', result: 'done' })
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

describe('leaderboardOf (results)', () => {
  const tally = (winners: number, perfect = 0, smashes = 0, saves = 0, bonks = 0) => ({
    winners,
    perfect,
    smashes,
    saves,
    bonks,
  })

  it('winners first, each team by its tally, MVP on the best, you marked, longest rally as the note', () => {
    const s = doubles(['Ann', 'Bo'], 1, [8, 11])
    s.stats.longest = 7
    const [a, b, c, d] = s.players
    s.stats.by = { [a.id]: tally(4, 2), [b.id]: tally(1), [c.id]: tally(2, 1, 1), [d.id]: tally(5, 0, 2, 1) }
    const lb = leaderboardOf(s, a.id)
    expect(lb.columns).toEqual(['Points', 'Perfect', 'Smashes', 'Dive saves', 'Bonks'])
    const winners = s.players.filter((p) => p.side === 1)
    expect(
      lb.rows
        .slice(0, 2)
        .map((r) => r.id)
        .sort(),
    ).toEqual(winners.map((p) => p.id).sort())
    const score = (id: string) => {
      const t = s.stats.by![id]
      return t.winners * 3 + t.saves * 2 + t.perfect + t.smashes
    }
    expect(score(lb.rows[0].id)).toBeGreaterThanOrEqual(score(lb.rows[1].id))
    expect(score(lb.rows[2].id)).toBeGreaterThanOrEqual(score(lb.rows[3].id))
    expect(lb.rows.filter((r) => r.badge === 'MVP').map((r) => r.id)).toEqual([d.id])
    expect(lb.rows.find((r) => r.id === a.id)).toMatchObject({
      self: true,
      values: ['4', '2', '0', '0', '0'],
    })
    expect(lb.note).toBe('Longest rally: 7 shots')
    // The computer seats show the robot; humans leave it to the shell (lobby avatar).
    for (const r of lb.rows)
      expect(r.avatar).toBe(s.players.find((p) => p.id === r.id)!.kind === 'ai' ? 'robot' : undefined)
  })

  it("1v1 from the sim: p1's Perfect hit is in p1's row", () => {
    const s = perfectBySide1()
    s.score = [4, 11]
    s.winner = 1
    const lb = leaderboardOf(s, 'p1')
    expect(lb.rows.map((r) => r.id)).toEqual(['p1', 'p0'])
    expect(lb.rows[0]).toMatchObject({ self: true, badge: 'MVP' })
    expect(lb.rows[0].values[1]).toBe('1')
  })

  it('no stats yet (an older state): everyone at zero, no MVP', () => {
    const s = doubles(['Ann'], 0, [11, 5])
    const lb = leaderboardOf(s, 'p0')
    expect(lb.rows).toHaveLength(4)
    expect(lb.rows.every((r) => !r.badge && r.values.every((v) => v === '0'))).toBe(true)
  })
})
