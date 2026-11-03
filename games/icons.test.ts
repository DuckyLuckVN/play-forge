import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Every page (the launcher and each game) shows its own icon in the browser tab.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pages = [
  resolve(root, 'index.html'),
  ...readdirSync(resolve(root, 'games'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, 'games', d.name, 'index.html')))
    .map((d) => resolve(root, 'games', d.name, 'index.html')),
]

describe('tab icons', () => {
  it.each(pages.map((p) => [p.slice(root.length + 1), p]))('%s links an SVG icon that exists', (_, page) => {
    const html = readFileSync(page, 'utf8')
    const href = html.match(/<link rel="icon" type="image\/svg\+xml" href="([^"]+\.svg)"/)?.[1]
    expect(href).toBeTruthy()
    const svg = readFileSync(resolve(dirname(page), href!), 'utf8')
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 64 64"/)
    // No external references: the icon is inlined into the single-file build.
    expect(svg).not.toMatch(/href="http|url\(http/)
  })
})
