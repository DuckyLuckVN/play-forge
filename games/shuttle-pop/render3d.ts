// Shuttle Pop in 3D: court, net, chibi players (actors.ts), shuttle, landing ring.
// Reads interpolated sim state only; gameplay lives in sim.ts.
//
// Built once per page: `warm()` (menu preload) compiles every shader, each match `attach`es it to the
// stage and gets a cleanup that parks it offscreen again. The render loop allocates nothing.
// The park around the court (sky, lights, crowd) is scenery.ts. Real shadows come from the players
// only and stop (between rallies) once the quality governor sees slow frames.
// Juice: timing pops + badges (hud.ts), Perfect sparkles, a shuttle trail (hot after a smash), a sprung
// camera punch on smashes and the sounds (sounds.ts), all driven by new sim events. Hold-to-charge: a
// charge ring at the feet (chargering.ts) with rising sounds, the racket held loaded until the release,
// and punch / burst / trail / streak scaled by the charge (a full-charge Perfect is the biggest).
// Motion: one Gait per player (locomotion.ts) fed by the interpolated sim velocity, so the remote / bot
// player animates exactly like the local one; swing / leap curves are moves.ts; dust puffs are dust.ts.
// Online guests: the own chibi comes from GuestPredictor (predict.ts: moves the frame the input does,
// gait fed by the predicted velocity); the shuttle and the opponent stay pure interpolation.

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
import { createChibi, PRESETS, restPose, setToyShading, type Chibi, type ChibiPose } from './actors'
import { chargeOf, chargeStage, CHARGE, isFull } from './charge'
import { ChargeRing } from './chargering'
import { TICK_RATE } from './court'
import { DustPuffs } from './dust'
import { canSplit, Footwork, lungeWanted, splitHop, splitsOn } from './footwork'
import { Hud, matchPoint, newEvents, newestShotId, trackerAction, type PopKind } from './hud'
import { t } from './i18n'
import { damp, Gait, GaitEvent } from './locomotion'
import {
  leapAtHit,
  leapStartAge,
  lookAround,
  pendingDue,
  SMASH,
  smashJump,
  SwingDriver,
  type Hop,
} from './moves'
import { COURT, predictLanding, type Vec3 } from './physics'
import type { GuestPredictor } from './predict'
import { SpringPunch } from './punch'
import { SURROUND } from './props'
import { Park } from './scenery'
import { shownName, TAPPED, type SpEvent, type SpState } from './sim'
import { chargeSound, eventSound, SHUTTLE_SOUNDS, swingSound } from './sounds'
import { ShuttleTrail, type TrailLook } from './trail'
import {
  CAMERA,
  CHEER,
  cameraPose,
  cheerLevel,
  dampFocus,
  framingTightness,
  isTwinAlt,
  lerpV,
  moodOf,
  rallyHits,
  viewOf,
  type CameraPose,
} from './world'

