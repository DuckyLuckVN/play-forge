import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Euler,
  InstancedMesh,
  Object3D,
  Points,
  ShaderMaterial,
  Vector3,
  type Material,
  type Texture,
} from 'three'

let glow: Texture | null = null
/** Soft round white glow, shared (tint with a material colour). */
export function glowTexture(): Texture {
  if (glow) return glow
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  glow = new CanvasTexture(c)
  return glow
}

export interface Burst3D {
  count?: number
  color?: string | string[]
  /** Units per second. */
  speed?: number
  life?: number
  size?: number
  /** Downward acceleration. */
  gravity?: number
  /** Bias direction (normalised internally); spread 0..1 mixes in randomness. */
  dir?: [number, number, number]
  spread?: number
}

/**
 * Additive glowing particle bursts in 3D, in one draw call. Fixed capacity:
 * the oldest particles are overwritten when full.
 */
export class Particles3D {
  readonly points: Points
  private pos: Float32Array
  private vel: Float32Array
  private col: Float32Array
  private age: Float32Array
  private life: Float32Array
  private size: Float32Array
  private grav: Float32Array
  private next = 0
  private tmp = new Color()

  constructor(private capacity = 800) {
    const geo = new BufferGeometry()
    this.pos = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.col = new Float32Array(capacity * 3)
    this.age = new Float32Array(capacity).fill(1)
    this.life = new Float32Array(capacity).fill(1)
    this.size = new Float32Array(capacity)
    this.grav = new Float32Array(capacity)
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new BufferAttribute(this.col, 3))
    geo.setAttribute('size', new BufferAttribute(this.size, 1))
    const fade = new Float32Array(capacity)
    geo.setAttribute('fade', new BufferAttribute(fade, 1))
    this.points = new Points(
      geo,
      new ShaderMaterial({
        uniforms: { map: { value: glowTexture() }, scale: { value: 300 } },
        vertexShader: /* glsl */ `
          attribute float size; attribute float fade; attribute vec3 color;
          varying vec3 vColor; varying float vFade; uniform float scale;
          void main() {
            vColor = color; vFade = fade;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * scale / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D map; varying vec3 vColor; varying float vFade;
          void main() {
            vec4 t = texture2D(map, gl_PointCoord);
            gl_FragColor = vec4(vColor * 1.6, t.a * vFade);
          }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    this.points.frustumCulled = false
  }

  /** Projected point-size scale; set to the canvas height in pixels. */
  setScale(viewHeight: number): void {
    ;(this.points.material as ShaderMaterial).uniforms.scale.value = viewHeight * 0.5
  }

  burst(x: number, y: number, z: number, o: Burst3D = {}): void {
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#fff']
    const n = o.count ?? 16
    const speed = o.speed ?? 4
    const spread = o.spread ?? 1
    const [bx, by, bz] = o.dir ?? [0, 0, 0]
    const bl = Math.hypot(bx, by, bz) || 1
    for (let i = 0; i < n; i++) {
      const p = this.next
      this.next = (this.next + 1) % this.capacity
      // Random direction on a sphere, mixed with the bias.
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      let dx = r * Math.cos(a) * spread + (bx / bl) * (1 - spread)
      let dy = u * spread + (by / bl) * (1 - spread)
      let dz = r * Math.sin(a) * spread + (bz / bl) * (1 - spread)
      const dl = Math.hypot(dx, dy, dz) || 1
      const s = speed * (0.4 + Math.random() * 0.8)
      dx = (dx / dl) * s
      dy = (dy / dl) * s
      dz = (dz / dl) * s
      this.pos.set([x, y, z], p * 3)
      this.vel.set([dx, dy, dz], p * 3)
      this.tmp.set(colors[i % colors.length])
      this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], p * 3)
      this.age[p] = 0
      this.life[p] = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6)
      this.size[p] = (o.size ?? 0.3) * (0.6 + Math.random() * 0.8)
      this.grav[p] = o.gravity ?? 0
    }
  }

  /** Moves particles; `scrollZ` shifts everything (the world moving past). */
  update(dt: number, scrollZ = 0): void {
    const geo = this.points.geometry
    const fade = geo.getAttribute('fade') as BufferAttribute
    for (let p = 0; p < this.capacity; p++) {
      if (this.age[p] >= this.life[p]) {
        fade.array[p] = 0
        continue
      }
      this.age[p] += dt
      const i = p * 3
      this.vel[i + 1] -= this.grav[p] * dt
      const drag = 1 - 2.2 * dt
      this.vel[i] *= drag
      this.vel[i + 1] *= drag
      this.vel[i + 2] *= drag
      this.pos[i] += this.vel[i] * dt
      this.pos[i + 1] += this.vel[i + 1] * dt
      this.pos[i + 2] += this.vel[i + 2] * dt + scrollZ
      const t = this.age[p] / this.life[p]
      fade.array[p] = 1 - t * t * t
    }
    geo.getAttribute('position').needsUpdate = true
    geo.getAttribute('color').needsUpdate = true
    geo.getAttribute('size').needsUpdate = true
    fade.needsUpdate = true
  }
}

export interface Chunks3DBurst {
  count?: number
  color?: string
  speed?: number
  size?: number
  life?: number
}

/**
 * Solid debris chunks (instanced boxes) that fly, spin, bounce on y = 0 and
 * shrink away. One draw call; oldest chunks are reused when full.
 */
export class Chunks3D {
  readonly mesh: InstancedMesh
  private items: {
    p: Vector3
    v: Vector3
    r: Euler
    spin: Vector3
    age: number
    life: number
    size: number
  }[] = []
  private next = 0
  private dummy = new Object3D()
  private tmp = new Color()

  constructor(
    material: Material,
    private capacity = 120,
  ) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, capacity)
    this.mesh.frustumCulled = false
    for (let i = 0; i < capacity; i++) {
      this.items.push({
        p: new Vector3(),
        v: new Vector3(),
        r: new Euler(),
        spin: new Vector3(),
        age: 1,
        life: 1,
        size: 0,
      })
      this.mesh.setColorAt(i, this.tmp.set('#fff'))
    }
  }

  burst(x: number, y: number, z: number, o: Chunks3DBurst = {}): void {
    const speed = o.speed ?? 6
    for (let i = 0; i < (o.count ?? 12); i++) {
      const c = this.items[this.next]
      this.mesh.setColorAt(this.next, this.tmp.set(o.color ?? '#fff'))
      this.next = (this.next + 1) % this.capacity
      const a = Math.random() * Math.PI * 2
      const out = speed * (0.3 + Math.random() * 0.7)
      c.p.set(x, y, z)
      c.v.set(Math.cos(a) * out, speed * (0.6 + Math.random() * 0.8), Math.sin(a) * out * 0.6)
      c.r.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      c.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14)
      c.age = 0
      c.life = (o.life ?? 1.1) * (0.7 + Math.random() * 0.6)
      c.size = (o.size ?? 0.3) * (0.5 + Math.random())
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  /** `scrollZ`: how far the world moved this frame (chunks ride the track). */
  update(dt: number, scrollZ = 0, gravity = 22): void {
    this.items.forEach((c, i) => {
      if (c.age < c.life) {
        c.age += dt
        c.v.y -= gravity * dt
        c.p.addScaledVector(c.v, dt)
        c.p.z += scrollZ
        if (c.p.y < c.size / 2) {
          c.p.y = c.size / 2
          c.v.y *= -0.4
          c.v.x *= 0.7
          c.v.z *= 0.7
        }
        c.r.x += c.spin.x * dt
        c.r.y += c.spin.y * dt
        c.r.z += c.spin.z * dt
      }
      const t = Math.min(1, c.age / c.life)
      this.dummy.position.copy(c.p)
      this.dummy.rotation.copy(c.r)
      this.dummy.scale.setScalar(c.size * (1 - t * t))
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
