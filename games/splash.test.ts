import { describe, expect, it } from 'vitest'

// Every game page gets the first-paint splash (vite `game-splash` plugin / scripts/build.mjs).
// Only `dismissSplash()` removes it: `createGameApp` calls it, so a game with its own shell
// must call it itself, or the page stays on "Loading…" forever (Brickstorm did).
// Glob options must be written inline (Vite reads them at build time).
const mains = import.meta.glob<string>('./*/main.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('loading splash', () => {
  it('finds every game entry', () => {
    expect(Object.keys(mains).length).toBeGreaterThanOrEqual(5)
  })

  it.each(Object.entries(mains))('%s dismisses the splash once booted', (_file, src) => {
    expect(/\bcreateGameApp\s*[<(]|\bdismissSplash\(/.test(src)).toBe(true)
  })
})
