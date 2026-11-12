import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GRAPHICS_PREFS } from './look'
import {
  estimateTier,
  loadAutoLevel,
  saveAutoLevel,
  SP_QUALITY,
  spLadder,
  spStartLevel,
  spTier,
  type DeviceInfo,
} from './quality'

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
    expect(src).toContain('this.ladder = spLadder(')
    expect(src).toContain('levels: this.ladder')
    expect(src).toContain('spTier(this.view.quality)')
  })
  it('start: a pinned look at the top; Auto from the saved level, else the device estimate, else Medium', () => {
    expect(spStartLevel('high')).toBe(0)
    expect(spStartLevel('low', { saved: 3 })).toBe(0)
    expect(spStartLevel('auto', { saved: 3, tier: 'high' })).toBe(3)
    expect(spTier(SP_QUALITY[spStartLevel('auto', { tier: 'high' })])).toBe('high')
    expect(spTier(SP_QUALITY[spStartLevel('auto', { tier: 'low' })])).toBe('low')
    expect(SP_QUALITY[spStartLevel('auto', { tier: 'low' })].dpr).toBe(Infinity)
    expect(spTier(SP_QUALITY[spStartLevel('auto')])).toBe('medium')
  })

  const dev = (d: Partial<DeviceInfo>): DeviceInfo => ({
    gpu: '',
    cores: 8,
    memGB: 8,
    pixels: 2e6,
    touch: false,
    ...d,
  })
  it('device estimate: strong desktop GPU → High, weak GPU or small hardware → Low, unknown → Medium', () => {
    expect(
      estimateTier(dev({ gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' })),
    ).toBe('high')
    expect(
      estimateTier(dev({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)' })),
    ).toBe('high')
    expect(estimateTier(dev({ gpu: 'Mali-G52 MC2' }))).toBe('low')
    expect(estimateTier(dev({ gpu: 'Adreno (TM) 506' }))).toBe('low')
    expect(estimateTier(dev({ gpu: 'Google SwiftShader' }))).toBe('low')
    expect(estimateTier(dev({ gpu: 'Intel(R) UHD Graphics 620', cores: 4 }))).toBe('low')
    expect(estimateTier(dev({ gpu: 'Intel(R) Iris(R) Xe Graphics' }))).toBe('medium')
    expect(estimateTier(dev({ gpu: 'Adreno (TM) 740', touch: true }))).toBe('medium')
    // A strong GPU on a phone / tablet still starts at Medium (thermals); hidden signals → Medium.
    expect(estimateTier(dev({ gpu: 'Apple M1', touch: true }))).toBe('medium')
    expect(estimateTier(dev({ cores: 0, memGB: 0 }))).toBe('medium')
  })

  it('the saved Auto level: valid ladder indexes only; garbage or blocked storage → null', () => {
    const mem = (v: string | null) => {
      let x = v
      return { getItem: () => x, setItem: (_k: string, val: string) => void (x = val) }
    }
    expect(loadAutoLevel(mem(null))).toBe(null)
    expect(loadAutoLevel(mem('2'))).toBe(2)
    expect(loadAutoLevel(mem('9'))).toBe(null)
    expect(loadAutoLevel(mem('-1'))).toBe(null)
    expect(loadAutoLevel(mem('1.5'))).toBe(null)
    expect(loadAutoLevel(mem('hi'))).toBe(null)
    expect(loadAutoLevel(null)).toBe(null)
    const m = mem(null)
    saveAutoLevel(1, m)
    expect(loadAutoLevel(m)).toBe(1)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => saveAutoLevel(1, broken)).not.toThrow()
    expect(loadAutoLevel(broken)).toBe(null)
  })
})
