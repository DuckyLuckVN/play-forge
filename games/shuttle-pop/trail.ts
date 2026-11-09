// Shuttle trail: dots spread along the shuttle's recent path, tapering to the tail.
// TrailSampler (pure) keeps the path on a fixed time grid, so the trail spans the same flight time at any
// frame rate; ShuttleTrail draws it as one InstancedMesh. Neither allocates per frame.
import { Color, InstancedMesh, MeshBasicMaterial, Object3D, SphereGeometry } from 'three'

/**
 * Path samples every `step` s (time grid), newest first, plus the head (index 0) that always tracks the
 * current position. A long frame fills every skipped sample by lerping along that frame's movement.
 */
export class TrailSampler {
  /** x,y,z per point: [head, newest sample, …, oldest]. */
  readonly pts: Float32Array
  /** Valid points (head included). */
  len = 0
  private time = 0
  private next = 0

  constructor(
    private samples: number,
    private step: number,
  ) {
    this.pts = new Float32Array(samples * 3)
  }

  reset() {
    this.len = 0
  }

  update(dt: number, x: number, y: number, z: number) {
    const p = this.pts
    if (this.len === 0) {
      p[0] = p[3] = x
      p[1] = p[4] = y
      p[2] = p[5] = z
      this.len = 2
      this.time = 0
      this.next = this.step
      return
    }
    const t0 = this.time
    this.time += dt
    // Previous head = where the shuttle was at t0.
    const px = p[0]
    const py = p[1]
    const pz = p[2]
    // Strictly before now (a sample exactly at now would duplicate the head).
    while (this.next < this.time - 1e-9) {
      const u = (this.next - t0) / dt
      p.copyWithin(6, 3, (this.samples - 1) * 3)
      p[3] = px + (x - px) * u
      p[4] = py + (y - py) * u
      p[5] = pz + (z - pz) * u
      this.len = Math.min(this.samples, this.len + 1)
      this.next += this.step
    }
    p[0] = x
    p[1] = y
    p[2] = z
  }
}

export interface TrailLook {
  color: Color
  opacity: number
  /** Head dot radius (m). */
  size: number
}

export class ShuttleTrail {
  readonly mesh: InstancedMesh
  private mat: MeshBasicMaterial
  private sampler: TrailSampler
  private dummy = new Object3D()
  private look: TrailLook

  constructor(
    private dots: number,
    samples: number,
    step: number,
    look: TrailLook,
  ) {
    this.look = look
    this.sampler = new TrailSampler(samples, step)
    // Always transparent (no recompiles); colour/opacity follow the look.
    this.mat = new MeshBasicMaterial({ color: look.color, transparent: true, depthWrite: false })
    this.mesh = new InstancedMesh(new SphereGeometry(1, 8, 6), this.mat, dots)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  setLook(look: TrailLook) {
    this.look = look
  }

  reset() {
    this.sampler.reset()
    this.mesh.visible = false
  }

  /** `flying` false hides it and forgets the path. `x,y,z` = the shuttle in render coords. */
  update(flying: boolean, x: number, y: number, z: number, dt: number) {
    if (!flying) return this.reset()
    const s = this.sampler
    s.update(dt, x, y, z)
    if (s.len < 3) {
      this.mesh.visible = false
      return
    }
    this.mat.color.copy(this.look.color)
    this.mat.opacity = this.look.opacity
    const p = s.pts
    const d = this.dummy
    for (let j = 0; j < this.dots; j++) {
      const f = (j / (this.dots - 1)) * (s.len - 1)
      const k = Math.min(Math.floor(f), s.len - 2)
      const u = f - k
      const a = k * 3
      const b = a + 3
      d.position.set(
        p[a] + (p[b] - p[a]) * u,
        p[a + 1] + (p[b + 1] - p[a + 1]) * u,
        p[a + 2] + (p[b + 2] - p[a + 2]) * u,
      )
      d.scale.setScalar(this.look.size * (1 - j / this.dots))
      d.updateMatrix()
      this.mesh.setMatrixAt(j, d.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.visible = true
  }
}
