import { describe, expect, it } from 'vitest'
import { PRESETS } from '../actors'
import { rigOf } from './look'
import { headTop, HEAD_SIZE } from './head'

describe('headTop', () => {
  it('sits below the old fixed 1.3 box top at the current HEAD_SIZE, for every look', () => {
    expect(HEAD_SIZE).toBeLessThan(1)
    for (const p of PRESETS) expect(headTop(rigOf(p.look), p.look.head)).toBeLessThan(1.3)
  })

  it('a smaller head size lowers the top; size 1 is the full-size head', () => {
    for (const p of PRESETS) {
      const r = rigOf(p.look)
      const k = p.look.head
      expect(headTop(r, k, 0.5)).toBeLessThan(headTop(r, k, 0.8))
      expect(headTop(r, k, 0.8)).toBeLessThan(headTop(r, k, 1))
    }
  })
})
