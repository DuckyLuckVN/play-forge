/**
 * Sprites: small floating spirits, armless, with two floating hands. One rig (hover, bob, squash, lean, KO drift) and
 * five variants, each moving like itself:
 * - spark (Zip): a zig-zag bolt that jitters with electric crackle and zaps on cheer;
 * - flame (Ember): a teardrop whose tongues flicker and whose embers rise; it flares on cheer;
 * - cloud (Volta): breathing puffs, a turning swirl and a crackling bolt; it spins with a flash and rain on cheer;
 * - star (Lumi): five points that twinkle and sway; it spins and sparkles on cheer;
 * - ghost (Boo): a wavy hem and a soft fade; it loops the loop on cheer.
 * On KO each fizzles out (dims, smokes) and drifts down to the floor; revive plays it back.
 */
import type { Pose } from '../../hero-avatar'
import {
  OUTLINE,
  clamp,
  dotEye,
  easeOut,
  ell,
  gloss,
  group,
  happy,
  happyEye,
  lightOf,
  look as wander,
  mix,
  openMouth,
  paint,
  smooth,
  ticks,
} from '../paint'
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HeadBox } from '../types'

type Ctx = CanvasRenderingContext2D
interface Pt {
  x: number
  y: number
}
type Variant = 'spark' | 'flame' | 'cloud' | 'star' | 'ghost'

/** Base hover height and bob (local units). */
const HOVER = 6
const BOB = 2.4
const TAU = Math.PI * 2
const GLOW = '#fff3a0'
const SMOKE = '#8a8f9e'

/** A variant's resting shape (base at y = 0, before the hover). */
interface Shape {
  /** Outline bounds. */
  l: number
  r: number
  t: number
  /** Spin / loop pivot (the middle of the body). */
  mid: Pt
  face: Pt
  head: HeadBox
  hat: HeadBox
  socket: Pt
  emblem: Pt
  /** Bob speed (rad/s): a spark darts, a ghost drifts. */
  bob: number
}

const SHAPES: Record<Variant, Shape> = {
  spark: {
    l: -16,
    r: 18,
    t: -44,
    mid: { x: 1, y: -24 },
    face: { x: 1, y: -31 },
    head: { x: 1, y: -32, rx: 11, ry: 9 },
    hat: { x: 2, y: -43, rx: 10, ry: 6 },
    socket: { x: 15, y: -21 },
    emblem: { x: 4, y: -20 },
    bob: 3.1,
  },
  flame: {
    l: -16,
    r: 16,
    t: -50,
    mid: { x: 0, y: -20 },
    face: { x: 0, y: -18 },
    head: { x: 0, y: -20, rx: 10, ry: 9 },
    hat: { x: 1, y: -29, rx: 8.5, ry: 6 },
    socket: { x: 15, y: -17 },
    emblem: { x: -8, y: -8 },
    bob: 2.4,
  },
  cloud: {
    l: -30,
    r: 29,
    t: -41,
    mid: { x: 0, y: -20 },
    face: { x: 6, y: -20 },
    head: { x: 6, y: -21, rx: 11, ry: 9 },
    hat: { x: 5, y: -33, rx: 12, ry: 8 },
    socket: { x: 20, y: -15 },
    emblem: { x: -14, y: -10 },
    bob: 2.2,
  },
  star: {
    l: -21,
    r: 21,
    t: -43,
    mid: { x: 0, y: -22 },
    face: { x: 0, y: -21 },
    head: { x: 0, y: -22, rx: 10, ry: 9 },
    hat: { x: 0, y: -37, rx: 10, ry: 8 },
    socket: { x: 16, y: -18 },
    emblem: { x: 8, y: -11 },
    bob: 2,
  },
  ghost: {
    l: -19,
    r: 19,
    t: -44,
    mid: { x: 0, y: -22 },
    face: { x: 1, y: -29 },
    head: { x: 1, y: -30, rx: 10, ry: 8 },
    hat: { x: 1, y: -32, rx: 8.5, ry: 7 },
    socket: { x: 16, y: -20 },
    emblem: { x: -8, y: -12 },
    bob: 1.8,
  },
}

