// The sand around the court: a small seeded, seamlessly tiling grain texture (no asset files). It multiplies
// the surround's colour, so it stays near white: soft darker patches, fine grain, a few pebbles and light
// sparkles. Built once (allocates); the pattern is the same every load.

import { DataTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { rng } from './kit'

export const SAND = {
  /** Texture edge (px). */
  px: 128,
  /** Metres one tile covers on the ground. */
  tile: 1.6,
  /** Base colour the texture multiplies (lit ≈ 1× albedo in full sun, look.ts). */
  color: '#e9d8b0',
  /** Soft patch depth (0..1 darker at most) and its lattice cells per tile. */
  patch: 0.07,
  patchCells: 4,
  /** Per-pixel grain (± share). */
  grain: 0.05,
  /** Share of pixels that are a darker pebble / a light sparkle, and how much darker / lighter. */
  pebbles: 0.025,
  pebbleDark: 0.22,
  sparkles: 0.012,
  sparkleLift: 0.06,
  seed: 7,
} as const

const smooth = (t: number) => t * t * (3 - 2 * t)

/** RGBA pixels (`px`×`px`) of the sand pattern; tiles seamlessly (the patch lattice wraps). */
export function sandPixels(px: number = SAND.px, seed: number = SAND.seed): Uint8Array {
  const r = rng(seed)
  const n = SAND.patchCells
  const lattice = Array.from({ length: n * n }, () => r())
  const at = (i: number, j: number) => lattice[((j + n) % n) * n + ((i + n) % n)]
  const out = new Uint8Array(px * px * 4)
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const u = (x / px) * n
      const v = (y / px) * n
      const i = Math.floor(u)
      const j = Math.floor(v)
      const fu = smooth(u - i)
      const fv = smooth(v - j)
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fu
      const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu
      let k = 1 - SAND.patch * (top + (bottom - top) * fv)
      k *= 1 + (r() * 2 - 1) * SAND.grain
      const roll = r()
      if (roll < SAND.pebbles) k *= 1 - SAND.pebbleDark * (0.5 + r() * 0.5)
      else if (roll < SAND.pebbles + SAND.sparkles) k = Math.min(1, k + SAND.sparkleLift)
      const c = Math.round(Math.max(0, Math.min(1, k)) * 255)
      const o = (y * px + x) * 4
      // A touch warmer in the darker grains (wet-sand brown), neutral in the light ones.
      out[o] = c
      out[o + 1] = Math.round(c * (0.985 + 0.015 * k))
      out[o + 2] = Math.round(c * (0.95 + 0.05 * k))
      out[o + 3] = 255
    }
  return out
}

/** The sand texture: repeats, mipmapped, sRGB; `anisotropy` keeps the grain crisp at the camera's low angle. */
export function sandTexture(anisotropy = 1): DataTexture {
  const tex = new DataTexture(sandPixels(), SAND.px, SAND.px)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = anisotropy
  tex.needsUpdate = true
  return tex
}
