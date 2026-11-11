// End-of-match leaderboard: players ranked (#1 first) with a few stat columns, a badge (e.g. MVP) and
// the local player highlighted. Games build the data (GameAppOptions.leaderboard); this only draws it.
import { avatarEl } from '../social/avatar-ui'
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
  /** Avatar id (e.g. 'robot' for the computer); none = the shell's resolver (the lobby player's). */
  avatar?: string
}

export interface Leaderboard {
  /** Stat column headers (short). */
  columns: string[]
  /** Already ranked: #1 first. */
  rows: LeaderboardRow[]
  /** One line under the table (e.g. the longest rally). */
  note?: string
}

/** `avatarOf` = the avatar for a row without its own (the shell looks the player up in the lobby). */
export function leaderboardTable(
  lb: Leaderboard,
  avatarOf: (id: string) => string | undefined = () => undefined,
): HTMLElement | null {
  if (!lb.rows.length) return null
  const head = h(
    'tr',
    {},
    h('th', { textContent: '#' }),
    h('th', { class: 'pf-lb-name', textContent: t('Player') }),
    ...lb.columns.map((c) => h('th', { textContent: c })),
  )
  const rows = lb.rows.map((r, i) => {
    const avatar = r.avatar ?? avatarOf(r.id)
    const who = h(
      'span',
      { class: 'pf-lb-who' },
      avatar ? avatarEl(avatar, 'pf-avatar pf-lb-avatar') : false,
      h('span', { class: 'pf-lb-player', textContent: r.name }),
    )
    if (r.badge) who.append(h('span', { class: 'pf-lb-badge', textContent: r.badge }))
    const name = h('td', { class: 'pf-lb-name' }, who)
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
