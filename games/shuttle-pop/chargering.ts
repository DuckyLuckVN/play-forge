// Charge ring at a player's feet while the swing button is held: a faint track and an arc that fills
// with the charge (charge.ts), mint → gold, then a hot pulsing glow at full. One ring per player, built
// once; the fill is a draw range over a pre-built ring (no per-frame allocation, no geometry rebuild).
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

/** Radii (m, around the root), segments, height off the court, colours, full-charge pulse (Hz, scale). */
const RING = {
  inner: 0.44,
  outer: 0.56,
  track: 0.035,
  segments: 40,
  y: 0.025,
  low: new Color('#7ef0c8'),
  high: new Color('#ffd166'),
  full: new Color('#ff7a45'),
  trackOpacity: 0.28,
  pulseHz: 7,
  pulse: 0.08,
} as const

/** Indices per ring segment (two triangles). */
const PER_SEGMENT = 6

export class ChargeRing {
  readonly root = new Group()
  private fill: Mesh
  private fillMat: MeshBasicMaterial
  private track: Mesh

  constructor() {
    // Starts at the back of the ring (toward the camera for the near player) and fills clockwise.
    const fillGeo = new RingGeometry(RING.inner, RING.outer, RING.segments, 1, -Math.PI / 2, Math.PI * 2)
    this.fillMat = new MeshBasicMaterial({
      color: RING.low,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    this.fill = new Mesh(fillGeo, this.fillMat)
    this.track = new Mesh(
      new RingGeometry(RING.outer - RING.track, RING.outer, RING.segments),
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: RING.trackOpacity,
        depthWrite: false,
      }),
    )
    this.root.add(this.track, this.fill)
    this.root.rotation.x = -Math.PI / 2
    this.root.position.y = RING.y
    this.root.visible = false
  }

  /** Show it filled to `charge` (0..1; < 0 hides it) at (x, z), pulsing at full. `time` in s. */
  update(charge: number, x: number, z: number, time: number) {
    if (charge < 0) {
      this.root.visible = false
      return
    }
    this.root.visible = true
    this.root.position.x = x
    this.root.position.z = z
    const full = charge >= 1
    const n = Math.max(1, Math.round(charge * RING.segments))
    this.fill.geometry.setDrawRange(0, n * PER_SEGMENT)
    if (full) this.fillMat.color.copy(RING.full)
    else this.fillMat.color.copy(RING.low).lerp(RING.high, charge)
    const s = full ? 1 + RING.pulse * (0.5 + 0.5 * Math.sin(time * RING.pulseHz * Math.PI * 2)) : 1
    this.root.scale.set(s, s, 1)
    this.fillMat.opacity = full ? 1 : 0.75 + 0.2 * charge
  }

  /** Visible for shader warm-up. */
  set shown(on: boolean) {
    this.root.visible = on
  }
}
