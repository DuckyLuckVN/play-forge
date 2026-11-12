// Charge ring at a player's feet while the swing button is held: a faint track and an arc that fills
// with the charge (charge.ts), mint → gold, then a hot pulsing glow at full. One ring per player, built
// once; the fill is a draw range over a pre-built ring (no per-frame allocation, no geometry rebuild).
// The same ring, in COOLDOWN_LOOK, shows the jump / dive cooldown just outside it: it refills as the
// cooldown runs out (`cooldownFill`), like the Jump / Dive buttons' rings.
import { Color, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'

/** The ring's track (the unfilled band): colour, opacity, width (m, from the outer edge). */
export interface RingTrack {
  color: Color
  opacity: number
  width: number
}

/**
 * A ring's radii (m, around the root) and fill colours (low → high, `full` at 1); `pulse` = throb at full;
 * `track` = the unfilled band (default: a thin faint white line at the outer edge).
 */
export interface RingLook {
  inner: number
  outer: number
  low: Color
  high: Color
  full: Color
  pulse: boolean
  track?: Readonly<RingTrack>
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

/**
 * The ability cooldown ring, just outside the charge ring (no overlap), styled like the Jump / Dive buttons:
 * a dark navy track the full band wide that refills in bright white (white and navy both read on the teal
 * court and the sand, where a teal ring would vanish).
 */
const COOL = new Color('#ffffff')
export const COOLDOWN_LOOK: Readonly<RingLook> = {
  inner: 0.6,
  outer: 0.74,
  low: COOL,
  high: COOL,
  full: COOL,
  pulse: false,
  track: { color: new Color('#181a38'), opacity: 0.5, width: 0.14 },
}

/**
 * How full the cooldown ring is for `share` (0..1) of the cooldown left: it refills as the cooldown runs out
 * (1 - share); -1 (hidden) once ready.
 */
export function cooldownFill(share: number): number {
  return share > 0 ? 1 - share : -1
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

/** The default track: a thin faint white line at the outer edge. */
const DEFAULT_TRACK: Readonly<RingTrack> = {
  color: new Color('#ffffff'),
  opacity: RING.trackOpacity,
  width: RING.track,
}

/** Indices per ring segment (two triangles). */
const PER_SEGMENT = 6

export class ChargeRing {
  readonly root = new Group()
  private fill: Mesh
  private fillMat: MeshBasicMaterial
  private track: Mesh
  private trackMat: MeshBasicMaterial
  private trackOpacity: number

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
    const track = look.track ?? DEFAULT_TRACK
    this.trackOpacity = track.opacity
    this.trackMat = new MeshBasicMaterial({
      color: track.color,
      transparent: true,
      opacity: track.opacity,
      depthWrite: false,
    })
    this.track = new Mesh(
      new RingGeometry(Math.max(look.inner, look.outer - track.width), look.outer, RING.segments),
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
    this.trackMat.opacity = this.trackOpacity * alpha
  }

  /** Visible for shader warm-up. */
  set shown(on: boolean) {
    this.root.visible = on
  }
}
