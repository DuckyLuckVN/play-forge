// Stun stars: three small unlit five-point stars orbiting a stunned player's head (render only).
// One geometry shared by every set, one material per set (its opacity is that player's fade); update() allocates nothing.
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from 'three'

const COUNT = 3
/** Star outer radius (m), inner / outer ratio, ring radius (m), bob amplitude (m) and rate (rad per spin rad). */
const STAR = 0.09
const INNER = 0.42
const RING = 0.28
const BOB = 0.03
const BOB_RATE = 2

function starGeometry(): ShapeGeometry {
  const sh = new Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? STAR : STAR * INNER
    const a = Math.PI / 2 + (i * Math.PI) / 5
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  sh.closePath()
  return new ShapeGeometry(sh)
}

const GEO = starGeometry()

export class StunStars {
  readonly group = new Group()
  private mat = new MeshBasicMaterial({
    color: '#ffd84a',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })

  constructor() {
    for (let i = 0; i < COUNT; i++) {
      const m = new Mesh(GEO, this.mat)
      m.renderOrder = 6
      this.group.add(m)
    }
    this.group.visible = false
  }

  /** `spin` rad (ring turn), centre (x, y, z) above the head, `opacity` = the owner's current fade. */
  update(look: { on: boolean; spin: number }, x: number, y: number, z: number, opacity: number): void {
    const show = look.on && opacity > 0.01
    this.group.visible = show
    if (!show) return
    this.mat.opacity = opacity
    for (let i = 0; i < COUNT; i++) {
      const a = look.spin + (i * Math.PI * 2) / COUNT
      this.group.children[i].position.set(
        x + Math.cos(a) * RING,
        y + Math.sin(look.spin * BOB_RATE + i * 2.1) * BOB,
        z + Math.sin(a) * RING,
      )
    }
  }

  /** Frees this set's material; the shared geometry lives for the page. */
  dispose(): void {
    this.mat.dispose()
  }
}
