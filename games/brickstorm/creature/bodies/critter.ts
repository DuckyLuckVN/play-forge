/**
 * Critters: chibi four-legged creatures. The back legs stand; the front legs are the arms, running from the chest to
 * paw mitts at the solved hands, so to hold the ball a critter sits up (the torso tilts up about the hip) and reaches
 * out with its near paw while the far one stays planted on the ground. One rig (rear-up, crouch, lean, breath, tail
 * wag, ear twitch, KO flop) and six variants, each moving like itself:
 * - sprout (Sprig): leaf ears and a leaf sprout that rustles; the sprout spins like a propeller on cheer;
 * - cat (Kage): a shadow cat in a ninja mask with glowing eyes and a curling tail; it backflips on cheer;
 * - lion (Aurelia): a sun lion cub, its mane a ring of rays with a pulsing sun glow; it roars on cheer;
 * - crystal (Nyx): crystal spikes down the back that glint; they flash and throw sparkles on cheer;
 * - dragon (Drakon): little back wings (scenery only) and a spade tail; a tiny flame puff on cheer;
 * - dice (Lucky): a cube body and head, its pips re-rolling; it tumbles and rolls on cheer.
 * On KO a critter flops over on its side (lying low, head down, paws out); revive plays it back.
 */
import type { Pose } from '../../hero-avatar'
import { type Mat, type Pt, along, apply, move, mul, scaleAbout, turnAbout } from '../affine'
import { drawArm } from '../hands'
import {
  OUTLINE,
  box,
  clamp,
  darkOf,
  dotEye,
  easeOut,
  ell,
  gloss,
  group,
  happy,
  happyEye,
  lerp,
  lightOf,
  look as wander,
  mix,
  openMouth,
  paint,
  smooth,
  ticks,
} from '../paint'
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HandPose, HeadBox, Rect } from '../types'

type Ctx = CanvasRenderingContext2D
type Variant = 'sprout' | 'cat' | 'lion' | 'crystal' | 'dragon' | 'dice'

const TAU = Math.PI * 2
const GOLD = '#ffc531'
const PINK = '#ff8fa3'
const SMOKE = '#9aa0ad'

/**
 * Body geometry, local units (feet at 0, facing +x, up is −y). The torso, front-leg sockets and neck live in the
 * spine frame: origin at the hip, before the rear-up tilt.
 */
const HIP: Pt = { x: -10, y: -7 }
const TORSO = { x: 8, y: -3, rx: 11, ry: 8 }
const SOCKET_F: Pt = { x: 11, y: -5 }
const SOCKET_B: Pt = { x: 8.5, y: -5.5 }
const NECK: Pt = { x: 11, y: -9 }
/** Head centre from the neck (the head stays upright while the torso tilts). */
const HEAD_UP: Pt = { x: 3, y: -14 }
const HEAD_RX = 12
const HEAD_RY = 10.5
/** Ear tips reach this far over the head top. */
const EAR_H = 6
/** Eyes and mouth sit forward on the round head (head frame). */
const FACE_X = 3.5
const EYE_GAP = 3.9
/** Torso tilt (rad) per unit of rear-up: 1 = sitting up to hold the ball. */
const REAR = 0.5
const LIMB = 8
const HAND_R = 4.2
const LEG_W = 6.5
/** The back haunch and foot (legs frame, kit units). */
const THIGH = { x: -9.5, y: -7, rx: 6.5, ry: 6.5 }
const FOOT = { x: -5.5, y: -2.6, rx: 5.6, ry: 2.6 }
/** Where a fallen critter's head comes to rest, cheek down, in front of the body. */
const KO_HEAD: Pt = { x: 13, y: -10.2 }
const KO_TILT = 0.45

/** A variant's head and tail shapes, hat placement (head frame) and extras. */
interface Shape {
  ear: 'leaf' | 'point' | 'round' | 'gem' | 'fin' | 'square'
  tail: 'leaf' | 'curl' | 'tuft' | 'gem' | 'spade' | 'nub'
  hat: HeadBox
  /** Square head and torso (the dice). */
  cube: boolean
  /** Belly colour mix toward white (0 = none). */
  belly: number
}

const HAT: HeadBox = { x: 1.5, y: -6.5, rx: 10, ry: 7 }

const SHAPES: Record<Variant, Shape> = {
  sprout: {
    ear: 'leaf',
    tail: 'leaf',
    hat: { x: FACE_X - 0.5, y: 4.5, rx: 7.2, ry: 5 },
    cube: false,
    belly: 0.45,
  },
  // The ninja mask pulls down over the eyes; Kage's eyes glow through it.
  cat: { ear: 'point', tail: 'curl', hat: { x: FACE_X, y: -2.2, rx: 8.6, ry: 7 }, cube: false, belly: 0.25 },
  lion: { ear: 'round', tail: 'tuft', hat: { x: 1.5, y: -9, rx: 8, ry: 5.5 }, cube: false, belly: 0.4 },
  crystal: { ear: 'gem', tail: 'gem', hat: HAT, cube: false, belly: 0.35 },
  dragon: { ear: 'fin', tail: 'spade', hat: HAT, cube: false, belly: 0 },
  dice: { ear: 'square', tail: 'nub', hat: { x: 1, y: -7.5, rx: 8.5, ry: 6 }, cube: true, belly: 0 },
}

const variantOf = (look: CreatureLook): Variant =>
  Object.hasOwn(SHAPES, look.variant) ? (look.variant as Variant) : 'sprout'

/** 0..1..0 over the first `dur` seconds. */
const pulse = (age: number, dur: number) => (age < dur ? Math.sin((age / dur) * Math.PI) : 0)
/** 0..1..0 while the signature plays; 0 when still. */
const sigOf = (f: Frame) => (f.still ? 0 : Math.sin(Math.PI * clamp(f.fidget)))

/** Cheer flourish strength 0..1 (a pump plays a lighter, shorter one); 0 under reduced motion. */
function flourish(f: Frame): { k: number; age: number; cheer: boolean } {
  if (f.still || (f.mood !== 'cheer' && f.mood !== 'pump')) return { k: 0, age: 0, cheer: false }
  const cheer = f.mood === 'cheer'
  return { k: pulse(f.moodAge, cheer ? 1 : 0.4) * (cheer ? 1 : 0.4), age: f.moodAge, cheer }
}

