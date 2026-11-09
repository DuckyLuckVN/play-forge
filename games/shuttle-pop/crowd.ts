// The small cheering crowd around the court: eight simplified chibi fans on blankets, benches and
// their feet. Five InstancedMeshes in all; matrices are rewritten only while they cheer.

import {
  CapsuleGeometry,
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { instanced, lambert, rng, yawTo } from './kit'

const CROWD = {
  shirts: ['#c98ba0', '#88a9c4', '#c9a865', '#93b49a', '#b39ac8', '#d49a7a', '#7fa3a8', '#c4a0b6'],
  hair: ['#5a3e36', '#3b2f33', '#8a5a3c', '#2f2a35', '#b0703f'],
  skin: ['#ffe0c7', '#f2c9a5', '#d9a77f', '#ffd9bd'],
  eye: '#2b2233',
}

type Seat = 'ground' | 'bench' | 'stand'
interface Fan {
  x: number
  z: number
  seat: Seat
}

/** Eight fans: two on each near/far blanket, one per bench, one standing. */
const FANS: readonly Fan[] = [
  { x: -6.0, z: 1.3, seat: 'ground' },
  { x: -6.6, z: 2.0, seat: 'ground' },
  { x: 6.0, z: 2.1, seat: 'ground' },
  { x: 6.2, z: -4.8, seat: 'ground' },
  { x: -6.8, z: -1.6, seat: 'bench' },
  { x: 6.8, z: -1.0, seat: 'bench' },
  { x: -6.9, z: 5.6, seat: 'bench' },
  { x: 5.9, z: 5.2, seat: 'stand' },
]

// Fan proportions (a simplified chibi from actors.ts: same shape, fewer parts).
const FAN_SCALE = 0.95
const HIP_Y = 0.24
const SEAT_Y: Record<Seat, number> = { ground: 0.1, bench: 0.5, stand: HIP_Y }
const LIMBS = 4

// Cheer motion.
const CHEER_FREQ = 9
const CHEER_EASE = 6
const ARM_REST = -0.25
const ARM_LAP = -0.7
const ARM_UP = -2.9
/** Arm splay at rest and extra when raised (a V clear of the big head). */
const ARM_SPLAY = 0.25
const ARM_SPLAY_UP = 0.25
/** Raised arms stretch (cartoon) so the hands wave clear above the shoulders of the big head. */
const ARM_LEN_UP = 0.9
const HOP: Record<Seat, number> = { ground: 0.1, bench: 0.12, stand: 0.26 }

/**
 * The crowd: every fan's body, head, hair, eyes and limbs are five InstancedMeshes. Matrices are
 * rewritten only while the cheer level is above zero (or easing back to rest).
 */
export class Crowd {
  readonly root = new Group()
  private body: InstancedMesh
  private head: InstancedMesh
  private hair: InstancedMesh
  private eyes: InstancedMesh
  private limbs: InstancedMesh
  private base: Matrix4[]
  private phase: number[]
  private level = 0
  /** Matrices currently show the rest pose. */
  private resting = false
  // Scratch (no per-frame allocations).
  private m = new Matrix4()
  private lift = new Matrix4()
  private part = new Matrix4()
  private q = new Quaternion()
  private e = new Euler()
  private v = new Vector3()
  private s = new Vector3()

  constructor() {
    const n = FANS.length
    const skin = lambert()
    this.body = instanced(new CapsuleGeometry(0.17, 0.14, 3, 8), lambert(), n)
    this.head = instanced(new SphereGeometry(0.36, 14, 10), skin, n)
    this.hair = instanced(new SphereGeometry(0.375, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lambert(), n)
    this.eyes = instanced(new SphereGeometry(0.055, 6, 4), new MeshBasicMaterial({ color: CROWD.eye }), n * 2)
    this.limbs = instanced(new CapsuleGeometry(0.065, 0.16, 2, 6), skin, n * LIMBS)
    const r = rng(11)
    const tint = new Color()
    this.base = FANS.map((f, i) => {
      this.body.setColorAt(i, tint.set(CROWD.shirts[i % CROWD.shirts.length]))
      this.hair.setColorAt(i, tint.set(CROWD.hair[i % CROWD.hair.length]))
      const sk = CROWD.skin[i % CROWD.skin.length]
      this.head.setColorAt(i, tint.set(sk))
      for (let k = 0; k < LIMBS; k++) this.limbs.setColorAt(i * LIMBS + k, tint)
      // Facing the court's centre line, a little toward the net.
      this.e.set(0, yawTo(f.x, f.z, 0, f.z * 0.6), 0)
      return new Matrix4().compose(
        this.v.set(f.x, 0, f.z),
        this.q.setFromEuler(this.e),
        this.s.setScalar(FAN_SCALE),
      )
    })
    this.phase = FANS.map(() => r() * Math.PI * 2)
    for (const m of [this.body, this.head, this.hair, this.eyes, this.limbs]) {
      // Hops move instances past the first bounds; the crowd is always on screen anyway.
      m.frustumCulled = false
      this.root.add(m)
    }
    this.pose(0, 0)
  }

  /** `target` = cheer level 0..1 (eased here), `t` = seconds. */
  update(target: number, t: number, dt: number) {
    this.level += (target - this.level) * (1 - Math.exp(-CHEER_EASE * dt))
    if (target === 0 && this.level < 0.01) {
      this.level = 0
      if (this.resting) return
    }
    this.pose(this.level, t)
  }

  private pose(level: number, t: number) {
    this.resting = level === 0
    const up = Math.min(1, level * 1.8)
    for (let i = 0; i < FANS.length; i++) {
      const fan = FANS[i]
      const wave = Math.sin(t * CHEER_FREQ + this.phase[i])
      const hop = Math.abs(wave) * HOP[fan.seat] * level
      this.lift.makeTranslation(0, SEAT_Y[fan.seat] - HIP_Y + hop, 0).premultiply(this.base[i])
      this.write(this.body, i, 0, 0.42, 0, 0, 0)
      this.write(this.head, i, 0, 0.94, 0, 0, wave * 0.1 * level)
      this.write(this.hair, i, 0, 0.94, 0, -0.45, wave * 0.1 * level)
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1
        this.write(this.eyes, i * 2 + k, s * 0.13, 0.94, 0.32, 0, 0, 0.8, 1.1, 0.5)
        // Legs: hang when standing, straight out when seated.
        const leg = fan.seat === 'stand' ? 0 : -Math.PI / 2
        this.writeLimb(i * LIMBS + k, s * 0.09, HIP_Y, leg, 0)
        // Arms: rest (lap when seated) → overhead, waving out of step with the other arm.
        const rest = fan.seat === 'stand' ? ARM_REST : ARM_LAP
        const arm = rest + (ARM_UP + s * wave * 0.3 - rest) * up
        this.writeLimb(
          i * LIMBS + 2 + k,
          s * 0.2,
          0.56,
          arm,
          s * (ARM_SPLAY + ARM_SPLAY_UP * up),
          1 + ARM_LEN_UP * up,
        )
      }
    }
    for (const m of [this.body, this.head, this.hair, this.eyes, this.limbs])
      m.instanceMatrix.needsUpdate = true
  }

  /** Part at (x, y, z) in fan space, tilted rx (about x) and rz (about z), scaled. */
  private write(
    mesh: InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    rz: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    this.e.set(rx, 0, rz)
    this.part.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz))
    mesh.setMatrixAt(i, this.m.multiplyMatrices(this.lift, this.part))
  }

  /** A limb pivoting at (x, y): swung `rx` about x, splayed `rz`, hanging below the pivot, `len` × long. */
  private writeLimb(i: number, x: number, y: number, rx: number, rz: number, len = 1) {
    this.e.set(rx, 0, rz)
    this.part.compose(this.v.set(x, y, 0), this.q.setFromEuler(this.e), this.s.set(1, len, 1))
    this.m.makeTranslation(0, -0.12, 0).premultiply(this.part).premultiply(this.lift)
    this.limbs.setMatrixAt(i, this.m)
  }
}
