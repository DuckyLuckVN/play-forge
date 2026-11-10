// Static checks for translations, used by the i18n tests: which English keys
// the source passes to a translator, and which English text reaches the
// screen without one.

const STRING = /(['"`])((?:\\.|(?!\1).)*)\1/gs
const unescape = (s: string) => s.replace(/\\(.)/g, '$1')

/**
 * The string literals passed as the first argument of `fn(…)` in `src`
 * (default `t`), including both sides of a ternary: `t(on ? 'A' : 'B')`.
 * Template literals with `${…}` can't be checked and are left out.
 */
export function translatedKeys(src: string, fn = 't'): string[] {
  const keys: string[] = []
  const call = new RegExp(`(?<![\\w.$])${fn}\\(`, 'g')
  for (const m of src.matchAll(call)) {
    const arg = firstArg(src, m.index + m[0].length)
    for (const s of arg.matchAll(STRING)) {
      // The text itself, not a value it's compared with: `t(n === '1' ? …)`.
      const before = arg.slice(0, s.index).trimEnd().at(-1)
      const isText = before === undefined || before === '?' || before === ':'
      if (isText && !(s[1] === '`' && s[2].includes('${'))) keys.push(unescape(s[2]))
    }
  }
  return keys
}

/** Source text of the argument starting at `i`, up to its `,` or `)` at depth 0. */
function firstArg(src: string, i: number): string {
  let depth = 0
  let quote = ''
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (quote) {
      if (c === '\\') j++
      else if (c === quote) quote = ''
    } else if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth-- === 0) return src.slice(i, j)
    } else if (c === ',' && depth === 0) return src.slice(i, j)
  }
  return src.slice(i)
}

// Places where a string literal becomes visible text or an accessible name.
const SINKS = [
  // { textContent: '…' }, { title: '…' }, headline: '…', option label: '…'
  /\b(?:textContent|innerText|title|placeholder|alt|ariaLabel|tagline|controls|headline|label|action)\s*:\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
  // el.textContent = '…'
  /\.(?:textContent|innerText|title|placeholder|alt)\s*=\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
  // setAttribute('aria-label', '…')
  /setAttribute\(\s*'(?:aria-label|title|placeholder|alt)'\s*,\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
  // button('…'), toast('…'), ctx.fillText('…'), showMessage('…')
  /\b(?:button|toast|fillText|showMessage|showMenu|showCount|alert|confirm)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
  // iconButton(icon, '…')
  /\biconButton\(\s*[\w.]+\s*,\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
  // h('label', { … }, '…')
  /\bh\(\s*'[\w-]+'\s*,\s*\{[^{}]*\}\s*,\s*(['"`])((?:\\.|(?!\1).)*)\1/g,
]

/**
 * English literals that go straight to the screen (see SINKS) without a
 * translator. Text is "English" when it has a word of 2+ letters once `${…}`
 * parts are removed; `allow` lists text that is the same in every language.
 */
export function untranslatedText(src: string, allow: ReadonlySet<string> = new Set()): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const found: string[] = []
  for (const sink of SINKS)
    for (const m of code.matchAll(sink)) {
      const text = unescape(m[2])
      const words = text.replace(/\$\{[^}]*\}/g, ' ')
      if (/[A-Za-z]{2,}/.test(words) && !allow.has(text)) found.push(text)
    }
  return found
}
