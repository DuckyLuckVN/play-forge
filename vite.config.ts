import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { appVersion } from './scripts/version.mjs'

// Dev server config. Production builds go through scripts/build.mjs, which
// produces one self-contained HTML file per game.
export default defineConfig({
  base: './',
  // Shown on the launcher; dev-server builds are marked "-dev".
  define: { __APP_VERSION__: JSON.stringify(appVersion(true)) },
  resolve: {
    alias: { '@forge': fileURLToPath(new URL('./engine', import.meta.url)) },
  },
  test: {
    include: ['engine/**/*.test.ts', 'games/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
