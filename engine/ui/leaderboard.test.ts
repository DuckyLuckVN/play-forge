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

  it('nothing for no rows', () => {
    expect(leaderboardTable({ columns: [], rows: [] })).toBeNull()
  })
})
