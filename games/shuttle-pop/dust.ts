// Dust puffs at the players' feet (foot plants, sharp starts and turns, smash landings).
// PuffPool (pure) is a fixed ring of puffs: spawning past capacity recycles the oldest, motion uses an
// exact exponential drag so paths match at any frame rate. DustPuffs draws it as one InstancedMesh.
// Nothing allocates per frame.
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three'

/** Size over normalised age 0..1: pops up by 0.25, then shrinks away (reads as fading dust). */
export function puffScale(u: number): number {
  if (!(u > 0) || u >= 1) return 0
  if (u < 0.25) {
    const k = u / 0.25
    return 1 - (1 - k) * (1 - k)
  }
  const k = (u - 0.25) / 0.75
  return 1 - k * k
}

/** Drag (1/s) on a puff's ground speed; rise speed (m/s); start height (m). */
const DRAG = 5
const RISE = 0.3
const START_Y = 0.05

export class PuffPool {
  readonly x: Float32Array
  readonly y: Float32Array
  readonly z: Float32Array
  /** Normalised age 0..1 (≥ 1 = free). */
  readonly age: Float32Array
  readonly size: Float32Array
  private vx: Float32Array
  private vz: Float32Array
  private life: Float32Array
  private next = 0

  constructor(readonly capacity: number) {
    const f = () => new Float32Array(capacity)
    this.x = f()
    this.y = f()
    this.z = f()
    this.age = f().fill(1)
    this.size = f()
    this.vx = f()
    this.vz = f()
    this.life = f().fill(1)
  }

  /** A puff at (x, ground, z) drifting at (vx, vz) m/s, living `life` s, `size` m across at its peak. */
  spawn(x: number, z: number, vx: number, vz: number, life: number, size: number) {
    const i = this.next
    this.next = (i + 1) % this.capacity
    this.x[i] = x
    this.y[i] = START_Y
    this.z[i] = z
    this.vx[i] = vx
    this.vz[i] = vz
    this.life[i] = life
    this.size[i] = size
    this.age[i] = 0
  }

  update(dt: number) {
    const keep = Math.exp(-DRAG * dt)
    const move = (1 - keep) / DRAG
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= 1) continue
      this.age[i] += dt / this.life[i]
      this.x[i] += this.vx[i] * move
      this.z[i] += this.vz[i] * move
      this.vx[i] *= keep
      this.vz[i] *= keep
      this.y[i] += RISE * dt
    }
  }

  live(): number {
    let n = 0
    for (let i = 0; i < this.capacity; i++) if (this.age[i] < 1) n++
    return n
  }

  reset() {
    this.age.fill(1)
  }
}

export class DustPuffs {
  readonly mesh: InstancedMesh
  readonly pool: PuffPool
  private dummy = new Object3D()

  constructor(capacity: number, color: string, opacity: number) {
    this.pool = new PuffPool(capacity)
    // Always transparent (no recompiles); squashed spheres read as soft little clouds.
    const mat = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
    })
    this.mesh = new InstancedMesh(new SphereGeometry(0.5, 8, 6), mat, capacity)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  spawn(x: number, z: number, vx: number, vz: number, life: number, size: number) {
    this.pool.spawn(x, z, vx, vz, life, size)
  }

  reset() {
    this.pool.reset()
    this.mesh.visible = false
  }

  update(dt: number) {
    const p = this.pool
    p.update(dt)
    const d = this.dummy
    let any = false
    for (let i = 0; i < p.capacity; i++) {
      const s = p.size[i] * puffScale(p.age[i])
      if (s > 0) any = true
      d.position.set(p.x[i], p.y[i], p.z[i])
      d.scale.set(s, s * 0.7, s)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.visible = any
  }
}
