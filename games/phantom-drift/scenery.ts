// The world around the rift: sky, a retro striped sun, stars, neon wireframe
// mountains, crystal monoliths, the glowing track, rails, pillars, floating
// debris and speed streaks. Nothing crosses over the track, so hazards stay clear.
// Everything scrolls with `travel` (world units travelled) so it freezes on pause.

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  WireframeGeometry,
  type Scene,
} from 'three'
import { lerp } from '@forge/fx/tween'
import { glowTexture } from '@forge/render3d'
import type { Ambience } from './ambience'
import { trackHalfWidth } from './world'

/** How far ahead the world is built (world units, forward is -z). */
export const FAR = 210
const TRACK_LEN = FAR + 40
const PILLAR_GAP = 9
const MONOLITH_GAP = 26
const TERRAIN_LEN = 60
const TERRAIN_TILES = 5

// Sky palette for the day/night cycle.
const NIGHT_TOP = new Color('#05030f')
const DAY_TOP = new Color('#4f7fc4')
const WARM_TOP = new Color('#4a2a6e')
const DAY_HORIZON = new Color('#c9dcf2')
const WARM_HORIZON = new Color('#ff8a66')
const DAY_FOG = new Color('#9db8db')
const WARM_FOG = new Color('#e89a86')
const PHANTOM_FOG = new Color('#1a0c33')
const NIGHT_GROUND = new Color('#05040e')
const DAY_GROUND = new Color('#5c7299')
const NIGHT_TRACK = new Color('#070a1c')
const DAY_TRACK = new Color('#1d2742')
const SUN_TOP = new Color('#ffc861').multiplyScalar(0.62)
const SUN_BOTTOM = new Color('#ff3d9a').multiplyScalar(0.7)
const SUN_DAY = new Color('#fff4d6').multiplyScalar(0.85)

/** Wraps a scrolling coordinate into [-(span - behind), behind). */
export const wrap = (z: number, span: number, behind = 12) =>
  ((((z + span - behind) % span) + span) % span) - span + behind

// Scratch colours reused every frame (no garbage): each result is copied
// straight away, so a small ring is plenty.
const SCRATCH = Array.from({ length: 4 }, () => new Color())
let scratchAt = 0
function hsl(h: number, s: number, l: number) {
  const c = SCRATCH[scratchAt++ % SCRATCH.length]
  return c.setHSL((((h % 360) + 360) % 360) / 360, s, l)
}

/** Seeded so the world looks the same every run (not gameplay-relevant). */
function rand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

