// End-of-match leaderboard: players ranked (#1 first) with a few stat columns, a badge (e.g. MVP) and
// the local player highlighted. Games build the data (GameAppOptions.leaderboard); this only draws it.
import { h } from './dom'
import { t } from './i18n'

export interface LeaderboardRow {
  id: string
  name: string
  /** One value per Leaderboard column. */
  values: string[]
  /** CSS colour of the row's edge (the player's colour). */
  color?: string
  /** A short tag after the name, e.g. "MVP". */
  badge?: string
  /** The local player. */
  self?: boolean
}

export interface Leaderboard {
  /** Stat column headers (short). */
  columns: string[]
  /** Already ranked: #1 first. */
  rows: LeaderboardRow[]
  /** One line under the table (e.g. the longest rally). */
  note?: string
}

export function leaderboardTable(lb: Leaderboard): HTMLElement | null {
  if (!lb.rows.length) return null
  const head = h(
    'tr',
    {},
    h('th', { textContent: '#' }),
    h('th', { class: 'pf-lb-name', textContent: t('Player') }),
    ...lb.columns.map((c) => h('th', { textContent: c })),
  )
  const rows = lb.rows.map((r, i) => {
    const name = h('td', { class: 'pf-lb-name' }, h('span', { textContent: r.name }))
    if (r.badge) name.append(h('span', { class: 'pf-lb-badge', textContent: r.badge }))
    const tr = h(
      'tr',
      { class: r.self ? 'self' : '' },
      h('td', { class: 'pf-rank', textContent: String(i + 1) }),
      name,
      ...r.values.map((v) => h('td', { textContent: v })),
    )
    if (r.color) tr.style.setProperty('--c', r.color)
    return tr
  })
  return h(
    'div',
    { class: 'pf-leaderboard' },
    h('table', {}, h('thead', {}, head), h('tbody', {}, ...rows)),
    lb.note ? h('p', { class: 'pf-lb-note', textContent: lb.note }) : false,
  )
}
