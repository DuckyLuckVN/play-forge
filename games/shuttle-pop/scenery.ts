// The park around the court at golden hour: sky dome, warm lights + fog, the lawn, and the layers
// on top of it — painted far layer (backdrop.ts), mid-layer props (props.ts, drawn by kit.ts),
// benches + lantern strings, the cheering crowd (crowd.ts) and ambient life (ambient.ts).
//
// Draw-call lean: every repeated thing is one InstancedMesh (or one merged geometry), so the whole
// park is ~22 draw calls. Nothing here casts or receives shadows. The background is kept soft
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
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Ambient } from './ambient'
import { Backdrop, HAZE } from './backdrop'
import { Crowd } from './crowd'
import { buildProps, instanced, lambert, yawTo } from './kit'
import { BENCHES, LANTERN, lanternHang, parkLayout } from './props'

const SKY = {
  top: '#a995d4',
  mid: '#eaa9ae',
  horizon: HAZE,
  sun: '#ffb877',
}
const PARK = {
  grass: '#a3bd7c',
  hemiSky: '#ffe2c6',
  hemiGround: '#6f8a5e',
  sun: '#ffc890',
  wood: '#8a6a52',
  wire: '#4a3b45',
}

/** Sun direction (from the scene toward the sun): low, behind the camera and to one side, so faces toward the camera are lit and shadows fall long across the court. */
const SUN_DIR = new Vector3(-9, 7, -10).normalize()
const SKY_R = 100
const FOG_NEAR = 28
const FOG_FAR = 90

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

/** Benches: seat, back and two legs merged into one geometry (front faces model +z), facing the court. */
function makeBenches(): Mesh {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new BoxGeometry(w, h, d).translate(x, y, z)
  const geo = mergeGeometries([
    part(1.4, 0.07, 0.42, 0, 0.45, 0),
    part(1.4, 0.3, 0.06, 0, 0.72, -0.2),
    part(0.08, 0.45, 0.38, -0.6, 0.225, 0),
    part(0.08, 0.45, 0.38, 0.6, 0.225, 0),
  ])
  const benches = instanced(geo, lambert(PARK.wood), BENCHES.length)
  const m = new Object3D()
  BENCHES.forEach((b, i) => {
    m.position.set(b.x, 0, b.z)
    m.rotation.set(0, yawTo(b.x, b.z, 0, b.z), 0)
    m.updateMatrix()
    benches.setMatrixAt(i, m.matrix)
  })
  return benches
}

/** The lantern strings' wire (poles and lanterns are props). One line batch. */
function makeWire(): LineSegments {
  const STEPS = 12
  const wire: number[] = []
  const { x: PX, poles } = LANTERN
  for (const side of [-1, 1]) {
    const x = side * PX
    for (let s = 0; s + 1 < poles.length; s++) {
      const z0 = poles[s]
      const z1 = poles[s + 1]
      for (let k = 0; k < STEPS; k++) {
        const a = k / STEPS
        const b = (k + 1) / STEPS
        wire.push(x, lanternHang(a), z0 + (z1 - z0) * a, x, lanternHang(b), z0 + (z1 - z0) * b)
      }
    }
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(wire, 3))
  return new LineSegments(geo, new LineBasicMaterial({ color: PARK.wire }))
}

/** Sky, lights, fog and park scenery. Add once; call `update` every frame for the crowd. */
export class Park {
  readonly root = new Group()
  /** The low warm sun; the only shadow-casting light (players only; Court3D pauses its pass when slow). */
  private sun: DirectionalLight
  private crowd = new Crowd()
  private backdrop = new Backdrop()
  private ambient = new Ambient()

  constructor(scene: Scene) {
    scene.background = new Color(SKY.horizon)
    scene.fog = new Fog(SKY.horizon, FOG_NEAR, FOG_FAR)

    this.sun = new DirectionalLight(PARK.sun, 2.4)
    this.sun.position.copy(SUN_DIR).multiplyScalar(20)
    const cam = this.sun.shadow.camera
    cam.left = -10
    cam.right = 10
    cam.top = 10
    cam.bottom = -10
    cam.near = 1
    cam.far = 45
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.02
    this.sun.castShadow = true

    const grass = new Mesh(new CircleGeometry(SKY_R * 0.9, 48), new MeshBasicMaterial({ color: PARK.grass }))
    grass.rotation.x = -Math.PI / 2

    this.root.add(
      makeSky(),
      new HemisphereLight(PARK.hemiSky, PARK.hemiGround, 1.3),
      this.sun,
      grass,
      this.backdrop.root,
      ...buildProps(parkLayout()),
      makeBenches(),
      makeWire(),
      this.crowd.root,
      this.ambient.root,
    )
    scene.add(this.root)
  }

  /** `cheer` = crowd excitement 0..1 (see world.ts cheerLevel), `t` = seconds. */
  update(cheer: number, t: number, dt: number) {
    this.crowd.update(cheer, t, dt)
    this.backdrop.update(dt)
    this.ambient.update(t)
  }
}
