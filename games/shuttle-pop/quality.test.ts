import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SP_QUALITY, spStartLevel } from './quality'

describe('Shuttle Pop quality ladder', () => {
  it('drops real shadows before any resolution', () => {
    expect(SP_QUALITY[0]).toMatchObject({ dpr: Infinity, shadows: true })
    expect(SP_QUALITY[1]).toMatchObject({ dpr: Infinity, shadows: false })
  })
  it('resolution never rises down the ladder; floor is DPR 1, shadows stay off once off', () => {
    for (let i = 1; i < SP_QUALITY.length; i++) {
      expect(SP_QUALITY[i].dpr).toBeLessThanOrEqual(SP_QUALITY[i - 1].dpr)
      if (SP_QUALITY[i - 1].shadows === false) expect(SP_QUALITY[i].shadows).toBe(false)
    }
    expect(SP_QUALITY.at(-1)!.dpr).toBe(1)
  })
  it('only the engine decides quality: the renderer builds no governor of its own', () => {
    const src = readFileSync(new URL('./render3d.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/new QualityGovernor|QualityGovernor\(/)
    expect(src).toContain('levels: SP_QUALITY')
    expect(src).toContain('view.quality.shadows')
  })
  it('phones start one rung down (no real shadows, full resolution); desktops at the top', () => {
    expect(SP_QUALITY[spStartLevel(true)]).toMatchObject({ dpr: Infinity, shadows: false })
    expect(spStartLevel(false)).toBe(0)
  })
})
