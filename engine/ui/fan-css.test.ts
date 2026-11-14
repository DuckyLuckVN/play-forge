/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/components/mobile.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const phones = css.indexOf('@media (max-width: 520px)')

describe('mobile.css: voice, chat and reactions behind one floating button', () => {
  it('on every screen, not only phones (keeps the desktop top bar short)', () => {
    const fab = css.search(/\n\s*\.pf-fan-anchor \{[^}]*position: fixed/)
    expect(fab).toBeGreaterThanOrEqual(0)
    expect(phones).toBeGreaterThan(0)
    expect(fab).toBeLessThan(phones)
    expect(css).not.toMatch(/\.pf-fab,\s*\.pf-more-btn \{\s*display: none/)
  })

  it('desktop: what the fan opens unfolds to its left, not off the bottom of the screen', () => {
    expect(css).toMatch(
      /@media \(min-width: 521px\)[\s\S]*\.pf-fan \.pf-popover-anchor > \.pf-popover \{[^}]*right: calc\(100% \+ \d+px\)/,
    )
  })
})
