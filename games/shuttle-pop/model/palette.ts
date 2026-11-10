// Shared character colours (3D builders and picker portraits read the same values), kept in one place
// so a style pass can retune them without hunting through the builders. Per-character colours live in
// presets.ts; materials (roughness, twin shade, outline) in actors.ts.

export const PALETTE = {
  /** Eye dark, highlights, mouth, cheek blush, dark nose. */
  eye: 0x2b2233,
  shine: 0xffffff,
  mouth: 0x8c2f3f,
  blush: 0xff9eb5,
  nose: 0x2b2233,
  /** Inner ears (cat, bunny). */
  earPink: 0xffb3c6,
  /** Robot visor plate. */
  visor: 0x23263a,
  /** Shuttlecock emblem on jerseys / chest panels. */
  emblem: 0xffffff,
  /** Racket strings and shaft. */
  string: 0xd9d4c6,
  shaft: 0xc9ccd6,
} as const

/** `#rrggbb` for SVG. */
export const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`
