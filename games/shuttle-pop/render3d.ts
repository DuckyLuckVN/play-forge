// Shuttle Pop in 3D (primitive slice): court, net, capsule players with a racket, shuttle, landing
// ring. Reads interpolated sim state only; gameplay lives in sim.ts.
//
// Built once per page: `warm()` (menu preload) compiles every shader, each match `attach`es it to the
// stage and gets a cleanup that parks it offscreen again. The render loop allocates nothing.

import {
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
} from 'three'
import { startRenderLoop } from '@forge/core/loop'
import type { Smoothed } from '@forge/net/smoothing'
import { createScene3D, type Scene3D } from '@forge/render3d'
import { COURT, predictLanding, type Vec3 } from './physics'
import type { SpState } from './sim'
import { CAMERA, lerpV, viewOf } from './world'

const PALETTE = {
  sky: '#bfe6ff',
  grass: '#a7dca0',
  court: '#5fb87c',
  line: '#ffffff',
  net: '#ffffff',
  post: '#6b5b73',
  shuttle: '#ffffff',
  ringMine: '#ffd166',
  ringTheirs: '#ffffff',
  skin: '#ffe0c7',
  racket: '#ff6f91',
}
/** Shirt colours by character preset (sim PRESETS = 4). */
const PRESET_COLORS = ['#ff8fab', '#7cc6fe', '#ffd166', '#9be7a8']

const LINE_W = 0.05
const POST_OUT = 0.25
const NET_DEPTH = 0.76
const SHUTTLE_R = 0.08
/** A player jumping further than this between two ticks was placed (new serve): snap, don't glide. */
const PLAYER_SNAP = 1.5
/** Shuttle moves ≤ 0.75 m a tick in flight; more is a reset into the server's hand. */
const SHUTTLE_SNAP = 2
const SWING_TIME = 0.28
const RACKET_IDLE = -0.7
const RACKET_FWD = 1.6
/** A local swing press already animated; ignore the matching swingAt change for this long. */
const LOCAL_SWING_GRACE = 0.4

interface PlayerView {
  group: Group
  shirt: MeshStandardMaterial
  racket: Group
  preset: number
  /** Seconds since the last swing started (Infinity = idle). */
  swingAge: number
  /** Last swingAt seen in the state (NaN = none yet). */
  swingAt: number
}

function makePlayer(skin: MeshStandardMaterial, racketMat: MeshStandardMaterial): PlayerView {
  const group = new Group()
  const shirt = new MeshStandardMaterial({ color: PRESET_COLORS[0], roughness: 0.7 })
  const body = new Mesh(new CapsuleGeometry(0.28, 0.5, 6, 12), shirt)
  body.position.y = 0.55
  // Big chibi head.
  const head = new Mesh(new SphereGeometry(0.3, 20, 14), skin)
  head.position.y = 1.32
  // Racket: pivot at the right shoulder (the player faces +z, so right is −x), sweeping about y.
  const racket = new Group()
  racket.position.set(-0.3, 1.0, 0)
  const handle = new Mesh(new CylinderGeometry(0.025, 0.025, 0.32, 8), racketMat)
  handle.rotation.z = Math.PI / 2
  handle.position.x = -0.16
  const frame = new Mesh(new TorusGeometry(0.17, 0.025, 8, 20), racketMat)
  frame.position.x = -0.5
  racket.add(handle, frame)
  racket.rotation.y = RACKET_IDLE
  group.add(body, head, racket)
  return { group, shirt, racket, preset: -1, swingAge: Infinity, swingAt: NaN }
}

export class Court3D {
  private view: Scene3D
  /** Offscreen home while no match is showing (keeps the GL context alive). */
  private parking: HTMLElement
  private smooth: Smoothed<SpState> | null = null
  private selfId = ''
  private players: [PlayerView, PlayerView]
  private shuttle: Mesh
  private shadow: Mesh
  private ring: Mesh
  private ringMat: MeshBasicMaterial
  private ringColor = { mine: new Color(PALETTE.ringMine), theirs: new Color(PALETTE.ringTheirs) }
  /** Newest hit/serve event id already turned into a landing ring. */
  private lastShotId = 0
  private lastHitter = -2
  private lastTick = -1
  private localIdx = 0
  private side: 0 | 1 = 0
  private flip: 1 | -1 = 1
  private time = 0
  private localPressAt = -Infinity
  private camX = 0
  private tmp: Vec3 = { x: 0, y: 0, z: 0 }