/** Kage's paw lick plays on its signature while idle (the near paw keeps the ball). */
const licking = (v: Variant, f: Frame) =>
  v === 'cat' && f.mood === 'idle' && sigOf(f) > 0.05 && f.pose.fall <= 0

/** How far the critter sits up: 1 holding (or about to), lower on all fours or sad, higher rearing on cheer. */
function rearOf(f: Frame): number {
  let r = 1
  if (f.mood === 'sad' || (!f.hold && (f.mood === 'idle' || f.mood === 'watch'))) r = 0.6
  if (f.mood === 'cheer' || f.mood === 'cast' || f.mood === 'revive' || f.mood === 'wow') r = 1.2
  if (!f.still && f.mood === 'cheer') r += 0.15 * easeOut(f.moodAge / 0.2)
  if (!f.still && f.mood === 'pump') r += 0.3 * pulse(f.moodAge, 0.4)
  return r - 0.3 * clamp(f.pose.crouch, -1, 1)
}

/** Everything the rig does this frame (local units → the kit's frame). */
interface Rig {
  /** Spine frame → kit. */
  body: Mat
  /** Back legs (kit units) → kit. */
  legs: Mat
  /** Head frame (origin at the head centre) → kit. */
  head: Mat
  /** 0 standing .. 1 flopped. */
  ko: number
  /** Hurt flash 0..1. */
  flash: number
  /** Body spin (canvas angle) on Kage's backflip; the arms follow it. */
  spin: number
  /** Tail wag angle and ear twitch (rad). */
  wag: number
  ear: number
}

function rigOf(v: Variant, f: Frame): Rig {
  const t = f.still ? 0 : f.t
  const c = smooth(clamp(f.pose.fall))
  const fl = flourish(f)
  // Squash spring and the hurt flinch (+ = wider), with a dark flash.
  let sq = f.still ? 0 : -f.squash * 0.03
  let flash = 0
  if (!f.still && f.mood === 'hurt' && f.moodAge < 0.5) {
    sq += 0.14 * Math.exp(-f.moodAge * 9)
    flash = clamp(1 - f.moodAge / 0.3) * 0.5
  }
  const breath = f.still ? 0 : Math.sin(t * 2.2) * 0.45
  // KO landing: a little bounce as it hits the floor.
  const ko = f.mood === 'ko' && !f.still ? f.moodAge - 0.4 : -1
  const bounce = ko > 0 && ko < 0.35 ? Math.sin((ko / 0.35) * Math.PI) * 2.2 : 0
  const theta = lerp(-REAR * rearOf(f) + f.pose.lean * 0.8, 0.1, c)
  const drop = lerp(breath + f.pose.crouch * 3, 1, c) - bounce
  // On the floor a flopped critter flattens a little.
  const squash = scaleAbout({ x: 0, y: 0 }, 1 + sq + 0.1 * c, 1 - sq - 0.18 * c)
  const spine = mul(squash, mul(move(HIP.x, HIP.y + drop), turnAbout({ x: 0, y: 0 }, theta)))

  // Kage's backflip (lifted in an arc) and Lucky's hop on cheer: applied outside everything.
  let spin = 0
  let lift = 0
  if (fl.cheer && v === 'cat' && fl.age > 0.15 && fl.age < 0.8) {
    const k = smooth((fl.age - 0.15) / 0.65)
    spin = -TAU * k
    lift = Math.sin(Math.PI * k) * 14
  }
  if (fl.cheer && v === 'dice') lift = pulse(fl.age, 0.55) * 8
  const pivot = apply(spine, { x: TORSO.x, y: TORSO.y - 6 })
  const flip = mul(move(0, -lift), turnAbout(pivot, spin))

  // The head: on the neck, upright, a beat behind the breath; tilts with the pose; rests cheek-down when flopped.
  const neck = apply(spine, NECK)
  const lag = f.still ? 0 : Math.sin(t * 2.2 - 0.8) * 0.35 - breath
  const up = { x: neck.x + HEAD_UP.x, y: neck.y + HEAD_UP.y + lag }
  const at = { x: lerp(up.x, KO_HEAD.x, c), y: lerp(up.y, KO_HEAD.y + bounce * 0.5, c) }
  const tilt =
    f.pose.tilt * 0.8 +
    (licking(v, f) ? 0.18 * sigOf(f) : 0) +
    (f.still ? 0 : happy(f) ? Math.sin(t * 11) * 0.06 : Math.sin(t * 0.9) * 0.03)
  const head = mul(flip, mul(move(at.x, at.y), turnAbout({ x: 0, y: 0 }, lerp(tilt, KO_TILT, c))))

  // Idle loops: the tail wags (fast when happy), an ear twitches now and then; ears flatten on a flinch.
  const fast = happy(f) || fl.k > 0
  const wag = f.still ? 0 : fast ? Math.sin(t * 15) * 0.45 : Math.sin(t * 3.2) * 0.22
  const tw = (t * 0.31 + 0.2) % 1
  let ear = !f.still && tw < 0.07 ? Math.sin((tw / 0.07) * TAU) * 0.35 : 0
  if (flash > 0 || f.mood === 'scared' || f.mood === 'sad') ear -= 0.45
  return {
    body: mul(flip, spine),
    legs: mul(flip, squash),
    head,
    ko: c,
    flash,
    spin,
    wag,
    ear: lerp(ear, -0.6, c),
  }
}

/** Kit-frame bounds of an ellipse in some frame. */
function ellBounds(m: Mat, e: { x: number; y: number; rx: number; ry: number }): Pt[] {
  return Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * TAU
    return apply(m, { x: e.x + Math.cos(a) * e.rx, y: e.y + Math.sin(a) * e.ry })
  })
}
function boundsOf(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const v = variantOf(look)
  const r = rigOf(v, f)
  const head = apply(r.head, { x: 0, y: 0 })
  const top = apply(r.head, { x: 0, y: -HEAD_RY - EAR_H * (1 - r.ko) })
  // While Kage licks its paw, the solver's head box shrinks to the crown so the paw may come up to the mouth.
  const lick = licking(v, f)
  return {
    headTop: top.y,
    head: lick
      ? { x: head.x - 3, y: head.y - 3, rx: 8, ry: 7.5 }
      : { x: head.x, y: head.y, rx: HEAD_RX, ry: HEAD_RY },
    socketF: apply(r.body, SOCKET_F),
    socketB: apply(r.body, SOCKET_B),
    // The torso is what covers the far paw (the haunch sits behind the chest).
    bodyBox: boundsOf(ellBounds(r.body, TORSO)),
    upper: LIMB,
    fore: LIMB,
    armed: true,
    handR: HAND_R,
  }
}

