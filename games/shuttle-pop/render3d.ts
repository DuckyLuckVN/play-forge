// Shuttle Pop in 3D: court, net, chibi players (actors.ts), shuttle, landing ring.
// Reads interpolated sim state only; gameplay lives in sim.ts.
//
// Built once per page: `warm()` (menu preload) compiles every shader, each match `attach`es it to the
// stage and gets a cleanup that parks it offscreen again. The render loop allocates nothing.
// The park around the court (sky, lights, crowd) is scenery.ts. Real shadows come from the players
// only and stop (between rallies) once the engine's quality ladder (quality.ts) drops them.
// Net: net.ts (mesh, tapes, posts; a ripple when the shuttle hits it). Scoreboard: scoreboard.ts (DOM, top
// centre) + the live score on the flip board by the net (boardprop.ts).
// Juice: timing pops + badges (hud.ts), Perfect sparkles, a trail ribbon behind the shuttle styled by the
// shot's kind, grade and power (trail.ts), a sprung
// camera punch on smashes and the sounds (sounds.ts), all driven by new sim events. Hold-to-charge: a
// charge ring at the feet (chargering.ts) with rising sounds, the racket held loaded until the release,
// and punch / burst / trail / streak scaled by the charge (a full-charge Perfect is the biggest).
// Motion: one Gait per player (locomotion.ts) fed by the interpolated sim velocity, so the remote / bot
// player animates exactly like the local one; swing / leap curves are moves.ts; dust puffs are dust.ts.
// Online guests: the own chibi comes from GuestPredictor (predict.ts: moves the frame the input does,
// gait fed by the predicted velocity); the shuttle comes from GuestShuttle (guestshuttle.ts: a smooth RenderClock + local deterministic flight
// between host states, so jitter never rubber-bands it); remote players on guests are drawn from RemoteTracks (remotes.ts).
// Findability (visibility.ts): a soft halo on the shuttle, and any player whose body covers it on screen fades
// (Chibi.setOpacity, each chibi independently, in any phase: a server's own body too).

import {
  BackSide,
  CircleGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  PMREMGenerator,
  MeshBasicMaterial,
  PlaneGeometry,
  ShadowMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { prefersTouch } from '@forge/core/device'
import { startRenderLoop } from '@forge/core/loop'
import type { Smoothed } from '@forge/net/smoothing'
import { playSound } from '@forge/audio/sound'
import { createScene3D, Particles3D, type Scene3D } from '@forge/render3d'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  ABILITY,
  actArcInto,
  actorIndex,
  cooldownLeft,
  cooldownTicksLeft,
  glideOf,
  type AbilityKind,
  type ActArc,
} from './ability'
import {
  createChibi,
  JUMP_H,
  PRESETS,
  restPose,
  setToyEnvironment,
  setToyShading,
  type Chibi,
  type ChibiPose,
} from './actors'
import { AVAILABLE_IDS } from './presets'
import { chargeOf, chargeStage, CHARGE } from './charge'
import { isPowerHit } from './power'
import { ChargeRing, COOLDOWN_LOOK } from './chargering'
import { TICK_RATE } from './court'
import { courtScale } from './courtsize'
import { DustPuffs } from './dust'
import { jumpMotionInto, type JumpMotion } from './animpose'
import { teamName } from './doubles'
import { StunStars } from './stars'
import { stunLook, type StunLook } from './stun'
import { canSplit, Footwork, lungeWanted, splitHop, splitsOn } from './footwork'
import { Hud, newEvents, newestShotId, sameMatchPrev, trackerAction, type PopKind } from './hud'
import { ScoreCards } from './boardprop'
import { Net } from './net'
import { prefs } from './prefs'
import { ringShown, type RingMode } from './landing'
import { mountCameraButton } from './camera-menu'
import { headAnchorY, ReactionBubbles, toScreen } from './bubbles'
import { boardView, Scoreboard } from './scoreboard'
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
import { COURT, predictLanding, type CourtDims, type Vec3 } from './physics'
import type { GuestView, PredictedHit } from './guestshuttle'
import { HitEcho } from './hitecho'
import type { GuestPredictor } from './predict'
import { flashAt, hitJuice } from './hitfx'
import { SpringPunch } from './punch'
import type { Grade, ShotKind } from './shots'
import { SHUTTLE_LOOK_SCALE, SHUTTLECOCK, shuttlecockGeometry, SHUTTLECOCK_COLORS } from './model/shuttlecock'
import {
  corkAxis,
  floorClearance,
  ORIENT,
  restingDir,
  shuttleMode,
  shuttleOrientation,
  turnToward,
  type ShuttleMode,
} from './orient'
import { BOARD, surroundOf } from './props'
import { SP_QUALITY, spStartLevel } from './quality'
import { Park } from './scenery'
import { isOwnEvent, shownName, TAPPED, type SpEvent, type SpState } from './sim'
import { MAX_SEATS } from './doubles'
import {
  abilitySound,
  chargeSound,
  eventSound,
  hitSound,
  type LastShot,
  SHUTTLE_SOUNDS,
  swingSound,
} from './sounds'
import { newTrailStyle, RibbonTrail, trailStyle } from './trail'
import {
  bodyBox,
  haloOpacity,
  haloPixels,
  occlusion,
  stepFades,
  VIS,
  type BodyBox,
  type ScreenRect,
} from './visibility'
import {
  CAMERA,
  CHEER,
  cameraPose,
  clampCameraTweak,
  cheerLevel,
  dampFocus,
  framingTightness,
  hitterIndex,
  interpShuttle,
  moodOf,
  NO_TWEAK,
  PLAYER_SNAP,
  rallyHits,
  twinAlt,
  viewOf,
  type CameraPose,
  type CameraTweak,
} from './world'

const PALETTE = {
  /** Warm clay border around the court (the park grass is scenery.ts). */
  surround: '#c9a487',
  court: '#3f9a86',
  line: '#ffffff',
  /** Dark outline so the white shuttlecock reads against the pale sky (same idea as the twin outline). */
  shuttleRim: SHUTTLECOCK_COLORS.outline,
  ringMine: '#ffd166',
  ringTheirs: '#ffffff',
}

