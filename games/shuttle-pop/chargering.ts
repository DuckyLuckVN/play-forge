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
  /** The fill blends low → high from this share up (default 0: across the whole fill). */
  warmFrom?: number
  /** Pops when it empties after showing (ready): flashes `full` and grows as it fades (RING.pop). */
  pop?: boolean
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
 * a dark navy track the full band wide that refills in fresh lime (reads on the teal court and the sand,
 * apart from the charge ring's mint / gold), warms to cream over the last quarter, then pops when ready.
 */
const READY = new Color('#fff1a8')
export const COOLDOWN_LOOK: Readonly<RingLook> = {
  inner: 0.6,
  outer: 0.74,
  low: new Color('#c6f26b'),
  high: READY,
  full: READY,
  pulse: false,
  track: { color: new Color('#181a38'), opacity: 0.5, width: 0.14 },
  warmFrom: 0.75,
  pop: true,
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
  /** Ready pop: length (s) and how much it grows by the end. */
  pop: { dur: 0.3, grow: 0.4 },
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
  /** Shown last frame (a hide after showing = ready: pop). */
  private wasShown = false
  /** When the ready pop started (s); -Infinity = none. */
  private popAt = -Infinity

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
    const L = this.look
    if (charge < 0) {
      if (this.wasShown && L.pop) this.popAt = time
      this.wasShown = false
      this.drawPop(x, z, time, alpha)
      return
    }
    this.wasShown = true
    this.popAt = -Infinity
    this.track.visible = true
    this.root.visible = true
    this.root.position.x = x
    this.root.position.z = z
    const full = charge >= 1
    const n = Math.max(1, Math.round(charge * RING.segments))
    this.fill.geometry.setDrawRange(0, n * PER_SEGMENT)
    if (full) this.fillMat.color.copy(L.full)
    else this.fillMat.color.copy(L.low).lerp(L.high, warmth(charge, L.warmFrom ?? 0))
    const throb = full && L.pulse
    const s = throb ? 1 + RING.pulse * (0.5 + 0.5 * Math.sin(time * RING.pulseHz * Math.PI * 2)) : 1
    this.root.scale.set(s, s, 1)
    this.fillMat.opacity = (full ? 1 : 0.75 + 0.2 * charge) * alpha
    this.trackMat.opacity = this.trackOpacity * alpha
  }

  /** The ready pop (if one is running at `time`): the full ring in `full`, growing as it fades; else hidden. */
  private drawPop(x: number, z: number, time: number, alpha: number) {
    const t = (time - this.popAt) / RING.pop.dur
    if (!(t >= 0 && t < 1)) {
      this.root.visible = false
      return
    }
    this.root.visible = true
    this.track.visible = false
    this.root.position.x = x
    this.root.position.z = z
    this.fill.geometry.setDrawRange(0, Infinity)
    this.fillMat.color.copy(this.look.full)
    const s = 1 + RING.pop.grow * (1 - (1 - t) * (1 - t))
    this.root.scale.set(s, s, 1)
    this.fillMat.opacity = (1 - t) * alpha
  }

  /** Hide now, with no ready pop (the player's view goes away). */
  hide() {
    this.wasShown = false
    this.popAt = -Infinity
    this.root.visible = false
  }

  /** Visible for shader warm-up. */
  set shown(on: boolean) {
    this.root.visible = on
  }
}

/** How far the fill has blended low → high at `charge`: 0 until `from`, then up to 1 at full. */
export function warmth(charge: number, from: number): number {
  if (from <= 0) return charge
  return Math.min(1, Math.max(0, (charge - from) / (1 - from)))
}
