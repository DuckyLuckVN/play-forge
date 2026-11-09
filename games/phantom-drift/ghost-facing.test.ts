// The ghost runs away from the camera (forward is -z): we see its back, not a
// face looking back at the player, and on a lane change its face peeks round
// towards the lane it moves into. The 3D rift draws the same 2D ghost on a card.
import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { forwardPitch, ghostRig, runPose, runPoseOut } from './ghost-motion'
import { drawGhost2D, RESTING, type GhostPose } from './ghost2d'
import { CHARACTERS } from './characters'

vi.mock('@forge/render3d', async (orig) => ({
  ...(await orig<typeof import('@forge/render3d')>()),
  glowTexture: () => new Texture(),
}))

/** A 2D context that records the x of every ellipse (eyes, blush, petals). */
function recorder() {
  const xs: number[] = []
  const ctx: any = new Proxy(
    {},
    {
      get: (_, k) => (k === 'ellipse' ? (x: number) => xs.push(x) : () => ctx),
      set: () => true,
    },
  )
  return { ctx: ctx as CanvasRenderingContext2D, xs }
}

const wisp = CHARACTERS.find((c) => c.id === 'wisp')!

function ellipses(pose: GhostPose) {
  const r = recorder()
  drawGhost2D(r.ctx, 0, 0, wisp, pose, 1)
  return r.xs
}

describe('ghost facing', () => {
  it('tips forward more the faster the rift runs', () => {
    expect(forwardPitch(0)).toBeGreaterThan(0)
    expect(forwardPitch(0)).toBeLessThan(0.12)
    expect(forwardPitch(1)).toBeGreaterThan(0.35)
    expect(forwardPitch(1)).toBeLessThan(0.45)
    expect(forwardPitch(0.5)).toBeGreaterThan(forwardPitch(0.2))
    expect(forwardPitch(2)).toBe(forwardPitch(1))
  })

  it('in 2D, a running ghost seen from behind draws no eyes or blush', () => {
    expect(ellipses({ ...RESTING }).length - ellipses({ ...RESTING, back: true }).length).toBe(4)
    expect(ellipses({ ...RESTING, back: true, peek: 0 })).toEqual([])
    expect(ellipses({ ...RESTING, back: true, peek: 0.2 })).toEqual([])
  })

  it('a turned head shows both eyes, on the side it turns to', () => {
    for (const turn of [-1, 1]) {
      const xs = ellipses({ ...RESTING, back: true, peek: turn })
      expect(xs.length).toBe(4) // two eyes, two blush
      const [left, right] = xs
      expect(Math.sign(left)).toBe(turn)
      expect(Math.sign(right)).toBe(turn)
    }
  })

  it('the face comes round from the edge as the head turns further', () => {
    const half = ellipses({ ...RESTING, back: true, peek: 0.6 })
    const full = ellipses({ ...RESTING, back: true, peek: 1 })
    const mid = (xs: number[]) => (xs[0] + xs[1]) / 2
    expect(mid(half)).toBeGreaterThan(mid(full))
    expect(mid(full)).toBeGreaterThan(0)
  })

  it('the picker (front) look is unchanged by peek', () => {
    expect(ellipses({ ...RESTING, peek: 1 })).toEqual(ellipses({ ...RESTING }))
  })

  it('the 3D ghost card draws the running pose: its back, no face', async () => {
    const { makeGhost, paintGhost } = await import('./actors')
    const r = recorder()
    const canvas = { width: 0, height: 0, getContext: () => r.ctx } as unknown as HTMLCanvasElement
    const g = makeGhost(canvas)
    const before = g.texture.version
    const pose = runPose(
      ghostRig(),
      { time: 1, dt: 1 / 60, slide: 0, speed: 0.5, eyes: 1, glow: 0, reduced: false },
      runPoseOut(),
    )
    paintGhost(g, wisp, pose)
    expect(pose.back).toBe(true)
    expect(r.xs).toEqual([])
    expect(g.texture.version).toBeGreaterThan(before)
  })
})