/** Shoulder and elbow angles that put the paw on `target` (elbow back, like a front leg); straight when too far. */
function legTo(socket: Pt, target: Pt): { s: number; e: number } {
  const dx = target.x - socket.x
  const dy = target.y - socket.y
  const d = Math.max(1e-6, Math.hypot(dx, dy))
  const to = Math.atan2(dx, dy)
  const cos = (d * d) / (2 * LIMB * d)
  const s = to - Math.acos(Math.min(1, cos))
  const ex = socket.x + Math.sin(s) * LIMB
  const ey = socket.y + Math.cos(s) * LIMB
  return { s, e: Math.atan2(target.x - ex, target.y - ey) - s }
}

/** Moods in which the free front paw stays planted (the near one holds the ball, swats, or pumps). */
const PLANT = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried', 'throw', 'pump'])

/**
 * Paw reactions on the mood pose: the free paw planted on the ground while the near one holds the ball (an idle wave
 * still plays), all fours without the ball, both paws up waving on cheer, raised on cast, Kage's paw lick; on KO the
 * paws stretch out along the floor. Angles follow the body's spin on the backflip.
 */
function pose(look: CreatureLook, f: Frame): Pose {
  const v = variantOf(look)
  const p = { ...f.pose }
  const m = metrics(look, f)
  const r = rigOf(v, f)
  const t = f.t
  const wave = (ph: number) => (f.still ? 0 : 0.28 * Math.sin(t * 15 + ph))
  const plant = (socket: Pt, dx: number) => legTo(socket, { x: socket.x + dx, y: -HAND_R })
  const set = (which: 'F' | 'B', a: { s: number; e: number }) => {
    if (which === 'F') [p.sF, p.eF] = [a.s, a.e]
    else [p.sB, p.eB] = [a.s, a.e]
  }
  const wavy = f.mood === 'idle' && p.sB < -1.2
  if (f.mood === 'cheer' || f.mood === 'revive') {
    p.sF = 2 + wave(0)
    p.eF = 0.35 + wave(2)
    p.sB = -2.1 - wave(1)
    p.eB = -0.35 - wave(3)
  } else if (f.mood === 'cast') {
    p.sF = 2.1
    p.eF = 0.4
    p.sB = -2.4
    p.eB = -0.3
  } else if (!f.holding && (f.mood === 'idle' || f.mood === 'watch' || f.mood === 'sad')) {
    // All fours.
    set('F', plant(m.socketF, 4.5))
    if (!wavy) set('B', plant(m.socketB, 3.5))
  } else if (PLANT.has(f.mood) && !wavy) {
    set('B', plant(m.socketB, 3.5))
  }
  if (licking(v, f)) {
    // Up to the mouth, a lick per stroke.
    const mouth = apply(r.head, { x: FACE_X + 6, y: 6 + (f.still ? 0 : Math.sin(t * 14) * 1.2) })
    set('B', legTo(m.socketB, mouth))
  }
  // Angles are in the kit frame: on the backflip they turn with the body.
  p.sF -= r.spin
  p.sB -= r.spin
  const c = r.ko
  if (c > 0) {
    const fF = plant(m.socketF, 10)
    const fB = plant(m.socketB, 6)
    p.sF = lerp(p.sF, fF.s, c)
    p.eF = lerp(p.eF, fF.e, c)
    p.sB = lerp(p.sB, fB.s, c)
    p.eB = lerp(p.eB, fB.e, c)
  }
  return p
}

/** What a variant painter gets. */
interface Paint {
  look: CreatureLook
  f: Frame
  r: Rig
  v: Variant
  /** Idle time (0 when still). */
  t: number
  /** Main colour after the hurt flash. */
  main: string
  fl: { k: number; age: number; cheer: boolean }
  sig: number
}

/** A thick tapered rope (tail): outline, colour, then a light inner line. */
function rope(ctx: Ctx, d: Path2D, w: number, c: string): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = w + 5
  ctx.stroke(d)
  ctx.strokeStyle = c
  ctx.lineWidth = w
  ctx.stroke(d)
  ctx.strokeStyle = lightOf(c)
  ctx.lineWidth = w * 0.3
  ctx.globalAlpha *= 0.7
  ctx.translate(-0.6, -0.8)
  ctx.stroke(d)
  ctx.restore()
}

/** A pointed leaf along +x from the origin, `l` long. */
const leaf = (l: number, w: number) => new Path2D(`M0 0 Q${l * 0.45} ${-w} ${l} 0 Q${l * 0.45} ${w} 0 0 Z`)

/** A four-point sparkle. */
function sparkle(ctx: Ctx, x: number, y: number, s: number, c = '#ffffff'): void {
  if (s <= 0.05) return
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.quadraticCurveTo(x, y, x + s, y)
  ctx.quadraticCurveTo(x, y, x, y + s)
  ctx.quadraticCurveTo(x, y, x - s, y)
  ctx.quadraticCurveTo(x, y, x, y - s)
  ctx.fill()
}

