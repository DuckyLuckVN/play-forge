import { describe, expect, it } from 'vitest'
import icon from '../icon.svg?raw'

// Every page (the launcher and each game) shows the shared Play Forge icon in the browser tab.
// Glob options must be written inline (Vite reads them at build time).
const pages = import.meta.glob<string>(['../index.html', './*/index.html'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('tab icon', () => {
  it('finds the launcher and every game', () => {
    expect(Object.keys(pages)).toContain('../index.html')
    expect(Object.keys(pages).length).toBeGreaterThanOrEqual(5)
  })

  it.each(Object.entries(pages))('%s links the shared icon', (page, html) => {
    const href = html.match(/<link rel="icon" type="image\/svg\+xml" href="([^"]+)"/)?.[1]
    expect(href).toBe(page === '../index.html' ? './icon.svg' : '../../icon.svg')
  })

  it('is a self-contained square SVG (the build inlines it into each page)', () => {
    expect(icon).toMatch(/^<svg[^>]*viewBox="0 0 64 64"/)
    expect(icon).not.toMatch(/href=|url\(http/)
  })
})
