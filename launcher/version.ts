// The launcher's version tag: "v1.0.300 · 11/11/2026, 13:48", the update time as
// dd/MM/yyyy, HH:mm (24-hour) in the viewer's timezone, the same in every language.
// Pure (the tests pass the timezone).

/** Formats a date's parts in a timezone (cached per zone; undefined = the viewer's). */
const formats = new Map<string | undefined, Intl.DateTimeFormat>()

function partsIn(d: Date, timeZone?: string): Record<string, string> {
  let f = formats.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
    formats.set(timeZone, f)
  }
  const out: Record<string, string> = {}
  for (const p of f.formatToParts(d)) out[p.type] = p.value
  return out
}

/**
 * An ISO timestamp as "dd/MM/yyyy, HH:mm" in `timeZone` (default: the viewer's), or '' when the
 * timestamp is missing or invalid.
 */
export function formatUpdated(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const p = partsIn(d, timeZone)
  return `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}`
}

/** The tag text: "v<version>", plus " · <updated>" when the update time is known. */
export function versionLabel(version: string, iso: string, timeZone?: string): string {
  const when = formatUpdated(iso, timeZone)
  return when ? `v${version} · ${when}` : `v${version}`
}
