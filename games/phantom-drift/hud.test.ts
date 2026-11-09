import { describe, expect, it } from 'vitest'
import { heartSlot, meterAt } from './hud'
import { MAX_HEARTS } from './sim'

describe('Phantom Drift HUD layout', () => {
  for (const [w, h] of [
    [390, 844],
    [1280, 800],
  ])
    it(`hearts sit in a centred row just above the Phantom ring at ${w}×${h}`, () => {
      const [mx, my] = meterAt(w, h)
      const slots = Array.from({ length: MAX_HEARTS }, (_, i) => heartSlot(w, h, i))
      // Centred on the ring, evenly spaced, left to right.
      expect((slots[0][0] + slots.at(-1)![0]) / 2).toBeCloseTo(mx)
      for (let i = 1; i < slots.length; i++) expect(slots[i][0]).toBeGreaterThan(slots[i - 1][0])
      for (const [x, y] of slots) {
        expect(y).toBe(slots[0][1])
        // Above the ring and its ready glow (radius ~43), still in the bottom part of the screen.
        expect(my - y).toBeGreaterThan(43 + 12)
        expect(my - y).toBeLessThan(100)
        expect(x).toBeGreaterThan(0)
        expect(x).toBeLessThan(w)
        expect(y).toBeGreaterThan(h / 2)
      }
    })
})