const LINE_W = 0.05
const POST_OUT = 0.25
/** Cork-down in the server's hand (model +Y = cork, model/shuttlecock.ts). */
const CORK_DOWN = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
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
  capacity: 32,
  color: '#f4ecd6',
  opacity: 0.6,
  stepFrom: 0.5,
  step: { size: 0.16, life: 0.32, throw: -0.12 },
  burst: { size: 0.26, life: 0.42, throw: -0.35 },
  land: { size: 0.3, life: 0.45, speed: 1.6, count: 4 },
  /** A dive's landing puffs: this far apart along the dive (m, before CHIBI_SCALE). */
  dive: 0.3,
  /** Foot offset from the root (m, before CHIBI_SCALE). */
  foot: 0.1,
}
const WIN_SPARK = [
  { count: 7, color: ['#ff6b8b', '#ffd166'], speed: 1.7, life: 0.55, size: 0.12, gravity: 0.8 },
  { count: 7, color: ['#9ff0c8', '#ffffff'], speed: 1.7, life: 0.55, size: 0.12, gravity: 0.8 },
]
/** A local swing press already animated; ignore the matching swingAt change for this long. */
const LOCAL_SWING_GRACE = 0.4
/** A swing pressed this soon after its hit event (same frame, any order) still catches up to it (s). */
const HIT_GRACE = 0.25
/** A guest's own predicted ability press: the host's matching `act` event this soon after stays silent (s). */
const OWN_ACT_ECHO = 1
/** Others' cooldown rings at this opacity (ours full). */
const THEIR_CD_ALPHA = 0.5
/** Jump-smash camera punch over a plain smash. */
const JUMP_PUNCH = 1.2
/** What the local player's swing button just did (main.ts → attach's callback). */
export type LocalSwing = 'charge' | 'swing' | 'cancel'
/** Chibis are ~1.3 m in model space; drawn a bit larger so they read from the far camera. */
const CHIBI_SCALE = 1.15
/** Bonked look: sad mood floor, head wobble (rad amplitude), recoil lean, star gap above the head (m). */
const STUN_SAD = 0.7
const STUN_WOBBLE = 0.35
const STUN_RECOIL = 0.25
const STUN_STAR_GAP = 0.15
/** Court surface beyond the lines (m); the warm border (SURROUND) is props.ts. */
const COURT_RUNOFF = { x: 0.35, z: 0.45 }
/** Environment-map strength on the chibis in the park (the studio room is brighter than golden hour). */
const TOY_ENV = 0.55
const SHADOW_OPACITY = 0.26

/**
 * Trail path: TRAIL_SAMPLES positions one every TRAIL_STEP s (enough path for the longest ribbon), and the
 * empty gap (m) behind the shuttle's origin: its skirt plus a little, so the ribbon never touches it.
 */
const TRAIL_SAMPLES = 40
const TRAIL_STEP = 1 / 60
const TRAIL_GAP = SHUTTLECOCK.length * SHUTTLE_LOOK_SCALE + 0.05
/** Perfect-trail sparkles (trail.ts): a tiny gold twinkle at the ribbon's tip every `every` s. */
const TRAIL_SPARK = {
  every: 0.07,
  burst: { count: 2, color: ['#ffd166', '#fff3b0'], speed: 0.6, life: 0.32, size: 0.12 },
}
/** Draw order (transparent pass): net 1 → trail / sparkles 2 → halo 2.5 → shuttlecock 3 → chibis (CHIBI_ORDER). */
const SHUTTLE_ORDER = 3
const HALO_ORDER = 2.5
/** Longest frame step (s) fed to the trail: a hitch draws one normal frame, not a huge one. */
const TRAIL_MAX_DT = 0.05
/**
 * Every chibi object (meshes and their nested Groups: a Group's renderOrder becomes its subtree's group order)
 * draws after the shuttlecock, so a faded (covering) chibi blends over it instead of hiding it. The rig is
 * built once (setPreset only re-parents), so setting it at construction covers every look.
 */
const CHIBI_ORDER = 5

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
  /** Drawn as the tinted twin (an earlier player wears the same look: world.ts twinAlt). */
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
  /** Hit juice (hitfx.ts): the white flash's peak (fades from hitAt) and the hit-stop's end (s). */
  flashPeak: number
  stopUntil: number
  /** chargeAt in the last state seen (a change to TAPPED = the press swung as a tap). */
  chargeAt: number
  ring: ChargeRing
  /** Jump / lunge cooldown ring (just outside the charge ring). */
  cd: ChargeRing
  /** This frame's jump / lunge body offsets (ability.ts actArcInto; reused). */
  arc: ActArc
  nextTrail: number
  nextCheer: number
  /** Stun stars over the head (hidden unless stunned). */
  stars: StunStars
  /** Reused each frame by stunLook. */
  stunLook: StunLook
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
    flashPeak: 0,
    stopUntil: -Infinity,
    chargeAt: -1,
    ring: new ChargeRing(),
    cd: new ChargeRing(COOLDOWN_LOOK),
    arc: { lift: 0, dive: 0 },
    nextTrail: 0,
    nextCheer: 0,
    stars: new StunStars(),
    stunLook: { on: false, spin: 0, flinch: 0 },
  }
}

