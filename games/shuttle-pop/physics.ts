// Pure shuttle physics (metres, seconds). Side 0 owns z < 0, side 1 owns z > 0, net at z = 0.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const COURT = { halfLen: 6.7, halfWidth: 2.59, netH: 1.55, shortLine: 1.98 } as const
/** Gravity, quadratic drag coefficient (terminal speed = sqrt(G/DRAG)), fixed tick. */
export const G = 9.8
export const DRAG = 0.15
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

/**
 * If a step took `pos` to or below the floor, pull it back along that step (from px/py/pz) to the
 * exact y = 0 crossing. Shared by predictLanding and the sim's line calls so both agree. No alloc.
 */
export function settleOnFloor(pos: Vec3, px: number, py: number, pz: number): void {
  if (pos.y > 0) return
  if (py > 0) {
    const k = py / (py - pos.y)
    pos.x = px + (pos.x - px) * k
    pos.z = pz + (pos.z - pz) * k
  }
  pos.y = 0
}

function land(f: Flight, maxTicks: number, useNet: boolean): { pos: Vec3; ticks: number; netHit: boolean } {
  const g: Flight = { pos: { ...f.pos }, vel: { ...f.vel } }
  let netHit = false
  let ticks = 0
  while (g.pos.y > 0 && ticks < maxTicks) {
    const px = g.pos.x
    const py = g.pos.y
    const pz = g.pos.z
    if (advance(g, DT, useNet).netHit) netHit = true
    ticks++
    // interpolate to y = 0 so the result is smooth in the launch parameters
    settleOnFloor(g.pos, px, py, pz)
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
