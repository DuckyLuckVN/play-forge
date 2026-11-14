/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/reset.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

describe('reset.css', () => {
  it('no square tap flash on phones (round buttons press with their own look)', () => {
    expect(css).toMatch(/html,\s*body\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/)
  })

  it('keyboard focus still shows a ring', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid/)
  })
})
