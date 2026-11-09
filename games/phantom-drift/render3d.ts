// Phantom Drift in 3D: chase camera, neon rift, bloom. Reads interpolated sim
// state only; gameplay lives in sim.ts.
//
// Built once per page and kept: `warm()` (from the menu's preload) compiles
// every shader up front, and each run just `attach`es it to the stage, so
// starting a run never freezes.

import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  Sprite,
  Vector3,
  type LineBasicMaterial,
  type Object3D,
} from 'three'
import { Shake } from '@forge/fx/shake'
import { clamp, damp, ease, lerp, prefersReducedMotion } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import { telegraph } from '@forge/reflex'
import {
  createOverlay2D,
  Chunks3D,
  createScene3D,
  KeyedPool,
  Particles3D,
  type Overlay2D,
  type Scene3D,
} from '@forge/render3d'
import {
  GHOST_BRIGHTNESS,
  GHOST_HEAD,
  GHOST_PIVOT,
  GHOST_SIZE,
  makeAfterimage,
  makeCrack,
  makeFaller,
  makeGhost,
  makeHeart,
  makeRibbon,
  makeShard,
  makeSweeper,
  makeWall,
  makeWisp,
  paintGhost,
} from './actors'
import { DEFAULT_CHARACTER, type Character } from './characters'
import { Blinker, ghostRig, runPose, runPoseOut, type RunInput } from './ghost-motion'
import { DriftHud } from './hud'
import type { Moment } from './moments'
import { ambienceAt, riftHue } from './ambience'
import { C } from './palette'
import { FAR, Scenery } from './scenery'
import {
  DEATH_TICKS,
  SPAWN_Z,
  speedLevel as speedLevelOf,
  type DriftEvent,
  type DriftState,
  type Faller,
  type Obj,
} from './sim'
import type { DriftView } from './view'
import {
  CAM_BACK,
  CAM_HEIGHT,
  cameraRig,
  fitView,
  LANE_W,
  laneX,
  trackHalfWidth,
  worldZ,
  Z_SCALE,
} from './world'

const AFTERIMAGES = 5
const CRACKS = 4
const CRACK_LIFE = 2.2
/** Fraction of the dying phase spent swelling before the ghost shatters. */
const SHATTER_AT = 0.14
const PHANTOM_COLOR = new Color(C.phantom)
/** Height of the ghost's skirt hem above the track (it floats just over it). */
const GHOST_Y = 0.16
/** The ribbon leaves the ghost this high above its hem. */
const RIBBON_Y = 0.26
const RIBBON_POINTS = 16

/** Named descendants of a model, looked up once instead of every frame. */
function part<T extends Object3D = Object3D>(g: Object3D, name: string): T {
  const cache = (g.userData.parts ??= {}) as Record<string, Object3D>
  return (cache[name] ??= g.getObjectByName(name)!) as T
}

const FACTORIES: Record<Obj['kind'], () => Group> = {
  shard: makeShard,
  wisp: makeWisp,
  heart: makeHeart,
  wall: makeWall,
  sweeper: makeSweeper,
}

interface Crack {
  mesh: Mesh
  age: number
}

export class Drift3D implements DriftView {
  readonly surface: HTMLElement
  private view: Scene3D
  private overlay: Overlay2D
  private smooth: Smoothed<DriftState> | null = null
  /** Offscreen home while no run is showing (keeps the GL context alive). */
  private parking: HTMLElement
  private hud = new DriftHud()
  private scenery: Scenery
  private fx = new Particles3D(900)
  private shake = new Shake(0.35)
  private ghost = makeGhost()
  private ghostLight = new PointLight(C.wisp, 2.5, 8, 1.6)
  private hemi = new HemisphereLight('#6fa8ff', '#05040e', 1.1)
  private afterimages: Sprite[] = []
  private history: number[] = []
  private ribbon = makeRibbon(RIBBON_POINTS)
  private ribbonX: number[] = []
  private rig = ghostRig()
  private pose = runPoseOut()
  private runIn: RunInput = { time: 0, dt: 0, slide: 0, speed: 0, eyes: 1, glow: 0, reduced: false }
  private blink = new Blinker(5)
  private character: Character = DEFAULT_CHARACTER
  private trailColor = new Color(C.wisp)
  /** The character's rim: the ghost's light and afterimages. */
  private rim = new Color(C.wisp)
  private cracks: Crack[] = []
  private chunks = new Chunks3D(
    new MeshStandardMaterial({
      color: '#ffffff',
      emissive: C.faller,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    }),
  )
  /** Glowing shards of the ghost when it dies. */
  private ghostBits = new Chunks3D(
    new MeshStandardMaterial({ color: '#dff6ff', emissive: C.wisp, emissiveIntensity: 1.2, roughness: 0.2 }),
    60,
  )
  private shattered = false
  private before = new Map<number, Obj>()
  private streakBoost = 0
  private objects: KeyedPool<Obj, Group>
  private fallers: KeyedPool<Faller, Group>
  private time = 0
  private lanes = 3
  private hue = riftHue(0)
  private sunLight = new DirectionalLight('#ffffff', 1.6)
  private phantom = 0
  private camX = 0
  private fovKick = 0
  private lastTravel = 0
  private tmp = new Vector3()

