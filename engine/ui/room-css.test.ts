/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles/components/room.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

describe('room.css: room actions', () => {
  // How to play sits next to Leave room; on narrow widths it wraps instead of being pushed out.
  it('wraps the How to play / Leave room row', () => {
    const at = css.indexOf('.pf-room-actions > .pf-row {')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/flex-wrap:\s*wrap/)
  })
})