/** The tail, from the rump, wagging (spine frame). Each variant has its own tip. */
function tail(ctx: Ctx, p: Paint): void {
  const { v, r, look, f, t } = p
  const s = SHAPES[v]
  const c = p.main
  ctx.save()
  ctx.translate(-5, -2)
  // Flopped: the tail lies along the floor behind.
  ctx.rotate(r.wag + lerp(0, 0.9, r.ko))
  const puff = v === 'cat' && (p.fl.k > 0 || f.mood === 'scared' || p.r.flash > 0) ? 1 : 0
  switch (s.tail) {
    case 'curl': {
      // A long S tail whose tip curls over.
      const curl = f.still ? 0 : Math.sin(t * 2.1) * 2
      const d = new Path2D(`M0 0 C-8 0 -14 -4 -13 -12 C-12 -19 -6 ${-21 + curl} -5 ${-17 + curl}`)
      rope(ctx, d, 4.2 + puff * 2.4, c)
      break
    }
    case 'leaf': {
      const d = new Path2D('M0 0 C-5 0 -9 -3 -10 -8')
      rope(ctx, d, 3.2, c)
      ctx.save()
      ctx.translate(-10, -8)
      ctx.rotate(-2 + (f.still ? 0 : Math.sin(t * 5) * 0.15))
      group(ctx, [{ p: leaf(11, 4.5), c: look.second, k: 0.6 }])
      ctx.strokeStyle = darkOf(look.second)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.lineTo(9, 0)
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'tuft': {
      const d = new Path2D('M0 0 C-7 1 -12 -2 -13 -9')
      rope(ctx, d, 3, c)
      group(ctx, [{ p: ell(-13.5, -11, 3.6, 4.2, -0.4), c: look.second, k: 0.8 }])
      break
    }
    case 'gem': {
      const d = new Path2D('M0 0 C-7 0 -11 -3 -12 -8')
      rope(ctx, d, 3.6, c)
      paintGem(ctx, -12.5, -10.5, 3, 5.5, -0.5, look.second, p)
      break
    }
    case 'spade': {
      const d = new Path2D('M0 0 C-7 1 -12 -1 -14 -7')
      rope(ctx, d, 3.8, c)
      ctx.save()
      ctx.translate(-14.5, -8.5)
      ctx.rotate(-0.4)
      group(ctx, [
        { p: new Path2D('M0 -5 Q4 -1 2.5 2 Q0 1 0 3 Q0 1 -2.5 2 Q-4 -1 0 -5 Z'), c: look.second, k: 0.6 },
      ])
      ctx.restore()
      break
    }
    case 'nub':
      group(ctx, [{ p: box(-6.5, -4.5, 6, 5.5, 2), c: look.second, k: 0.7 }])
      break
  }
  ctx.restore()
}

/** A faceted crystal (spine or head frame): a tall diamond with a light facet that glints. */
function paintGem(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
  c: string,
  p: Paint,
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  const flash = p.fl.k
  const col = flash ? mix(c, '#ffffff', 0.6 * flash) : c
  group(ctx, [
    {
      p: new Path2D(`M0 ${-h} L${w} ${-h * 0.25} L${w * 0.6} ${h * 0.6} L0 ${h * 0.75} L${-w} 0 Z`),
      c: col,
      k: 0.6,
    },
  ])
  paint(ctx, { p: new Path2D(`M0 ${-h} L${w * 0.15} 0 L${-w} 0 Z`), c: lightOf(col), k: 0, lw: 0 })
  ctx.restore()
}

/** Crystal spikes down Nyx's back (spine frame, behind the torso so only the tips show). */
const SPIKES: Array<[number, number, number, number]> = [
  [-3, -7, 3.6, -0.8],
  [3, -10, 4.4, -0.45],
  [9, -11, 3.6, -0.1],
]

/** Dragon wings on the back: scenery only, they flap gently and spread on cheer (spine frame). */
function wings(ctx: Ctx, p: Paint): void {
  const { f, t, look, fl } = p
  const flap = f.still ? 0 : Math.sin(t * (fl.k > 0 ? 18 : 2.6)) * (0.12 + 0.25 * fl.k)
  for (const [dx, k] of [
    [-3, 0.75],
    [0, 1],
  ] as const) {
    ctx.save()
    ctx.translate(3 + dx, -8)
    ctx.rotate((k < 1 ? -0.55 : -0.1) - flap - 0.35 * fl.k)
    ctx.scale(1.35, 1.35)
    const c = k < 1 ? darkOf(p.main) : p.main
    group(ctx, [
      {
        p: new Path2D('M0 0 L-3 -15 Q-7 -12 -10 -12 Q-11 -8 -14 -6 Q-13 -3 -14 0 Q-7 -1 0 0 Z'),
        c: mix(look.second, c, 0.35),
        k: 0.5,
      },
    ])
    ctx.strokeStyle = c
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-3, -15)
    ctx.stroke()
    ctx.restore()
  }
}

/** Behind the torso (spine frame): wings, spikes. */
function backLayer(ctx: Ctx, p: Paint): void {
  if (p.v === 'dragon') wings(ctx, p)
  if (p.v === 'crystal')
    for (const [x, y, w, rot] of SPIKES) paintGem(ctx, x, y, w, w * 1.8, rot, p.look.second, p)
}

/** Dice pips: 1–6 laid out on a face of half-size `h` centred at (x, y). */
function pips(ctx: Ctx, x: number, y: number, h: number, n: number, c: string): void {
  const a = h * 0.55
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [
      [-a, -a],
      [a, a],
    ],
    3: [
      [-a, -a],
      [0, 0],
      [a, a],
    ],
    4: [
      [-a, -a],
      [a, -a],
      [-a, a],
      [a, a],
    ],
    5: [
      [-a, -a],
      [a, -a],
      [0, 0],
      [-a, a],
      [a, a],
    ],
    6: [
      [-a, -a],
      [a, -a],
      [-a, 0],
      [a, 0],
      [-a, a],
      [a, a],
    ],
  }
  ctx.fillStyle = c
  ctx.beginPath()
  for (const [px, py] of spots[n]) ctx.ellipse(x + px, y + py, h * 0.16, h * 0.16, 0, 0, TAU)
  ctx.fill()
}

/** The face Lucky shows: a lucky 5, rolling through the faces on the signature and cheer. */
function pipCount(p: Paint, seed: number): number {
  const rolling = p.sig > 0.05 || p.fl.k > 0.05
  if (!rolling) return seed === 0 ? 5 : 3
  return 1 + (Math.floor(p.t * 14 + seed * 3.3) % 6)
}