  constructor() {
    this.parking = document.createElement('div')
    // About the stage's size, so warm-up renders allocate near-final buffers
    // (no big reallocation when a run starts), but never seen.
    this.parking.style.cssText =
      'position:fixed;left:-10000px;top:0;width:100vw;height:85vh;pointer-events:none;opacity:0'
    document.body.appendChild(this.parking)
    this.view = createScene3D(this.parking, {
      fov: 58,
      far: FAR * 2,
      maxDpr: 2,
      bloom: { strength: 0.8, radius: 0.45, threshold: 0.62 },
    })
    this.surface = this.view.root
    this.overlay = createOverlay2D(this.view.root)
    const { scene } = this.view
    // Fog starts well out, so hazards read from far away.
    scene.fog = new Fog('#000', FAR * 0.3, FAR)
    this.scenery = new Scenery(scene)

    this.sunLight.position.set(3, 9, 7)
    scene.add(this.hemi, this.sunLight)

    // The light lives in the scene, not on the ghost: hiding a light changes
    // the light count, which recompiles every lit shader (a ~300 ms freeze
    // at the first death). It follows the ghost and dims to 0 instead.
    scene.add(this.ghost.sprite, this.ghostLight, this.ribbon.mesh)
    for (let i = 0; i < AFTERIMAGES; i++) {
      const m = makeAfterimage(this.ghost.texture)
      this.afterimages.push(m)
      scene.add(m)
    }
    for (let i = 0; i < CRACKS; i++) {
      const mesh = makeCrack()
      mesh.visible = false
      this.cracks.push({ mesh, age: CRACK_LIFE })
      scene.add(mesh)
    }
    scene.add(this.fx.points, this.chunks.mesh, this.ghostBits.mesh)

    const pool = <T>(kind: (t: T) => string, make: (kind: string) => Group) =>
      new KeyedPool<T, Group>({
        kind,
        create: (k) => {
          const g = make(k)
          scene.add(g)
          return g
        },
        show: (g, on) => (g.visible = on),
      })
    this.objects = pool<Obj>(
      (o) => o.kind,
      (k) => FACTORIES[k as Obj['kind']](),
    )
    this.fallers = pool<Faller>(() => 'faller', makeFaller)

    this.view.onResize((w, h) => {
      this.overlay.resize(w, h)
      this.fx.setScale(h * this.view.renderer.getPixelRatio())
    })
  }

  /**
   * Compile every shader and upload every mesh now, so nothing stalls when it
   * first appears in a run: one of each object, all effects, then two frames.
   */
  async warm(): Promise<void> {
    const z = -12
    const kinds: Obj['kind'][] = ['shard', 'wisp', 'heart', 'wall', 'sweeper']
    const samples = kinds.map((kind, i): Obj => ({
      id: -1 - i,
      kind,
      row: 0,
      z: 10,
      lane: i % 3,
      gap: 1,
      from: 0,
      to: 2,
    }))
    const views = this.objects.sync(samples, (o) => o.id)
    samples.forEach((o, i) => views.get(o.id)!.position.set(laneX(i % 3, 3), 0, z))
    const faller: Faller = { id: -9, lane: 1, slamAt: 0, tele: 30 }
    this.fallers
      .sync([faller], (f) => f.id)
      .get(-9)!
      .position.set(0, 0, z)
    this.crack(0)
    this.fx.burst(0, 1, z, { count: 4 })
    this.chunks.burst(0, 1, z, { count: 2 })
    this.ghostBits.burst(0, 1, z, { count: 2 })
    const cam = this.view.camera
    cam.position.set(0, 4, 8)
    cam.lookAt(0, 0, z)
    this.scenery.update(0, 0, 3, this.hue, 0, 0, ambienceAt(0))
    // The ghost card's texture gets uploaded with the rest (characters only redraw it).
    paintGhost(this.ghost, this.character, this.pose)
    await this.view.renderer.compileAsync(this.view.scene, cam)
    // Draw for real twice: uploads geometry/textures and builds post buffers.
    this.view.render(1 / 60)
    this.view.render(1 / 60)
    this.setCharacter(this.character)
    this.objects.clear()
    this.fallers.clear()
    this.reset()
  }

