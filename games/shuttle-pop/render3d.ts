// Shuttle Pop in 3D: court, net, chibi players (actors.ts), shuttle, landing ring.
// Reads interpolated sim state only; gameplay lives in sim.ts.
//
// Built once per page: `warm()` (menu preload) compiles every shader, each match `attach`es it to the
// stage and gets a cleanup that parks it offscreen again. The render loop allocates nothing.
// The park around the court (sky, lights, crowd) is scenery.ts. Real shadows come from the players
// only and stop (between rallies) once the quality governor sees slow frames.
// Juice: timing pops + badges (hud.ts), Perfect sparkles, a shuttle trail (hot after a smash), a sprung
// camera punch on smashes and the sounds (sounds.ts), all driven by new sim events.

import {
  BackSide,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShadowMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  Vector3,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { startRenderLoop } from '@forge/core/loop'
import type { Smoothed } from '@forge/net/smoothing'
import { playSound } from '@forge/audio/sound'
import { createScene3D, Particles3D, QualityGovernor, type Scene3D } from '@forge/render3d'
import { createChibi, type Chibi, type ChibiPose } from './actors'
import { MOVE_SPEED } from './court'
import { Hud, matchPoint, newEvents, type PopKind } from './hud'
import { t } from './i18n'
import { COURT, predictLanding, type Vec3 } from './physics'
import { SpringPunch } from './punch'
import { Park } from './scenery'
import type { SpEvent, SpState } from './sim'
import { eventSound, SHUTTLE_SOUNDS } from './sounds'
import { ShuttleTrail, type TrailLook } from './trail'
import {
  CAMERA,
  CHEER,
  cameraPose,
  cheerLevel,
  dampFocus,
  isTwinAlt,
  lerpV,
  moodOf,
  rallyHits,
  viewOf,
  type CameraPose,
} from './world'

const PALETTE = {
  /** Light border around the court (the park grass is scenery.ts). */
  surround: '#bcd09a',
  court: '#3f9a86',
  line: '#ffffff',
  net: '#ffffff',
  post: '#6b5b73',
  shuttle: '#ffffff',
  /** Dark rim so the white shuttle reads against the pale sky (same idea as the twin outline). */
  shuttleRim: '#3b2f4a',
  ringMine: '#ffd166',
  ringTheirs: '#ffffff',
}

const LINE_W = 0.05
const POST_OUT = 0.25
const NET_DEPTH = 0.76
const SHUTTLE_R = 0.08
/** Rim shell radius over the shuttle's. */
const SHUTTLE_RIM = 1.35
/** A player jumping further than this between two ticks was placed (new serve): snap, don't glide. */
const PLAYER_SNAP = 1.5
/** Shuttle moves ≤ 0.75 m a tick in flight; more is a reset into the server's hand. */
const SHUTTLE_SNAP = 2
const SWING_TIME = 0.32
/** Smash leap length (s). */
const JUMP_TIME = 0.5
/** Run blend damping (1/s). */
const RUN_DAMP = 10
/** A local swing press already animated; ignore the matching swingAt change for this long. */
const LOCAL_SWING_GRACE = 0.4
/** Chibis are ~1.3 m in model space; drawn a bit larger so they read from the far camera. */
const CHIBI_SCALE = 1.15
/** Court surface and its light border, beyond the lines (m). */
const COURT_RUNOFF = { x: 0.35, z: 0.45 }
const SURROUND = { x: 1.3, z: 1.6 }
/** Quality level (QualityGovernor) from which players stop casting real shadows. */
const SHADOWS_OFF_LEVEL = 1
/** Seconds after attach the shadow governor ignores (first frames hitch: buffers, textures, GC). */
const QUALITY_SETTLE = 2
const SHADOW_OPACITY = 0.26

/** Shuttle trail: TRAIL_DOTS spheres spread along the last TRAIL_SAMPLES positions, one every TRAIL_STEP s. */
const TRAIL_DOTS = 18
const TRAIL_SAMPLES = 7
const TRAIL_STEP = 1 / 60
/** Trail look per shot: colour, opacity, head dot radius (m). Smash = hot and thick. */
const TRAIL: Record<'plain' | 'perfect' | 'smash', TrailLook> = {
  plain: { color: new Color('#e4dcff'), opacity: 0.4, size: 0.06 },
  perfect: { color: new Color('#ffd166'), opacity: 0.7, size: 0.075 },
  smash: { color: new Color('#ff4d6d'), opacity: 0.85, size: 0.1 },
}

/**
 * Camera punch on a smash: a damped spring (stiffness, damping ratio) kicked with a velocity (m/s);
 * the offset dollies the camera toward the net and down a touch. Stepped in fixed sub-steps so it
 * feels the same at any frame rate.
 */
const PUNCH = { k: 380, zeta: 0.42, kickMine: 11, kickTheirs: 6, step: 1 / 240, dip: 0.35 }

/** Timing pops: anchor heights (m) for the near player (at the knees, under the shuttle path) and the far one (over the head). */
const POP_Y = { near: 0.35, far: 2.1 }
/**
 * A second pop for the same player within POP_STACK.time s stacks POP_STACK.px above the first (no
 * overlap); a "Miss" that soon after a hit is just swing-spam and is dropped.
 */
const POP_STACK = { time: 0.6, px: 38 }
/** Perfect sparkles: short, gold, juicy. */
const SPARKLE = {
  count: 22,
  color: ['#ffd166', '#fff3b0', '#ffffff'],
  speed: 3.4,
  life: 0.38,
  size: 0.22,
  gravity: 2,
}
const SMASH_BURST = { count: 14, color: ['#ff4d6d', '#ffb3c1'], speed: 4.2, life: 0.3, size: 0.2 }

interface PlayerView {
  chibi: Chibi
  preset: number
  /** Drawn as the tinted far twin (both sides on the same preset). */
  alt: boolean
  /** Seconds since the last swing started (Infinity = idle). */
  swingAge: number
  /** Last swingAt seen in the state (NaN = none yet). */
  swingAt: number
  /** Seconds since the last smash leap started (Infinity = grounded). */
  jumpAge: number
  /** Reused every frame. */
  pose: ChibiPose
}

function makePlayer(preset: number): PlayerView {
  const chibi = createChibi(preset)
  chibi.root.scale.setScalar(CHIBI_SCALE)
  return {
    chibi,
    preset: -1,
    alt: false,
    swingAge: Infinity,
    swingAt: NaN,
    jumpAge: Infinity,
    pose: { run: 0, swing: 0, jump: 0, mood: 'idle' },
  }
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
  /** Newest event id already turned into a pose (smash leap, point mood). */
  private lastEventId = 0
  /** Side that won the latest point (−1 = none yet). */
  private pointSide = -1
  private localIdx = 0
  private side: 0 | 1 = 0
  private flip: 1 | -1 = 1
  private time = 0
  private localPressAt = -Infinity
  private camX = 0
  /** Damped shuttle height the camera frames. */
  private focus = 1
  private pose: CameraPose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }
  private tmp: Vec3 = { x: 0, y: 0, z: 0 }
  private park: Park
  /** Takes the players' real shadows (the ground is unlit, so it can't). */
  private catcher!: Mesh
  private quality = new QualityGovernor()
  private shadows = true
  private wantShadows = true
  /** Seconds left before the shadow governor starts judging frames. */
  private settle = QUALITY_SETTLE
  /** Crowd: hits in the current rally, length of the last point's rally, when that point was. */
  private rally = 0
  private pointHits = 0
  private pointAt = -Infinity
  private callsLogged = false
  /** New events this frame (reused). */
  private fresh: SpEvent[] = []
  /** No seat is ours: everything is drawn from side 0's view, pops all full size. */
  private spectating = false
  private hud = new Hud()
  /** What the serve / match-point badges were last drawn for (phase '' = redraw). */
  private hudPhase = ''
  private hudServer = -1
  private hudS0 = -1
  private hudS1 = -1
  private fx = new Particles3D(160)
  private trail = new ShuttleTrail(TRAIL_DOTS, TRAIL_SAMPLES, TRAIL_STEP, TRAIL.plain)
  private proj = new Vector3()
  /** When each player's latest pop showed (for stacking). */
  private lastPop: [number, number] = [-Infinity, -Infinity]
  private punch = new SpringPunch(PUNCH.k, PUNCH.zeta, PUNCH.step)

  constructor() {
    this.parking = document.createElement('div')
    // About the stage's size, so warm-up renders allocate near-final buffers, but never seen.
    this.parking.style.cssText =
      'position:fixed;left:-10000px;top:0;width:100vw;height:85vh;pointer-events:none;opacity:0'
    document.body.appendChild(this.parking)
    this.view = createScene3D(this.parking, { fov: CAMERA.fov, far: 120, maxDpr: 2 })
    const { scene, renderer } = this.view
    renderer.shadowMap.enabled = true
    this.park = new Park(scene)

    this.buildCourt()
    // The engine's own governor restarts its window on every resize (buffers realloc); so does ours.
    this.view.onResize(() => this.quality.restart())

    this.players = [makePlayer(0), makePlayer(1)]
    for (const p of this.players) scene.add(p.chibi.root)

    this.shuttle = new Mesh(
      new SphereGeometry(SHUTTLE_R, 14, 10),
      new MeshBasicMaterial({ color: PALETTE.shuttle }),
    )
    const rim = new Mesh(
      new SphereGeometry(SHUTTLE_R * SHUTTLE_RIM, 12, 8),
      new MeshBasicMaterial({ color: PALETTE.shuttleRim, side: BackSide }),
    )
    this.shuttle.add(rim)
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

    scene.add(this.trail.mesh, this.fx.points)
    this.view.onResize((_w, h) => this.fx.setScale(h * this.view.renderer.getPixelRatio()))
    this.view.root.appendChild(this.hud.root)
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
    const outerW = (COURT.halfWidth + SURROUND.x) * 2
    const outerL = (COURT.halfLen + SURROUND.z) * 2
    flat(outerW, outerL, PALETTE.surround, 0.002)
    flat((COURT.halfWidth + COURT_RUNOFF.x) * 2, (COURT.halfLen + COURT_RUNOFF.z) * 2, PALETTE.court, 0.004)
    this.catcher = new Mesh(
      new PlaneGeometry(outerW, outerL),
      new ShadowMaterial({ opacity: SHADOW_OPACITY, depthWrite: false }),
    )
    this.catcher.rotation.x = -Math.PI / 2
    this.catcher.position.y = 0.008
    this.catcher.receiveShadow = true
    scene.add(this.catcher)

    // Lines are centred on the boundary (a shuttle on the line is in). One merged mesh.
    const lines: BufferGeometry[] = []
    const line = (x: number, z: number, w: number, d: number) =>
      lines.push(new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0.006, z))
    const W = COURT.halfWidth * 2 + LINE_W
    const L = COURT.halfLen * 2 + LINE_W
    for (const s of [-1, 1]) {
      line(s * COURT.halfWidth, 0, LINE_W, L) // side lines
      line(0, s * COURT.halfLen, W, LINE_W) // base lines
      line(0, s * COURT.shortLine, W, LINE_W) // short service lines
      const centreLen = COURT.halfLen - COURT.shortLine
      line(0, s * (COURT.shortLine + centreLen / 2), LINE_W, centreLen) // centre lines
    }
    scene.add(new Mesh(mergeGeometries(lines), new MeshBasicMaterial({ color: PALETTE.line })))

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
    this.trail.mesh.visible = true
    // Every hat + the twin outline, so no material compiles mid-match.
    for (const p of this.players) p.chibi.root.traverse((o) => (o.visible = true))
    this.placeCamera(0, 1)
    // Scenery, crowd and the shadow variants of every lit material are all in the scene by now.
    await this.view.renderer.compileAsync(this.view.scene, this.view.camera)
    this.view.render(0)
    this.ring.visible = false
    this.trail.mesh.visible = false
    for (let i = 0; i < 2; i++) this.players[i].chibi.setPreset(i)
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
    this.settle = QUALITY_SETTLE
    this.quality.restart()
    onLocalSwing(() => {
      this.players[this.localIdx].swingAge = 0
      this.localPressAt = this.time
      playSound(SHUTTLE_SOUNDS.swing)
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
    this.lastEventId = 0
    this.pointSide = -1
    this.localPressAt = -Infinity
    this.rally = 0
    this.pointHits = 0
    this.pointAt = -Infinity
    this.ring.visible = false
    this.hud.reset()
    this.hudPhase = ''
    this.trail.reset()
    this.trail.setLook(TRAIL.plain)
    this.punch.reset()
    this.lastPop[0] = this.lastPop[1] = -Infinity
    for (const p of this.players) {
      p.swingAge = Infinity
      p.swingAt = NaN
      p.jumpAge = Infinity
      p.pose.run = 0
    }
  }

  private frame(dt: number) {
    this.time += dt
    const curr = this.smooth?.curr
    if (!curr) return this.view.render(dt)
    if (curr.tick < this.lastTick) this.reset()
    this.lastTick = curr.tick
    // Slow frames: drop the players' real shadows, between rallies so they don't vanish mid-shot.
    // Blob shadows stay either way.
    if (this.settle > 0) this.settle -= dt
    else if (this.quality.sample(dt)) this.wantShadows = this.quality.level < SHADOWS_OFF_LEVEL
    if (this.wantShadows !== this.shadows && curr.phase !== 'rally') this.setShadows(this.wantShadows)
    const prev = this.smooth!.prev ?? curr
    const a = this.smooth!.alpha()

    // The local player's side is drawn near; spectators see side 0's view.
    let side: 0 | 1 = 0
    this.localIdx = 0
    this.spectating = true
    for (let i = 0; i < 2; i++)
      if (curr.players[i].id === this.selfId) {
        side = curr.players[i].side
        this.localIdx = i
        this.spectating = false
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
      const placed = Math.abs(cp.x - pp.x) + Math.abs(cp.z - pp.z) > PLAYER_SNAP
      const t = placed ? 1 : a
      const x = (pp.x + (cp.x - pp.x) * t) * flip
      const z = (pp.z + (cp.z - pp.z) * t) * flip
      const root = view.chibi.root
      root.position.set(x, 0, z)
      // Everyone faces the net.
      root.rotation.y = z < 0 ? 0 : Math.PI
      if (i === this.localIdx) localX = x
      const alt = isTwinAlt(curr.players[0].preset, curr.players[1].preset, i, this.localIdx)
      if (cp.preset !== view.preset || alt !== view.alt) {
        view.preset = cp.preset
        view.alt = alt
        view.chibi.setPreset(cp.preset, alt)
      }
      // Swings seen in the state (the opponent's, or ours if the press wasn't animated already).
      if (cp.swingAt !== view.swingAt) {
        const pressed = i === this.localIdx && this.time - this.localPressAt < LOCAL_SWING_GRACE
        if (!Number.isNaN(view.swingAt) && !pressed) {
          view.swingAge = 0
          playSound(SHUTTLE_SOUNDS.swing, i === this.localIdx ? 1 : 0.5)
        }
        view.swingAt = cp.swingAt
      }
      view.swingAge += dt
      view.jumpAge += dt
      const pose = view.pose
      const speed = Math.min(1, Math.hypot(cp.vx, cp.vz) / MOVE_SPEED)
      pose.run += (speed - pose.run) * (1 - Math.exp(-RUN_DAMP * dt))
      pose.swing = view.swingAge < SWING_TIME ? view.swingAge / SWING_TIME : 0
      pose.jump = view.jumpAge < JUMP_TIME ? Math.sin((Math.PI * view.jumpAge) / JUMP_TIME) : 0
      // Celebrate / slump through the point pause and on the results screen.
      pose.mood = moodOf(curr.phase, curr.winner, this.pointSide, cp.side)
      view.chibi.setPose(pose, this.time)
    }

    // Shuttle (+ its shadow for depth).
    const ps = prev.shuttle.pos
    const cs = curr.shuttle.pos
    const snap = Math.abs(cs.x - ps.x) + Math.abs(cs.y - ps.y) + Math.abs(cs.z - ps.z) > SHUTTLE_SNAP
    const pos = lerpV(ps, cs, snap ? 1 : a, this.tmp)
    this.shuttle.position.set(pos.x * flip, Math.max(SHUTTLE_R, pos.y), pos.z * flip)
    this.shadow.position.x = pos.x * flip
    this.shadow.position.z = pos.z * flip
    // After players + shuttle are placed: pops and bursts anchor on this frame's positions.
    this.scanEvents(curr)
    const flying = curr.phase === 'rally' && curr.shuttle.lastHitter !== -1 && !snap
    const sp = this.shuttle.position
    this.trail.update(flying, sp.x, sp.y, sp.z, dt)
    this.fx.update(dt)
    this.updateHud(curr)

    this.updateRing(curr, flip)
    this.ring.visible = this.ring.visible && curr.phase === 'rally'

    this.park.update(cheerLevel(this.rally, this.time - this.pointAt, this.pointHits), this.time, dt)

    this.placeCamera(localX * CAMERA.followX, pos.y, dt)
    if (import.meta.env.DEV && !this.callsLogged && curr.phase === 'rally') this.logDrawCalls(dt)
    else this.view.render(dt)
  }

  /**
   * Shadows off = the shadow pass stops rendering (no draw calls, no depth fill) and the catcher, its
   * only receiver, hides. The shadow map and light stay configured, so no material's program changes:
   * nothing recompiles, and warm() already compiled the only variant ever used.
   */
  private setShadows(on: boolean) {
    this.shadows = on
    this.view.renderer.shadowMap.autoUpdate = on
    this.catcher.visible = on
  }

  /** Dev only, once: draw calls in one full frame (shadow pass + scene + post passes). */
  private logDrawCalls(dt: number) {
    const info = this.view.renderer.info
    info.autoReset = false
    info.reset()
    this.view.render(dt)
    // eslint-disable-next-line no-console
    console.info(
      `[shuttle-pop] draw calls per frame: ${info.render.calls} (shadows ${this.shadows ? 'on' : 'off'})`,
    )
    info.autoReset = true
    this.callsLogged = true
  }

  /** New events → poses (a smash leaps, a point sets who celebrates), pops, sparkles, punch, sounds. */
  private scanEvents(s: SpState) {
    const fresh = newEvents(s.events, this.lastEventId, this.fresh)
    for (let i = 0; i < fresh.length; i++) {
      const e = fresh[i]
      this.lastEventId = e.id
      if (e.k === 'point') {
        this.pointHits = this.rally
        this.pointAt = this.time
      }
      this.rally = rallyHits(this.rally, e.k)
      const sound = eventSound(e, this.side)
      if (sound) playSound(sound.sound, sound.vol)
      if (e.k === 'point') {
        this.pointSide = e.side
        if (this.pointHits >= CHEER.rally) playSound(SHUTTLE_SOUNDS.cheer)
      } else if (e.k === 'hit') this.onHit(s, e.side, e.grade, e.shot === 'smash')
      else if (e.k === 'serve') this.trail.setLook(TRAIL.plain)
      else if (e.k === 'whiff' && !this.spectating && e.side === this.side)
        this.popAt(this.localIdx, 'miss', false)
    }
  }

  private onHit(s: SpState, side: 0 | 1, grade: PopKind, smash: boolean) {
    const j = s.players[0].side === side ? 0 : 1
    const mine = this.spectating || side === this.side
    this.popAt(j, grade, smash)
    this.trail.setLook(smash ? TRAIL.smash : grade === 'perfect' ? TRAIL.perfect : TRAIL.plain)
    const p = this.shuttle.position
    if (grade === 'perfect') this.fx.burst(p.x, p.y, p.z, SPARKLE)
    if (smash) {
      this.players[j].jumpAge = 0
      this.fx.burst(p.x, p.y, p.z, SMASH_BURST)
      this.punch.kick(mine ? PUNCH.kickMine : PUNCH.kickTheirs)
    }
  }

  /** A timing pop at player j: the near player's at the knees (clear of the shuttle), the far one's overhead. */
  private popAt(j: number, kind: PopKind, smash: boolean) {
    const recent = this.time - this.lastPop[j] < POP_STACK.time
    if (recent && kind === 'miss') return
    this.lastPop[j] = this.time
    const root = this.players[j].chibi.root
    const near = root.position.z < 0
    this.proj.set(root.position.x, near ? POP_Y.near : POP_Y.far, root.position.z).project(this.view.camera)
    const w = this.view.width
    const h = this.view.height
    const mine = this.spectating || j === this.localIdx
    const y = ((1 - this.proj.y) / 2) * h - (recent ? POP_STACK.px : 0)
    this.hud.pop(kind, ((this.proj.x + 1) / 2) * w, y, w, h, mine, smash)
  }

  /** Serve badge + match-point badge, touched only when phase / server / score change. */
  private updateHud(s: SpState) {
    if (
      s.phase === this.hudPhase &&
      s.server === this.hudServer &&
      s.score[0] === this.hudS0 &&
      s.score[1] === this.hudS1
    )
      return
    this.hudPhase = s.phase
    this.hudServer = s.server
    this.hudS0 = s.score[0]
    this.hudS1 = s.score[1]
    const live = s.phase === 'serve' || s.phase === 'rally'
    if (s.phase !== 'serve') this.hud.setServe(null)
    else if (!this.spectating && s.server === this.side) this.hud.setServe(t('Your serve'))
    else {
      const server = s.players[0].side === s.server ? s.players[0] : s.players[1]
      this.hud.setServe(t('{name} serves', { name: server.name }))
    }
    const mine = live && matchPoint(s.score, this.side)
    const theirs = live && matchPoint(s.score, this.side === 0 ? 1 : 0)
    this.hud.setMatchPoint(mine && theirs ? 'both' : mine ? 'mine' : theirs ? 'theirs' : null)
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

  /** Damped: x slides with the local player, the look-at rises with the shuttle (see world.ts). */
  private placeCamera(targetX: number, shuttleY: number, dt = 1) {
    this.camX += (targetX - this.camX) * (1 - Math.exp(-6 * dt))
    this.focus = dampFocus(this.focus, shuttleY, dt)
    const p = cameraPose(this.camX, this.focus, this.pose)
    const cam = this.view.camera
    cam.position.set(p.x, p.y, p.z)
    cam.lookAt(p.lookX, p.lookY, p.lookZ)
    // Smash punch: a post offset on top of the framed pose (cameraPose itself is untouched).
    const punch = this.punch.update(dt)
    cam.position.z += punch
    cam.position.y -= punch * PUNCH.dip
  }
}
