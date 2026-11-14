/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/components/popover.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`)
  expect(at, sel).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}

describe('settings sheet height', () => {
  it('grows to the screen (no fixed cap), so it only scrolls when it truly does not fit', () => {
    const sheet = rule('.pf-sheet')
    expect(sheet).toMatch(/max-height:\s*100%;/)
    expect(sheet).not.toMatch(/max-height:\s*min\(/)
  })
})