  /** Show this view on the stage for a run. */
  attach(stage: HTMLElement, smooth: Smoothed<DriftState>, character = DEFAULT_CHARACTER): this {
    this.smooth = smooth
    this.setCharacter(character)
    this.reset()
    stage.appendChild(this.view.root)
    return this
  }

  /** Back to the offscreen parking spot between runs (nothing is destroyed). */
  destroy(): void {
    this.smooth = null
    this.objects.clear()
    this.fallers.clear()
    this.parking.appendChild(this.view.root)
  }

  /** Dress the ghost (its card is redrawn every frame: nothing compiles). */
  setCharacter(c: Character): void {
    this.character = c
    this.rim.set(c.colors.rim)
    this.trailColor.set(c.colors.trail)
    ;(this.ghostBits.mesh.material as MeshStandardMaterial).emissive.set(c.colors.rim)
  }

  /** Forget everything from the last run. */
  private reset() {
    this.hud = new DriftHud()
    this.history = []
    this.lastTravel = 0
    this.fovKick = 0
    this.phantom = 0
    this.streakBoost = 0
    this.shattered = false
    this.view.glitch = 0
    this.ghost.sprite.visible = true
    this.ghost.material.color.setScalar(GHOST_BRIGHTNESS)
    this.ribbonX = []
    this.rig = ghostRig()
    for (const c of this.cracks) {
      c.age = CRACK_LIFE
      c.mesh.visible = false
    }
    this.fx.update(10)
    this.chunks.update(10)
    this.ghostBits.update(10)
  }

  banner(m: Moment): void {
    this.hud.banner(m)
  }

