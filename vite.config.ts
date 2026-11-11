import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { withSplash } from './scripts/splash.mjs'
import { appUpdated, appVersion } from './scripts/version.mjs'

/** Where tests live; `SIMULATION` files are the long-running ones (their own project). */
const TEST_DIRS = ['engine', 'games', 'launcher', 'scripts', 'server']
const SIMULATION = '**/*.simulation.test.ts'

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
  define: {
    __APP_VERSION__: JSON.stringify(appVersion(true)),
    __APP_UPDATED__: JSON.stringify(appUpdated()),
  },
  resolve: {
    alias: { '@forge': fileURLToPath(new URL('./engine', import.meta.url)) },
  },
  // Two projects: `unit` (npm test: fast functional tests) and `simulation` (npm run test:sim: long
  // runs of whole matches / balance gauges / big sweeps, named *.simulation.test.ts). CI runs both.
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: TEST_DIRS.map((d) => `${d}/**/*.test.ts`),
          exclude: [...configDefaults.exclude, SIMULATION],
        },
      },
      {
        extends: true,
        test: {
          name: 'simulation',
          include: TEST_DIRS.map((d) => `${d}/${SIMULATION}`),
          // Whole matches / long runs, all files in parallel: no per-test clock (each run is bounded by
          // its own match / tick caps), one generous ceiling for a hung run.
          testTimeout: 600_000,
        },
      },
    ],
  },
})
