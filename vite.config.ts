import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Dev server config. Production builds go through scripts/build.mjs, which
// produces one self-contained HTML file per game.
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@forge': fileURLToPath(new URL('./engine', import.meta.url)) },
  },
  test: {
    include: ['engine/**/*.test.ts', 'games/**/*.test.ts'],
  },
})
