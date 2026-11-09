import { describe, expect, it } from 'vitest'
import { heartSlot, meterAt } from './hud'
import { MAX_HEARTS } from './sim'

describe('Phantom Drift HUD layout', () => {
  for (const [w, h] of [
    [390, 844],
    [1280, 800],
  ])
    it(`hearts sit in a row under the score, beside the Phantom ring, at ${w}×${h}`, () => {
      const [mx, my] = meterAt(w, h)
      const slots = Array.from({ length: MAX_HEARTS }, (_, i) => heartSlot(w, h, i))
      for (let i = 1; i < slots.length; i++) expect(slots[i][0]).toBeGreaterThan(slots[i - 1][0])
      for (const [x, y] of slots) {
        expect(y).toBe(slots[0][1])
        // Left of the ring (clear of the ghost standing over it), under the score text, on screen.
        expect(x).toBeLessThan(mx - 32 - 20)
        expect(y).toBeGreaterThan(my + 30)
        expect(y + 14).toBeLessThan(h)
        expect(x - 15).toBeGreaterThan(0)
      }
    })
})