export class Court3D {
  private view: Scene3D
  /** Offscreen home while no match is showing (keeps the GL context alive). */
  private parking: HTMLElement
  private smooth: Smoothed<SpState> | null = null
  private selfId = ''
  /** One view per seat (MAX_SEATS, built once); views past the match's players are hidden. */
  private players: PlayerView[]
  /** How many views the last frame showed (−1 = not yet): hiding / showing runs on a change only. */
  private shownViews = -1
  /** This frame's looks, one per player (twinAlt; reused). */
  private presets: number[] = []
  /** The shuttlecock (model/shuttlecock.ts), its quaternion posed by orient.ts. */
  private shuttle: Mesh
  /** Last drawn (render-space, unclamped) shuttle position: the per-frame delta is the velocity it turns to. */
  private drawn = new Vector3()
  private drawnOk = false
  /** Scratch velocity, cork axis and resting direction (no allocation in the loop). */
  private shVel: Vec3 = { x: 0, y: 0, z: 0 }
  private shAxis = new Vector3()
  private restDir: Vec3 = { x: 0, y: 0, z: 0 }
  /** Last horizontal heading in flight: a landed shuttle lies cork-forward along it. */
  private headX = 0
  private headZ = 1
  /** The shuttle's glow (visibility.ts haloOpacity) and how the shuttle is posed this frame (orient.ts). */
  private halo!: Sprite
  private shMode: ShuttleMode = 'hand'
  /** Each player's opacity while covering the shuttle (visibility.ts stepFades), and this frame's cover. */
  private fades: number[] = []
  private occ: number[] = []
  /** Reaction bubbles over the chibis (bubbles.ts), and the shuttle's NDC point from updateVisibility (shOn: in front, drawn). */
  private bubbles = new ReactionBubbles()
  private shNdcX = 0
  private shNdcY = 0
  private shOn = false
  private bubSh = { x: 0, y: 0 }
  /** Per-frame scratch for updateVisibility (no allocation in the loop). */
  private visP = new Vector3()
  private visRect: ScreenRect = { x0: 0, y0: 0, x1: 0, y1: 0, depth: 0 }
  private shadow: Mesh
  private ring: Mesh
  private ringMat: MeshBasicMaterial
  private ringColor = { mine: new Color(PALETTE.ringMine), theirs: new Color(PALETTE.ringTheirs) }
  /** Personal landing-ring setting (Hidden / Near drop / Always). */
  private ringMode: RingMode = prefs.get().ring
  /** The ring's prediction is valid (rally, a hitter, ball not stopped by the net). */
  private ringOn = false
  /** Sim tick the shuttle lands at; compared with the tick being shown (render clock online) so Near drop matches the visible flight. */
  private ringLandTick = Infinity
  /** Newest hit/serve event id already turned into a landing ring. */
  private lastShotId = 0
  /** The last hit's shot + power (a smash's landing thumps); null from a serve / reset. One reused object. */
  private lastShot: LastShot | null = null
  private readonly lastShotBuf: LastShot = { shot: 'drive', power: 0 }
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
  /** The player's saved camera preference, and what actually applies at this canvas shape. */
  private camWant: CameraTweak = prefs.get().camera
  private camTweak: CameraTweak = NO_TWEAK
  private tmp: Vec3 = { x: 0, y: 0, z: 0 }
  private park: Park
  /** Takes the players' real shadows (the ground is unlit, so it can't). */
  private catcher!: Mesh
  /** The clay surround and the court surface (geometry follows the court, see shapeCourt). */
  private surround!: Mesh
  private floor!: Mesh
  /** Every court line, one merged mesh. */
  private lines!: Mesh
  private shadows = true
  private wantShadows = true
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
  /** The match's court (state.court; old hosts send none → Normal). The camera frames this one. */
  private court: CourtDims = COURT
  /** Online guests only: the shuttle's smooth clock + flight (null = host / vs-AI: plain interpolation). */
  private guest: GuestView | null = null
  /** Online guest: the predicted own hit already heard, so the host's answering hit stays silent. */
  private readonly echo = new HitEcho()
  /** Scratch for GuestView.remotes.sample (no per-frame allocation). */
  private readonly remote = { x: 0, z: 0, vx: 0, vz: 0 }
  /** Whether our inputs reach the sim now (no prediction while they'd be dropped). */
  private live: () => boolean = () => false
  private board = new Scoreboard()
  private hud = new Hud(this.board.root)
  private cards = new ScoreCards()
  private net!: Net
  /** What the serve badge and the scoreboard were last drawn for (phase '' = redraw). */
  private hudPhase = ''
  private hudServer = -1
  private hudS0 = -1
  private hudS1 = -1
  private hudSide = -1
  /** Every player's look, packed (1, then × 64 + preset per player): the board's colour dots. */
  private hudLooks = -1
  private fx = new Particles3D(160)
  /** The trail ribbon, styled by the last hit's kind / grade / power (null = a serve) (trail.ts). */
  private trail = new RibbonTrail(TRAIL_SAMPLES, TRAIL_STEP, TRAIL_GAP)
  private trailShot: { kind: ShotKind | null; grade: Grade | null; power: number } = {
    kind: null,
    grade: null,
    power: 0,
  }
  /** This frame's trail look (reused). */
  private trailLook = newTrailStyle()
  /** Next time (s) a Perfect trail twinkles. */
  private sparkAt = 0
  private proj = new Vector3()
  /** When each player's latest pop showed (for stacking). */
  private lastPop: number[] = new Array<number>(MAX_SEATS).fill(-Infinity)
  private punch = new SpringPunch(PUNCH.k, PUNCH.zeta, PUNCH.step)
  private dust = new DustPuffs(DUST.capacity, DUST.color, DUST.opacity)
  private jumpMotion: JumpMotion = { crouch: 0, cock: 0, stretch: 0 }
  private banner = document.createElement('div')
  private bannerPhase = false
  /** Smash leap sample (reused). */
  private leap: Hop = { height: 0, squash: 0 }
  /** Split-step sample (reused). */
  private splitO: Hop = { height: 0, squash: 0 }
  /** The local player's jump / lunge cooldown left 0..1 this frame (the phone button reads it). */
  private localCd = 0
  /** The local cooldown left in seconds (the HUD's countdown). */
  private localCdSec = 0
  /** Called every frame with the local ability cooldown (the phone button follows it; set by main.ts). */
  onCooldown: ((cd: number, seconds: number) => void) | null = null
  /** Online guest: when our own ability press was predicted and heard (s; its host `act` stays silent). */
  private lastOwnActAt = -Infinity
  /** Scratch body box for the occlusion pass. */
  private body: BodyBox = { y0: 0, y1: 0, mid: 0 }