const variantOf = (look: CreatureLook): Variant =>
  look.variant in SHAPES ? (look.variant as Variant) : 'spark'

/** 0..1..0 over the first `dur` seconds of a mood. */
const pulse = (age: number, dur: number) => (age < dur ? Math.sin((age / dur) * Math.PI) : 0)

/** Cheer flourish strength 0..1 (a pump plays a lighter, shorter one); 0 under reduced motion. */
function flourish(f: Frame): { k: number; age: number; cheer: boolean } {
  if (f.still || (f.mood !== 'cheer' && f.mood !== 'pump')) return { k: 0, age: 0, cheer: false }
  const cheer = f.mood === 'cheer'
  return { k: pulse(f.moodAge, cheer ? 0.9 : 0.35) * (cheer ? 1 : 0.4), age: f.moodAge, cheer }
}

/** The body's placement for this frame: everything the rig does to the resting shape. */
interface Rig {
  x: number
  y: number
  rot: number
  sx: number
  sy: number
  /** Draw-only spin about the shape's middle (cloud, star, ghost loop). */
  spin: number
  /** KO: 0 floating .. 1 fizzled on the floor. */
  ko: number
  /** Hurt flash 0..1. */
  flash: number
}

function rigOf(v: Variant, f: Frame): Rig {
  const s = SHAPES[v]
  const t = f.t
  const ko = smooth(clamp(f.pose.fall))
  const bob = f.still ? 0 : Math.sin(t * s.bob) * BOB
  let x = 0
  let y = -HOVER + bob
  let sx = 1
  let sy = 1
  let rot = f.pose.lean * 0.5
  let spin = 0
  let flash = 0
  if (!f.still) {
    // Squash spring (+ = wider) and the hurt squash with a dark flash.
    let sq = -f.squash * 0.03
    if (f.mood === 'hurt' && f.moodAge < 0.6) {
      sq += 0.16 * Math.exp(-f.moodAge * 8)
      flash = clamp(1 - f.moodAge / 0.3) * 0.55
    }
    sx += sq
    sy -= sq
    // Each moves like itself while idle.
    if (v === 'spark') x += (Math.sin(t * 31) + Math.sin(t * 47)) * 0.25 * Math.max(0, Math.sin(t * 1.3))
    if (v === 'ghost') {
      x += Math.sin(t * 1.1) * 1.4
      rot += Math.sin(t * 1.1 + 1) * 0.05
    }
    if (v === 'star') rot += Math.sin(t * 0.8) * 0.04
    if (v === 'flame') rot += Math.sin(t * 1.7) * 0.03
    const fl = flourish(f)
    if (fl.k > 0 || fl.cheer) {
      const a = fl.age
      if (v === 'spark' && a < 0.5) x += Math.sin(a * 80) * (fl.cheer ? 1.2 : 0.5) * (1 - a / 0.5)
      if (v === 'flame') sy *= 1 + 0.15 * fl.k
      if (v === 'cloud' && fl.cheer) spin = easeOut(a / 0.6) * TAU
      if (v === 'star') spin = fl.cheer ? easeOut(a / 0.8) * TAU : easeOut(a / 0.35) * (TAU / 5)
      if (v === 'ghost') {
        if (fl.cheer) {
          const th = smooth(clamp(a / 0.9)) * TAU
          x += Math.sin(th) * 10
          y -= (1 - Math.cos(th)) * 10
          spin = th
        } else y -= 3 * fl.k
      }
    }
  }
  // A light crouch squishes a floater a little.
  sy *= 1 - 0.08 * clamp(f.pose.crouch, -1, 1)
  // KO: sag, and drift down until the base sits on the floor.
  if (ko > 0) {
    y = y * (1 - ko)
    rot *= 1 - ko
    sy *= 1 - 0.18 * ko
    sx *= 1 + 0.08 * ko
  }
  return { x, y, rot, sx, sy, spin, ko, flash }
}

