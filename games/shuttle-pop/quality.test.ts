import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GRAPHICS_PREFS } from './look'
import { SP_QUALITY, spLadder, spStartLevel, spTier } from './quality'

describe('Shuttle Pop quality ladder', () => {
  it('Auto walks the looks High → Medium → Low at full resolution, then drops resolution', () => {
    expect(SP_QUALITY.slice(0, 3).map(spTier)).toEqual(['high', 'medium', 'low'])
    for (const l of SP_QUALITY.slice(0, 3)) expect(l.dpr).toBe(Infinity)
  })
  it('resolution never rises down any ladder; floor is DPR 1; shadows / AO / bloom stay off once off', () => {
    for (const pref of GRAPHICS_PREFS) {
      const L = spLadder(pref)
      for (let i = 1; i < L.length; i++) {
        expect(L[i].dpr).toBeLessThanOrEqual(L[i - 1].dpr)
        if (L[i - 1].shadows === false) expect(L[i].shadows).toBe(false)
        if (!L[i - 1].ao) expect(L[i].ao).toBeFalsy()
        if (!L[i - 1].bloom) expect(L[i].bloom).toBe(false)
      }
      expect(L.at(-1)!.dpr).toBe(1)
    }
  })
  it('a pinned look keeps its look on every rung (only resolution steps)', () => {
    for (const pref of ['low', 'medium', 'high'] as const)
      for (const l of spLadder(pref)) expect(spTier(l)).toBe(pref)
  })
  it('Low has no post effects (straight to the canvas); High alone has AO', () => {
    const [low] = spLadder('low')
    expect(low).toMatchObject({ bloom: false, shadows: false })
    expect(low.ao).toBeFalsy()
    expect(spLadder('medium')[0]).toMatchObject({ bloom: true, shadows: true, ao: false })
    expect(spLadder('high')[0]).toMatchObject({ bloom: true, shadows: true, ao: true })
  })
  it('only the engine decides quality: the renderer builds no governor of its own', () => {
    const src = readFileSync(new URL('./render3d.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/new QualityGovernor|QualityGovernor\(/)
    expect(src).toContain('levels: spLadder(')
    expect(src).toContain('spTier(this.view.quality)')
  })
  it('Auto on phones starts at the Low look (full resolution); desktops and pinned looks at the top', () => {
    expect(spTier(SP_QUALITY[spStartLevel(true)])).toBe('low')
    expect(SP_QUALITY[spStartLevel(true)].dpr).toBe(Infinity)
    expect(spStartLevel(false)).toBe(0)
    expect(spStartLevel(true, 'high')).toBe(0)
    expect(spStartLevel(true, 'low')).toBe(0)
  })
})
