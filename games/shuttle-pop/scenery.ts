// The park around the court at golden hour: sky dome, warm lights + fog, the lawn, and the layers
// on top of it — painted far layer (backdrop.ts), mid-layer props (props.ts, drawn by kit.ts),
// benches + lantern strings, the cheering crowd (crowd.ts) and ambient life (ambient.ts).
//
// Draw-call lean: every repeated thing is one InstancedMesh (or one merged geometry), so the whole
// park is ~22 draw calls. With real shadows on (look.ts tiers), the lawn and the near props cast / receive
// the sun's soft shadow; the painted far layer, sky and ambient life never do. The background is kept soft
// (muted colours, fog, pre-hazed far layer) so the court, players and white shuttle pop; nothing tall
// stands between the camera and the court, and nothing pale sits behind the far baseline.
//
// Render space: the local player is near (z < 0), the camera behind them looking toward +z.

import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Ambient } from './ambient'
import { Backdrop, HAZE } from './backdrop'
import { courtScale, spreadXZ } from './courtsize'
import { Crowd } from './crowd'
import { buildProps, instanced, lambert, yawTo } from './kit'
import { LOOK, type LookTier } from './look'
import type { CourtDims } from './physics'
import { BENCHES, LANTERN, lanternHang, parkLayout } from './props'

/** The sun's shadow map edge (px) for a look: none on Low, then per tier (look.ts). */
export function shadowMapSize(tier: LookTier): number {
  return tier === 'low' ? 0 : LOOK.shadow[tier].map
}

const SKY = {
  top: '#a995d4',
  mid: '#eaa9ae',
  horizon: HAZE,
  sun: '#ffb877',
}
const PARK = {
  /** Lit now (sun + sky ≈ 1× albedo in full sun, look.ts). */
  grass: '#7db552',
  wood: '#8a6a52',
  wire: '#4a3b45',
}

/**
 * Sun direction (from the scene toward the sun): from the left, a touch toward the far end, ~44° up. Shadows
 * fall to the right across the court and lawn (about a body length), where the camera sees them, and every
 * prop gets a lit and a shaded side; faces toward the camera stay half lit.
 */
const SUN_DIR = new Vector3(-12, 12, 2).normalize()
const SKY_R = 100
const FOG_NEAR = 40
const FOG_FAR = 150
/** Sun shadow box half-size on the Normal court (grows with the court). */
const SHADOW_HALF = LOOK.shadowHalf
/** How far up the sun's beam the shadow camera sits (m), and its depth range. */
const SUN_DIST = 40