/** Resting-shape point → the kit's frame (scale about the base, rotate, place). */
function at(r: Rig, p: Pt): Pt {
  const x = p.x * r.sx
  const y = p.y * r.sy
  const c = Math.cos(r.rot)
  const s = Math.sin(r.rot)
  return { x: x * c - y * s + r.x, y: x * s + y * c + r.y }
}

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const v = variantOf(look)
  const s = SHAPES[v]
  const r = rigOf(v, f)
  const corners = [
    { x: s.l, y: s.t },
    { x: s.r, y: s.t },
    { x: s.l, y: 0 },
    { x: s.r, y: 0 },
  ].map((p) => at(r, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const head = at(r, s.head)
  return {
    headTop: at(r, { x: 0, y: s.t }).y,
    head: { x: head.x, y: head.y, rx: s.head.rx, ry: s.head.ry * r.sy },
    socketF: at(r, s.socket),
    socketB: at(r, { x: -s.socket.x, y: s.socket.y }),
    bodyBox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
    upper: 8,
    fore: 8,
    armed: false,
    handR: 4.2,
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Moods whose back hand rests low behind the body (the front one holds the ball or wrings). */
const REST = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried'])

/**
 * Floating-hand reactions on the mood pose: each hand bobs on its own phase; both up and waving on cheer, raised on
 * cast; the back hand rests low behind while the front one holds (an idle wave still plays); on KO they sink by the
 * body. Angles follow the lean (the body tips by half of it).
 */
function pose(_look: CreatureLook, f: Frame): Pose {
  const p = { ...f.pose }
  const t = f.t
  const wave = (ph: number) => (f.still ? 0 : 0.3 * Math.sin(t * 16 + ph))
  const bob = (ph: number) => (f.still ? 0 : 0.16 * Math.sin(t * 2.4 + ph))
  if (f.mood === 'cheer') {
    p.sF = 2.7 + wave(0)
    p.sB = -2.7 - wave(1)
    p.eF = 0.2 + wave(2)
    p.eB = -0.2 - wave(3)
  } else if (f.mood === 'cast') {
    p.sF = 2.3
    p.sB = -2.3
    p.eF = p.eB = 0.25
  } else if (REST.has(f.mood) && !(f.mood === 'idle' && p.sB < -1.2)) {
    p.sB = -0.55 - bob(0.6) * 0.5
    p.eB = 0.3
    p.eF += bob(0)
  } else {
    p.eF += bob(0)
    p.eB += bob(1.3)
  }
  p.sF += p.lean * 0.5
  p.sB += p.lean * 0.5
  const c = smooth(clamp(f.pose.fall))
  if (c > 0) {
    p.sF = lerp(p.sF, 0.6, c)
    p.eF = lerp(p.eF, 0.4, c)
    p.sB = lerp(p.sB, -0.6, c)
    p.eB = lerp(p.eB, -0.4, c)
  }
  return p
}

/** What a variant painter gets. */
interface Paint {
  look: CreatureLook
  f: Frame
  r: Rig
  /** Idle time (0 when still). */
  t: number
  /** Main colour after hurt flash and KO fizzle. */
  main: string
  fl: { k: number; age: number; cheer: boolean }
}

/** A short zig-zag spark from `a` toward angle `ang`, `len` long. */
function zig(ctx: Ctx, a: Pt, ang: number, len: number, seed: number): void {
  const n = 4
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  for (let i = 1; i <= n; i++) {
    const d = (len * i) / n
    const side = i === n ? 0 : (i % 2 ? 1 : -1) * (1.6 + Math.abs(Math.sin(seed * 3.7 + i)) * 1.4)
    ctx.lineTo(a.x + Math.cos(ang) * d + nx * side, a.y + Math.sin(ang) * d + ny * side)
  }
  ctx.stroke()
}

function glowLine(ctx: Ctx, color: string, w: number, fn: () => void): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = w + 2
  fn()
  ctx.strokeStyle = color
  ctx.lineWidth = w
  fn()
  ctx.restore()
}

/** Shared face: dot eyes that look around, ^ ^ when happy, xx on KO, squeezed on a flinch; small mouth; blush. */
function face(ctx: Ctx, p: Paint, gap: number, size = 1): void {
  const { f, t } = p
  const ex = [-gap, gap]
  ctx.lineCap = 'round'
  if (happy(f)) {
    for (const x of ex) happyEye(ctx, x, 0, 2.7 * size)
  } else if (f.eyes === 'xx') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const x of ex) {
      ctx.moveTo(x - 2.2, -2.2)
      ctx.lineTo(x + 2.2, 2.2)
      ctx.moveTo(x + 2.2, -2.2)
      ctx.lineTo(x - 2.2, 2.2)
    }
    ctx.stroke()
  } else if (f.eyes === 'squeeze') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.2
    ctx.beginPath()
    for (const [x, d] of [
      [ex[0], 1],
      [ex[1], -1],
    ]) {
      ctx.moveTo(x - 2.2 * d, -2.4)
      ctx.lineTo(x + 2 * d, 0)
      ctx.lineTo(x - 2.2 * d, 2.4)
    }
    ctx.stroke()
  } else {
    const wide = f.eyes === 'wide' ? 1.3 : 1
    const shut = f.blink > 0 || f.pose.eyeOpen < 0.2
    const open = Math.max(0.35, Math.min(1, f.pose.eyeOpen))
    const lx = f.lookX * 1.1 + (f.still ? 0 : wander(t, 2) * 0.8)
    const ly = f.lookY * 0.8
    for (const x of ex) dotEye(ctx, x, 0, 2.1 * wide * size, 2.9 * wide * open * size, shut, lx, ly)
  }
  // Worried or angry brows only: a sprite's resting face stays clean.
  if (f.eyes !== 'xx' && (Math.abs(f.pose.brow) > 0.3 || f.pose.browUp > 0.5)) {
    const up = f.pose.browUp * 1.4
    const knit = f.pose.brow * 1.6
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(-gap - 3, -5.5 - up)
    ctx.lineTo(-gap + 2, -5.5 - up + knit)
    ctx.moveTo(gap + 3, -5.5 - up)
    ctx.lineTo(gap - 2, -5.5 - up + knit)
    ctx.stroke()
  }
  const my = 4.2 * size
  if (f.mood === 'ko' || (f.pose.mouthOpen > 0.45 && !happy(f) && f.pose.smile <= 0.3)) {
    ctx.fillStyle = '#7a1f2b'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(0, my + 1.2, 1.8, 1.2 + 1.2 * f.pose.mouthOpen, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
  } else if (f.pose.smile < 0) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(0, my + 3.4, 2.6, 1.2 * Math.PI, 1.8 * Math.PI)
    ctx.stroke()
  } else {
    const joy = happy(f)
    openMouth(ctx, 0, my, (joy ? 3.6 : 2.4) * size, (joy ? 4.6 : 2.6 + 1.6 * f.pose.mouthOpen) * size)
  }
  ctx.fillStyle = 'rgb(255 130 150 / 0.45)'
  ctx.beginPath()
  ctx.ellipse(-gap - 3.4, my - 0.6, 2.2, 1.3, 0, 0, TAU)
  ctx.ellipse(gap + 3.4, my - 0.6, 2.2, 1.3, 0, 0, TAU)
  ctx.fill()
}