  constructor() {
    this.parking = document.createElement('div')
    // About the stage's size, so warm-up renders allocate near-final buffers, but never seen.
    this.parking.style.cssText =
      'position:fixed;left:-10000px;top:0;width:100vw;height:85vh;pointer-events:none;opacity:0'
    document.body.appendChild(this.parking)
    this.view = createScene3D(this.parking, {
      fov: CAMERA.fov,
      far: 120,
      maxDpr: 2,
      levels: SP_QUALITY,
      startLevel: spStartLevel(prefersTouch()),
    })
    const { scene, renderer } = this.view
    renderer.shadowMap.enabled = true
    this.park = new Park(scene)
    // The chibis' soft reflections: a procedural studio room baked into a PMREM map (no asset files).
    const pmrem = new PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    setToyEnvironment(pmrem.fromScene(room, 0.04).texture, TOY_ENV)
    room.dispose()
    pmrem.dispose()

    this.buildCourt()
    // Fires on every size or quality-level change (the engine's one governor decides both).
    this.view.onResize((w, h) => {
      this.wantShadows = this.view.quality.shadows !== false
      // Snaps on purpose: a resize/rotate already redraws everything at a new size, so easing the
      // framing would only add a second, slower jump.
      this.tight = framingTightness(w, h)
      this.refitCamera()
    })
    // Lives as long as the page: no unsubscribe.
    prefs.onChange((p) => {
      this.camWant = p.camera
      this.ringMode = p.ring
      this.refitCamera()
    })

    this.players = Array.from({ length: MAX_SEATS }, (_, i) => makePlayer(i))
    this.fades = this.players.map(() => 1)
    this.occ = this.players.map(() => 0)
    for (const p of this.players) {
      p.chibi.root.traverse((o) => {
        // The swing streak and blob shadow keep their own order (the streak must not draw over the shuttle).
        if (o.name !== 'streak' && o.name !== 'shadow') o.renderOrder = CHIBI_ORDER
      })
      scene.add(p.chibi.root, p.ring.root, p.cd.root, p.stars.group)
    }

    // Shuttlecock: vertex-coloured unlit body + dark back-side outline (2 draw calls, as the old ball + rim).
    const cock = shuttlecockGeometry()
    // Transparent at opacity 1 (looks opaque) only to draw in the transparent pass after the wind streaks, so
    // streaks in front of it (flying away) never veil it; it still writes depth.
    this.shuttle = new Mesh(cock.body, new MeshBasicMaterial({ vertexColors: true, transparent: true }))
    const rim = new Mesh(
      cock.outline,
      new MeshBasicMaterial({ color: PALETTE.shuttleRim, side: BackSide, transparent: true }),
    )
    this.shuttle.renderOrder = rim.renderOrder = SHUTTLE_ORDER
    this.shuttle.add(rim)
    // Drawn bigger than life (look only); the outline and the glow below are children, so they follow.
    this.shuttle.scale.setScalar(SHUTTLE_LOOK_SCALE)
    // Soft glow around the shuttle: depth-tested (never through posts / court), after the net, the wind and
    // the shuttlecock (HALO_ORDER) so none of them blends over it. Never on a player: hidden while the
    // shuttle is held and faded out wherever it overlaps any player on screen (updateVisibility).
    const haloTex = new DataTexture(haloPixels(), VIS.halo.px, VIS.halo.px)
    haloTex.magFilter = haloTex.minFilter = LinearFilter
    haloTex.needsUpdate = true
    const halo = (this.halo = new Sprite(
      new SpriteMaterial({
        map: haloTex,
        color: VIS.halo.color,
        opacity: VIS.halo.opacity,
        transparent: true,
        depthWrite: false,
      }),
    ))
    halo.scale.setScalar(VIS.halo.size)
    halo.renderOrder = HALO_ORDER
    this.shuttle.add(halo)
    this.shadow = new Mesh(
      new CircleGeometry(0.12 * SHUTTLE_LOOK_SCALE, 16),
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

    // Drawn after the net mesh (renderOrder 1), so it never blends over a trail / sparkle in front of it.
    this.trail.mesh.renderOrder = this.fx.points.renderOrder = 2
    scene.add(this.trail.mesh, this.fx.points, this.dust.mesh)
    this.view.onResize((_w, h) => this.fx.setScale(h * this.view.renderer.getPixelRatio()))
    this.view.root.appendChild(this.hud.root)
    this.hud.root.appendChild(this.board.splash.root)
    this.view.root.appendChild(this.bubbles.root)
    this.banner.className = 'sp-outcome-stamp'
    this.banner.setAttribute('aria-live', 'polite')
    mountCameraButton(this.view.root)
  }

  /** The element under the view (for pointer input). */
  get surface(): HTMLElement {
    return this.view.root
  }

  /** The court's meshes (shapes from shapeCourt), the net and the score cards. Once. */
  private buildCourt() {
    const { scene } = this.view
    const flat = (mat: MeshBasicMaterial | ShadowMaterial, y: number) => {
      const m = new Mesh(new BufferGeometry(), mat)
      m.rotation.x = -Math.PI / 2
      m.position.y = y
      scene.add(m)
      return m
    }
    this.surround = flat(new MeshBasicMaterial({ color: PALETTE.surround }), 0.002)
    this.floor = flat(new MeshBasicMaterial({ color: PALETTE.court }), 0.004)
    this.catcher = flat(new ShadowMaterial({ opacity: SHADOW_OPACITY, depthWrite: false }), 0.008)
    this.catcher.receiveShadow = true
    this.lines = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: PALETTE.line }))
    scene.add(this.lines, this.cards.mesh)
    this.shapeCourt(this.court)
  }

  /**
   * (Re)shapes everything sized by the court: surround, surface + run-off, shadow catcher, lines, net (a new
   * one, the old disposed), the scoreboard cards and the park. Rare (a court change): allocates.
   */
  private shapeCourt(court: CourtDims) {
    const { scene } = this.view
    const reshape = (m: Mesh, geo: BufferGeometry) => {
      m.geometry.dispose()
      m.geometry = geo
    }
    const sur = surroundOf(court)
    const outerW = (court.halfWidth + sur.x) * 2
    const outerL = (court.halfLen + sur.z) * 2
    reshape(this.surround, new PlaneGeometry(outerW, outerL))
    reshape(
      this.floor,
      new PlaneGeometry((court.halfWidth + COURT_RUNOFF.x) * 2, (court.halfLen + COURT_RUNOFF.z) * 2),
    )
    reshape(this.catcher, new PlaneGeometry(outerW, outerL))

    // Lines are centred on the boundary (a shuttle on the line is in). One merged mesh.
    const lines: BufferGeometry[] = []
    const line = (x: number, z: number, w: number, d: number) =>
      lines.push(new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0.006, z))
    const W = court.halfWidth * 2 + LINE_W
    const L = court.halfLen * 2 + LINE_W
    for (const s of [-1, 1]) {
      line(s * court.halfWidth, 0, LINE_W, L) // side lines
      line(0, s * court.halfLen, W, LINE_W) // base lines
      line(0, s * court.shortLine, W, LINE_W) // short service lines
      const centreLen = court.halfLen - court.shortLine
      line(0, s * (court.shortLine + centreLen / 2), LINE_W, centreLen) // centre lines
    }
    reshape(this.lines, mergeGeometries(lines))
    for (const g of lines) g.dispose()

    // Net: posts, the see-through mesh and the tapes (net.ts).
    if (this.net) {
      scene.remove(this.net.group)
      this.net.dispose()
    }
    const aniso = this.view.renderer.capabilities.getMaxAnisotropy()
    this.net = new Net(court.halfWidth + POST_OUT, court.netH, aniso)
    scene.add(this.net.group)

    this.cards.mesh.position.x = BOARD.x * courtScale(court).x
    this.park.setCourt(court)
  }

  /** Compile every shader up front, so the first match starts without a hitch. */
  async warm(): Promise<void> {
    this.ring.visible = true
    this.trail.mesh.visible = true
    this.dust.mesh.visible = true
    // Every view's fade materials (per chibi, one toy program) and its twin outline + kit materials (both
    // shades), so no material is made mid-match, 1v1 or 2v2. View 0 starts on its twin shade (a spectator
    // or a later seat can tint it) and its normal fade is drawn just after the compile.
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      p.chibi.setOpacity(0.5)
      p.chibi.setPreset(i, true)
      p.chibi.root.traverse((o) => (o.visible = true))
      p.ring.shown = true
      p.cd.shown = true
    }
    this.placeCamera(0, 1)
    // Scenery, crowd and the shadow variants of every lit material are all in the scene by now (the
    // chibis' slow-device shading is uniforms only: the same programs).
    await this.view.renderer.compileAsync(this.view.scene, this.view.camera)
    this.view.render(0)
    this.players[0].chibi.setPreset(0)
    this.view.render(0)
    for (const p of this.players) p.chibi.setOpacity(1)
    // Upload every look's merged geometries now (a first-time preset would otherwise upload mid-match).
    // Per look, not per view: geometries are shared, two views cover both shades.
    for (const k of AVAILABLE_IDS) {
      this.players[0].chibi.setPreset(k)
      this.players[1].chibi.setPreset(k, true)
      this.view.render(0)
    }
    this.ring.visible = false
    this.trail.mesh.visible = false
    this.dust.mesh.visible = false
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].chibi.setPreset(i)
      this.players[i].ring.shown = false
      this.players[i].cd.shown = false
      // Seats 3–4 stay hidden until a 2v2 match shows them (showViews).
      this.players[i].chibi.root.visible = i < 2
    }
    this.shownViews = -1
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
    guest: GuestView | null = null,
  ): () => void {
    this.smooth = smooth
    this.selfId = selfId
    this.predictor = predictor
    this.live = live
    this.guest = guest
    this.reset()
    this.seeded = false
    stage.appendChild(this.view.root)
    stage.appendChild(this.banner)
    onLocalSwing((what) => this.localSwing(what))
    const stop = startRenderLoop((dt) => this.frame(dt))
    return () => {
      stop()
      this.smooth = null
      this.predictor = null
      this.guest?.clock.reset()
      this.guest?.shuttle.reset()
      this.guest?.remotes.reset()
      this.guest = null
      this.parking.appendChild(this.view.root)
      this.banner.remove()
    }
  }

  /** Forget the last match (a rematch restarts ticks and event ids). */
  private reset() {
    this.guest?.clock.reset()
    this.guest?.shuttle.reset()
    this.guest?.remotes.reset()
    // A charge held through the last match's end must not slow the new match's first steps.
    this.predictor?.setCharging(false)
    this.echo.reset()
    this.lastShotId = 0
    this.lastShot = null
    this.lastHitter = -2
    this.lastTick = -1
    this.lastEventId = 0
    this.pointSide = -1
    this.localPressAt = -Infinity
    this.localChargeAt = -1
    this.localCd = 0
    this.localCdSec = 0
    this.lastOwnActAt = -Infinity
    this.rally = 0
    this.pointHits = 0
    this.pointAt = -Infinity
    this.ring.visible = false
    this.ringOn = false
    this.hud.reset()
    this.bubbles.reset()
    this.board.reset()
    this.net.reset()
    this.hudPhase = ''
    this.trail.reset()
    this.setTrailShot(null, null, 0)
    this.shVel.x = this.shVel.y = this.shVel.z = 0
    this.punch.reset()
    this.dust.reset()
    this.bannerPhase = false
    this.banner.classList.remove('show')
    this.lastPop.fill(-Infinity)
    this.drawnOk = false
    this.fades.fill(1)
    this.occ.fill(0)
    this.shownViews = -1
    for (const p of this.players) {
      p.chibi.setOpacity(1)
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
      p.flashPeak = 0
      p.stopUntil = -Infinity
      p.chibi.setFlash(0)
      p.chargeAt = -1
      p.nextTrail = 0
      p.nextCheer = 0
      p.ring.update(-1, 0, 0, 0)
      p.stars.group.visible = false
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

  /**
   * Views 0..n−1 shown, the rest hidden with their rings and stars (a 1v1 ↔ 2v2 rematch reuses the
   * pool: nothing is built or disposed). Runs on a change of `n` only.
   */
  private showViews(n: number) {
    if (n === this.shownViews) return
    this.shownViews = n
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      const on = i < n
      p.chibi.root.visible = on
      if (on) continue
      p.ring.update(-1, 0, 0, 0)
      p.cd.update(-1, 0, 0, 0)
      p.stars.group.visible = false
      p.fresh = true
    }
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
    this.onCooldown?.(this.localCd, this.localCdSec)
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
    this.setCourt(curr.court ?? COURT)
    // Quality ladder dropped the players' real shadows: apply between rallies so they don't vanish
    // mid-shot. Blob shadows stay either way.
    if (this.wantShadows !== this.shadows && curr.phase !== 'rally') this.setShadows(this.wantShadows)
    // Never the old match's last state (rematch countdown) or another seat layout: see sameMatchPrev.
    const prev = sameMatchPrev(this.smooth!.prev ?? curr, curr)
    const a = this.smooth!.alpha()

    // The local player's side is drawn near; spectators see side 0's view.
    let side: 0 | 1 = 0
    this.localIdx = 0
    this.spectating = true
    // One view per seat: never more players than views (MAX_SEATS), so every index below is bounded.
    const n = Math.min(curr.players.length, this.players.length)
    for (let i = 0; i < n; i++)
      if (curr.players[i].id === this.selfId) {
        side = curr.players[i].side
        this.localIdx = i
        this.spectating = false
      }
    if (curr.phase === 'over' && !this.bannerPhase) {
      const winner = curr.winner === 1 ? 1 : 0
      this.banner.textContent = this.spectating
        ? t('{name} wins!', {
            name: teamName(
              curr.players.filter((p) => p.side === winner),
              shownName,
            ),
          })
        : t(curr.players[this.localIdx].side === winner ? 'Victory!' : 'Defeat')
      this.banner.classList.remove('show')
      // Restart the stamp only at the phase edge, never inside the frame loop.
      void this.banner.offsetWidth
      this.banner.classList.add('show')
      this.bannerPhase = true
    }
    // viewOf allocates: only when the side changes.
    if (side !== this.side) {
      this.side = side
      this.flip = viewOf(side).flip
    }
    const flip = this.flip

    // Online guest: feed the states first (the clock samples its error at frame start), then advance it.
    const g0 = this.guest
    if (g0) {
      g0.clock.onState(prev.tick)
      g0.clock.onState(curr.tick)
      g0.shuttle.push(prev)
      g0.shuttle.push(curr)
      g0.remotes.push(prev.tick, prev.players)
      g0.remotes.push(curr.tick, curr.players)
      g0.clock.update(dt)
    }

    let localX = 0
    this.localCd = 0
    this.localCdSec = 0
    // Host ticks on screen: a guest's render clock (remotes, the shuttle), else the interpolated tick.
    const renderTick = prev.tick + (curr.tick - prev.tick) * a
    const shownTick = g0 ? g0.clock.tick : renderTick
    this.showViews(n)
    const presets = this.presets
    presets.length = n
    for (let i = 0; i < n; i++) presets[i] = curr.players[i].preset
    for (let i = 0; i < n; i++) {
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
      // The predicted local player, else a guest's remote on the render clock, else the plain lerp.
      const rem = !pred && g0 !== null && g0.remotes.sample(cp.id, this.remote)
      const px = pred ? pred.x : rem ? this.remote.x : pp.x + (cp.x - pp.x) * t
      const pz = pred ? pred.z : rem ? this.remote.z : pp.z + (cp.z - pp.z) * t
      const x = px * flip
      const z = pz * flip
      // Jump / lunge: our predicted press on the predictor's step clock, else the state's on the shown tick.
      const act = pred?.act ?? cp.act ?? null
      const actTick = pred?.act ? pred.stepNow : shownTick
      const arc = actArcInto(act, actTick, view.arc)
      // Perfect cuts come from the host's act (the predicted press doesn't know them).
      const cut = cp.act?.cut ?? 0
      const cd = cooldownLeft(act, actTick, cut)
      // A dive's slide is real movement now (sim + prediction): the body just follows the player.
      const root = view.chibi.root
      root.position.set(x, 0, z)
      if (i === this.localIdx) localX = x
      const alt = twinAlt(presets, i, this.spectating ? -1 : this.localIdx)
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
      view.cd.update(
        cd > 0 ? cd : -1,
        root.position.x,
        root.position.z,
        this.time,
        local ? 1 : THEIR_CD_ALPHA,
      )
      if (local) {
        this.localCd = cd
        this.localCdSec = cooldownTicksLeft(act, actTick, cut) / TICK_RATE
      }
      // A pending contact of mine (render time sits between the prev and curr ticks): the racket holds
      // its wind-up, or hurries, so the strike meets the shuttle on the contact tick (a hit that already
      // happened tells the driver in onHit). A smash also schedules the leap so its rise tops out there
      // (once per pending shot).
      // The swinger's own contact (by id: a teammate on the same side doesn't wind up for it).
      const pend = curr.shuttle.pending?.id === cp.id ? curr.shuttle.pending : null
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
      const vx = (pred ? pred.vx : rem ? this.remote.vx : pp.vx + (cp.vx - pp.vx) * t) * flip
      const vz = (pred ? pred.vz : rem ? this.remote.vz : pp.vz + (cp.vz - pp.vz) * t) * flip
      const g = view.gait
      const flags = g.update(vx, vz, netYaw, swinging || mood !== 'idle', dt)
      // Footwork: a far, low reach just before my contact lunges toward it (a smash leaps instead).
      const sh = curr.shuttle.pos
      this.footwork(view, sh.x * flip, sh.y, sh.z * flip, loading ? undefined : due, mood === 'idle', dt)
      const facing = g.yaw + view.foot.turn()
      const dive = act?.k === 'lunge' && act.free ? arc.dive : 0
      const slideYaw = act ? Math.atan2(act.dx * flip, act.dz * flip) : facing
      root.rotation.y = facing + Math.atan2(Math.sin(slideYaw - facing), Math.cos(slideYaw - facing)) * dive
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
      pose.jump = Math.max(this.leap.height, arc.lift / JUMP_H)
      const jumpAge =
        act && (act.k === 'jump' || act.k === 'hop') ? actTick - act.at : view.jumpAge * TICK_RATE
      const jumpAir =
        act && (act.k === 'jump' || act.k === 'hop') ? ABILITY[act.k].air : SMASH.land * TICK_RATE
      jumpMotionInto(jumpAge, jumpAir, this.jumpMotion)
      pose.jumpCrouch = this.jumpMotion.crouch
      pose.jumpCock = this.jumpMotion.cock
      pose.jumpStretch = this.jumpMotion.stretch
      pose.dive = dive
      splitHop(view.foot.splitAge, this.splitO)
      pose.split = this.splitO.height
      pose.squash = view.squash.update(dt) + this.leap.squash + this.splitO.squash
      pose.lean = view.lean.update(dt)
      pose.lunge = Math.max(view.foot.lunge, arc.dive)
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
      if (this.view.quality.dpr > 1) {
        if (pose.jump > 0.12 && this.time >= view.nextTrail) {
          view.nextTrail = this.time + 0.085
          this.dust.spawn(x, z, -vx * 0.08, -vz * 0.08, 0.28, 0.11)
        }
        if (
          act?.k === 'lunge' &&
          actTick - act.at < glideOf(act).dive &&
          arc.dive > 0 &&
          this.time >= view.nextTrail
        ) {
          view.nextTrail = this.time + 0.045
          this.dust.spawn(
            x - act.dx * flip * 0.12,
            z - act.dz * flip * 0.12,
            -vx * 0.1,
            -vz * 0.1,
            0.34,
            0.17,
          )
        }
        if (curr.phase === 'over' && cp.side === curr.winner && this.time >= view.nextCheer) {
          view.nextCheer = this.time + 0.55 + i * 0.12
          this.fx.burst(x, 1.25 * CHIBI_SCALE, z, WIN_SPARK[cp.side])
        }
      }
      pose.look = lookAround(this.time, view.seed)
      // Bonked: dizzy and still, a recoil at the hit, stars over the head. Ours is known when the host's state
      // is (the predictor froze us then), a remote's on the render clock.
      const stun = stunLook(cp.stunAt ?? -1, pred ? renderTick : shownTick, view.stunLook)
      if (stun.on) {
        pose.stance = 0
        pose.sad = Math.max(pose.sad, STUN_SAD)
        pose.look = STUN_WOBBLE * Math.sin(stun.spin * 2)
        pose.lean -= STUN_RECOIL * stun.flinch
      }
      // Hit-stop: the hitter's pose holds a beat on the biggest hits (visual only; the shuttle flies on).
      if (this.time >= view.stopUntil) view.chibi.setPose(pose, this.time)
      view.chibi.setFlash(flashAt(view.flashPeak, this.time - view.hitAt))
      const ch = view.chibi
      view.stars.update(
        stun,
        root.position.x,
        root.position.y + (ch.lift + ch.top) * root.scale.y + STUN_STAR_GAP,
        root.position.z,
        this.fades[i],
      )
    }
    this.dust.update(dt)

    // Shuttle (+ its shadow for depth).
    const ps = prev.shuttle.pos
    const cs = curr.shuttle.pos
    let pos: Vec3 = this.tmp
    let snap: boolean
    if (g0) {
      g0.shuttle.update(dt)
      pos = g0.shuttle.pos
      snap = g0.shuttle.snapped
    } else {
      snap = interpShuttle(ps, cs, a, this.tmp).snap
    }
    this.poseShuttle(curr.phase, pos.x * flip, pos.y, pos.z * flip, snap, dt)
    this.shadow.position.x = pos.x * flip
    this.shadow.position.z = pos.z * flip
    // After players + shuttle are placed: pops and bursts anchor on this frame's positions.
    this.scanEvents(curr)
    const flying = curr.phase === 'rally' && curr.shuttle.lastHitter !== -1 && !snap
    const sp = this.shuttle.position
    const cp = this.view.camera.position
    const v = this.shVel
    const ts = this.trailShot
    const look = trailStyle(ts.kind, ts.grade, ts.power, Math.hypot(v.x, v.y, v.z), this.trailLook)
    const tr = this.trail
    const cam = this.view.camera
    const pxScale = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, this.view.height)
    tr.update(flying, sp.x, sp.y, sp.z, Math.min(dt, TRAIL_MAX_DT), look, cp.x, cp.y, cp.z, pxScale)
    // Perfect trails twinkle at the ribbon's tip (the lowest quality rung skips it).
    if (tr.shown && look.sparkle && this.view.quality.dpr > 1 && this.time >= this.sparkAt) {
      this.sparkAt = this.time + TRAIL_SPARK.every
      this.fx.burst(tr.tip[0], tr.tip[1], tr.tip[2], TRAIL_SPARK.burst)
    }
    this.fx.update(dt)
    this.net.update(dt)
    this.updateHud(curr)

    this.updateRing(curr, flip)
    this.ring.visible =
      this.ringOn &&
      curr.phase === 'rally' &&
      ringShown(this.ringMode, (this.ringLandTick - shownTick) / TICK_RATE)

    this.park.update(cheerLevel(this.rally, this.time - this.pointAt, this.pointHits), this.time, dt)

    this.placeCamera(localX * CAMERA.followX, pos.y, dt)
    this.updateVisibility(curr, dt)
    this.placeBubbles(curr)
    if (import.meta.env.DEV && !this.callsLogged && curr.phase === 'rally') this.logDrawCalls(dt)
    else this.view.render(dt)
  }

  /**
   * Place and orient the shuttlecock (orient.ts) at render-space (x, y, z): cork-down in the server's hand,
   * cork-first along the drawn per-frame movement in flight (what is shown, host or guest alike), tipping
   * onto its side once a point's shuttle is on the floor. A teleport (snap) keeps the last orientation.
   * Lifted just enough that neither cork nor rim goes through the floor. Allocates nothing.
   */
  private poseShuttle(phase: SpState['phase'], x: number, y: number, z: number, snap: boolean, dt: number) {
    const q = this.shuttle.quaternion
    const mode = (this.shMode = shuttleMode(phase, y))
    const moved = this.drawnOk && !snap && dt > 1e-4
    if (mode === 'hand') q.copy(CORK_DOWN)
    else if (mode === 'rest') {
      const d = restingDir(this.headX, this.headZ, this.restDir)
      // Already on the floor when first drawn (joined mid-point): lie down at once.
      turnToward(q, d.x, d.y, d.z, ORIENT.restRate, moved ? dt : this.drawnOk ? 0 : 1, q)
    } else if (moved) {
      const v = this.shVel
      v.x = (x - this.drawn.x) / dt
      v.y = (y - this.drawn.y) / dt
      v.z = (z - this.drawn.z) / dt
      if (Math.hypot(v.x, v.z) >= ORIENT.minSpeed) {
        this.headX = v.x
        this.headZ = v.z
      }
      shuttleOrientation(v, q, dt, q)
    }
    this.drawn.set(x, y, z)
    this.drawnOk = true
    this.shuttle.position.set(
      x,
      Math.max(y, floorClearance(corkAxis(q, this.shAxis).y, SHUTTLE_LOOK_SCALE)),
      z,
    )
  }

  /**
   * Shadows off = the shadow pass stops rendering (no draw calls, no depth fill) and the catcher, its
   * only receiver, hides. The shadow map and light stay configured, so no material's program changes:
   * nothing recompiles, and warm() already compiled the only variant ever used. The chibis' toy rim,
   * clear coat and sheen go with them (strength uniforms only, the programs stay: no recompile either).
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
        for (let n = 0; n < Math.min(s.players.length, this.players.length); n++) {
          const v = this.players[n]
          const airborne = (v.jumpAge >= 0 && v.jumpAge < SMASH.end) || v.arc.lift > 0 || v.arc.dive > 0
          if (splitsOn(e.k, e.side, s.players[n].side) && canSplit(v.gait.speed, v.foot.lunge, airborne))
            v.foot.splitStep()
        }
      // Every event feeds the echo (a serve / whiff / expiry forgets it); only the predicted hit is muted,
      // and our own predicted ability press (ownActPredicted).
      const heard = this.echo.heard(e)
      if (!heard && !(e.k === 'act' && this.ownActEcho(s, e))) {
        const sound = eventSound(e, this.side, this.lastShot, this.spectating ? undefined : this.selfId)
        if (sound) playSound(sound.sound, sound.vol)
      }
      if (e.k === 'hit') {
        this.lastShotBuf.shot = e.shot
        this.lastShotBuf.power = e.power ?? 0
        this.lastShot = this.lastShotBuf
      } else if (e.k === 'serve') this.lastShot = null
      // Into the net: it ripples out from the shuttle, pushed away from whoever hit it (near = +z).
      if (e.k === 'net') this.net.hit(this.shuttle.position.x, s.shuttle.lastHitter === this.side ? 1 : -1)
      if (e.k === 'point') {
        this.pointSide = e.side
        if (this.pointHits >= CHEER.rally) playSound(SHUTTLE_SOUNDS.cheer)
      } else if (e.k === 'hit') {
        this.onHit(s, e, e.grade, e.shot === 'smash', e.power ?? 0, e.act === 'jump')
        this.setTrailShot(e.shot, e.grade, e.power ?? 0)
      } else if (e.k === 'serve') this.setTrailShot(e.shot ?? null, null, 0)
      else if (e.k === 'whiff' && !this.spectating && isOwnEvent(e, this.side, this.selfId))
        this.popAt(this.localIdx, 'miss', false)
      else if (e.k === 'actLand') this.onActLand(s, e.side, e.act, e.tick)
      else if (e.k === 'bonk') this.onBonk(s, e.who)
    }
  }

  /** A racket bonk: the victim squashes; ours also drops the swing and charge visuals (the host did). */
  private onBonk(s: SpState, who: string) {
    const i = s.players.findIndex((p) => p.id === who)
    if (i < 0 || i >= this.players.length) return
    this.players[i].squash.kick(MOTION.kickPerfect)
    if (i === this.localIdx && !this.spectating) this.localSwing('cancel')
  }

  /** True (once) when this `act` event is our own press already heard by ownActPredicted. */
  private ownActEcho(s: SpState, e: { side: 0 | 1; act: AbilityKind; tick: number }): boolean {
    if (this.spectating || this.time - this.lastOwnActAt >= OWN_ACT_ECHO) return false
    if (actorIndex(s.players, { k: 'act', ...e }) !== this.localIdx) return false
    this.lastOwnActAt = -Infinity
    return true
  }

  /** Feet back on the floor: a dust ring (a dive: two puffs along it) and a landing squash. */
  private onActLand(s: SpState, side: 0 | 1, k: AbilityKind, tick: number) {
    const j = actorIndex(s.players, { k: 'actLand', side, act: k, tick })
    if (j < 0 || j >= this.players.length) return
    const view = this.players[j]
    const { x, z } = view.chibi.root.position
    const act = s.players[j].act
    if (k === 'lunge' && act) {
      const L = DUST.land
      const dx = act.dx * this.flip
      const dz = act.dz * this.flip
      for (let n = 1; n <= 2; n++) {
        const d = n * DUST.dive * CHIBI_SCALE
        this.dust.spawn(x + dx * d, z + dz * d, dx * L.speed, dz * L.speed, L.life, L.size)
      }
    } else this.landPuff(x, z)
    view.squash.kick(MOTION.kickPerfect * (k === 'hop' ? 0.5 : 1))
  }

  /**
   * Online guest: our own ability press was just predicted (main.ts, the host's pick on the shown flight),
   * so its jump / dive is heard now; the host's answering `act` event is then skipped (its landing is not).
   */
  ownActPredicted(k: AbilityKind): void {
    const { sound, vol } = abilitySound('act', k, true)
    playSound(sound, vol)
    this.lastOwnActAt = this.time
  }

  /** The local player's jump / lunge cooldown left this frame, 0..1 (0 = ready; spectators 0). */
  abilityCooldown(): number {
    return this.localCd
  }

  /**
   * Online guest: our own hit was just predicted (GuestShuttle.predictHit), so it is heard now, not
   * ~1 RTT later; the host's answering hit event is then skipped (its pops / punch still play).
   */
  ownHitPredicted(h: PredictedHit): void {
    const { sound, vol } = hitSound(h.shot, h.grade, h.power, true)
    playSound(sound, vol)
    this.echo.note(h)
  }

  /** A new shot: the trail regrows from the contact in that shot's look (kind null = a serve). */
  private setTrailShot(kind: ShotKind | null, grade: Grade | null, power: number) {
    const t = this.trailShot
    t.kind = kind
    t.grade = grade
    t.power = power
    this.trail.restart()
  }

  private onHit(
    s: SpState,
    e: { side: 0 | 1; by?: string },
    grade: Exclude<PopKind, 'power' | 'miss'>,
    smash: boolean,
    power: number,
    jump = false,
  ) {
    const j = hitterIndex(s.players, e)
    if (j < 0 || j >= this.players.length) return
    const own = !this.spectating && isOwnEvent(e, this.side, this.selfId)
    const mine = this.spectating || own
    const big = isPowerHit(power)
    this.popAt(j, big ? 'power' : grade, smash)
    // The hit is happening now: a racket still on its way to contact hurries to meet it (a press seen
    // later this frame catches up too: hitAt).
    const view = this.players[j]
    view.hitAt = this.time
    const juice = hitJuice(grade === 'perfect', smash, big)
    view.flashPeak = juice.flash
    if (juice.stop > 0) view.stopUntil = this.time + juice.stop
    view.swing.setDue(0)
    const p = this.shuttle.position
    // A hit with no pending contact seen first (same-tick) can still lunge.
    if (!smash) this.footwork(view, p.x, p.y, p.z, 0, view.pose.happy + view.pose.sad < 0.5, 0)
    if (grade === 'perfect') {
      this.fx.burst(p.x, p.y, p.z, SPARKLE)
      // A snappy stretch-then-squash on the hitter.
      view.squash.kick(MOTION.kickPerfect)
    }
    const boost = 1 + POWER_FX.punch * power
    if (smash) {
      // Keep a leap scheduled from the pending smash; a same-tick hit leaps now.
      view.jumpAge = leapAtHit(view.jumpAge)
      this.fx.burst(p.x, p.y, p.z, SMASH_BURST)
      if (big) this.fx.burst(p.x, p.y, p.z, POWER_BURST)
      this.punch.kick(
        (mine ? PUNCH.kickMine : PUNCH.kickTheirs) *
          (big ? POWER_FX.powerSmash : boost) *
          (jump ? JUMP_PUNCH : 1),
      )
    } else if (power > 0) this.punch.kick(POWER_FX.hitKick * power * (mine ? 1 : 0.5))
    if (big && own) {
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

  /**
   * Scoreboard (+ the flip board by the net) and the "Your serve" badge, touched only when the phase,
   * server, score, our side or the looks change. The opponent's serve shows as the board's shuttle icon.
   */
  private updateHud(s: SpState) {
    let looks = 1
    for (let i = 0; i < s.players.length; i++) looks = looks * 64 + s.players[i].preset
    if (
      s.phase === this.hudPhase &&
      s.server === this.hudServer &&
      s.score[0] === this.hudS0 &&
      s.score[1] === this.hudS1 &&
      this.side === this.hudSide &&
      looks === this.hudLooks
    )
      return
    this.hudPhase = s.phase
    this.hudServer = s.server
    this.hudS0 = s.score[0]
    this.hudS1 = s.score[1]
    this.hudSide = this.side
    this.hudLooks = looks
    const mine = s.phase === 'serve' && !this.spectating && s.server === this.side
    this.hud.setServe(mine ? t('Your serve') : null)
    const view = boardView(s, this.side)
    this.board.update(view)
    this.cards.set(view.left.score, view.right.score)
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
      this.ringOn = false
      return
    }
    const land = predictLanding(s.shuttle)
    const x = land.pos.x * flip
    const z = land.pos.z * flip
    this.ring.position.x = x
    this.ring.position.z = z
    this.ringOn = !land.netHit
    this.ringLandTick = s.tick + land.ticks
    // Coming to my half: bright yellow; going away: faint white.
    const mine = z < 0
    this.ringMat.color.copy(mine ? this.ringColor.mine : this.ringColor.theirs)
    this.ringMat.opacity = mine ? 0.95 : 0.45
  }

  /**
   * Keep the shuttle findable (after placeCamera): every player whose body box covers it on screen fades
   * toward see-through, each by its own cover, in any phase (a server's own body hides the serve), local,
   * opponent or spectated alike (visibility.ts). Works for any number of players; allocates nothing.
   */
  private updateVisibility(curr: SpState, dt: number) {
    const cam = this.view.camera
    cam.updateMatrixWorld()
    const v = this.visP
    const occ = this.occ
    occ.fill(0)
    /** Most any player's screen box overlaps the shuttle, in front or behind (the halo's no-go zone). */
    let overlap = 0
    // Shuttle: camera-space depth, then NDC.
    v.copy(this.shuttle.position).applyMatrix4(cam.matrixWorldInverse)
    const sDepth = -v.z
    v.applyMatrix4(cam.projectionMatrix)
    const sx = v.x
    const sy = v.y
    this.shNdcX = sx
    this.shNdcY = sy
    this.shOn = sDepth > 0 && this.shuttle.visible
    if (sDepth > 0 && this.shuttle.visible) {
      const r = this.visRect
      const tanY = Math.tan((cam.fov * Math.PI) / 360)
      for (let i = 0; i < Math.min(curr.players.length, this.players.length); i++) {
        const chibi = this.players[i].chibi
        const root = chibi.root
        const k = root.scale.y
        const { x, y, z } = root.position
        // The box rides on the rig (a jump lifts it): Chibi.lift is in the root's scaled space.
        const b = bodyBox(y, chibi.lift * k, chibi.top, k, this.body)
        // Body centre: depth + NDC x; bottom / top: NDC y.
        v.set(x, b.mid, z).applyMatrix4(cam.matrixWorldInverse)
        r.depth = -v.z
        if (r.depth <= 0) continue
        v.applyMatrix4(cam.projectionMatrix)
        const hw = (VIS.body.halfW * k) / (r.depth * tanY * cam.aspect)
        r.x0 = v.x - hw
        r.x1 = v.x + hw
        v.set(x, b.y0, z).project(cam)
        r.y0 = v.y
        v.set(x, b.y1, z).project(cam)
        r.y1 = v.y
        if (r.y1 < r.y0) {
          const t = r.y0
          r.y0 = r.y1
          r.y1 = t
        }
        occ[i] = occlusion(sx, sy, sDepth, r)
        overlap = Math.max(overlap, occlusion(sx, sy, Infinity, r))
      }
    }
    const haloMat = this.halo.material
    haloMat.opacity = haloOpacity(overlap, this.shMode === 'hand')
    this.halo.visible = haloMat.opacity > 0.01
    stepFades(occ, this.fades, dt)
    for (let i = 0; i < this.players.length; i++) {
      const f = this.fades[i]
      this.players[i].chibi.setOpacity(f > 0.995 ? 1 : f)
    }
  }

  /** Shows a reaction bubble over `playerId`'s chibi. False when there is no match state, no such player or an unknown id. */
  react(playerId: string, reactionId: string): boolean {
    const players = this.smooth?.curr?.players
    if (!players) return false
    const i = players.findIndex((p) => p.id === playerId)
    if (i < 0 || i >= this.players.length) return false
    return this.bubbles.show(i, reactionId, this.time)
  }

  /** Per frame, after updateVisibility: each live bubble hangs above its chibi's head (follows the jump). Allocates only for live bubbles. */
  private placeBubbles(curr: SpState) {
    const cam = this.view.camera
    const w = this.view.width
    const h = this.view.height
    const sh = this.shOn ? this.bubSh : null
    if (sh) {
      sh.x = ((this.shNdcX + 1) / 2) * w
      sh.y = ((1 - this.shNdcY) / 2) * h
    }
    for (let i = 0; i < Math.min(curr.players.length, this.players.length); i++) {
      if (!this.bubbles.live(i)) continue
      const chibi = this.players[i].chibi
      const root = chibi.root
      const v = this.visP
      v.set(
        root.position.x,
        headAnchorY(root.position.y, chibi.lift, chibi.top, root.scale.y),
        root.position.z,
      )
      v.applyMatrix4(cam.matrixWorldInverse)
      const depth = -v.z
      v.applyMatrix4(cam.projectionMatrix)
      this.bubbles.place(i, this.time, toScreen(v, depth, w, h), this.fades[i], sh)
    }
  }

  /** Clamps the wanted tweak to what keeps the court framed. Allocates: call on change only, never per frame. */
  private refitCamera() {
    this.camTweak = clampCameraTweak(this.camWant, {
      aspect: this.view.width / Math.max(1, this.view.height),
      tight: this.tight,
      court: this.court,
    })
  }

  /**
   * Every frame: tells the guest predictor the match's court. On a different court size (only then) it
   * reshapes the court, net and park and refits the camera's tweak clamp.
   */
  private setCourt(court: CourtDims) {
    if (this.predictor) this.predictor.court = court
    const c = this.court
    if (court.halfLen === c.halfLen && court.halfWidth === c.halfWidth && court.shortLine === c.shortLine)
      return
    this.court = court
    this.shapeCourt(court)
    this.refitCamera()
  }

  /** Damped: x slides with the local player, the look-at rises with the shuttle (see world.ts). */
  private placeCamera(targetX: number, shuttleY: number, dt = 1) {
    this.camX += (targetX - this.camX) * (1 - Math.exp(-6 * dt))
    this.focus = dampFocus(this.focus, shuttleY, dt)
    const p = cameraPose(this.camX, this.focus, this.pose, this.tight, this.camTweak, this.court)
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
