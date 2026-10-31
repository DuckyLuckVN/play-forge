// Builds every game into a single, self-contained HTML file:
//
//   dist/index.html               launcher
//   dist/games/<id>/index.html    one file per game, all JS/CSS inlined
//
// Each game file works when opened straight from disk (file://) or from any
// static host such as GitHub Pages.
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const root = fileURLToPath(new URL('..', import.meta.url))
const engine = fileURLToPath(new URL('../engine', import.meta.url))

const only = process.argv[2] // optional: `npm run build -- snake`
const games = readdirSync(`${root}/games`, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(`${root}/games/${d.name}/index.html`))
  .map((d) => d.name)
  .filter((id) => !only || id === only)

const targets = [
  ...(only ? [] : [{ name: 'launcher', dir: root, out: 'dist', empty: true }]),
  ...games.map((id) => ({ name: id, dir: `${root}/games/${id}`, out: `dist/games/${id}` })),
]

for (const t of targets) {
  console.log(`\n▸ building ${t.name}`)
  await build({
    configFile: false,
    root: t.dir,
    base: './',
    logLevel: 'warn',
    resolve: { alias: { '@forge': engine } },
    plugins: [viteSingleFile()],
    build: {
      outDir: `${root}/${t.out}`,
      emptyOutDir: t.empty ?? true,
      rollupOptions: { input: `${t.dir}/index.html` },
    },
  })
  console.log(`  ✓ ${t.out}/index.html`)
}
