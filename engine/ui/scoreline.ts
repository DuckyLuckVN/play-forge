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