const TRACK_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying float vDepth;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float lanes; uniform float scroll; uniform float time; uniform float len;
    uniform vec3 glow; uniform vec3 base; uniform vec3 fogColor; uniform float far; uniform float phantom; uniform float neon;
    varying vec2 vUv; varying float vDepth;
    float line(float x, float w) { float d = abs(fract(x - 0.5) - 0.5); return smoothstep(w, 0.0, d); }
    void main() {
      float u = vUv.x * lanes;
      float along = (1.0 - vUv.y) * len + scroll;
      float aa = fwidth(u) * 1.5;
      float dividers = line(u, 0.02 + aa) * 0.3;
      float edges = smoothstep(0.07 + aa, 0.0, u) + smoothstep(lanes - 0.07 - aa, lanes, u);
      float cross = line(along / 4.0, 0.02 + fwidth(along / 4.0)) * 0.16;
      float pulse = line((along - time * 18.0) / 40.0, 0.01) * 0.35;
      // Softer right under the camera (easy on the eyes), full strength ahead.
      float near = mix(0.5, 1.0, smoothstep(3.0, 30.0, vDepth));
      vec3 col = base + glow * neon * near * (dividers + cross + pulse + edges * 0.9);
      col += glow * 0.02 * sin(along * 0.6 + time * 4.0);
      col = mix(col, vec3(0.55, 0.35, 1.0) * (dividers + edges + 0.15), phantom * 0.5);
      float fog = smoothstep(far * 0.35, far, vDepth);
      gl_FragColor = vec4(mix(col, fogColor, fog), 1.0);
    }`,
}

export class Scenery {
  readonly root = new Group()
  private sky: Mesh
  private riftGlow: Sprite
  private stars: Points
  private track: Mesh
  private trackMat: ShaderMaterial
  private rails: Mesh[] = []
  private railMat = new MeshBasicMaterial()
  private sun: Mesh
  private monoliths: Group[] = []
  private monolithEdges = new LineBasicMaterial()
  private monolithCore = new MeshBasicMaterial()
  private pillars: Group[] = []
  private pillarCapMat = new MeshBasicMaterial()
  private terrain: Group[] = []
  private terrainLines = new LineBasicMaterial({ transparent: true, opacity: 0.5 })
  private terrainFill = new MeshBasicMaterial({ color: '#05040e' })
  private debris: InstancedMesh
  private debrisSeeds: { x: number; y: number; z: number; s: number; r: number }[] = []
  private streaks: LineSegments
  private streakPos: Float32Array
  private dummy = new Object3D()
  private halfWidth = trackHalfWidth(3)
  readonly fogColor = new Color()
  private glow = new Color()
  /** 1 normal … lower to power the neon down (death). */
  power = 1

  constructor(scene: Scene) {
    // Sky dome: deep gradient that takes the rift hue near the horizon.
    this.sky = new Mesh(
      new SphereGeometry(FAR * 1.6, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { top: { value: NIGHT_TOP.clone() }, horizon: { value: new Color() } },
        vertexShader: /* glsl */ `varying vec3 vPos; void main() { vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
          void main() { float t = pow(1.0 - clamp(vPos.y * 1.6, 0.0, 1.0), 3.0); gl_FragColor = vec4(mix(top, horizon, t), 1.0); }`,
      }),
    )
    this.root.add(this.sky)

    // Rift glow at the vanishing point.
    this.riftGlow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
    )
    this.riftGlow.position.set(0, 10, -FAR * 1.25)
    this.riftGlow.scale.set(170, 70, 1)
    this.root.add(this.riftGlow)

    // Retro sun: warm gradient, its lower half cut into scrolling stripes.
    this.sun = new Mesh(
      new CircleGeometry(1, 64),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          time: { value: 0 },
          top: { value: SUN_TOP.clone() },
          bottom: { value: SUN_BOTTOM.clone() },
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float time; uniform vec3 top; uniform vec3 bottom; varying vec2 vUv;
          void main() {
            float y = vUv.y;
            if (y < 0.52) {
              float d = 0.52 - y;
              float band = fract(d * 9.0 + time * 0.25);
              if (band < d * 1.7) discard;
            }
            gl_FragColor = vec4(mix(bottom, top, smoothstep(0.1, 0.95, y)), 1.0);
          }`,
      }),
    )
    this.sun.position.set(0, 30, -FAR * 1.15)
    this.sun.scale.setScalar(46)
    this.root.add(this.sun)

    // Stars on the upper sky.
    const r = rand(7)
    const starPos = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      const a = r() * Math.PI * 2
      const y = 0.08 + r() * 0.9
      const rr = Math.sqrt(1 - y * y)
      starPos.set([Math.cos(a) * rr * FAR * 1.4, y * FAR * 1.4, Math.sin(a) * rr * FAR * 1.4], i * 3)
    }
    const starGeo = new BufferGeometry()
    starGeo.setAttribute('position', new BufferAttribute(starPos, 3))
    this.stars = new Points(
      starGeo,
      new PointsMaterial({
        size: 1.6,
        sizeAttenuation: false,
        color: '#cfd8ff',
        transparent: true,
        opacity: 0.8,
        fog: false,
      }),
    )
    this.root.add(this.stars)

    // Track: one long plane with a shader drawing lanes, grid and edges.
    this.trackMat = new ShaderMaterial({
      ...TRACK_SHADER,
      uniforms: {
        lanes: { value: 3 },
        scroll: { value: 0 },
        time: { value: 0 },
        len: { value: TRACK_LEN },
        glow: { value: new Color() },
        base: { value: new Color('#070a1c') },
        fogColor: { value: this.fogColor },
        far: { value: FAR },
        phantom: { value: 0 },
        neon: { value: 1 },
      },
    })
    this.track = new Mesh(new PlaneGeometry(1, TRACK_LEN), this.trackMat)
    this.track.rotation.x = -Math.PI / 2
    this.track.position.z = -TRACK_LEN / 2 + 20
    this.root.add(this.track)

    // Ground under everything, so no sky shows between the rift and the mountains.
    const ground = new Mesh(new PlaneGeometry(400, TRACK_LEN), this.terrainFill)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.1, this.track.position.z)
    this.root.add(ground)

    // Glowing rails along both edges.
    for (const side of [-1, 1]) {
      const rail = new Mesh(new BoxGeometry(0.12, 0.12, TRACK_LEN), this.railMat)
      rail.position.set(side, 0.08, this.track.position.z)
      rail.userData.side = side
      this.rails.push(rail)
      this.root.add(rail)
    }

    // Crystal monoliths: tall dark prisms with glowing edges and a light seam.
    const prism = new CylinderGeometry(0.35, 1.3, 1, 5, 1)
    prism.translate(0, 0.5, 0)
    const prismEdges = new EdgesGeometry(prism)
    const seam = new BoxGeometry(0.08, 1, 0.08)
    seam.translate(0, 0.5, 0)
    const darkGlass = new MeshStandardMaterial({ color: '#141638', roughness: 0.35, metalness: 0.35 })
    const mr = rand(17)
    for (let i = 0; i < Math.ceil(FAR / MONOLITH_GAP) + 1; i++) {
      for (const side of [-1, 1]) {
        const g = new Group()
        const height = 7 + mr() * 16
        const body = new Group()
        body.add(new Mesh(prism, darkGlass), new LineSegments(prismEdges, this.monolithEdges))
        const core = new Mesh(seam, this.monolithCore)
        core.position.z = 0.9
        body.add(core)
        body.scale.set(1 + mr(), height, 1 + mr())
        g.add(body)
        g.rotation.z = side * (0.05 + mr() * 0.12)
        g.userData = { side, slot: i, offset: 9 + mr() * 14, spin: mr() * 6, phase: mr() * MONOLITH_GAP }
        this.monoliths.push(g)
        this.root.add(g)
      }
    }

    // Pillars beside the track with glowing caps.
    const body = new BoxGeometry(0.5, 1, 0.5)
    const cap = new BoxGeometry(0.62, 0.14, 0.62)
    const bodyMat = new MeshStandardMaterial({ color: '#161a44', roughness: 0.5, metalness: 0.3 })
    const pr = rand(3)
    for (let i = 0; i < Math.ceil(FAR / PILLAR_GAP) + 2; i++) {
      for (const side of [-1, 1]) {
        const g = new Group()
        const h = 1.2 + pr() * 4.5
        const b = new Mesh(body, bodyMat)
        b.scale.y = h
        b.position.y = h / 2
        const c = new Mesh(cap, this.pillarCapMat)
        c.position.y = h
        g.add(b, c)
        g.userData = { side, slot: i, offset: 1.4 + pr() * 2.5 }
        this.pillars.push(g)
        this.root.add(g)
      }
    }

    // Wireframe mountains: a valley that keeps the rift clear.
    const tr = rand(11)
    for (let t = 0; t < TERRAIN_TILES; t++) {
      for (const side of [-1, 1]) {
        const geo = new PlaneGeometry(70, TERRAIN_LEN, 14, 12)
        geo.rotateX(-Math.PI / 2)
        const pos = geo.getAttribute('position') as BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) + 35 // 0..70 away from the track
          const z = pos.getZ(i)
          const edge = Math.abs(z) > TERRAIN_LEN / 2 - 0.01 // seams stay low so tiles join
          const rise = Math.max(0, x - 8) / 62
          pos.setY(i, edge ? rise * 6 : rise * rise * (8 + tr() * 22) + tr() * rise * 4)
        }
        geo.translate(35, 0, 0)
        geo.computeVertexNormals()
        const g = new Group()
        g.add(new Mesh(geo, this.terrainFill))
        g.add(new LineSegments(new WireframeGeometry(geo), this.terrainLines))
        g.scale.x = side
        // Outside the widest rift and a hair below it: no flicker where they meet.
        g.position.set(side * 7, -0.06, 0)
        g.userData = { tile: t }
        this.terrain.push(g)
        this.root.add(g)
      }
    }

    // Floating crystal debris far to the sides.
    const dr = rand(5)
    this.debris = new InstancedMesh(
      new IcosahedronGeometry(1, 0),
      new MeshStandardMaterial({ color: '#2a2f6b', emissive: '#14183d', flatShading: true, roughness: 0.3 }),
      40,
    )
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? 1 : -1
      this.debrisSeeds.push({
        x: side * (18 + dr() * 30),
        y: 6 + dr() * 16,
        z: -dr() * FAR,
        s: 0.4 + dr() * 1.6,
        r: dr() * 6,
      })
    }
    this.root.add(this.debris)

    // Speed streaks close to the camera.
    this.streakPos = new Float32Array(70 * 6)
    const sGeo = new BufferGeometry()
    sGeo.setAttribute('position', new BufferAttribute(this.streakPos, 3))
    this.streaks = new LineSegments(
      sGeo,
      new LineBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0, blending: AdditiveBlending }),
    )
    this.streaks.frustumCulled = false
    this.root.add(this.streaks)

    scene.add(this.root)
  }

  /**
   * @param travel world units travelled
   * @param lanes lanes shown (fractional while the rift widens)
   * @param hue rift hue in degrees
   * @param speedLevel 0..1 how fast we're going (streaks, pulses)
   * @param sky time of day
   */
  update(
    time: number,
    travel: number,
    lanes: number,
    hue: number,
    speedLevel: number,
    phantom: number,
    sky: Ambience,
  ): void {
    const day = sky.daylight
    const warm = sky.warmth
    const glow = this.glow.copy(hsl(hue, 1, 0.55))
    this.halfWidth = trackHalfWidth(lanes)

    // Night: deep and neon. Day: soft pastel haze. Dawn/dusk: a warm glow.
    this.fogColor
      .copy(hsl(hue + 20, 0.7, 0.045))
      .lerp(DAY_FOG, day)
      .lerp(WARM_FOG, warm * 0.55)
      .lerp(PHANTOM_FOG, phantom * 0.6)
    const skyU = (this.sky.material as ShaderMaterial).uniforms
    skyU.top.value
      .copy(NIGHT_TOP)
      .lerp(DAY_TOP, day)
      .lerp(WARM_TOP, warm * 0.5)
    skyU.horizon.value
      .copy(hsl(hue + 25, 0.9, 0.12))
      .lerp(DAY_HORIZON, day)
      .lerp(WARM_HORIZON, warm * 0.8)
    this.riftGlow.material.color
      .copy(hsl(hue, 1, 0.5))
      .lerp(WARM_HORIZON, warm)
      .multiplyScalar(0.35 * (1 - day * 0.6) + warm * 0.25)
    ;(this.stars.material as PointsMaterial).opacity = 0.8 * sky.stars
    this.stars.visible = sky.stars > 0.01
    this.sun.position.y = sky.sunHeight
    const sunU = (this.sun.material as ShaderMaterial).uniforms
    sunU.top.value.copy(SUN_TOP).lerp(SUN_DAY, day * 0.8)
    sunU.bottom.value.copy(SUN_BOTTOM).lerp(SUN_DAY, day * 0.6)
    this.terrainFill.color.copy(NIGHT_GROUND).lerp(DAY_GROUND, day)
    this.terrainLines.opacity = lerp(0.5, 0.22, day)

    const u = this.trackMat.uniforms
    u.lanes.value = lanes
    u.scroll.value = travel
    u.time.value = time
    u.glow.value.copy(glow)
    u.phantom.value = phantom
    u.neon.value = lerp(1, 0.6, day) * this.power
    u.base.value.copy(NIGHT_TRACK).lerp(DAY_TRACK, day)
    this.track.scale.x = this.halfWidth * 2

    this.railMat.color.copy(glow).multiplyScalar(lerp(0.6, 0.45, day) * this.power)
    for (const rail of this.rails) rail.position.x = rail.userData.side * (this.halfWidth + 0.06)

    ;(this.sun.material as ShaderMaterial).uniforms.time.value = time

    this.monolithEdges.color.copy(hsl(hue + 35, 1, 0.55)).multiplyScalar(lerp(0.9, 0.5, day) * this.power)
    this.monolithCore.color.copy(hsl(hue + 10, 1, 0.6)).multiplyScalar(0.8)
    const monoSpan = (this.monoliths.length / 2) * MONOLITH_GAP
    for (const m of this.monoliths) {
      const { side, slot, offset, spin, phase } = m.userData
      m.position.set(
        side * (this.halfWidth + offset),
        0,
        wrap(-slot * MONOLITH_GAP - phase + travel, monoSpan, 20),
      )
      m.rotation.y = spin + time * 0.05 * side
    }

    this.pillarCapMat.color.copy(hsl(hue - 15, 1, 0.55)).multiplyScalar(lerp(1.2, 0.8, day) * this.power)
    const pillarSpan = (this.pillars.length / 2) * PILLAR_GAP
    for (const p of this.pillars) {
      const { side, slot, offset } = p.userData
      p.position.set(side * (this.halfWidth + offset), 0, wrap(-slot * PILLAR_GAP + travel, pillarSpan, 12))
    }

    this.terrainLines.color.copy(hsl(hue + 40, 0.9, 0.42))
    for (const t of this.terrain)
      t.position.z = wrap(-t.userData.tile * TERRAIN_LEN + travel, TERRAIN_TILES * TERRAIN_LEN, 40)

    this.debrisSeeds.forEach((d, i) => {
      this.dummy.position.set(
        d.x,
        d.y + Math.sin(time * 0.6 + d.r) * 0.8,
        wrap(d.z + travel * 0.5, FAR + 20, 10),
      )
      this.dummy.rotation.set(time * 0.3 + d.r, time * 0.2 + d.r, 0)
      this.dummy.scale.setScalar(d.s)
      this.dummy.updateMatrix()
      this.debris.setMatrixAt(i, this.dummy.matrix)
    })
    this.debris.instanceMatrix.needsUpdate = true

    // Streaks: brighter and longer the faster the rift runs.
    const sm = this.streaks.material as LineBasicMaterial
    sm.opacity = 0.06 + speedLevel * 0.3 + phantom * 0.15
    const len = 0.8 + speedLevel * 2.5
    for (let i = 0; i < 70; i++) {
      const a = (i * 2.399) % (Math.PI * 2)
      const side = i % 2 ? 1 : -1
      const x = side * (this.halfWidth + 0.8 + ((i * 7.13) % 6))
      const y = 0.2 + Math.abs(Math.sin(a)) * 2.5
      const z = wrap(-((i * 13.7) % 60) + travel * 2.2, 60, 8)
      this.streakPos.set([x, y, z, x, y, z - len], i * 6)
    }
    this.streaks.geometry.getAttribute('position').needsUpdate = true
  }
}