/** Zip: a fat zig-zag bolt, edges crackling; zaps out on cheer, a big crackle on the signature. */
function spark(ctx: Ctx, p: Paint): void {
  const { f, t, look, fl } = p
  const s = SHAPES.spark
  const bolt = new Path2D('M-12 -44 L18 -44 L9 -29 L18 -29 L-3 0 L1 -16 L-16 -16 Z')
  const hot = fl.k
  const main = hot ? mix(p.main, '#ffffff', 0.45 * hot) : p.main
  ctx.save()
  if (!f.still && p.r.ko < 0.5) {
    ctx.shadowColor = GLOW
    ctx.shadowBlur = 6 + 14 * hot
  }
  group(ctx, [{ p: bolt, c: main, k: 1.1 }])
  ctx.restore()
  gloss(ctx, -7, -39, 3, 1.5, -0.2)
  gloss(ctx, 8, -11, 1.4, 1, -0.9)
  // Crackle: little arcs that flick on and off around the edges (a big one on the signature).
  if (!f.still && p.r.ko < 0.5) {
    const sig = Math.sin(clamp(f.fidget) * Math.PI)
    const spots: Array<[number, number, number]> = [
      [18, -38, -0.4],
      [-15, -30, Math.PI + 0.3],
      [12, -12, 0.5],
      [-6, -6, Math.PI - 0.6],
    ]
    spots.forEach(([x, y, ang], i) => {
      const on = Math.sin(t * (19 + i * 4) + i * 2) > 0.55 || sig > 0.2
      if (on) glowLine(ctx, look.second, 1.4, () => zig(ctx, { x, y }, ang, 6 + sig * 8, t * 10 + i))
    })
  }
  ctx.save()
  ctx.translate(s.face.x, s.face.y)
  face(ctx, p, 5)
  ctx.restore()
  // Cheer: zaps shoot out all round.
  if (fl.age < 0.6 && fl.k > 0) {
    const out = easeOut(fl.age / 0.3)
    const n = fl.cheer ? 6 : 3
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i - (n - 1) / 2) * (fl.cheer ? 0.75 : 0.9)
      const from = { x: s.mid.x + Math.cos(ang) * 20 * out, y: s.mid.y + Math.sin(ang) * 22 * out }
      glowLine(ctx, look.second, 1.8, () => zig(ctx, from, ang, 10 * fl.k + 4, i + Math.floor(t * 20)))
    }
  }
}