/** The torso (spine frame) with belly, and per-variant marks. */
function torso(ctx: Ctx, p: Paint): void {
  const { v, look } = p
  const s = SHAPES[v]
  if (s.cube) {
    // A die: a rounded cube body tumbling a quarter turn on cheer.
    const roll = p.fl.cheer ? easeOut(p.fl.age / 0.55) * (Math.PI / 2) : 0
    ctx.save()
    ctx.translate(TORSO.x, TORSO.y)
    ctx.rotate(-roll)
    group(ctx, [{ p: box(-12, -11, 24, 21, 5), c: p.main, k: 0.9 }])
    pips(ctx, -4.5, -3, 6.5, pipCount(p, 0), look.second)
    gloss(ctx, -6, -6, 2.4, 1.2, -0.4)
    ctx.restore()
    return
  }
  const body = ell(TORSO.x, TORSO.y, TORSO.rx, TORSO.ry)
  group(ctx, [{ p: body, c: p.main }])
  if (v === 'dragon') {
    // Cream belly plates.
    ctx.save()
    ctx.clip(body)
    paint(ctx, { p: ell(TORSO.x + 6, TORSO.y + 4, 7, 6, -0.4), c: look.second, k: 0.4, lw: 0 })
    ctx.strokeStyle = darkOf(look.second)
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const k of [0, 1, 2]) {
      ctx.moveTo(TORSO.x + 1 + k * 3.5, TORSO.y + 3 + k * 0.5)
      ctx.lineTo(TORSO.x + 3 + k * 3.5, TORSO.y + 9)
    }
    ctx.stroke()
    ctx.restore()
  } else if (s.belly) {
    ctx.save()
    ctx.clip(body)
    paint(ctx, {
      p: ell(TORSO.x + 5, TORSO.y + 5, 7.5, 5.5, -0.3),
      c: mix(p.main, '#ffffff', s.belly),
      k: 0,
      lw: 0,
    })
    ctx.restore()
  }
  if (v === 'cat') {
    // Shadow stripes.
    ctx.strokeStyle = darkOf(p.main)
    ctx.lineWidth = 1.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const x of [1, 5, 9]) {
      ctx.moveTo(x, -10)
      ctx.lineTo(x - 1, -5.5)
    }
    ctx.stroke()
  }
  gloss(ctx, TORSO.x - 5, TORSO.y - 5, 3, 1.4, -0.3)
}

/** A back haunch and foot (legs frame); flopped, the leg stretches out behind. */
function backLeg(ctx: Ctx, p: Paint, dx: number, c: string, k: DrawKit | null): void {
  const ko = p.r.ko
  ctx.save()
  ctx.translate(dx - 3 * ko, 0)
  // Flopped: the thigh lowers and turns, the foot points back along the floor.
  ctx.translate(THIGH.x, THIGH.y)
  ctx.rotate(-0.9 * ko)
  ctx.translate(-THIGH.x, -THIGH.y + 1.5 * ko)
  const thigh =
    p.v === 'dice' ? box(THIGH.x - 4.5, THIGH.y - 3.5, 9, 10, 3.5) : ell(THIGH.x, THIGH.y, THIGH.rx, THIGH.ry)
  group(ctx, [
    { p: ell(FOOT.x, FOOT.y, FOOT.rx, FOOT.ry), c: p.v === 'dice' ? p.look.second : c, k: 0.6 },
    { p: thigh, c },
  ])
  if (k) {
    gloss(ctx, THIGH.x - 2.5, THIGH.y - 3.5, 1.8, 1, -0.4)
    k.emblem(THIGH.x + 0.5, THIGH.y + 0.5, 5.5)
  }
  ctx.restore()
}

/** One ear (head frame), rotated about its base by the twitch. */
function ear(ctx: Ctx, p: Paint, x: number, y: number, lean: number, back: boolean): void {
  const { v, look, r } = p
  const s = SHAPES[v]
  const c = back ? darkOf(p.main) : p.main
  const inner = back ? darkOf(PINK) : PINK
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean + (back ? r.ear * 0.4 : r.ear))
  switch (s.ear) {
    case 'point':
      group(ctx, [{ p: new Path2D('M-4.5 2 L0 -9 L4.5 2 Z'), c }])
      paint(ctx, { p: new Path2D('M-2.3 1 L0 -5.5 L2.3 1 Z'), c: inner, k: 0, lw: 0 })
      break
    case 'leaf': {
      ctx.rotate(-Math.PI / 2)
      group(ctx, [{ p: leaf(11, 4.2), c: back ? darkOf(look.second) : look.second, k: 0.6 }])
      ctx.strokeStyle = darkOf(look.second)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(1, 0)
      ctx.lineTo(9, 0)
      ctx.stroke()
      break
    }
    case 'round':
      group(ctx, [{ p: ell(0, -3, 4, 4), c }])
      paint(ctx, { p: ell(0, -2.6, 2, 2), c: inner, k: 0, lw: 0 })
      break
    case 'gem':
      paintGem(ctx, 0, -3.5, 3.2, 6, 0, back ? darkOf(look.second) : look.second, p)
      break
    case 'fin':
      group(ctx, [{ p: new Path2D('M-3 2 Q-4 -5 2 -8 Q1 -3 3.5 2 Z'), c: mix(look.second, c, 0.3), k: 0.6 }])
      break
    case 'square':
      group(ctx, [{ p: box(-3.2, -6, 6.4, 7.5, 2), c: back ? darkOf(look.second) : look.second, k: 0.6 }])
      break
  }
  ctx.restore()
}

/** Aurelia's mane: a ring of sun rays round the head, glowing; it flares on the roar (head frame, behind the head). */
function mane(ctx: Ctx, p: Paint): void {
  const { look, t, f, fl, sig } = p
  const flare = Math.max(fl.k, sig)
  const n = 12
  const r0 = 12.5 + 1.5 * flare
  const r1 = 17 + 4 * flare + (f.still ? 0 : Math.sin(t * 2) * 0.6)
  let d = ''
  for (let i = 0; i < n; i++) {
    const a0 = ((i - 0.5) / n) * TAU + t * 0.15
    const a1 = (i / n) * TAU + t * 0.15
    const a2 = ((i + 0.5) / n) * TAU + t * 0.15
    const q = (a: number, rad: number) =>
      `${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad * 0.95).toFixed(2)}`
    d += `${i ? 'L' : 'M'}${q(a0, r0)} Q${q(a1 - 0.12, r1)} ${q(a1, r1)} Q${q(a1 + 0.12, r1)} ${q(a2, r0)} `
  }
  ctx.save()
  ctx.shadowColor = GOLD
  ctx.shadowBlur = f.still ? 6 : 6 + 4 * Math.sin(t * 2.4) + 12 * flare
  group(ctx, [{ p: new Path2D(d + 'Z'), c: look.second, k: 0.8 }])
  ctx.restore()
}

