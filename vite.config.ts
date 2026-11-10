import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { withSplash } from './scripts/splash.mjs'
import { appVersion } from './scripts/version.mjs'

// Dev server config. Production builds go through scripts/build.mjs, which
// produces one self-contained HTML file per game.
export default defineConfig({
  base: './',
  plugins: [
    {
      // The same first-paint splash as built pages (scripts/build.mjs); dev scripts are external, so nothing moves.
      name: 'game-splash',
      transformIndexHtml(html, ctx) {
        const id = /\/games\/([^/]+)\//.exec(ctx.path)?.[1]
        if (!id) return html
        const coverFile = fileURLToPath(new URL(`./games/${id}/cover.svg`, import.meta.url))
        const cover = existsSync(coverFile) ? readFileSync(coverFile, 'utf8').trim() : ''
        return withSplash(html, { cover, move: false })
      },
    },
  ],
  // Shown on the launcher; dev-server builds are marked "-dev".
  define: { __APP_VERSION__: JSON.stringify(appVersion(true)) },
  resolve: {
    alias: { '@forge': fileURLToPath(new URL('./engine', import.meta.url)) },
  },
  test: {
    include: [
      'engine/**/*.test.ts',
      'games/**/*.test.ts',
      'launcher/**/*.test.ts',
      'scripts/**/*.test.ts',
      'server/**/*.test.ts',
    ],
  },
})
