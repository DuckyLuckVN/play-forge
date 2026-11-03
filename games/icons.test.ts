import { describe, expect, it } from 'vitest'

// Every page (the launcher and each game) shows its own icon in the browser tab.
// Glob options must be written inline (Vite reads them at build time).
const pages = import.meta.glob<string>(['../index.html', './*/index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
})
const icons = import.meta.glob<string>(['../launcher/icon.svg', './*/icon.svg'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Resolves `href` against the page's folder, in the same `./` / `../` form as the glob keys. */
function iconPath(page: string, href: string): string {
  const dir = page.slice(0, page.lastIndexOf('/'))
  const path = `${dir}/${href.replace(/^\.\//, '')}`
  return path.replace(/^\.\.\/games\//, './')
}

describe('tab icons', () => {
  it('finds the launcher and every game', () => {
    expect(Object.keys(pages)).toContain('../index.html')
    expect(Object.keys(pages).length).toBeGreaterThanOrEqual(5)
  })

  it.each(Object.entries(pages))('%s links an SVG icon that exists', (page, html) => {
    const href = html.match(/<link rel="icon" type="image\/svg\+xml" href="([^"]+\.svg)"/)?.[1]
    expect(href).toBeTruthy()
    const svg = icons[iconPath(page, href!)]
    expect(svg, iconPath(page, href!)).toBeTruthy()
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 64 64"/)
    // No external references: the build inlines the icon into the single file.
    expect(svg).not.toMatch(/href="http|url\(http/)
  })
})
