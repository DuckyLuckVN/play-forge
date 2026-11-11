import { describe, expect, it } from 'vitest'
import { NO_TWEAK } from './world'
import { PREFS_KEY, createPrefs, fromStep, parsePrefs, stepLabel, toStep, type SpPrefs } from './prefs'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('shuttle-pop prefs', () => {
  it('defaults when empty, garbage, or storage throws', () => {
    expect(createPrefs(mem()).get().camera).toEqual(NO_TWEAK)
    const bad = mem()
    bad.setItem(PREFS_KEY, '{nope')
    expect(createPrefs(bad).get().camera).toEqual(NO_TWEAK)
    const boom = {
      getItem: () => {
        throw new Error()
      },
      setItem: () => {
        throw new Error()
      },
    }
    const p = createPrefs(boom)
    expect(p.get().camera).toEqual(NO_TWEAK)
    expect(() => p.set({ camera: { height: 0.3, tilt: 0 } })).not.toThrow()
    expect(p.get().camera.height).toBe(0.3)
  })

  it('auto swing: off by default; only a stored true turns it on', () => {
    expect(createPrefs(mem()).get().autoSwing).toBe(false)
    expect(parsePrefs({ autoSwing: true }).autoSwing).toBe(true)
    expect(parsePrefs({ autoSwing: 'yes' }).autoSwing).toBe(false)
    const m = mem()
    createPrefs(m).set({ autoSwing: true })
    expect(createPrefs(m).get().autoSwing).toBe(true)
  })

  it('clamps and sanitizes stored values', () => {
    expect(parsePrefs({ camera: { height: 5, tilt: 'x' } }).camera).toEqual({ height: 1, tilt: 0 })
    expect(parsePrefs({ camera: { height: NaN, tilt: -3 } }).camera).toEqual({ height: 0, tilt: -1 })
    expect(parsePrefs(null).camera).toEqual(NO_TWEAK)
    expect(parsePrefs({ camera: 7, extra: 1 }).camera).toEqual(NO_TWEAK)
  })

  it('round-trips through storage and notifies listeners', () => {
    const s = mem()
    const a = createPrefs(s)
    const seen: SpPrefs[] = []
    const off = a.onChange((p) => seen.push(p))
    a.set({ camera: { height: -0.4, tilt: 0.2 } })
    expect(createPrefs(s).get().camera).toEqual({ height: -0.4, tilt: 0.2 })
    expect(seen).toHaveLength(1)
    off()
    a.set({ camera: { height: 0, tilt: 0 } })
    expect(seen).toHaveLength(1)
  })

  it('slider steps: ±10 <-> ±1, labels', () => {
    expect(toStep(0.3)).toBe(3)
    expect(fromStep(-10)).toBe(-1)
    expect(stepLabel(0)).toBe('Default')
    expect(stepLabel(3)).toBe('+3')
    expect(stepLabel(-3)).toBe('−3')
  })

  it('ring: default always, old saves without it, garbage → always; camera kept', () => {
    expect(createPrefs(mem()).get().ring).toBe('always')
    const s = mem()
    s.setItem(PREFS_KEY, JSON.stringify({ camera: { height: 0.3, tilt: 0 } })) // slice-3 save
    expect(createPrefs(s).get()).toEqual({
      camera: { height: 0.3, tilt: 0 },
      ring: 'always',
      autoSwing: false,
    })
    for (const ring of ['x', 3, null, 'Near']) expect(parsePrefs({ ring }).ring).toBe('always')
    expect(parsePrefs({ ring: 'near' }).ring).toBe('near')
  })

  it('setting the ring keeps the camera and persists', () => {
    const s = mem()
    const a = createPrefs(s)
    a.set({ camera: { height: -0.2, tilt: 0.1 } })
    a.set({ ring: 'hidden' })
    expect(createPrefs(s).get()).toEqual({
      camera: { height: -0.2, tilt: 0.1 },
      ring: 'hidden',
      autoSwing: false,
    })
  })
})
