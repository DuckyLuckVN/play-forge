// Pure shuttle physics (metres, seconds). Side 0 owns z < 0, side 1 owns z > 0, net at z = 0.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const COURT = { halfLen: 6.7, halfWidth: 2.59, netH: 1.55, shortLine: 1.98 } as const
/** Gravity, quadratic drag coefficient (terminal speed ≈ 6.8 m/s), fixed tick. */
export const G = 9.8
export const DRAG = 0.21
export const DT = 1 / 60

export interface Flight {
  pos: Vec3
  vel: Vec3
}

const DEFAULT_MAX_TICKS = 600

/** One semi-implicit Euler step. Mutates f. `netHit` when crossing z = 0 below net height. */
export function stepShuttle(f: Flight, dt: number = DT): { netHit: boolean } {
  return advance(f, dt, true)
}

function advance(f: Flight, dt: number, useNet: boolean): { netHit: boolean } {
  const { pos, vel } = f
  const speed = Math.hypot(vel.x, vel.y, vel.z)
  vel.x -= DRAG * speed * vel.x * dt
  vel.y -= (G + DRAG * speed * vel.y) * dt
  vel.z -= DRAG * speed * vel.z * dt
  const pz = pos.z
  pos.x += vel.x * dt
  pos.y += vel.y * dt
  pos.z += vel.z * dt
  const crossed = (pz < 0 && pos.z >= 0) || (pz > 0 && pos.z <= 0)
  if (useNet && crossed && pos.y < COURT.netH) {
    pos.z = pz
    vel.x = 0
    vel.z = 0
    return { netHit: true }
  }
  return { netHit: false }
}

function land(f: Flight, maxTicks: number, useNet: boolean): { pos: Vec3; ticks: number; netHit: boolean } {
  const g: Flight = { pos: { ...f.pos }, vel: { ...f.vel } }
  let netHit = false
  let ticks = 0
  while (g.pos.y > 0 && ticks < maxTicks) {
    const prev = { ...g.pos }
    if (advance(g, DT, useNet).netHit) netHit = true
    ticks++
    if (g.pos.y <= 0) {
      // interpolate to y = 0 so the result is smooth in the launch parameters
      const k = prev.y / (prev.y - g.pos.y)
      g.pos.x = prev.x + (g.pos.x - prev.x) * k
      g.pos.z = prev.z + (g.pos.z - prev.z) * k
      g.pos.y = 0
    }
  }
  return { pos: g.pos, ticks, netHit }
}

/** Where (y = 0) and when the shuttle lands. Works on a copy; f is untouched. */
export function predictLanding(
  f: Flight,
  maxTicks: number = DEFAULT_MAX_TICKS,
): { pos: Vec3; ticks: number; netHit: boolean } {
  return land(f, maxTicks, true)
}

/**
 * Launch velocity from `from` toward `target` at a fixed elevation, binary-searching speed
 * (<= maxSpeed) so the landing distance matches. Net ignored. Unreachable -> maxSpeed.
 */
export function solveLaunch(
  from: Vec3,
  target: { x: number; z: number },
  elevationDeg: number,
  maxSpeed: number,
): Vec3 {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const want = Math.hypot(dx, dz)
  const ux = want > 0 ? dx / want : 0
  const uz = want > 0 ? dz / want : 0
  const el = (elevationDeg * Math.PI) / 180
  const velAt = (s: number): Vec3 => ({
    x: ux * Math.cos(el) * s,
    y: Math.sin(el) * s,
    z: uz * Math.cos(el) * s,
  })
  const reach = (s: number): number => {
    const p = land({ pos: from, vel: velAt(s) }, DEFAULT_MAX_TICKS, false).pos
    return Math.hypot(p.x - from.x, p.z - from.z)
  }
  if (reach(maxSpeed) < want) return velAt(maxSpeed)
  let lo = 0
  let hi = maxSpeed
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (reach(mid) < want) lo = mid
    else hi = mid
  }
  return velAt((lo + hi) / 2)
}

/** Inside that side's singles half-court (lines count as in). */
export function isIn(p: { x: number; z: number }, side: 0 | 1): boolean {
  if (Math.abs(p.x) > COURT.halfWidth) return false
  return side === 1 ? p.z >= 0 && p.z <= COURT.halfLen : p.z <= 0 && p.z >= -COURT.halfLen
}