/** Ember's flame outline: a round bottom and three tongues that flicker on their own phases. */
function flamePath(t: number, tall: number, shrink: number): Path2D {
  const w = (ph: number, a: number) => Math.sin(t * 9 + ph) * a + Math.sin(t * 13.7 + ph * 2) * a * 0.6
  const h = (base: number) => base * (1 - 0.6 * shrink) + tall
  const lt = { x: -15 + w(0, 1.4), y: -17 - h(21) }
  const mt = { x: -3 + w(1, 2), y: -17 - h(38) }
  const rt = { x: 12 + w(2, 1.4), y: -17 - h(26) }
  return new Path2D(
    `M16 -17 C16 -6 9 1 0 1 C-9 1 -16 -6 -16 -17 C-16 -25 ${lt.x - 2} ${lt.y + 8} ${lt.x} ${lt.y} ` +
      `C-9 ${lt.y + 5} -7 -31 -6 -29 C-9 -37 ${mt.x - 3} ${mt.y + 9} ${mt.x} ${mt.y} ` +
      `C${mt.x + 5} ${mt.y + 9} 6 -38 5 -32 C7 -35 ${rt.x - 3} ${rt.y + 5} ${rt.x} ${rt.y} C${rt.x + 3} ${rt.y + 8} 16 -26 16 -17 Z`,
  )
}

