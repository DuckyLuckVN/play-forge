// The launcher's version tag: "v1.0.300 · 11 Nov 2026, 13:48", the update time in the
// viewer's language and timezone. Pure (the tests pass the language and timezone).
import type { Lang } from '@forge/core/i18n'

/** Intl locale per page language. */
const LOCALE: Record<Lang, string> = { en: 'en-GB', vi: 'vi-VN' }

/**
 * A short date + time for an ISO timestamp, in `lang` and `timeZone` (default: the viewer's), or ''
 * when the timestamp is missing or invalid.
 */
export function formatUpdated(iso: string, lang: Lang, timeZone?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(d)
}

/** The tag text: "v<version>", plus " · <updated>" when the update time is known. */
export function versionLabel(version: string, iso: string, lang: Lang, timeZone?: string): string {
  const when = formatUpdated(iso, lang, timeZone)
  return when ? `v${version} · ${when}` : `v${version}`
}
