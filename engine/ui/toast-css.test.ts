/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/components/toast.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const rule = (selector: string) => {
  const at = css.search(new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} {`))
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}

describe('toast.css: player name', () => {
  it('caps the name in em, not % (a % of a short sentence cut "Hèo haha" to "Hè…")', () => {
    expect(rule('.pf-toast-name')).toMatch(/max-width:\s*\d+(\.\d+)?em/)
    expect(css).not.toMatch(/\.pf-toast-name\s*{[^}]*max-width:\s*\d+%/)
  })

  it('the name is text in the player colour (no capsule), darkened to read on the light toast', () => {
    const r = rule('.pf-toast-name')
    expect(r).not.toMatch(/background:/)
    expect(r).not.toMatch(/border-radius:/)
    expect(r).toMatch(/color:\s*color-mix\([^)]*var\(--pf-toast-dot/)
  })
})