/** Ember: a teardrop flame, tongues flickering, a hot core with the face; flares on cheer and the signature. */
function flame(ctx: Ctx, p: Paint): void {
  const { f, t, look, fl, r } = p
  const s = SHAPES.flame
  const sig = Math.sin(clamp(f.fidget) * Math.PI)
  const tall = 8 * Math.max(fl.k, sig)
  ctx.save()
  if (!f.still && r.ko < 0.5) {
    ctx.shadowColor = look.second
    ctx.shadowBlur = 8 + 10 * Math.max(fl.k, sig)
  }
  group(ctx, [{ p: flamePath(t, tall, r.ko), c: p.main, k: 1.1 }])
  ctx.restore()
  // The hot core: a smaller teardrop that flickers with its own tip.
  const ct = -32 - tall * 0.5 + (f.still ? 0 : Math.sin(t * 11) * 1.2) + 10 * r.ko
  const core = new Path2D(
    `M0 -2 C-8 -2 -11 -8 -11 -14 C-11 -21 -4 -25 ${f.still ? 0 : Math.sin(t * 8) * 1} ${ct} C4 -25 11 -21 11 -14 C11 -8 8 -2 0 -2 Z`,
  )
  paint(ctx, { p: core, c: r.ko > 0 ? mix(look.second, SMOKE, 0.5 * r.ko) : look.second, k: 0.5, lw: 0 })
  gloss(ctx, -6, -15, 2.4, 1.4, -0.6)
  ctx.save()
  ctx.translate(s.face.x, s.face.y)
  face(ctx, p, 4.2, 0.9)
  ctx.restore()
  // Embers rise off the tips and fade (a burst on the flare).
  if (!f.still && r.ko < 0.5) {
    const n = 3 + Math.round(4 * Math.max(fl.k, sig))
    for (let i = 0; i < n; i++) {
      const k = (t * 0.7 + i * 0.37) % 1
      const x = Math.sin(i * 2.3) * 9 + Math.sin(t * 3 + i) * 2
      const y = -36 - tall - k * 18
      ctx.globalAlpha = 1 - k
      ctx.fillStyle = i % 2 ? look.second : lightOf(look.main)
      ctx.beginPath()
      ctx.arc(x, y, 1.4 - k * 0.6, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

/** Volta's puffs: a union of circles, each breathing on its own phase. */
const PUFFS: Array<[number, number, number]> = [
  [-21, -15, 8.4],
  [-10, -25, 10.6],
  [6, -28, 12.3],
  [19, -19, 9.5],
  [10, -9, 9],
  [-6, -9, 9.5],
]

/** Volta: the approved sample's storm cloud, with a crackling bolt below; spins with a flash and rain on cheer. */
function cloud(ctx: Ctx, p: Paint): void {
  const { f, t, look, fl, r } = p
  const s = SHAPES.cloud
  const flashK = fl.cheer && fl.age < 0.35 ? 1 - fl.age / 0.35 : 0
  const sig = Math.sin(clamp(f.fidget) * Math.PI)
  // Bolt: flickers idle, crackles on the signature, flares on the zap; gone once fizzled.
  if (r.ko < 0.8) {
    const crackle = !f.still && (Math.sin(t * 23) > 0.7 || sig > 0.3) ? 1 : 0
    const bs = 1 + flashK * 0.6 + sig * 0.35
    ctx.save()
    ctx.translate(-1, -1)
    ctx.scale(0.9 * bs, 0.9 * bs)
    if (!f.still && (flashK || crackle)) {
      ctx.shadowColor = GLOW
      ctx.shadowBlur = 8 + flashK * 14
    }
    group(ctx, [
      {
        p: new Path2D('M1 -4 L-3 4 L0 4 L-2 10 L5 1 L2 1 L4 -4 Z'),
        c: crackle || flashK ? '#ffe36b' : look.second,
        k: 0.6,
      },
    ])
    ctx.restore()
  }
  const breathe = (ph: number) => (f.still ? 0 : Math.sin(t * 2.6 + ph * 1.3) * 0.9)
  const puffs = new Path2D()
  PUFFS.forEach(([x, y, rad], i) => puffs.ellipse(x, y, rad + breathe(i), rad + breathe(i), 0, 0, TAU))
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 6
  ctx.stroke(puffs)
  paint(ctx, { p: puffs, c: flashK ? mix(p.main, '#fffbe0', flashK) : p.main, k: 1.3, lw: 0 })
  // The swirl turns slowly.
  ctx.save()
  ctx.translate(-14, -15)
  ctx.rotate(t * 1.2)
  ctx.strokeStyle = mix(p.main, '#3b6fd6', 0.55)
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, 4, Math.PI * 0.2, Math.PI * 1.9)
  ctx.arc(0, 0, 1.6, Math.PI * 1.9, Math.PI * 0.9, true)
  ctx.stroke()
  ctx.restore()
  gloss(ctx, -7, -31, 3.4, 2, -0.5)
  ctx.save()
  ctx.translate(s.face.x, s.face.y)
  face(ctx, p, 5)
  ctx.restore()
}

/** Rain after the cheer zap (in the rig frame, unspun, so it falls straight down). */
function rain(ctx: Ctx, p: Paint): void {
  const { fl } = p
  if (!fl.cheer || fl.age <= 0.1 || fl.age >= 1.2) return
  ctx.save()
  ctx.globalAlpha = clamp((1.2 - fl.age) * 3)
  ctx.strokeStyle = 'rgb(120 190 255 / 0.85)'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    const x = -18 + i * 4.6
    const y = -6 + ((fl.age * 60 + i * 7) % 20)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 1, y + 4)
    ctx.stroke()
  }
  ctx.restore()
}

/** Lumi's star: five chubby rounded points, each twinkling (a length pulse) on its own phase. */
function starPath(t: number, still: boolean, c: Pt): Path2D {
  const pts: Pt[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const R = i % 2 ? 10.5 : 21 + (still ? 0 : Math.sin(t * 1.6 + i * 1.3) * 0.8)
    pts.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R })
  }
  const mid = (a: Pt, b: Pt, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k })
  // Round each corner: a curve through every point, from just before it to just after.
  let d = ''
  pts.forEach((q, i) => {
    const prev = pts[(i + 9) % 10]
    const next = pts[(i + 1) % 10]
    const k = i % 2 ? 0.3 : 0.22
    const a = mid(q, prev, k)
    const b = mid(q, next, k)
    d += `${i ? 'L' : 'M'}${a.x.toFixed(3)} ${a.y.toFixed(3)} Q${q.x.toFixed(3)} ${q.y.toFixed(3)} ${b.x.toFixed(3)} ${b.y.toFixed(3)} `
  })
  return new Path2D(d + 'Z')
}