const PALETTE = {
  /** Warm clay border around the court (the park grass is scenery.ts). */
  surround: '#c9a487',
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
/**
 * Motion feel. Weight damping rates (1/s) for the ready stance, the smash crouch and moods; squash and
 * lean springs (stiffness, damping ratio, sub-step) and their kicks (velocity): + squash / − stretch,
 * + lean forward. Kicks are small on purpose: a lively bounce, not a wobble.
 */
const MOTION = {
  readyRate: 6,
  crouchRate: 18,
  /** Plain swing ↔ overhead smash blend (fast: it settles during the ~50 ms wind-up). */
  smashRate: 30,
  moodRate: 8,
  squash: { k: 260, zeta: 0.35 },
  lean: { k: 160, zeta: 0.3 },
  step: 1 / 240,
  kickStart: 1.4,
  kickTurn: 1.1,
  kickPerfect: -2.2,
  kickStop: 1.8,
}
/**
 * Dust puffs: pool size, colour / opacity, and per kind the puff size (m), life (s) and how fast it is
 * thrown (share of the run velocity, or m/s for the landing ring). Footsteps only above `stepFrom`.
 */
const DUST = {
  capacity: 14,
  color: '#f4ecd6',
  opacity: 0.6,
  stepFrom: 0.5,
  step: { size: 0.16, life: 0.32, throw: -0.12 },
  burst: { size: 0.26, life: 0.42, throw: -0.35 },
  land: { size: 0.3, life: 0.45, speed: 1.6, count: 4 },
  /** Foot offset from the root (m, before CHIBI_SCALE). */
  foot: 0.1,
}
/** A local swing press already animated; ignore the matching swingAt change for this long. */
const LOCAL_SWING_GRACE = 0.4
/** A swing pressed this soon after its hit event (same frame, any order) still catches up to it (s). */
const HIT_GRACE = 0.25
/** What the local player's swing button just did (main.ts → attach's callback). */
export type LocalSwing = 'charge' | 'swing' | 'cancel'
/** Chibis are ~1.3 m in model space; drawn a bit larger so they read from the far camera. */
const CHIBI_SCALE = 1.15
/** Court surface beyond the lines (m); the warm border (SURROUND) is props.ts. */
const COURT_RUNOFF = { x: 0.35, z: 0.45 }
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
const TRAIL: Record<'plain' | 'perfect' | 'smash' | 'power', TrailLook> = {
  plain: { color: new Color('#e4dcff'), opacity: 0.4, size: 0.06 },
  perfect: { color: new Color('#ffd166'), opacity: 0.7, size: 0.075 },
  smash: { color: new Color('#ff4d6d'), opacity: 0.85, size: 0.1 },
  /** A full-charge hit: hot orange and thickest. */
  power: { color: new Color('#ff7a45'), opacity: 0.95, size: 0.12 },
}

/**
 * Camera punch on a smash: a damped spring (stiffness, damping ratio) kicked with a velocity (m/s);
 * the offset dollies the camera toward the net and down a touch. Stepped in fixed sub-steps so it
 * feels the same at any frame rate.
 */
const PUNCH = { k: 380, zeta: 0.42, kickMine: 11, kickTheirs: 6, step: 1 / 240, dip: 0.35 }
/**
 * Charge juice: the punch grows by up to `punch` share with the charge (a full-charge Perfect smash by
 * `powerSmash`×), a charged hit also punches (`hitKick` × charge, mine; half for theirs), the phone buzzes
 * (ms) on our full-charge hit.
 */
const POWER_FX = { punch: 0.5, powerSmash: 1.6, hitKick: 5, buzz: 35 }

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
/** Full-charge Perfect smash: a bigger, hotter burst on top. */
const POWER_BURST = {
  count: 26,
  color: ['#ff7a45', '#ffd166', '#ffffff'],
  speed: 5.6,
  life: 0.42,
  size: 0.26,
}
/** Charge reaching full: a small gold flash at the chest (m above the root). */
const FULL_SPARK = { count: 12, color: ['#ffd166', '#fff3b0'], speed: 2.2, life: 0.3, size: 0.16, gravity: 1 }
const FULL_SPARK_Y = 0.9

interface PlayerView {
  chibi: Chibi
  preset: number
  /** Drawn as the tinted far twin (both sides on the same preset). */
  alt: boolean
  /** Racket swing timeline (wind-up / hold / strike). */
  swing: SwingDriver
  /** Last swingAt seen in the state (NaN = none yet). */
  swingAt: number
  /** Seconds since the last smash leap started (Infinity = grounded, < 0 = scheduled, crouching). */
  jumpAge: number
  /** Contact tick of the pending smash the leap was scheduled for (NaN = none). */
  leapTick: number
  /** Run cycle, facing, lean, foot plants. */
  gait: Gait
  /** Badminton footwork: lunge + its turn, split step. */
  foot: Footwork
  /** True until the first frame after a reset (stand facing the net, no turn-in). */
  fresh: boolean
  squash: SpringPunch
  lean: SpringPunch
  /** Idle glance offset, so the two players don't look around in sync. */
  seed: number
  /** Reused every frame. */
  pose: ChibiPose
  /** Charge shown now (0..1; −1 = not charging) and the charge sound stage reached. */
  charge: number
  stage: number
  /** When this player's latest hit event was seen (s; see HIT_GRACE). */
  hitAt: number
  /** chargeAt in the last state seen (a change to TAPPED = the press swung as a tap). */
  chargeAt: number
  ring: ChargeRing
}

function makePlayer(preset: number): PlayerView {
  const chibi = createChibi(preset)
  chibi.root.scale.setScalar(CHIBI_SCALE)
  return {
    chibi,
    preset: -1,
    alt: false,
    swing: new SwingDriver(),
    swingAt: NaN,
    jumpAge: Infinity,
    leapTick: NaN,
    gait: new Gait(),
    foot: new Footwork(),
    fresh: true,
    squash: new SpringPunch(MOTION.squash.k, MOTION.squash.zeta, MOTION.step),
    lean: new SpringPunch(MOTION.lean.k, MOTION.lean.zeta, MOTION.step),
    seed: preset * 2.7,
    pose: restPose(),
    charge: -1,
    stage: 0,
    hitAt: -Infinity,
    chargeAt: -1,
    ring: new ChargeRing(),
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
  /** False until the first state after attach seeds the trackers (no replay of old events). */
  private seeded = false
  /** Side that won the latest point (−1 = none yet). */
  private pointSide = -1
  private localIdx = 0
  private side: 0 | 1 = 0
  private flip: 1 | -1 = 1
  private time = 0
  private localPressAt = -Infinity
  /** When the local swing button went down (s); −1 = not charging. */
  private localChargeAt = -1
  private camX = 0
  /** Damped shuttle height the camera frames. */
  private focus = 1
  private pose: CameraPose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0, fov: CAMERA.fov }
  /** Framing for the canvas shape (world.ts framingTightness): tight on phone landscape. */
  private tight = 0
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
  /** Online guest only: our own player's prediction (null = draw it from the interpolated state). */
  private predictor: GuestPredictor | null = null
  /** Whether our inputs reach the sim now (no prediction while they'd be dropped). */
  private live: () => boolean = () => false
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
  private dust = new DustPuffs(DUST.capacity, DUST.color, DUST.opacity)
  /** Smash leap sample (reused). */
  private leap: Hop = { height: 0, squash: 0 }
  /** Split-step sample (reused). */
  private splitO: Hop = { height: 0, squash: 0 }

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
    this.view.onResize((w, h) => {
      this.quality.restart()
      // Snaps on purpose: a resize/rotate already redraws everything at a new size, so easing the
      // framing would only add a second, slower jump.
      this.tight = framingTightness(w, h)
    })

    this.players = [makePlayer(0), makePlayer(1)]
    for (const p of this.players) scene.add(p.chibi.root, p.ring.root)

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

    scene.add(this.trail.mesh, this.fx.points, this.dust.mesh)
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
    this.dust.mesh.visible = true
    // The twin outline + kit materials (both shades), so no material compiles mid-match.
    this.players[1].chibi.setPreset(1, true)
    for (const p of this.players) {
      p.chibi.root.traverse((o) => (o.visible = true))
      p.ring.shown = true
    }
    this.placeCamera(0, 1)
    // Scenery, crowd and the shadow variants of every lit material are all in the scene by now.
    await this.view.renderer.compileAsync(this.view.scene, this.view.camera)
    this.view.render(0)
    // Upload every look's merged geometries now (a first-time preset would otherwise upload mid-match).
    for (let k = 0; k < PRESETS.length; k++) {
      this.players[0].chibi.setPreset(k)
      this.players[1].chibi.setPreset(k, true)
      this.view.render(0)
    }
    this.ring.visible = false
    this.trail.mesh.visible = false
    this.dust.mesh.visible = false
    for (let i = 0; i < 2; i++) {
      this.players[i].chibi.setPreset(i)
      this.players[i].ring.shown = false
    }
  }

  /**
   * Show the match on `stage`. `onLocalSwing` registers a callback main calls the moment the local
   * swing button charges, swings or cancels (the racket moves the same frame, before the state comes
   * back). An online guest passes its `predictor` (fed by main with the moves it sends) and `live`
   * (inputs reach the sim). Returns the cleanup.
   */
  attach(
    stage: HTMLElement,
    smooth: Smoothed<SpState>,
    selfId: string,
    onLocalSwing: (cb: (what: LocalSwing) => void) => void,
    predictor: GuestPredictor | null = null,
    live: () => boolean = () => false,
  ): () => void {
    this.smooth = smooth
    this.selfId = selfId
    this.predictor = predictor
    this.live = live
    this.reset()
    this.seeded = false
    stage.appendChild(this.view.root)
    this.settle = QUALITY_SETTLE
    this.quality.restart()
    onLocalSwing((what) => this.localSwing(what))
    const stop = startRenderLoop((dt) => this.frame(dt))
    return () => {
      stop()
      this.smooth = null
      this.predictor = null
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
    this.localChargeAt = -1
    this.rally = 0
    this.pointHits = 0
    this.pointAt = -Infinity
    this.ring.visible = false
    this.hud.reset()
    this.hudPhase = ''
    this.trail.reset()
    this.trail.setLook(TRAIL.plain)
    this.punch.reset()
    this.dust.reset()
    this.lastPop[0] = this.lastPop[1] = -Infinity
    for (const p of this.players) {
      p.swing.reset()
      p.swingAt = NaN
      p.jumpAge = Infinity
      p.leapTick = NaN
      p.foot.reset()
      p.fresh = true
      p.squash.reset()
      p.lean.reset()
      Object.assign(p.pose, restPose())
      p.charge = -1
      p.stage = 0
      p.hitAt = -Infinity
      p.chargeAt = -1
      p.ring.update(-1, 0, 0, 0)
    }
  }

  /** The local swing button: load and hold, strike on the release (whoosh by charge), or let go. */
  private localSwing(what: LocalSwing) {
    const view = this.players[this.localIdx]
    if (what === 'charge') {
      if (this.localChargeAt < 0) this.localChargeAt = this.time
      view.swing.hold()
      return
    }
    const charge = Math.max(0, view.charge)
    this.localChargeAt = -1
    if (what === 'cancel') {
      view.swing.cancel()
      return
    }
    this.strikeOut(view, charge)
    this.localPressAt = this.time
    playSound(swingSound(charge))
  }

  /** Swing `view` now: let a hold go (or press), remember its power for the streak, catch up a hit already seen. */
  private strikeOut(view: PlayerView, charge: number) {
    if (view.swing.holding) view.swing.release()
    else view.swing.press()
    view.pose.power = charge
    if (this.time - view.hitAt < HIT_GRACE) view.swing.setDue(0)
  }

  private frame(dt: number) {
    this.time += dt
    const curr = this.smooth?.curr
    if (!curr) return this.view.render(dt)
    const track = trackerAction(this.seeded, curr.nextEventId, this.lastEventId, curr.tick, this.lastTick)
    if (track === 'reset') this.reset()
    else if (track === 'seed') {
      // Joined mid-match (or a rematch began while hidden): what already happened isn't replayed.
      this.reset()
      this.seeded = true
      this.lastEventId = curr.nextEventId - 1
      this.lastShotId = newestShotId(curr.events)
    }
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
      const pred = i === this.localIdx && !this.spectating ? this.predictor : null
      if (pred) {
        // The host places or holds us (serve set-up, the server before the serve, countdown, over).
        const held =
          !this.live() || curr.phase === 'over' || (curr.phase === 'serve' && cp.side === curr.server)
        // A jump mid-rally is a packet gap, not a placement: correct()'s ≥ 1 m snap handles it.
        pred.update(dt, cp, curr.tick, (placed && curr.phase !== 'rally') || held)
      }
      const x = (pred ? pred.x : pp.x + (cp.x - pp.x) * t) * flip
      const z = (pred ? pred.z : pp.z + (cp.z - pp.z) * t) * flip
      const root = view.chibi.root
      root.position.set(x, 0, z)
      if (i === this.localIdx) localX = x
      const alt = isTwinAlt(curr.players[0].preset, curr.players[1].preset, i, this.localIdx)
      if (cp.preset !== view.preset || alt !== view.alt) {
        view.preset = cp.preset
        view.alt = alt
        view.chibi.setPreset(cp.preset, alt)
      }
      // Charging: ours from the local button (same frame), the opponent's from the state.
      const local = i === this.localIdx && !this.spectating
      // Our press already swung as a tap on the host: no charging left (ring, slow-down) until the next press.
      if (local && cp.chargeAt === TAPPED && view.chargeAt !== TAPPED) {
        this.localChargeAt = -1
        this.predictor?.setCharging(false)
      }
      view.chargeAt = cp.chargeAt
      const renderTick = prev.tick + (curr.tick - prev.tick) * a
      const charge = local
        ? this.localChargeAt >= 0
          ? chargeOf((this.time - this.localChargeAt) * TICK_RATE)
          : -1
        : cp.chargeAt >= 0
          ? chargeOf(renderTick - cp.chargeAt)
          : -1
      if (!local && cp.chargeAt >= 0 && cp.swingAt === view.swingAt && !view.swing.holding) view.swing.hold()
      // Swings seen in the state (the opponent's, or ours if the press wasn't animated already).
      if (cp.swingAt !== view.swingAt) {
        const pressed = i === this.localIdx && this.time - this.localPressAt < LOCAL_SWING_GRACE
        if (!Number.isNaN(view.swingAt) && !pressed) {
          const power = Math.max(0, view.charge)
          this.strikeOut(view, power)
          playSound(swingSound(power), i === this.localIdx ? 1 : 0.5)
        }
        view.swingAt = cp.swingAt
      }
      // The opponent let go without a swing that counted (cancel / cooldown): drop the hold.
      if (!local && cp.chargeAt < 0 && view.swing.holding) view.swing.cancel()
      this.chargeFx(view, charge, x, z, local || this.spectating)
      // A pending contact of mine (render time sits between the prev and curr ticks): the racket holds
      // its wind-up, or hurries, so the strike meets the shuttle on the contact tick (a hit that already
      // happened tells the driver in onHit). A smash also schedules the leap so its rise tops out there
      // (once per pending shot).
      const pend = curr.shuttle.pending
      const due = pendingDue(pend, cp.side, prev.tick + (curr.tick - prev.tick) * a, TICK_RATE)
      view.swing.update(dt, due)
      const loading = due !== undefined && pend!.kind === 'smash'
      if (loading && pend!.atTick !== view.leapTick) {
        view.leapTick = pend!.atTick
        view.jumpAge = leapStartAge(due)
      }
      const landed = view.jumpAge < SMASH.land && view.jumpAge + dt >= SMASH.land
      view.jumpAge += dt
      // Celebrate / slump through the point pause and on the results screen.
      const mood = moodOf(curr.phase, curr.winner, this.pointSide, cp.side)
      const swinging = view.swing.busy

      // Gait from the interpolated sim velocity (render space), facing the net when swinging / posing.
      const netYaw = z < 0 ? 0 : Math.PI
      // Only a real placement (into the serve) resets; a big jump from a packet gap mid-rally doesn't.
      if ((placed && curr.phase === 'serve') || view.fresh) {
        view.gait.reset(netYaw)
        view.fresh = false
      }
      const vx = (pred ? pred.vx : pp.vx + (cp.vx - pp.vx) * t) * flip
      const vz = (pred ? pred.vz : pp.vz + (cp.vz - pp.vz) * t) * flip
      const g = view.gait
      const flags = g.update(vx, vz, netYaw, swinging || mood !== 'idle', dt)
      // Footwork: a far, low reach just before my contact lunges toward it (a smash leaps instead).
      const sh = curr.shuttle.pos
      this.footwork(view, sh.x * flip, sh.y, sh.z * flip, loading ? undefined : due, mood === 'idle', dt)
      root.rotation.y = g.yaw + view.foot.turn()
      this.onGait(view, flags, x, z, vx, vz)
      if (landed) this.landPuff(x, z)

      const pose = view.pose
      pose.run = g.speed
      pose.stride = g.phase
      pose.fwd = g.fwd
      pose.side = g.side
      const sw = view.swing
      pose.load = sw.load
      pose.strike = sw.strike
      pose.prev = sw.prev
      pose.coil = sw.coil
      const leaping = view.jumpAge >= 0 && view.jumpAge < SMASH.land
      pose.smash = damp(pose.smash, loading || leaping ? 1 : 0, MOTION.smashRate, dt)
      smashJump(view.jumpAge, this.leap)
      pose.jump = this.leap.height
      splitHop(view.foot.splitAge, this.splitO)
      pose.split = this.splitO.height
      pose.squash = view.squash.update(dt) + this.leap.squash + this.splitO.squash
      pose.lean = view.lean.update(dt)
      pose.lunge = view.foot.lunge
      // Badminton ready stance whenever not celebrating / slumping.
      pose.stance = damp(pose.stance, mood === 'idle' ? 1 : 0, MOTION.readyRate, dt)
      // Ready stance while the shuttle comes my way; crouch while my smash is about to connect.
      const hitter = curr.shuttle.lastHitter
      const incoming = curr.phase === 'rally' && hitter !== -1 && hitter !== cp.side
      pose.ready = damp(pose.ready, incoming ? 1 : 0, MOTION.readyRate, dt)
      pose.crouch = damp(pose.crouch, loading && view.jumpAge < 0 ? 1 : 0, MOTION.crouchRate, dt)
      pose.happy = damp(pose.happy, mood === 'happy' ? 1 : 0, MOTION.moodRate, dt)
      pose.sad = damp(pose.sad, mood === 'sad' ? 1 : 0, MOTION.moodRate, dt)
      pose.cheer = damp(pose.cheer, mood === 'happy' && curr.phase === 'over' ? 1 : 0, MOTION.moodRate, dt)
      pose.look = lookAround(this.time, view.seed)
      view.chibi.setPose(pose, this.time)
    }
    this.dust.update(dt)

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
   * nothing recompiles, and warm() already compiled the only variant ever used. The chibis' toy rim +
   * gloss go with them (uniforms only: no recompile either).
   */
  private setShadows(on: boolean) {
    this.shadows = on
    setToyShading(on)
    this.view.renderer.shadowMap.autoUpdate = on
    this.catcher.visible = on
  }

  /** The charge ring, the rising charge sounds and the flash at full (`near` = ours: full volume). */
  private chargeFx(view: PlayerView, charge: number, x: number, z: number, near: boolean) {
    view.ring.update(charge, x, z, this.time)
    const stage = charge >= 0 ? chargeStage(charge) : 0
    if (stage > view.stage) {
      const sound = chargeSound(stage)
      if (sound) playSound(sound, near ? 1 : 0.5)
      if (stage === CHARGE.steps.length) {
        this.fx.burst(x, FULL_SPARK_Y * CHIBI_SCALE, z, FULL_SPARK)
        view.squash.kick(MOTION.kickPerfect * 0.5)
      }
    }
    view.stage = stage
    view.charge = charge
  }

  /** Gait signals → springs and dust: squash on a start or sharp turn, lean overshoot on a stop, foot puffs. */
  private onGait(view: PlayerView, flags: number, x: number, z: number, vx: number, vz: number) {
    if (flags === 0) return
    const B = DUST.burst
    // A floating look (ghost) never touches the ground: springs, but no dust.
    const floats = PRESETS[view.preset]?.look.legs === 'float'
    if (flags & (GaitEvent.Start | GaitEvent.Kick)) {
      view.squash.kick(flags & GaitEvent.Start ? MOTION.kickStart : MOTION.kickTurn)
      // Kicked back from both feet.
      if (!floats) {
        this.footPuff(view, 1, x, z, vx * B.throw, vz * B.throw, B.size, B.life)
        this.footPuff(view, -1, x, z, vx * B.throw, vz * B.throw, B.size, B.life)
      }
    }
    if (flags & GaitEvent.Stop) view.lean.kick(MOTION.kickStop)
    if (floats || view.gait.speed < DUST.stepFrom) return
    const S = DUST.step
    if (flags & GaitEvent.StepL) this.footPuff(view, 1, x, z, vx * S.throw, vz * S.throw, S.size, S.life)
    if (flags & GaitEvent.StepR) this.footPuff(view, -1, x, z, vx * S.throw, vz * S.throw, S.size, S.life)
  }

  /** A puff under one foot (`s` = +1 left / −1 right, local x), thrown at (vx, vz). */
  private footPuff(
    view: PlayerView,
    s: number,
    x: number,
    z: number,
    vx: number,
    vz: number,
    size: number,
    life: number,
  ) {
    const yaw = view.gait.yaw
    const off = s * DUST.foot * CHIBI_SCALE
    this.dust.spawn(x + Math.cos(yaw) * off, z - Math.sin(yaw) * off, vx, vz, life, size)
  }

  /** Smash landing: a little ring of dust. */
  private landPuff(x: number, z: number) {
    const L = DUST.land
    for (let k = 0; k < L.count; k++) {
      const a = (k / L.count) * Math.PI * 2 + 0.4
      this.dust.spawn(x, z, Math.cos(a) * L.speed, Math.sin(a) * L.speed, L.life, L.size)
    }
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

  /**
   * Feed `view`'s footwork for this frame: lunge toward the shuttle (render-space x, y, z) when it is far
   * and low and my contact is `due` s away (undefined = none of mine; 0 = now).
   */
  private footwork(
    view: PlayerView,
    sx: number,
    sy: number,
    sz: number,
    due: number | undefined,
    idle: boolean,
    dt: number,
  ) {
    const r = view.chibi.root.position
    const dx = sx - r.x
    const dz = sz - r.z
    const want = idle && lungeWanted(Math.hypot(dx, dz), sy, due)
    // Body frame (model faces +z; local +x is (cos yaw, −sin yaw) in render space).
    const yaw = view.gait.yaw
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    view.foot.update(dt, want, dx * c - dz * sn, dx * sn + dz * c)
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
      // The opponent hits / serves: split step, landing ready.
      if (e.k === 'hit' || e.k === 'serve')
        for (let n = 0; n < 2; n++) {
          const v = this.players[n]
          const airborne = v.jumpAge >= 0 && v.jumpAge < SMASH.end
          if (splitsOn(e.k, e.side, s.players[n].side) && canSplit(v.gait.speed, v.foot.lunge, airborne))
            v.foot.splitStep()
        }
      const sound = eventSound(e, this.side)
      if (sound) playSound(sound.sound, sound.vol)
      if (e.k === 'point') {
        this.pointSide = e.side
        if (this.pointHits >= CHEER.rally) playSound(SHUTTLE_SOUNDS.cheer)
      } else if (e.k === 'hit') this.onHit(s, e.side, e.grade, e.shot === 'smash', e.charge ?? 0)
      else if (e.k === 'serve') this.trail.setLook(TRAIL.plain)
      else if (e.k === 'whiff' && !this.spectating && e.side === this.side)
        this.popAt(this.localIdx, 'miss', false)
    }
  }

  private onHit(
    s: SpState,
    side: 0 | 1,
    grade: Exclude<PopKind, 'power' | 'miss'>,
    smash: boolean,
    charge: number,
  ) {
    const j = s.players[0].side === side ? 0 : 1
    const mine = this.spectating || side === this.side
    const power = isFull(charge) && grade === 'perfect'
    this.popAt(j, power ? 'power' : grade, smash)
    this.trail.setLook(
      isFull(charge) ? TRAIL.power : smash ? TRAIL.smash : grade === 'perfect' ? TRAIL.perfect : TRAIL.plain,
    )
    // The hit is happening now: a racket still on its way to contact hurries to meet it (a press seen
    // later this frame catches up too: hitAt).
    const view = this.players[j]
    view.hitAt = this.time
    view.swing.setDue(0)
    const p = this.shuttle.position
    // A hit with no pending contact seen first (same-tick) can still lunge.
    if (!smash) this.footwork(view, p.x, p.y, p.z, 0, view.pose.happy + view.pose.sad < 0.5, 0)
    if (grade === 'perfect') {
      this.fx.burst(p.x, p.y, p.z, SPARKLE)
      // A snappy stretch-then-squash on the hitter.
      view.squash.kick(MOTION.kickPerfect)
    }
    const boost = 1 + POWER_FX.punch * charge
    if (smash) {
      // Keep a leap scheduled from the pending smash; a same-tick hit leaps now.
      view.jumpAge = leapAtHit(view.jumpAge)
      this.fx.burst(p.x, p.y, p.z, SMASH_BURST)
      if (power) this.fx.burst(p.x, p.y, p.z, POWER_BURST)
      this.punch.kick((mine ? PUNCH.kickMine : PUNCH.kickTheirs) * (power ? POWER_FX.powerSmash : boost))
    } else if (charge > 0) this.punch.kick(POWER_FX.hitKick * charge * (mine ? 1 : 0.5))
    if (power && !this.spectating && side === this.side) {
      try {
        navigator.vibrate?.(POWER_FX.buzz)
      } catch {
        // Haptics are a nicety (blocked or missing on some browsers).
      }
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
      this.hud.setServe(t('{name} serves', { name: shownName(server) }))
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
    const p = cameraPose(this.camX, this.focus, this.pose, this.tight)
    const cam = this.view.camera
    if (Math.abs(cam.fov - p.fov) > 1e-3) {
      cam.fov = p.fov
      cam.updateProjectionMatrix()
    }
    cam.position.set(p.x, p.y, p.z)
    cam.lookAt(p.lookX, p.lookY, p.lookZ)
    // Smash punch: a post offset on top of the framed pose (cameraPose itself is untouched).
    const punch = this.punch.update(dt)
    cam.position.z += punch
    cam.position.y -= punch * PUNCH.dip
  }
}
