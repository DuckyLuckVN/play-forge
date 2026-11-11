// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { leaderboardTable } from './leaderboard'

describe('leaderboardTable', () => {
  it('ranks rows in order with their columns, badge, colour and the local player marked', () => {
    const el = leaderboardTable({
      columns: ['Points', 'Perfect'],
      rows: [
        { id: 'a', name: 'Ann', values: ['5', '3'], badge: 'MVP', color: '#ff0000' },
        { id: 'b', name: 'Bo', values: ['2', '1'], self: true },
      ],
      note: 'Longest rally: 9 shots',
    })!
    const heads = [...el.querySelectorAll('th')].map((th) => th.textContent)
    expect(heads).toEqual(['#', 'Player', 'Points', 'Perfect'])
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[]
    expect(rows.map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['1', 'AnnMVP', '5', '3'],
      ['2', 'Bo', '2', '1'],
    ])
    expect(rows[0].querySelector('.pf-lb-badge')!.textContent).toBe('MVP')
    expect(rows[0].style.getPropertyValue('--c')).toBe('#ff0000')
    expect(rows[1].classList.contains('self')).toBe(true)
    expect(el.querySelector('.pf-lb-note')!.textContent).toBe('Longest rally: 9 shots')
  })

  it("an avatar per row: the row's own (e.g. the robot), else the resolver's, else none", () => {
    const el = leaderboardTable(
      {
        columns: ['Points'],
        rows: [
          { id: 'cpu', name: 'Computer', values: ['1'], avatar: 'robot' },
          { id: 'a', name: 'Ann', values: ['2'] },
          { id: 'x', name: 'Gone', values: ['0'] },
        ],
      },
      (id) => (id === 'a' ? 'cat' : undefined),
    )!
    const avatars = [...el.querySelectorAll('tbody tr')].map(
      (r) => (r.querySelector('.pf-lb-avatar') as HTMLElement | null)?.dataset.avatar ?? null,
    )
    expect(avatars).toEqual(['robot', 'cat', null])
  })

  it('nothing for no rows', () => {
    expect(leaderboardTable({ columns: [], rows: [] })).toBeNull()
  })
})
