import { avatarFor, isAvatarId } from '../social/avatars'
import { t } from './i18n'

/**
 * A top-bar score chip's text: the player's lobby name, else the line's own `name` (a seat that
 * isn't in the lobby, e.g. the computer), else "Gone" (a player who left).
 */
export function scoreLabel(
  line: { id: string; score: number; name?: string },
  players: readonly { id: string; name: string }[],
): string {
  const p = players.find((q) => q.id === line.id)
  return `${p?.name ?? line.name ?? t('Gone')} ${line.score}`
}

/**
 * A top-bar score chip's colour slot and avatar id: a lobby player's own, else the line's `slot` /
 * `avatar` (a seat that isn't in the lobby, e.g. the computer), else slot 0 and no avatar.
 */
export function chipLook(
  line: { id: string; slot?: number; avatar?: string },
  players: readonly { id: string; slot: number; avatar?: string }[],
): { slot: number; avatar: string | null } {
  const p = players.find((q) => q.id === line.id)
  if (p) return { slot: p.slot, avatar: avatarFor(p) }
  return { slot: line.slot ?? 0, avatar: isAvatarId(line.avatar) ? line.avatar : null }
}
