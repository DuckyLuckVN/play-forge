// The ghost runs away from the camera (forward is -z): it must face where it's
// going, not look back at the player, and tip further forward the faster it goes.
import { Texture, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { forwardPitch } from './ghost-motion'
import { drawGhost2D, RESTING } from './ghost2d'
import { CHARACTERS } from './characters'

vi.mock('@forge/render3d', async (orig) => ({
  ...(await orig<typeof import('@forge/render3d')>()),
  glowTexture: () => new Texture(),
}))

describe('ghost facing', () => {
  it('its eyes are on the side facing forward (away from the camera)', async () => {
    const { makeGhost } = await import('./actors')
    const g = makeGhost()
    g.root.updateMatrixWorld(true)
    for (const eye of g.eyes) expect(eye.getWorldPosition(new Vector3()).z).toBeLessThan(0)
  })

  it('tips forward more the faster the rift runs', () => {
    expect(forwardPitch(0)).toBeGreaterThan(0)
    expect(forwardPitch(0)).toBeLessThan(0.12)
    expect(forwardPitch(1)).toBeGreaterThan(0.35)
    expect(forwardPitch(1)).toBeLessThan(0.45)
    expect(forwardPitch(0.5)).toBeGreaterThan(forwardPitch(0.2))
    expect(forwardPitch(2)).toBe(forwardPitch(1))
  })

  it('in 2D, a running ghost seen from behind draws no eyes or blush', () => {
    const ellipses = (back: boolean) => {
      let n = 0
      const ctx: any = new Proxy(
        {},
        {
          get: (_, k) => (k === 'ellipse' ? () => n++ : () => ctx),
          set: () => true,
        },
      )
      drawGhost2D(ctx, 0, 0, CHARACTERS[0], { ...RESTING, back }, 1)
      return n
    }
    expect(ellipses(false) - ellipses(true)).toBe(4)
  })
})