/** Sprig's sprout: two leaves on a stem from the crown, rustling; spins like a propeller on cheer (head frame). */
function sprout(ctx: Ctx, p: Paint): void {
  const { look, t, f, fl, sig } = p
  const spin = fl.cheer ? easeOut(fl.age / 1) * TAU * 2 : 0
  const shake = f.still
    ? 0
    : Math.sin(t * 2.2) * 0.08 + Math.sin(t * 38) * 0.3 * sig + Math.sin(t * 30) * 0.2 * fl.k
  ctx.save()
  ctx.translate(1.5, -15.5)
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 4.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.lineTo(0, -2)
  ctx.stroke()
  ctx.strokeStyle = darkOf(look.second)
  ctx.lineWidth = 1.8
  ctx.stroke()
  ctx.translate(0, -2)
  ctx.rotate(shake)
  // A propeller seen from the side: the leaves sweep round, foreshortened.
  for (const [side, ph] of [
    [-1, 0],
    [1, Math.PI],
  ] as const) {
    const k = spin ? Math.cos(spin + ph) : side
    ctx.save()
    ctx.scale(k || 0.05, 1)
    ctx.rotate(-0.45)
    group(ctx, [{ p: leaf(10, 3.8), c: side < 0 && !spin ? darkOf(look.second) : look.second, k: 0.6 }])
    ctx.restore()
  }
  ctx.restore()
}

/** Per-variant face marks drawn on the head under the eyes (head frame). */
function muzzle(ctx: Ctx, p: Paint): void {
  const { v, look } = p
  const x = FACE_X
  if (v === 'lion' || v === 'sprout') {
    paint(ctx, { p: ell(x + 0.5, 4.5, 5.5, 3.6), c: mix(p.main, '#ffffff', 0.5), k: 0, lw: 0 })
  }
  if (v === 'cat' || v === 'lion') {
    // Whiskers.
    ctx.strokeStyle = v === 'cat' ? lightOf(p.main) : darkOf(look.second)
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [sx, dy] of [
      [-1, -0.8],
      [-1, 0.8],
      [1, -0.8],
      [1, 0.8],
    ]) {
      ctx.moveTo(x + sx * 6.5, 4.5 + dy)
      ctx.lineTo(x + sx * 11, 4 + dy * 2.4)
    }
    ctx.stroke()
  }
}

/** Eyes (head frame): dot eyes that look around, glowing slit eyes for Kage, ^ ^ happy, xx on KO, squeezed on a flinch. */
function eyes(ctx: Ctx, p: Paint): void {
  const { f, t, look } = p
  const ex = [FACE_X - EYE_GAP, FACE_X + EYE_GAP]
  const y = 0.5
  const lick = licking(p.v, f)
  const glow = look.eye !== OUTLINE
  ctx.lineCap = 'round'
  if (happy(f) || lick) {
    for (const x of ex) happyEye(ctx, x, y, 2.6, glow ? look.eye : OUTLINE, 2.4)
  } else if (f.eyes === 'xx') {
    ctx.strokeStyle = glow ? look.eye : OUTLINE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const x of ex) {
      ctx.moveTo(x - 2.1, y - 2.1)
      ctx.lineTo(x + 2.1, y + 2.1)
      ctx.moveTo(x + 2.1, y - 2.1)
      ctx.lineTo(x - 2.1, y + 2.1)
    }
    ctx.stroke()
  } else if (f.eyes === 'squeeze') {
    ctx.strokeStyle = glow ? look.eye : OUTLINE
    ctx.lineWidth = 2.1
    ctx.beginPath()
    for (const [x, d] of [
      [ex[0], 1],
      [ex[1], -1],
    ]) {
      ctx.moveTo(x - 2 * d, y - 2.3)
      ctx.lineTo(x + 1.9 * d, y)
      ctx.lineTo(x - 2 * d, y + 2.3)
    }
    ctx.stroke()
  } else {
    const wide = f.eyes === 'wide' ? 1.25 : 1
    const shut = f.blink > 0 || f.pose.eyeOpen < 0.2
    const open = Math.max(0.35, Math.min(1, f.pose.eyeOpen))
    const lx = f.lookX * 0.9 + (f.still ? 0 : wander(t, 3) * 0.7)
    const ly = f.lookY * 0.8
    if (glow) {
      // Kage: glowing almond eyes with slit pupils, through the mask.
      for (const x of ex) {
        if (shut) {
          ctx.strokeStyle = look.eye
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x - 2.4, y)
          ctx.lineTo(x + 2.4, y)
          ctx.stroke()
          continue
        }
        ctx.save()
        ctx.shadowColor = look.eye
        ctx.shadowBlur = 4
        paint(ctx, { p: ell(x, y, 2.7 * wide, 2.2 * wide * open, 0), c: look.eye, k: 0, lw: 1.2 })
        ctx.restore()
        ctx.fillStyle = OUTLINE
        ctx.beginPath()
        ctx.ellipse(x + lx * 0.8, y + ly * 0.5, 0.75, 1.9 * wide * open, 0, 0, TAU)
        ctx.fill()
      }
    } else {
      for (const x of ex) dotEye(ctx, x, y, 2 * wide, 2.7 * wide * open, shut, lx, ly)
    }
  }
  // Worried or angry brows only.
  if (f.eyes !== 'xx' && !glow && (Math.abs(f.pose.brow) > 0.3 || f.pose.browUp > 0.5)) {
    const up = f.pose.browUp * 1.3
    const knit = f.pose.brow * 1.5
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(ex[0] - 2.5, -4.5 - up)
    ctx.lineTo(ex[0] + 2, -4.5 - up + knit)
    ctx.moveTo(ex[1] + 2.5, -4.5 - up)
    ctx.lineTo(ex[1] - 2, -4.5 - up + knit)
    ctx.stroke()
  }
}