  constructor() {
    this.parking = document.createElement('div')
    // About the stage's size, so warm-up renders allocate near-final buffers, but never seen.
    this.parking.style.cssText =
      'position:fixed;left:-10000px;top:0;width:100vw;height:85vh;pointer-events:none;opacity:0'
    document.body.appendChild(this.parking)
    this.view = createScene3D(this.parking, { fov: CAMERA.fov, far: 120, maxDpr: 2 })
    const { scene } = this.view
    scene.background = new Color(PALETTE.sky)

    const sun = new DirectionalLight('#ffffff', 1.8)
    sun.position.set(4, 10, -6)
    scene.add(new HemisphereLight('#ffffff', '#7fae7a', 1.2), sun)

    this.buildCourt()

    const skin = new MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.8 })
    const racketMat = new MeshStandardMaterial({ color: PALETTE.racket, roughness: 0.5 })
    this.players = [makePlayer(skin, racketMat), makePlayer(skin, racketMat)]
    for (const p of this.players) scene.add(p.group)

    this.shuttle = new Mesh(
      new SphereGeometry(SHUTTLE_R, 14, 10),
      new MeshBasicMaterial({ color: PALETTE.shuttle }),
    )
    this.shadow = new Mesh(
      new CircleGeometry(0.12, 16),
      new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = 0.012
    // Always transparent: flipping `transparent` later would recompile the shader mid-rally.
    this.ringMat = new MeshBasicMaterial({ color: PALETTE.ringMine, transparent: true, opacity: 0.9 })
    this.ring = new Mesh(new TorusGeometry(0.32, 0.035, 8, 32), this.ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.03
    scene.add(this.shuttle, this.shadow, this.ring)
  }

  /** The element under the view (for pointer input). */
  get surface(): HTMLElement {
    return this.view.root
  }

  private buildCourt() {
    const { scene } = this.view
    const flat = (w: number, d: number, color: string, y: number) => {
      const m = new Mesh(new PlaneGeometry(w, d), new MeshBasicMaterial({ color }))
      m.rotation.x = -Math.PI / 2
      m.position.y = y
      scene.add(m)
      return m
    }
    flat(60, 60, PALETTE.grass, 0)
    flat(COURT.halfWidth * 2 + 1.2, COURT.halfLen * 2 + 1.6, PALETTE.court, 0.002)

    // Lines are centred on the boundary (a shuttle on the line is in).
    const lineMat = new MeshBasicMaterial({ color: PALETTE.line })
    const line = (x: number, z: number, w: number, d: number) => {
      const m = new Mesh(new PlaneGeometry(w, d), lineMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.006, z)
      scene.add(m)
    }
    const W = COURT.halfWidth * 2 + LINE_W
    const L = COURT.halfLen * 2 + LINE_W
    for (const s of [-1, 1]) {
      line(s * COURT.halfWidth, 0, LINE_W, L) // side lines
      line(0, s * COURT.halfLen, W, LINE_W) // base lines
      line(0, s * COURT.shortLine, W, LINE_W) // short service lines
      const centreLen = COURT.halfLen - COURT.shortLine
      line(0, s * (COURT.shortLine + centreLen / 2), LINE_W, centreLen) // centre lines
    }

    // Net: two posts, a see-through mesh and a white tape at net height.
    const span = COURT.halfWidth + POST_OUT
    const postMat = new MeshStandardMaterial({ color: PALETTE.post, roughness: 0.6 })
    for (const s of [-1, 1]) {
      const post = new Mesh(new CylinderGeometry(0.04, 0.04, COURT.netH, 10), postMat)
      post.position.set(s * span, COURT.netH / 2, 0)
      scene.add(post)
    }
    const net = new Mesh(
      new PlaneGeometry(span * 2, NET_DEPTH),
      new MeshBasicMaterial({
        color: PALETTE.net,
        transparent: true,
        opacity: 0.35,
        side: DoubleSide,
        depthWrite: false,
      }),
    )
    net.position.y = COURT.netH - NET_DEPTH / 2
    const tape = new Mesh(
      new BoxGeometry(span * 2, 0.05, 0.02),
      new MeshBasicMaterial({ color: PALETTE.net }),
    )
    tape.position.y = COURT.netH
    scene.add(net, tape)
  }

  /** Compile every shader up front, so the first match starts without a hitch. */
  async warm(): Promise<void> {
    this.ring.visible = true
    this.placeCamera(0)
    await this.view.renderer.compileAsync(this.view.scene, this.view.camera)
    this.view.render(0)
    this.ring.visible = false
  }

  /**
   * Show the match on `stage`. `onLocalSwing` registers a callback main calls the moment the local
   * player swings (the racket moves the same frame, before the state comes back). Returns the cleanup.
   */
  attach(
    stage: HTMLElement,
    smooth: Smoothed<SpState>,
    selfId: string,
    onLocalSwing: (cb: () => void) => void,
  ): () => void {
    this.smooth = smooth
    this.selfId = selfId
    this.reset()
    stage.appendChild(this.view.root)
    onLocalSwing(() => {
      this.players[this.localIdx].swingAge = 0
      this.localPressAt = this.time
    })
    const stop = startRenderLoop((dt) => this.frame(dt))
    return () => {
      stop()
      this.smooth = null
      this.parking.appendChild(this.view.root)
    }
  }

  /** Forget the last match (a rematch restarts ticks and event ids). */
  private reset() {
    this.lastShotId = 0
    this.lastHitter = -2
    this.lastTick = -1
    this.localPressAt = -Infinity
    this.ring.visible = false
    for (const p of this.players) {
      p.swingAge = Infinity
      p.swingAt = NaN
    }
  }

  private frame(dt: number) {
    this.time += dt
    const curr = this.smooth?.curr
    if (!curr) return this.view.render(dt)
    if (curr.tick < this.lastTick) this.reset()
    this.lastTick = curr.tick
    const prev = this.smooth!.prev ?? curr
    const a = this.smooth!.alpha()

    // The local player's side is drawn near; spectators see side 0's view.
    let side: 0 | 1 = 0
    this.localIdx = 0
    for (let i = 0; i < 2; i++)
      if (curr.players[i].id === this.selfId) {
        side = curr.players[i].side
        this.localIdx = i
      }
    // viewOf allocates: only when the side changes.
    if (side !== this.side) {
      this.side = side
      this.flip = viewOf(side).flip
    }
    const flip = this.flip

    let localX = 0
    for (let i = 0; i < 2; i++) {
      const cp = curr.players[i]
      const pp = prev.players[i]
      const view = this.players[i]
      const jump = Math.abs(cp.x - pp.x) + Math.abs(cp.z - pp.z) > PLAYER_SNAP
      const t = jump ? 1 : a
      const x = (pp.x + (cp.x - pp.x) * t) * flip
      const z = (pp.z + (cp.z - pp.z) * t) * flip
      view.group.position.set(x, 0, z)
      // Everyone faces the net.
      view.group.rotation.y = z < 0 ? 0 : Math.PI
      if (i === this.localIdx) localX = x
      if (cp.preset !== view.preset) {
        view.preset = cp.preset
        view.shirt.color.set(PRESET_COLORS[cp.preset % PRESET_COLORS.length])
      }
      // Swings seen in the state (the opponent's, or ours if the press wasn't animated already).
      if (cp.swingAt !== view.swingAt) {
        const pressed = i === this.localIdx && this.time - this.localPressAt < LOCAL_SWING_GRACE
        if (!Number.isNaN(view.swingAt) && !pressed) view.swingAge = 0
        view.swingAt = cp.swingAt
      }
      view.swingAge += dt
      const k = view.swingAge < SWING_TIME ? Math.sin((Math.PI * view.swingAge) / SWING_TIME) : 0
      view.racket.rotation.y = RACKET_IDLE + (RACKET_FWD - RACKET_IDLE) * k
    }

    // Shuttle (+ its shadow for depth).
    const ps = prev.shuttle.pos
    const cs = curr.shuttle.pos
    const snap = Math.abs(cs.x - ps.x) + Math.abs(cs.y - ps.y) + Math.abs(cs.z - ps.z) > SHUTTLE_SNAP
    const pos = lerpV(ps, cs, snap ? 1 : a, this.tmp)
    this.shuttle.position.set(pos.x * flip, Math.max(SHUTTLE_R, pos.y), pos.z * flip)
    this.shadow.position.x = pos.x * flip
    this.shadow.position.z = pos.z * flip

    this.updateRing(curr, flip)
    this.ring.visible = this.ring.visible && curr.phase === 'rally'

    this.placeCamera(localX * CAMERA.followX, dt)
    this.view.render(dt)
  }

  /** Landing ring: predicted once per new shot (a new hit/serve event or a new hitter), not per frame. */
  private updateRing(s: SpState, flip: 1 | -1) {
    let newest = this.lastShotId
    for (let i = 0; i < s.events.length; i++) {
      const e = s.events[i]
      if ((e.k === 'hit' || e.k === 'serve') && e.id > newest) newest = e.id
    }
    const hitter = s.shuttle.lastHitter
    if (newest === this.lastShotId && hitter === this.lastHitter) return
    this.lastShotId = newest
    this.lastHitter = hitter
    if (s.phase !== 'rally' || hitter === -1) {
      this.ring.visible = false
      return
    }
    const land = predictLanding(s.shuttle)
    const x = land.pos.x * flip
    const z = land.pos.z * flip
    this.ring.position.x = x
    this.ring.position.z = z
    this.ring.visible = !land.netHit
    // Coming to my half: bright yellow; going away: faint white.
    const mine = z < 0
    this.ringMat.color.copy(mine ? this.ringColor.mine : this.ringColor.theirs)
    this.ringMat.opacity = mine ? 0.95 : 0.45
  }

  private placeCamera(targetX: number, dt = 1) {
    this.camX += (targetX - this.camX) * (1 - Math.exp(-6 * dt))
    const cam = this.view.camera
    cam.position.set(this.camX, CAMERA.height, -(COURT.halfLen + CAMERA.back))
    cam.lookAt(this.camX * 0.5, 0, CAMERA.lookZ)
  }
}
