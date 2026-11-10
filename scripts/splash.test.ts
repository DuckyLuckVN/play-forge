import { describe, expect, it } from 'vitest'
import { splashMarkup, withSplash } from './splash.mjs'

const built = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Snake · Play Forge</title>
    <script type="module" crossorigin>console.log("app")</script>
    <style rel="stylesheet" crossorigin>.pf{color:red}</style>
  </head>
  <body>
  </body>
</html>`

describe('splashMarkup', () => {
  it('shows the game title and its cover, with no text that needs translating', () => {
    const html = splashMarkup({ title: 'Snake', cover: '<svg id="c"></svg>' })
    expect(html).toContain('id="pf-splash"')
    expect(html).toContain('<svg id="c"></svg>')
    expect(html).toContain('>Snake<')
    expect(html).not.toMatch(/Loading/i)
  })

  it('escapes the title', () => {
    expect(splashMarkup({ title: 'A<b>&' })).toContain('A&lt;b&gt;&amp;')
  })

  it('works without a cover', () => {
    expect(splashMarkup({ title: 'Snake' })).not.toContain('<svg')
  })
})

describe('withSplash', () => {
  const out = withSplash(built, { cover: '<svg></svg>' })

  it('puts the splash first in the body, so it paints before the big inlined bundle arrives', () => {
    const body = out.indexOf('<body>')
    const splash = out.indexOf('id="pf-splash"')
    const script = out.indexOf('<script type="module"')
    const style = out.indexOf('<style rel="stylesheet"')
    expect(splash).toBeGreaterThan(body)
    expect(script).toBeGreaterThan(splash)
    expect(style).toBeGreaterThan(splash)
  })

  it('moves the bundle out of the head without losing or duplicating it', () => {
    const head = out.slice(0, out.indexOf('</head>'))
    expect(head).not.toContain('<script')
    expect(head).not.toContain('<style rel="stylesheet"')
    expect(out.match(/console\.log\("app"\)/g)).toHaveLength(1)
    expect(out.match(/\.pf\{color:red\}/g)).toHaveLength(1)
    // Styles before the script, both before </body>.
    expect(out.indexOf('.pf{color:red}')).toBeLessThan(out.indexOf('console.log'))
    expect(out.indexOf('console.log')).toBeLessThan(out.indexOf('</body>'))
  })

  it('takes the title from <title> (before " · Play Forge")', () => {
    expect(out).toContain('>Snake<')
  })

  it('keeps "$" patterns in the bundle as they are (no replacement expansion)', () => {
    const page = built.replace('console.log("app")', () => 'a.replace(/x/, "$&$\'$1")')
    expect(withSplash(page)).toContain('a.replace(/x/, "$&$\'$1")')
  })

  it('leaves a page without a body untouched', () => {
    expect(withSplash('<html></html>')).toBe('<html></html>')
  })

  it('splashes a page only once', () => {
    expect(withSplash(out).match(/id="pf-splash"/g)).toHaveLength(1)
  })
})
