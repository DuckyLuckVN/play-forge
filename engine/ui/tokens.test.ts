/// <reference types="node" />
// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { theme } from './theme'

const css = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')

/** `--pf-name: value;` declarations in tokens.css, comments stripped. */
function tokens(src: string): Map<string, string> {
  const out = new Map<string, string>()
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of clean.matchAll(/(--pf-[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}

/** theme.ts key to its CSS custom property, as applyTheme() names it. */
const cssName = (key: string) => `--pf-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`

describe('tokens.css', () => {
  const declared = tokens(css)

  it('repeats every theme.ts colour with the same value', () => {
    for (const [key, value] of Object.entries(theme)) {
      expect(declared.get(cssName(key)), cssName(key)).toBe(value)
    }
  })

  it('has no static colour that theme.ts lacks', () => {
    const themeNames = new Set(Object.keys(theme).map(cssName))
    const hexTokens = [...declared].filter(([, v]) => /^#[0-9a-f]{3,8}$/i.test(v)).map(([k]) => k)
    expect(hexTokens.filter((k) => !themeNames.has(k))).toEqual([])
  })

  it('keeps the stacking order', () => {
    const z = (name: string) => Number(declared.get(`--pf-z-${name}`))
    const order = [
      'raised',
      'notice',
      'overlay',
      'countdown',
      'rotate',
      'bar',
      'toast',
      'popover',
      'fab',
      'sheet',
      'fx',
    ]
    const values = order.map(z)
    expect(values.every(Number.isFinite)).toBe(true)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })
})
