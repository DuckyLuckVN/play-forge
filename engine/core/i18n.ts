// Languages: English text is the key, each game ships a dictionary for the
// others. The language is fixed for the page's life; changing it reloads.

export type Lang = 'en' | 'vi'
export type Params = Record<string, string | number>
/** English text → translation. Missing entries fall back to the English. */
export type Dictionary = Record<string, string>

export const LANGS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
]

const KEY = 'pf.lang'

/** The saved choice if valid, else the browser's language if supported, else English. */
export function detectLang(saved: string | null, browser: string | undefined): Lang {
  if (saved === 'en' || saved === 'vi') return saved
  return browser?.toLowerCase().startsWith('vi') ? 'vi' : 'en'
}

function readSaved(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null
  } catch {
    return null
  }
}

let current: Lang | null = null

export function getLang(): Lang {
  current ??= detectLang(readSaved(), globalThis.navigator?.language)
  return current
}

/** Saves the choice and reloads the page so every screen is rebuilt in it. */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  if (lang === getLang()) return
  location.reload()
}

/** Replaces `{name}` with params.name. */
export function format(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

/** A `t(english, params)` for one dictionary (Vietnamese) in the page's language. */
export function translator(vi: Dictionary, lang: Lang = getLang()) {
  return (en: string, params?: Params): string => format(lang === 'vi' ? (vi[en] ?? en) : en, params)
}