/** A four-point sparkle. */
function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  if (r <= 0.2) return
  const q = r * 0.28
  const p = new Path2D(
    `M${x} ${y - r} Q${x + q} ${y - q} ${x + r} ${y} Q${x + q} ${y + q} ${x} ${y + r} Q${x - q} ${y + q} ${x - r} ${y} Q${x - q} ${y - q} ${x} ${y - r} Z`,
  )
  ctx.fillStyle = color
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.1
  ctx.lineJoin = 'round'
  ctx.fill(p)
  ctx.stroke(p)
}

/** Lumi: a soft glowing star that twinkles and sways; spins and sparkles on cheer, a big glint on the signature. */
function star(ctx: Ctx, p: Paint): void {
  const { f, t, look, fl, r } = p
  const s = SHAPES.star
  ctx.save()
  if (!f.still && r.ko < 0.5) {
    ctx.shadowColor = look.second
    ctx.shadowBlur = 8 + 8 * fl.k
  }
  group(ctx, [
    { p: starPath(t, f.still, s.mid), c: fl.k ? mix(p.main, '#ffffff', 0.4 * fl.k) : p.main, k: 1 },
  ])
  ctx.restore()
  gloss(ctx, -6, -31, 3, 1.7, -0.6)
  ctx.save()
  ctx.translate(s.face.x, s.face.y)
  face(ctx, p, 4.6)
  ctx.restore()
  if (f.still || r.ko > 0.5) return
  // Glints wink on the tips.
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5
    const k = Math.max(0, Math.sin(t * 2.2 + i * 2.1)) ** 6
    sparkle(ctx, s.mid.x + Math.cos(a) * 21, s.mid.y + Math.sin(a) * 21, 3.2 * k, '#ffffff')
  }
  const sig = Math.sin(clamp(f.fidget) * Math.PI)
  if (sig > 0) sparkle(ctx, 12, -38, 7 * sig, '#ffffff')
}

/** Sparkles burst out of Lumi on cheer (rig frame, unspun). */
function sparkles(ctx: Ctx, p: Paint): void {
  const { fl } = p
  if (!fl.cheer || fl.age >= 1) return
  const out = easeOut(fl.age / 0.6)
  const m = SHAPES.star.mid
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.3
    const d = 14 + 22 * out
    sparkle(
      ctx,
      m.x + Math.cos(a) * d,
      m.y + Math.sin(a) * d,
      (i % 2 ? 3.6 : 2.6) * (1 - fl.age),
      i % 3 ? '#fff3bf' : '#ffffff',
    )
  }
}

/** Boo's sheet: a dome with a wavy hem whose scallops travel. */
function ghostPath(t: number, still: boolean, swell: number): Path2D {
  const w = (ph: number) => (still ? 0 : Math.sin(t * 3 + ph) * 1.5 * (1 + swell))
  // Five round lobes hang from the flared hem, the wave travelling along them.
  let hem = ''
  for (let i = 0; i < 5; i++) {
    const x0 = -19 + i * 7.6
    hem += `Q${(x0 + 3.8).toFixed(1)} ${(4 + w(i * 1.3 + 0.6)).toFixed(3)} ${(x0 + 7.6).toFixed(1)} ${(-2 + w(i * 1.3 + 1.3) * 0.5).toFixed(3)} `
  }
  return new Path2D(
    `M17 -26 C17 -38 9 -44 0 -44 C-9 -44 -17 -38 -17 -26 C-17 -15 -19 -8 -19 ${(-2 + w(0) * 0.5).toFixed(3)} ` +
      hem +
      'C19 -8 17 -15 17 -26 Z',
  )
}