  hudPoint(clientX: number, clientY: number) {
    const r = this.surface.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top, w: r.width, h: r.height }
  }

  // ---------- Events → effects ----------

  onState(s: DriftState): void {
    for (const e of s.events) this.onEvent(e, s)
  }

  private ghostX(s: DriftState) {
    return laneX(s.player.x, this.lanes)
  }

  private screen(x: number, y: number, z: number): [number, number] {
    this.tmp.set(x, y, z).project(this.view.camera)
    return [((this.tmp.x + 1) / 2) * this.view.width, ((1 - this.tmp.y) / 2) * this.view.height]
  }

  /** Leave a glowing crack on the track where a block slammed. */
  private crack(x: number) {
    const c = this.cracks.reduce((a, b) => (b.age > a.age ? b : a))
    c.age = 0
    c.mesh.position.set(x, 0.03, 0)
    c.mesh.rotation.z = Math.random() * Math.PI * 2
    c.mesh.visible = true
  }

  private onEvent(e: DriftEvent, s: DriftState) {
    const gx = this.ghostX(s)
    switch (e.type) {
      case 'wisp': {
        const x = laneX(e.lane, this.lanes)
        this.fx.burst(x, 1, 0, { count: 22, color: [C.wisp, '#ffffff'], speed: 6, life: 0.5, size: 0.35 })
        const [sx, sy] = this.screen(x, 2.2, 0)
        this.hud.text(sx, sy, `+${e.points}`, C.wisp, 28)
        const [bx, by] = this.screen(x, 1, 0)
        this.hud.spark(bx, by)
        break
      }
      case 'nearMiss': {
        const x = laneX(e.lane, this.lanes)
        const dir = Math.sign(gx - x) || 1
        this.fx.burst(lerp(x, gx, 0.45), 1, 0, {
          count: 34,
          color: [C.gold, '#ffffff'],
          speed: 9,
          life: 0.45,
          size: 0.28,
          dir: [dir, 0.4, 0.6],
          spread: 0.55,
        })
        const [sx, sy] = this.screen(gx, 2.6, 0)
        this.hud.text(sx, sy, `+${e.points}`, C.gold, 38)
        this.shake.add(0.18)
        this.fovKick = Math.max(this.fovKick, 4)
        break
      }
      case 'hit':
        this.fx.burst(gx, 1, 0, {
          count: 50,
          color: [C.shard, '#ffffff', C.ghost],
          speed: 9,
          life: 0.7,
          size: 0.4,
        })
        this.shake.add(0.8)
        this.view.glitch = 1
        this.hud.hit()
        break
      case 'slam': {
        const x = laneX(e.lane, this.lanes)
        // Dust kicked out low, solid chunks bouncing off, a crack left behind.
        this.fx.burst(x, 0.2, 0, {
          count: 40,
          color: [C.faller, '#ffffff', '#8a7cff'],
          speed: 9,
          life: 0.55,
          size: 0.35,
          gravity: 6,
          dir: [0, 0.25, 0],
          spread: 0.9,
        })
        this.chunks.burst(x, 0.5, 0, { count: 14, color: C.faller, speed: 7, size: 0.32 })
        this.crack(x)
        this.shake.add(0.5)
        this.fovKick = Math.max(this.fovKick, 2)
        break
      }
      case 'phantom':
        this.fx.burst(gx, 1, 0, {
          count: 70,
          color: [C.phantom, '#ffffff', C.wisp],
          speed: 8,
          life: 0.9,
          size: 0.4,
        })
        // A spiral of light lifting off the ghost.
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          this.fx.burst(gx + Math.cos(a) * 0.8, 0.3 + i * 0.07, Math.sin(a) * 0.8, {
            count: 2,
            color: [C.phantom, '#ffffff'],
            speed: 2,
            life: 0.9,
            size: 0.3,
            dir: [0, 1, 0],
            spread: 0.3,
          })
        }
        this.fovKick = 10
        break
      case 'charged':
        this.fx.burst(gx, 1.1, 0, { count: 30, color: [C.phantom, C.wisp], speed: 4, life: 0.8, size: 0.3 })
        break
      case 'heart': {
        // Grabbed: a big pink pop on the track, and the heart flies into the HUD.
        const x = laneX(e.lane, this.lanes)
        this.fx.burst(x, 1.1, 0, {
          count: 60,
          color: [C.heart, '#ffffff', '#ffb3c7'],
          speed: 8,
          life: 0.8,
          size: 0.4,
        })
        this.fx.burst(x, 1.1, 0, {
          count: 16,
          color: ['#ffffff', C.gold],
          speed: 3,
          life: 0.9,
          size: 0.3,
          dir: [0, 1, 0],
          spread: 0.5,
        })
        const [sx, sy] = this.screen(x, 1.1, 0)
        this.hud.heartPickup(sx, sy)
        this.shake.add(0.15)
        this.fovKick = Math.max(this.fovKick, 4)
        break
      }
      case 'tier':
        this.streakBoost = 1
        this.hud.tier()
        this.fovKick = Math.max(this.fovKick, 6)
        break
      case 'lanes':
        this.shake.add(0.35)
        break
      case 'die':
        // The ghost swells and flickers first; the shatter follows in frame().
        this.hud.clearBanners()
        this.view.glitch = 0.6
        this.shake.add(0.9)
        this.hud.hit()
        this.fx.burst(gx, 1, 0, { count: 40, color: [C.shard, '#ffffff'], speed: 8, life: 0.6, size: 0.4 })
        break
      case 'multiplier': {
        this.hud.multiplier()
        const [sx, sy] = this.screen(gx, 3, 0)
        this.hud.text(sx, sy, `×${e.mult}`, C.gold, 40)
        this.fx.burst(gx, 1.2, 0, { count: 30, color: [C.gold, '#ffffff'], speed: 6, life: 0.6, size: 0.3 })
        break
      }
    }
  }

  // ---------- Frame ----------

  frame(dt: number): void {
    this.time += dt
    const curr = this.smooth?.curr
    if (!this.smooth || !curr) {
      this.scenery.update(this.time, 0, 3, this.hue, 0, 0, ambienceAt(0))
      this.view.render(dt)
      return
    }
    const prev = this.smooth.prev && this.smooth.prev.tick === curr.tick - 1 ? this.smooth.prev : null
    const a = prev ? this.smooth.alpha() : 1
    const p = curr.player
    const phantom = curr.tick < p.phantomUntil

    this.lanes = damp(this.lanes, curr.lanes, 5, dt)
    // Mood follows play time (sim ticks), so it freezes on pause.
    const seconds = (curr.tick + a) / 60
    this.hue = riftHue(seconds)
    const sky = ambienceAt(seconds)
    this.phantom = damp(this.phantom, phantom ? 1 : 0, 8, dt)
    // 0 alive … 1 at the end of the dying phase.
    const dying = curr.diedAt === null ? 0 : clamp((curr.tick + a - curr.diedAt) / DEATH_TICKS, 0, 1)
    const travel = (prev ? lerp(prev.dist, curr.dist, a) : curr.dist) * Z_SCALE
    const moved = Math.max(0, travel - this.lastTravel)
    this.lastTravel = travel
    const speedLevel = speedLevelOf(curr.speed)

    this.streakBoost = damp(this.streakBoost, 0, 2.5, dt)
    // Dying: the neon powers down.
    this.scenery.power = 1 - 0.75 * ease.outCubic(dying)
    this.scenery.update(
      this.time,
      travel,
      this.lanes,
      this.hue,
      Math.min(1, speedLevel + this.streakBoost),
      this.phantom,
      sky,
    )
    const fog = this.view.scene.fog as Fog
    fog.color.copy(this.scenery.fogColor)
    this.hemi.color.setHSL(this.hue / 360, lerp(0.8, 0.3, sky.daylight), lerp(0.6, 0.8, sky.daylight))
    this.hemi.intensity = lerp(1.1, 2.4, sky.daylight)
    this.sunLight.intensity = lerp(1.6, 2.6, sky.daylight)
    // Daylight needs less glow to read; night keeps the neon bloom.
    this.view.setBloom(
      lerp(0.8, 0.35, sky.daylight) * (1 - 0.6 * dying) + (dying > 0 && dying < 0.2 ? 0.6 : 0),
    )

    const gx = laneX(prev ? lerp(prev.player.x, p.x, a) : p.x, this.lanes)
    const tx = laneX(p.target, this.lanes)
    if (dying > 0) this.drawDeath(gx, dying)
    else this.drawGhost(curr, gx, tx, phantom, dt, speedLevel)
    this.drawObjects(curr, prev, a)
    this.drawFallers(curr, curr.tick + a)
    this.updateCracks(dt, moved)
    this.fx.update(dt, moved)
    this.chunks.update(dt, moved)
    this.ghostBits.update(dt, 0, 3)
    this.shake.update(dt)
    this.updateCamera(dt, gx, tx, speedLevel, dying)

    if (prefersReducedMotion()) {
      this.fovKick = 0
      this.view.glitch = 0
    }
    this.view.glitch = damp(this.view.glitch, 0, 5, dt)
    this.view.render(dt)

    const o = this.overlay
    o.begin()
    if (this.phantom > 0.01) this.phantomVignette(o.ctx, o.width, o.height)
    this.hud.draw(o.ctx, o.width, o.height, curr, dt)
    // Dying: the screen sinks into the dark (over the HUD too, fading it out).
    if (dying > 0) this.deathFade(o.ctx, o.width, o.height, dying)
  }

  /** The ghost swells and flickers, then bursts into glowing shards that float up. */
  private drawDeath(gx: number, k: number) {
    const { sprite, material } = this.ghost
    for (const m of this.afterimages) m.visible = false
    this.ribbon.mesh.visible = false
    const base = GHOST_Y + Math.min(1, k / SHATTER_AT) * 0.3
    if (k < SHATTER_AT) {
      const t = k / SHATTER_AT
      // Keeps its last pose, skirt still rippling, and burns white-hot (past 1: it blooms).
      this.pose.time = this.time
      paintGhost(this.ghost, this.character, this.pose)
      this.placeGhost(gx, base, 1 + 0.35 * ease.inCubic(t))
      sprite.visible = Math.floor(this.time * 30) % 2 === 0
      material.color.setScalar(GHOST_BRIGHTNESS * (1 + 4 * t))
      material.opacity = 1
      this.followLight()
      return
    }
    if (!this.shattered) {
      this.shattered = true
      sprite.visible = false
      this.ghostLight.intensity = 0
      const y = base + GHOST_HEAD
      const rim = this.character.colors.rim
      this.ghostBits.burst(gx, y, 0, { count: 26, color: '#dff6ff', speed: 7, size: 0.28, life: 1.7 })
      this.fx.burst(gx, y, 0, {
        count: 90,
        color: [rim, '#ffffff', C.phantom],
        speed: 9,
        life: 1.1,
        size: 0.45,
      })
      this.shake.add(0.7)
      this.view.glitch = 0.35
    }
    // Wisps of the ghost drifting upward as the world winds down.
    if (Math.random() < 0.6 * (1 - k))
      this.fx.burst(gx + (Math.random() - 0.5) * 1.5, 0.4 + Math.random(), 0, {
        count: 1,
        color: [this.character.colors.rim, C.phantom],
        speed: 1.5,
        life: 1.2,
        size: 0.3,
        dir: [0, 1, 0],
        spread: 0.3,
      })
  }

  private deathFade(ctx: CanvasRenderingContext2D, w: number, h: number, k: number) {
    const flash = Math.max(0, 1 - k / 0.08)
    if (flash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.45 * flash})`
      ctx.fillRect(0, 0, w, h)
    }
    const dark = 0.65 * ease.inOutCubic(Math.min(1, k * 1.2))
    const g = ctx.createRadialGradient(
      w / 2,
      h * 0.7,
      Math.min(w, h) * 0.1,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    )
    g.addColorStop(0, `rgb(6 4 18 / ${dark * 0.55})`)
    g.addColorStop(1, `rgb(6 4 18 / ${Math.min(0.92, dark * 1.35)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  /** Stand the ghost's card on `base` (its hem's height), `k` times its size. */
  private placeGhost(x: number, base: number, k: number) {
    const { sprite } = this.ghost
    sprite.position.set(x, base + GHOST_PIVOT * k, 0)
    sprite.scale.set(GHOST_SIZE * k, GHOST_SIZE * k, 1)
  }

  /** Keep the ghost's glow at its head, a little in front of it. */
  private followLight() {
    const { sprite } = this.ghost
    const k = sprite.scale.x / GHOST_SIZE
    this.ghostLight.position.set(
      sprite.position.x,
      sprite.position.y + (GHOST_HEAD - GHOST_PIVOT) * k,
      0.6 * k,
    )
  }

  private drawGhost(s: DriftState, gx: number, tx: number, phantom: boolean, dt: number, speed: number) {
    const { sprite, material } = this.ghost
    const slide = tx - gx
    // Seen from behind: bob, lean into a slide, the face peeking round towards
    // the lane it moves into, a little shorter at speed (see runPose).
    const reduced = prefersReducedMotion()
    const input = this.runIn
    input.time = this.time
    input.dt = dt
    input.slide = slide / LANE_W
    input.speed = speed
    input.eyes = reduced ? 1 : this.blink.update(dt)
    input.reduced = reduced
    const pose = runPose(this.rig, input, this.pose)
    paintGhost(this.ghost, this.character, pose, this.phantom > 0.5 ? C.phantom : undefined)
    this.placeGhost(gx, GHOST_Y + pose.lift, 1)

    const invuln = s.tick < s.player.invulnUntil && !phantom
    sprite.visible = !(invuln && Math.floor(this.time * 14) % 2 === 0)
    material.color.setScalar(GHOST_BRIGHTNESS)
    material.opacity = lerp(1, 0.5 + 0.15 * Math.sin(this.time * 22), this.phantom)
    this.ghostLight.color.copy(this.rim).lerp(PHANTOM_COLOR, this.phantom)
    this.ghostLight.intensity = 2.5 + this.phantom * 3
    this.followLight()

    // Afterimages: more of them in Phantom or mid-slide.
    this.history.unshift(gx)
    this.history.length = Math.min(this.history.length, AFTERIMAGES * 3 + 1)
    const strength = Math.max(this.phantom, clamp(Math.abs(slide) / 2, 0, 1))
    this.afterimages.forEach((m, i) => {
      const hx = this.history[(i + 1) * 3] ?? gx
      m.position.set(hx, sprite.position.y, -0.15 * (i + 1))
      m.scale.copy(sprite.scale)
      m.material.opacity = strength * 0.22 * (1 - i / AFTERIMAGES)
      m.material.color.copy(this.ghostLight.color)
      m.visible = m.material.opacity > 0.01
    })
    this.drawRibbon(gx, GHOST_Y + RIBBON_Y + pose.lift, strength, sprite.visible)

    // A full meter: the ghost sheds sparkles, ready to go Phantom.
    if (s.player.charge >= s.perks.phantomCost && !phantom && Math.random() < 0.5)
      this.fx.burst(gx + (Math.random() - 0.5), 0.6 + Math.random() * 1.2, 0, {
        count: 1,
        color: C.phantom,
        speed: 1.2,
        life: 0.7,
        size: 0.25,
        dir: [0, 1, 0],
        spread: 0.4,
      })
  }

  /** The glowing ribbon: where the ghost has been, streaming back from its tail. */
  private drawRibbon(gx: number, y: number, strength: number, visible: boolean) {
    const r = this.ribbon
    r.mesh.visible = visible
    this.ribbonX.unshift(gx)
    if (this.ribbonX.length > r.points) this.ribbonX.length = r.points
    for (let i = 0; i < r.points; i++) {
      const k = i / (r.points - 1)
      const x = this.ribbonX[i] ?? gx
      const w = 0.02 + 0.13 * (1 - k)
      const z = 0.2 + i * 0.13
      const ry = y + 0.2 - k * 0.12
      r.position.setXYZ(i * 2, x, ry + w, z)
      r.position.setXYZ(i * 2 + 1, x, ry - w, z)
    }
    r.position.needsUpdate = true
    r.material.color.copy(this.trailColor).lerp(PHANTOM_COLOR, this.phantom)
    r.material.opacity = 0.25 + 0.45 * strength
  }

  private drawObjects(curr: DriftState, prev: DriftState | null, a: number) {
    const before = this.before
    before.clear()
    if (prev) for (const o of prev.objects) before.set(o.id, o)
    const views = this.objects.sync(curr.objects, (o) => o.id)
    for (const o of curr.objects) {
      const g = views.get(o.id)!
      const b = before.get(o.id)
      const z = b ? lerp(b.z, o.z, a) : o.z
      const lane = b ? lerp(b.lane, o.lane, a) : o.lane
      const wz = worldZ(z)
      // Full size from the start: they emerge from the far fog, readable early.
      g.scale.setScalar(z > SPAWN_Z - 2 ? 0.85 : 1)
      if (o.kind === 'wall') {
        g.position.set(0, 0, wz)
        this.layoutWall(g, o.gap!, curr.lanes)
        continue
      }
      g.position.set(laneX(lane, this.lanes), 0, wz)
      if (o.kind === 'shard') {
        const spin = part(g, 'spin')
        spin.rotation.set(this.time * 0.9 + o.id, this.time * 1.4 + o.id, 0)
        // The core throbs: alive and dangerous.
        part(g, 'heart').scale.setScalar(1 + 0.35 * Math.max(0, Math.sin(this.time * 6 + o.id)))
      } else if (o.kind === 'wisp') {
        const y = 1 + Math.sin(this.time * 5 + o.id) * 0.18
        part(g, 'ball').position.y = y
        const halo = part<Sprite>(g, 'halo')
        halo.position.y = y
        halo.scale.setScalar(1.6 + Math.sin(this.time * 9 + o.id) * 0.25)
        for (let i = 0; i < 3; i++) {
          const a = this.time * 4 + (i / 3) * Math.PI * 2 + o.id
          part(g, `orb${i}`).position.set(Math.cos(a) * 0.55, y + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.55)
        }
        const trail = part<Sprite>(g, 'trail')
        trail.position.set(0, y, 0.9)
        trail.scale.set(0.7, 0.7, 1)
      } else if (o.kind === 'heart') {
        // Bobs, sways to show off its shine, and beats like the HUD hearts.
        const y = 1.1 + Math.sin(this.time * 3 + o.id) * 0.15
        const body = part(g, 'body')
        body.position.y = y
        body.rotation.y = Math.sin(this.time * 2 + o.id) * 0.5
        body.scale.setScalar(1.25 * (1 + 0.1 * Math.max(0, Math.sin(this.time * 7))))
        const halo = part<Sprite>(g, 'halo')
        halo.position.y = y
        halo.scale.setScalar(2.3 + Math.sin(this.time * 7) * 0.3)
        for (let i = 0; i < 2; i++) {
          const a = this.time * 3 + i * Math.PI + o.id
          part(g, `orb${i}`).position.set(Math.cos(a) * 0.75, y + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.75)
        }
      } else if (o.kind === 'sweeper') {
        part(g, 'saw').rotation.z = -this.time * 12
        // Sparks where the blade bites the track.
        if (z < SPAWN_Z * 0.8 && Math.random() < 0.6)
          this.fx.burst(g.position.x + 0.3, 0.15, wz, {
            count: 2,
            color: [C.sweeper, '#ffe9a8'],
            speed: 6,
            life: 0.35,
            size: 0.18,
            gravity: 10,
            dir: [1, 0.6, 0.4],
            spread: 0.5,
          })
        for (let i = 0; i < 7; i++) {
          const t = (i + 1) / 8
          const dot = part(g, `dot${i}`)
          const dl = lerp(lane, o.to!, t)
          dot.position.set(laneX(dl, this.lanes) - g.position.x, 0.15, worldZ(lerp(z, 0, t)) - wz)
        }
      }
    }
  }

  private layoutWall(g: Group, gap: number, lanes: number) {
    for (let l = 0; l < 5; l++) {
      const slab = part(g, `slab${l}`)
      slab.visible = l < lanes && l !== gap
      slab.position.x = laneX(l, this.lanes)
    }
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 12)
    const body = (part(g, 'slab0').children[0] as Mesh).material as ShaderMaterial
    body.uniforms.time.value = this.time
    const chevrons = part(g, 'chevrons')
    chevrons.position.x = laneX(gap, this.lanes)
    for (let i = 0; i < 3; i++) {
      // Light up one after another, running forward through the gap.
      const c = part<LineSegments>(chevrons, `chev${i}`)
      ;(c.material as LineBasicMaterial).opacity =
        0.25 + 0.75 * Math.max(0, Math.sin(this.time * 8 - i * 1.2))
    }
    const frame = part<LineSegments>(g, 'gap')
    frame.position.x = laneX(gap, this.lanes)
    ;(frame.material as LineBasicMaterial).opacity = pulse
    const glow = part<Mesh>(g, 'gapGlow')
    glow.position.x = frame.position.x
    ;(glow.material as MeshBasicMaterial).opacity = 0.3 + 0.4 * pulse
  }

  private drawFallers(s: DriftState, now: number) {
    const views = this.fallers.sync(s.fallers, (f) => f.id)
    for (const f of s.fallers) {
      const g = views.get(f.id)!
      const { progress, fired } = telegraph(f.slamAt, f.tele, now)
      g.position.set(laneX(f.lane, this.lanes), 0, 0)
      // Hover and shake high up for the first half, then drop hard.
      const fall = clamp((progress - 0.5) / 0.5, 0, 1)
      const y = fired ? 0.65 : lerp(9 + Math.sin(this.time * 4) * 0.2, 0.65, ease.inCubic(fall))
      const jitter = fired ? 0 : Math.sin(this.time * 70) * 0.1 * progress * (1 - fall)
      const block = part(g, 'block')
      block.position.set(jitter, y, 0)
      block.rotation.set(0, fired ? 0 : (1 - progress) * 2.5, 0)
      // Squash on impact, spring back.
      const k = fired ? clamp((now - f.slamAt) / 6, 0, 1) : 1
      block.scale.set(lerp(1.25, 1, k), lerp(0.6, 1, k), lerp(1.25, 1, k))

      const beam = part<Mesh>(g, 'beam')
      beam.scale.set(1, Math.max(0.01, y), 1)
      ;(beam.material as MeshBasicMaterial).opacity = fired ? 0 : 0.06 + 0.22 * progress
      const shadow = part<Mesh>(g, 'shadow')
      shadow.scale.setScalar(0.5 + 0.9 * progress)
      ;(shadow.material as MeshBasicMaterial).opacity = 0.25 + 0.6 * progress
      const reticle = part<LineSegments>(g, 'reticle')
      reticle.visible = !fired
      reticle.rotation.y = this.time * 1.8
      reticle.scale.setScalar(1.15 - 0.25 * progress + 0.06 * Math.sin(this.time * 16))
      ;(reticle.material as LineBasicMaterial).opacity = 0.5 + 0.5 * progress
      const trail = part<Sprite>(g, 'trail')
      trail.visible = !fired && fall > 0
      trail.position.set(0, y + 1.6, 0)
      trail.scale.set(1.2, 1 + fall * 4, 1)
      trail.material.opacity = 0.6 * fall
    }
  }

  /** Cracks ride the track away and fade. */
  private updateCracks(dt: number, moved: number) {
    for (const c of this.cracks) {
      if (c.age >= CRACK_LIFE) {
        c.mesh.visible = false
        continue
      }
      c.age += dt
      c.mesh.position.z += moved
      ;(c.mesh.material as MeshBasicMaterial).opacity = 1 - c.age / CRACK_LIFE
    }
  }

  private updateCamera(dt: number, gx: number, tx: number, speedLevel: number, dying = 0) {
    const cam = this.view.camera
    const aspect = this.view.width / this.view.height
    // Narrow screens: hug the lanes tighter; wide screens show the scenery.
    const halfW = trackHalfWidth(this.lanes) + (aspect < 1 ? 0.3 : 1.2)
    const fit = fitView(aspect, 58, halfW, CAM_BACK)
    const rig = cameraRig(gx, tx)
    this.camX = damp(this.camX, rig.x, 6, dt)
    this.fovKick = damp(this.fovKick, 0, 4, dt)
    const [sx, sy] = this.shake.offset
    const pull = fit.dist / CAM_BACK
    // Pulled back (tall screens): rise and look down more, so the rift fills the
    // screen instead of the sky.
    // Dying: drift in on the spot where the ghost fell, with a slow turn.
    const push = ease.inOutCubic(dying)
    const orbit = push * 0.35
    const dist = fit.dist * (1 - 0.45 * push)
    cam.position.set(
      lerp(this.camX, gx, push) + Math.sin(orbit) * dist * 0.5 + sx,
      CAM_HEIGHT * pull * (1 - 0.4 * push) + sy,
      dist * Math.cos(orbit),
    )
    cam.lookAt(lerp(this.camX * 0.8, gx, push), lerp(-2.2, 0.8, push), lerp(-24 / pull, 0, push))
    cam.rotateZ(rig.roll * (1 - push))
    cam.fov = fit.fov + speedLevel * 6 + this.phantom * 5 + this.fovKick
    cam.updateProjectionMatrix()
  }

  private phantomVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    )
    g.addColorStop(0, 'rgb(180 140 255 / 0)')
    g.addColorStop(1, `rgb(150 100 255 / ${0.35 * this.phantom})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}