/** Nose and mouth (head frame): a little ω mouth; open when happy or roaring; o on KO; a frown. */
function mouth(ctx: Ctx, p: Paint): void {
  const { f, v, sig, fl } = p
  const x = FACE_X
  const y = 4.2
  // Nose.
  if (v === 'dragon') {
    ctx.fillStyle = OUTLINE
    ctx.beginPath()
    ctx.ellipse(x + 3.2, y - 1, 0.7, 0.5, 0, 0, TAU)
    ctx.ellipse(x + 5.4, y - 1.2, 0.7, 0.5, 0, 0, TAU)
    ctx.fill()
  } else if (v !== 'dice') {
    paint(ctx, {
      p: new Path2D(`M${x - 1.4} ${y - 1} L${x + 1.4} ${y - 1} L${x} ${y + 0.5} Z`),
      c: '#e8597a',
      k: 0,
      lw: 1.1,
    })
  }
  const roar = v === 'lion' ? Math.max(fl.k, sig) : 0
  if (roar > 0.2) {
    openMouth(ctx, x, y + 1, 3 + 1.5 * roar, 3.5 + 3 * roar)
  } else if (f.mood === 'ko' || (f.pose.mouthOpen > 0.45 && !happy(f) && f.pose.smile <= 0.3)) {
    ctx.fillStyle = '#7a1f2b'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(x, y + 2.6, 1.6, 1.1 + 1.1 * f.pose.mouthOpen, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
  } else if (f.pose.smile < 0) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y + 4.2, 2.4, 1.2 * Math.PI, 1.8 * Math.PI)
    ctx.stroke()
  } else if (happy(f)) {
    openMouth(ctx, x, y + 1, 3, 3.6)
  } else {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(x - 1.3, y + 0.8, 1.3, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.arc(x + 1.3, y + 0.8, 1.3, 0.1 * Math.PI, 0.9 * Math.PI)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgb(255 130 150 / 0.45)'
  ctx.beginPath()
  ctx.ellipse(x - EYE_GAP - 2.6, y - 0.4, 2, 1.2, 0, 0, TAU)
  ctx.ellipse(x + EYE_GAP + 2.6, y - 0.4, 2, 1.2, 0, 0, TAU)
  ctx.fill()
}

/** The tongue out for Kage's paw lick (over the mask). */
function tongue(ctx: Ctx, p: Paint): void {
  const k = p.sig
  if (k <= 0.1) return
  const out = 1.5 + (p.f.still ? 0 : Math.max(0, Math.sin(p.t * 14))) * 2.2 * k
  paint(ctx, { p: box(FACE_X + 1.5, 6, 2.8, out + 1.4, [0, 0, 1.4, 1.4]), c: PINK, k: 0, lw: 1.1 })
}

/** The whole head (head frame): ears, mane, head shape, face, hat and the bits over the hat. */
function head(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { v, look } = p
  const s = SHAPES[v]
  if (v === 'lion') mane(ctx, p)
  // Ears behind the head: the far one in shade.
  ear(ctx, p, -6, -7.5, -0.35, true)
  ear(ctx, p, 4.5, -8.5, 0.25, false)
  const shape = s.cube
    ? box(-HEAD_RX + 0.5, -HEAD_RY + 0.5, HEAD_RX * 2 - 1, HEAD_RY * 2 - 1, 6)
    : ell(0, 0, HEAD_RX, HEAD_RY)
  group(ctx, [{ p: shape, c: p.main, k: 1.1 }])
  gloss(ctx, -6, -6, 2.8, 1.5, -0.6)
  if (v === 'dice') {
    // Pips for cheeks, rolling with the body.
    ctx.save()
    ctx.globalAlpha *= 0.9
    pips(ctx, -6.5, 3.5, 3.6, pipCount(p, 1) > 3 ? 2 : 1, look.second)
    ctx.restore()
  }
  if (v === 'crystal') {
    // A gem set in the brow.
    paintGem(ctx, FACE_X, -5.5, 1.8, 2.6, 0, look.second, p)
  }
  muzzle(ctx, p)
  const masked = v === 'cat'
  if (!masked) {
    eyes(ctx, p)
    mouth(ctx, p)
  }
  k.hat(s.hat)
  if (masked) {
    eyes(ctx, p)
    if (licking(v, p.f)) tongue(ctx, p)
  }
  if (v === 'sprout') sprout(ctx, p)
}

/** Glints on Nyx's spikes: one travels along them now and then (and on the signature); spine frame. */
function glints(ctx: Ctx, p: Paint): void {
  if (p.f.still) return
  const i = Math.floor(p.t * 0.7) % SPIKES.length
  const k = pulse((p.t * 0.7) % 1, 0.35)
  const [x, y, w] = SPIKES[i]
  sparkle(ctx, x + 0.5, y - w * 1.2, 2.5 * k)
  if (p.sig > 0) {
    const j = Math.min(SPIKES.length - 1, Math.floor(clamp(p.f.fidget) * SPIKES.length))
    const [sx, sy, sw] = SPIKES[j]
    sparkle(ctx, sx, sy - sw * 1.4, 5 * p.sig)
  }
}

/** Cheer and signature effects in the kit frame (over everything). */
function effects(ctx: Ctx, p: Paint, m: BodyMetrics): void {
  const { v, f, fl, sig, look, t, r } = p
  if (f.still) return
  const mouthAt = apply(r.head, { x: FACE_X + 7, y: 4 })
  if (v === 'sprout' && fl.cheer && fl.age < 1.2) {
    // A burst of little leaves that flutter down.
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.55
      const k = fl.age / 1.2
      const x = m.head.x + Math.cos(a) * 26 * easeOut(k * 2) + Math.sin(t * 6 + i) * 2
      const y = m.headTop + 4 + Math.sin(a) * 18 * easeOut(k * 2) + 30 * k * k
      ctx.save()
      ctx.globalAlpha = clamp(2 - k * 2)
      ctx.translate(x, y)
      ctx.rotate(t * 5 + i)
      group(ctx, [{ p: leaf(6, 2.4), c: i % 2 ? look.second : look.main, k: 0 }])
      ctx.restore()
    }
  }
  if (v === 'sprout' && sig > 0.3) {
    // A leaf drifts off on the rustle.
    const k = clamp(f.fidget)
    ctx.save()
    ctx.translate(m.head.x - 6 - k * 10 + Math.sin(k * 12) * 3, m.headTop + 2 + k * 30)
    ctx.rotate(k * 6)
    ctx.globalAlpha = clamp(2 - k * 2)
    group(ctx, [{ p: leaf(6, 2.4), c: look.second, k: 0 }])
    ctx.restore()
  }
  if (v === 'lion' && (fl.k > 0.15 || sig > 0.3)) {
    // Roar lines out of the mouth.
    const k = Math.max(fl.k, sig)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.globalAlpha = k
    for (const [a, l] of [
      [-0.5, 6],
      [0, 8],
      [0.5, 6],
    ]) {
      const o = 4 + ((t * 30) % 5)
      ctx.beginPath()
      ctx.moveTo(mouthAt.x + Math.cos(a) * o, mouthAt.y + Math.sin(a) * o)
      ctx.lineTo(mouthAt.x + Math.cos(a) * (o + l * k), mouthAt.y + Math.sin(a) * (o + l * k))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  if (v === 'crystal' && fl.k > 0.1) {
    // Sparkles burst off the spikes.
    const top = apply(r.body, { x: 6, y: -14 })
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.6
      const d = 6 + 22 * easeOut(fl.age / 0.6)
      sparkle(
        ctx,
        top.x + Math.cos(a) * d,
        top.y + Math.sin(a) * d,
        3.2 * fl.k,
        i % 2 ? '#ffffff' : look.second,
      )
    }
  }
  if (v === 'dragon' && fl.k > 0.05 && fl.age < 0.7) {
    // A tiny flame puff out of the mouth.
    const k = pulse(fl.age, 0.7) * (fl.cheer ? 1 : 0.5)
    const len = 6 + 12 * k
    ctx.save()
    ctx.translate(mouthAt.x, mouthAt.y)
    ctx.rotate(-0.15)
    ctx.shadowColor = '#ffa94d'
    ctx.shadowBlur = 8 * k
    paint(ctx, {
      p: new Path2D(
        `M0 0 Q${len * 0.5} ${-5 * k} ${len} ${-1 * k} Q${len * 0.6} ${1 * k} ${len * 0.9} ${3 * k} Q${len * 0.4} ${5 * k} 0 0 Z`,
      ),
      c: '#ff922b',
      k: 0,
      lw: 1.3,
    })
    paint(ctx, { p: ell(len * 0.4, 0.3 * k, len * 0.28, 1.4 * k), c: '#ffe066', k: 0, lw: 0 })
    ctx.restore()
  }
  if (v === 'dragon' && sig > 0.1) {
    // Smoke rings puff from the nostrils.
    const k = clamp(f.fidget)
    const nose = apply(r.head, { x: FACE_X + 5, y: 2 })
    for (let i = 0; i < 2; i++) {
      const q = clamp(k * 1.6 - i * 0.4)
      if (q <= 0 || q >= 1) continue
      ctx.globalAlpha = 0.75 * (1 - q)
      paint(ctx, {
        p: ell(nose.x + 3 + q * 8, nose.y - 2 - q * 12, 1.8 + q * 2.6, 1.6 + q * 2.2),
        c: SMOKE,
        k: 0,
        lw: 1,
      })
    }
    ctx.globalAlpha = 1
  }
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const v = variantOf(look)
  const r = rigOf(v, f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  const main = r.flash ? mix(look.main, '#3a1f2e', r.flash) : look.main
  const p: Paint = { look, f, r, v, t, main, fl: flourish(f), sig: sigOf(f) }
  const lick = licking(v, f)
  // Lucky's legs are teal so the white die body reads apart from them.
  const leg = SHAPES[v].cube ? mix(look.second, main, 0.35) : main

  // Behind: wings and spikes, the tail, the far back leg, the far front leg.
  ctx.save()
  along(ctx, r.body)
  backLayer(ctx, p)
  tail(ctx, p)
  ctx.restore()
  ctx.save()
  along(ctx, r.legs)
  backLeg(ctx, p, 4, darkOf(leg), null)
  ctx.restore()
  const farLeg = () => {
    drawArm(ctx, m.socketB, k.hands.back, LEG_W, darkOf(leg))
    k.backHand()
  }
  if (!lick) farLeg()

  // The torso, the near back leg (emblem on the haunch).
  ctx.save()
  along(ctx, r.body)
  torso(ctx, p)
  if (v === 'crystal') glints(ctx, p)
  ctx.restore()
  ctx.save()
  along(ctx, r.legs)
  backLeg(ctx, p, 0, leg, k)
  ctx.restore()

  ctx.save()
  along(ctx, r.head)
  head(ctx, p, k)
  ctx.restore()

  // Kage brings the far paw up to its mouth, in front of the face.
  if (lick) farLeg()
  drawArm(ctx, m.socketF, k.hands.front, LEG_W, leg)
  k.frontHand()
  effects(ctx, p, m)
  if (happy(f)) ticks(ctx, m.head.x + 14, m.headTop - 4, f.moodAge)
}

/** A round paw along the forearm, toe lines at its front; it spreads flat when open (the throw's follow-through). */
function drawHand(ctx: Ctx, h: HandPose, look: CreatureLook, r: number): void {
  const a = Math.atan2(h.y - h.ey, h.x - h.ex)
  const len = r * (1.12 + 0.25 * h.open)
  const wid = r * (0.95 - 0.2 * h.open)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.rotate(a)
  group(ctx, [{ p: ell(0, 0, len, wid), c: look.hand, k: 0.6 }])
  ctx.strokeStyle = darkOf(look.hand)
  ctx.lineWidth = 1.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const y of [-wid * 0.34, wid * 0.34]) {
    ctx.moveTo(len * 0.5, y)
    ctx.lineTo(len * 0.95, y * 1.1)
  }
  ctx.stroke()
  if (h.open > 0.5) paint(ctx, { p: ell(-len * 0.1, 0, len * 0.35, wid * 0.4), c: PINK, k: 0, lw: 0 })
  ctx.restore()
}

export const critter: BodyType = { metrics, draw, drawHand, pose }