/** Boo: a little ghost, semi-transparent, softly swaying; fades out and back on the signature, its hem rippling harder. */
function ghost(ctx: Ctx, p: Paint): void {
  const { f, t, look } = p
  const s = SHAPES.ghost
  ctx.save()
  group(ctx, [{ p: ghostPath(t, f.still, Math.sin(clamp(f.fidget) * Math.PI)), c: p.main, k: 1 }])
  ctx.restore()
  // Cheek shade under the hood and a soft wisp line on the sheet.
  ctx.strokeStyle = mix(p.main, look.second, 0.35)
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-11, -15)
  ctx.quadraticCurveTo(-8, -9, -10, -4)
  ctx.moveTo(10, -13)
  ctx.quadraticCurveTo(13, -8, 11, -4)
  ctx.stroke()
  gloss(ctx, -9, -36, 3, 1.8, -0.6)
  ctx.save()
  ctx.translate(s.face.x, s.face.y)
  face(ctx, p, 4.2, 0.9)
  ctx.restore()
}

/** Ghost opacity: semi-transparent, fading out and back on the signature, dimmer on KO. */
function alphaOf(v: Variant, f: Frame, r: Rig): number {
  let a = 1 - 0.3 * r.ko
  if (v === 'ghost') a *= 0.86 - (f.still ? 0 : 0.6 * Math.sin(clamp(f.fidget) * Math.PI))
  return a
}

/** Smoke puffs rise off a fizzled sprite (kit frame). */
function smoke(ctx: Ctx, f: Frame, top: Pt): void {
  if (f.still || f.mood !== 'ko' || f.moodAge > 1.6) return
  for (let i = 0; i < 3; i++) {
    const k = clamp((f.moodAge - i * 0.18) / 1.2)
    if (k <= 0 || k >= 1) continue
    ctx.globalAlpha = 0.7 * (1 - k)
    paint(ctx, {
      p: ell(top.x + (i - 1) * 6 + Math.sin(k * 6 + i) * 2, top.y - 4 - k * 16, 2.6 + k * 3, 2.2 + k * 2.6),
      c: SMOKE,
      k: 0,
      lw: 1,
    })
  }
  ctx.globalAlpha = 1
}

const PAINTERS: Record<Variant, (ctx: Ctx, p: Paint) => void> = { spark, flame, cloud, star, ghost }
/** Unspun extras drawn over the body in the rig frame (rain falls straight while the cloud spins). */
const AFTER: Partial<Record<Variant, (ctx: Ctx, p: Paint) => void>> = { cloud: rain, star: sparkles }

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const v = variantOf(look)
  const s = SHAPES[v]
  const r = rigOf(v, f)
  const t = f.still ? 0 : f.t
  let main = r.flash ? mix(look.main, v === 'cloud' ? '#4a5878' : '#5a2a2a', r.flash) : look.main
  if (r.ko) main = mix(main, SMOKE, 0.45 * r.ko)
  const p: Paint = { look, f, r, t, main, fl: flourish(f) }

  k.backHand()
  ctx.save()
  ctx.translate(r.x, r.y)
  ctx.rotate(r.rot)
  ctx.scale(r.sx, r.sy)
  ctx.save()
  ctx.translate(s.mid.x, s.mid.y)
  ctx.rotate(r.spin)
  ctx.translate(-s.mid.x, -s.mid.y)
  ctx.save()
  ctx.globalAlpha = alphaOf(v, f, r)
  PAINTERS[v](ctx, p)
  k.emblem(s.emblem.x, s.emblem.y, 5)
  ctx.restore()
  k.hat(s.hat)
  ctx.restore()
  AFTER[v]?.(ctx, p)
  ctx.restore()

  const top = at(r, { x: 0, y: s.t })
  smoke(ctx, f, top)
  if (happy(f)) ticks(ctx, 22, top.y - 2, f.moodAge)
  k.frontHand()
}

export const sprite: BodyType = { metrics, draw, pose }
