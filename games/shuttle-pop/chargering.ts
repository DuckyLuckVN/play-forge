// Charge ring at a player's feet while the swing button is held: a faint track and an arc that fills
// with the charge (charge.ts), mint → gold, then a hot pulsing glow at full. One ring per player, built
// once; the fill is a draw range over a pre-built ring (no per-frame allocation, no geometry rebuild).
// The same ring, in COOLDOWN_LOOK, shows the jump / lunge cooldown just outside it.
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

/** A ring's radii (m, around the root) and fill colours (low → high, `full` at 1); `pulse` = throb at full. */
export interface RingLook {
  inner: number
  outer: number
  low: Color
  high: Color
  full: Color
  pulse: boolean
}

/** The swing charge ring. */
export const CHARGE_LOOK: Readonly<RingLook> = {
  inner: 0.44,
  outer: 0.56,
  low: new Color('#7ef0c8'),
  high: new Color('#ffd166'),
  full: new Color('#ff7a45'),
  pulse: true,
}

/** The ability cooldown ring: a thin cool-blue band just outside the charge ring (no overlap). */
const COOL = new Color('#8fd3ff')
export const COOLDOWN_LOOK: Readonly<RingLook> = {
  inner: 0.6,
  outer: 0.66,
  low: COOL,
  high: COOL,
  full: COOL,
  pulse: false,
}

/** Track width, segments, height off the court, track opacity, full-charge pulse (Hz, scale). */
const RING = {
  track: 0.035,
  segments: 40,
  y: 0.025,
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
  private trackMat: MeshBasicMaterial

  constructor(private readonly look: Readonly<RingLook> = CHARGE_LOOK) {
    // Starts at the back of the ring (toward the camera for the near player) and fills clockwise.
    const fillGeo = new RingGeometry(look.inner, look.outer, RING.segments, 1, -Math.PI / 2, Math.PI * 2)
    this.fillMat = new MeshBasicMaterial({
      color: look.low,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    this.fill = new Mesh(fillGeo, this.fillMat)
    this.trackMat = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: RING.trackOpacity,
      depthWrite: false,
    })
    this.track = new Mesh(
      new RingGeometry(Math.max(look.inner, look.outer - RING.track), look.outer, RING.segments),
      this.trackMat,
    )
    this.root.add(this.track, this.fill)
    this.root.rotation.x = -Math.PI / 2
    this.root.position.y = RING.y
    this.root.visible = false
  }

  /**
   * Show it filled to `charge` (0..1; < 0 hides it) at (x, z), pulsing at full (when the look pulses).
   * `time` in s; `alpha` scales its opacity (e.g. others' rings fainter).
   */
  update(charge: number, x: number, z: number, time: number, alpha = 1) {
    if (charge < 0) {
      this.root.visible = false
      return
    }
    const L = this.look
    this.root.visible = true
    this.root.position.x = x
    this.root.position.z = z
    const full = charge >= 1
    const n = Math.max(1, Math.round(charge * RING.segments))
    this.fill.geometry.setDrawRange(0, n * PER_SEGMENT)
    if (full) this.fillMat.color.copy(L.full)
    else this.fillMat.color.copy(L.low).lerp(L.high, charge)
    const throb = full && L.pulse
    const s = throb ? 1 + RING.pulse * (0.5 + 0.5 * Math.sin(time * RING.pulseHz * Math.PI * 2)) : 1
    this.root.scale.set(s, s, 1)
    this.fillMat.opacity = (full ? 1 : 0.75 + 0.2 * charge) * alpha
    this.trackMat.opacity = RING.trackOpacity * alpha
  }

  /** Visible for shader warm-up. */
  set shown(on: boolean) {
    this.root.visible = on
  }
}