/** Golden-hour gradient + a soft sun glow. One draw call, no fog. */
function makeSky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color(SKY.top) },
      mid: { value: new Color(SKY.mid) },
      horizon: { value: new Color(SKY.horizon) },
      sunColor: { value: new Color(SKY.sun) },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, d.y));
        c = mix(c, top, smoothstep(0.22, 0.75, d.y));
        float s = max(dot(d, sunDir), 0.0);
        c += sunColor * (pow(s, 64.0) * 0.5 + pow(s, 6.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const sky = new Mesh(new SphereGeometry(SKY_R, 32, 16), mat)
  sky.renderOrder = -1
  sky.frustumCulled = false
  return sky
}

type Spread = { x: number; z: number }

/** Benches: seat, back and two legs merged into one geometry (front faces model +z); `placeBenches` seats them. */
function makeBenches(): InstancedMesh {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new BoxGeometry(w, h, d).translate(x, y, z)
  const geo = mergeGeometries([
    part(1.4, 0.07, 0.42, 0, 0.45, 0),
    part(1.4, 0.3, 0.06, 0, 0.72, -0.2),
    part(0.08, 0.45, 0.38, -0.6, 0.225, 0),
    part(0.08, 0.45, 0.38, 0.6, 0.225, 0),
  ])
  return instanced(geo, lambert(PARK.wood), BENCHES.length, true)
}

/** Benches spread with the court (`k` = courtScale), facing it. */
function placeBenches(benches: InstancedMesh, k: Spread) {
  const m = new Object3D()
  BENCHES.forEach((spot, i) => {
    const b = spreadXZ(spot, k)
    m.position.set(b.x, 0, b.z)
    m.rotation.set(0, yawTo(b.x, b.z, 0, b.z), 0)
    m.updateMatrix()
    benches.setMatrixAt(i, m.matrix)
  })
  benches.instanceMatrix.needsUpdate = true
  benches.computeBoundingSphere()
}

/** The lantern strings' wire (poles and lanterns are props), spread with the court. One line batch. */
function wireGeometry(k: Spread): BufferGeometry {
  const STEPS = 12
  const wire: number[] = []
  const { x: PX, poles } = LANTERN
  for (const side of [-1, 1]) {
    const x = side * PX * k.x
    for (let s = 0; s + 1 < poles.length; s++) {
      const z0 = poles[s] * k.z
      const z1 = poles[s + 1] * k.z
      for (let i = 0; i < STEPS; i++) {
        const a = i / STEPS
        const b = (i + 1) / STEPS
        wire.push(x, lanternHang(a), z0 + (z1 - z0) * a, x, lanternHang(b), z0 + (z1 - z0) * b)
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(wire, 3))
  return geo
}

/** Sky, lights, fog and park scenery. Add once; call `update` every frame for the crowd. */
export class Park {
  readonly root = new Group()
  /** The low warm sun; the only shadow light (players + park; off on the Low look, see setLook). */
  private sun: DirectionalLight
  private crowd = new Crowd()
  private backdrop = new Backdrop()
  private ambient = new Ambient()
  /** Current court stretch from Normal (courtScale). */
  private k: Spread = { x: 1, z: 1 }
  /** The park's prop InstancedMeshes (props.ts; rebuilt on a court change). */
  private props = new Group()
  private benches = makeBenches()
  private wire = new LineSegments(wireGeometry(this.k), new LineBasicMaterial({ color: PARK.wire }))

  constructor(scene: Scene) {
    scene.background = new Color(SKY.horizon)
    scene.fog = new Fog(SKY.horizon, FOG_NEAR, FOG_FAR)

    this.sun = new DirectionalLight(LOOK.sun.color, LOOK.sun.intensity)
    this.sun.position.copy(SUN_DIR).multiplyScalar(SUN_DIST)
    const cam = this.sun.shadow.camera
    cam.left = -SHADOW_HALF
    cam.right = SHADOW_HALF
    cam.top = SHADOW_HALF
    cam.bottom = -SHADOW_HALF
    cam.near = 1
    cam.far = SUN_DIST * 2
    this.sun.shadow.intensity = LOOK.shadowIntensity
    this.sun.shadow.bias = LOOK.shadowBias
    this.sun.shadow.normalBias = LOOK.shadowNormalBias
    this.setLook('high')

    const grass = new Mesh(
      new CircleGeometry(SKY_R * 0.9, 48),
      new MeshLambertMaterial({ color: PARK.grass }),
    )
    grass.rotation.x = -Math.PI / 2
    grass.receiveShadow = true

    this.root.add(
      makeSky(),
      new HemisphereLight(LOOK.hemi.sky, LOOK.hemi.ground, LOOK.hemi.intensity),
      this.sun,
      grass,
      this.backdrop.root,
      this.props,
      this.benches,
      this.wire,
      this.crowd.root,
      this.ambient.root,
    )
    this.props.add(...buildProps(parkLayout()))
    placeBenches(this.benches, this.k)
    scene.add(this.root)
  }

  /**
   * Spreads the park around `court` (props, benches, lantern wire, crowd, the sun's shadow box). Rare: on
   * a court change only (allocates; the old prop meshes are disposed). No-op when the stretch is unchanged.
   */
  setCourt(court: CourtDims) {
    const k = courtScale(court)
    if (k.x === this.k.x && k.z === this.k.z) return
    this.k = k
    for (const m of this.props.children as InstancedMesh[]) {
      m.geometry.dispose()
      ;(m.material as Material).dispose()
      m.dispose()
    }
    this.props.clear()
    this.props.add(...buildProps(parkLayout(court)))
    placeBenches(this.benches, k)
    this.wire.geometry.dispose()
    this.wire.geometry = wireGeometry(k)
    this.crowd.place(k)
    const cam = this.sun.shadow.camera
    const half = SHADOW_HALF * Math.max(k.x, k.z)
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.updateProjectionMatrix()
  }

  /**
   * Real shadows for a graphics look: Low has none (the sun stops casting: no shadow pass at all), Medium /
   * High a soft map of their size. Turning casting on / off swaps the lit materials' shadow program variant
   * (both are compiled in Court3D.warm); a new map size reallocates the map. Rare: between rallies only.
   */
  setLook(tier: LookTier) {
    const on = tier !== 'low'
    this.sun.castShadow = on
    if (!on) return
    const { map, radius } = LOOK.shadow[tier]
    const shadow = this.sun.shadow
    shadow.radius = radius
    if (shadow.mapSize.x === map) return
    shadow.mapSize.set(map, map)
    shadow.map?.dispose()
    shadow.map = null
  }

  /** `cheer` = crowd excitement 0..1 (see world.ts cheerLevel), `t` = seconds. */
  update(cheer: number, t: number, dt: number) {
    this.crowd.update(cheer, t, dt)
    this.backdrop.update(dt)
    this.ambient.update(t)
  }
}
