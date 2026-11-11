/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/components/net.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThanOrEqual(0)
  return css.slice(at, css.indexOf('}', at))
}

describe('net.css: Network panel', () => {
  // Landscape phones (wider than the bottom-sheet breakpoint) get the dropdown:
  // it must fit the visible height and scroll, or the player list falls off-screen.
  it('caps the dropdown to the visible height and scrolls inside it', () => {
    const r = rule('.pf-popover.pf-net-pop')
    expect(r).toMatch(/max-height:\s*calc\(var\(--pf-vh,\s*100dvh\)\s*-\s*\d+px\)/)
    expect(r).toMatch(/overflow-y:\s*auto/)
    expect(r).toMatch(/overscroll-behavior:\s*contain/)
  })
})
