/** Extra jump beats, sampled from render time without storing animation state. */
export interface JumpMotion {
  crouch: number
  cock: number
  stretch: number
}

export function jumpMotionInto(age: number, air: number, out: JumpMotion): JumpMotion {
  out.crouch = out.cock = out.stretch = 0
  if (age < 0 || age >= air) return out
  const u = age / air
  out.crouch = Math.max(0, 1 - age / 3) * 0.18
  out.cock = Math.min(1, age / 5) * Math.max(0, 1 - u * u)
  out.stretch = Math.max(0, 1 - Math.abs(u - 0.5) / 0.22)
  return out
}
