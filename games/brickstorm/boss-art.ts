// Drawing a boss: its body follows its exact hitbox (a set of cells), with a
// skin for its kind, one of several faces that react to the fight, an aura for
// harder bosses, and an effect for each of its skills.
import { compactNumber, fillFitText } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { bossName, skillInfo } from './boss-skill-ui'
import { shapeOf } from './sim/boss-shapes'
import { phased } from './sim/boss-skills'
import { BRICK_INSET, CELL, TOP } from './sim/config'
import { dims } from './sim/dims'
import { brickRect, cellCenter, hitRects } from './sim/rows'
import type { Boss, BossRole, Brick, Rect, RunState } from './sim/types'

/** What drawBoss needs from the run; the boss card's preview fakes this. */
export type BossView = Pick<RunState, 'boss' | 'bricks'> & Partial<Pick<RunState, 'cols' | 'rows' | 'turn'>>

interface Geo {
  parts: Brick[]
  rects: Rect[]
  has: (col: number, row: number) => boolean
  box: Rect
  core: Rect
}

const CORNER = 14

const PALETTE: Record<string, [string, string]> = {
  Golem: ['#6b6f86', '#33364a'],
  Titan: ['#56688e', '#232c48'],
  Colossus: ['#7a3424', '#33100a'],
  Warden: ['#356090', '#16264a'],
  Behemoth: ['#4a2a8a', '#1d1240'],
  Hydra: ['#2c6a4c', '#0f3424'],
}
const RAGE: [string, string] = ['#7a1830', '#3a0814']

function geometry(s: BossView): Geo | null {
  const parts = s.bricks.filter((b) => b.kind === 'boss')
  if (!s.boss || !parts.length) return null
  const cells = new Set(parts.map((b) => `${b.col},${b.row}`))
  const rects = hitRects(parts)
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const box = {
    x,
    y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y,
  }
  const col0 = Math.min(...parts.map((b) => b.col))
  const row0 = Math.min(...parts.map((b) => b.row))
  const c = shapeOf(s.boss.shape).core
  const core = {
    x: (col0 + c.col) * CELL + BRICK_INSET,
    y: TOP + (row0 + c.row) * CELL + BRICK_INSET,
    w: c.w * CELL - 2 * BRICK_INSET,
    h: c.h * CELL - 2 * BRICK_INSET,
  }
  return { parts, rects, has: (col, row) => cells.has(`${col},${row}`), box, core }
}

/** The silhouette, grown (or shrunk, if negative) by `grow` on its outer sides only. */
/**
 * A triangle or orb part of the body (a shoulder, a horn, a fist), `grow` px
 * out; it reaches into neighbouring parts so the body joins with no seam.
 */
function shapedPart(path: Path2D, g: Geo, b: Brick, grow: number): void {
  const L = g.has(b.col - 1, b.row)
  const R = g.has(b.col + 1, b.row)
  const U = g.has(b.col, b.row - 1)
  const D = g.has(b.col, b.row + 1)
  const x1 = b.col * CELL + (L ? -1 : BRICK_INSET - grow)
  const x2 = (b.col + 1) * CELL + (R ? 1 : grow - BRICK_INSET)
  const y1 = TOP + b.row * CELL + (U ? -1 : BRICK_INSET - grow)
  const y2 = TOP + (b.row + 1) * CELL + (D ? 1 : grow - BRICK_INSET)
  if (b.shape === 'orb') {
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const r = Math.min(x2 - x1, y2 - y1) / 2
    path.moveTo(cx + r, cy)
    path.arc(cx, cy, r, 0, Math.PI * 2)
    // A wrist joining it to the body.
    const k = r * 0.55
    if (L) path.rect(x1, cy - k, cx - x1, 2 * k)
    if (R) path.rect(cx, cy - k, x2 - cx, 2 * k)
    if (U) path.rect(cx - k, y1, 2 * k, cy - y1)
    if (D) path.rect(cx - k, cy, 2 * k, y2 - cy)
    return
  }
  const tl = [x1, y1] as const
  const tr = [x2, y1] as const
  const bl = [x1, y2] as const
  const br = [x2, y2] as const
  const pts = {
    'tri-tl': [tl, tr, bl],
    'tri-tr': [tl, tr, br],
    'tri-bl': [tl, bl, br],
    'tri-br': [tr, br, bl],
  }[b.shape as 'tri-tl']
  path.moveTo(...pts[0])
  path.lineTo(...pts[1])
  path.lineTo(...pts[2])
  path.closePath()
}

function bodyPath(g: Geo, grow = 0): Path2D {
  const path = new Path2D()
  g.parts.forEach((b, i) => {
    if (b.shape) return shapedPart(path, g, b, grow)
    const r = g.rects[i]
    const L = g.has(b.col - 1, b.row)
    const R = g.has(b.col + 1, b.row)
    const U = g.has(b.col, b.row - 1)
    const D = g.has(b.col, b.row + 1)
    // Inner sides overlap their neighbour by a pixel so no seam shows between cells.
    const x = r.x - (L ? 1 : grow)
    const y = r.y - (U ? 1 : grow)
    const w = r.w + (L ? 1 : grow) + (R ? 1 : grow)
    const h = r.h + (U ? 1 : grow) + (D ? 1 : grow)
    const k = Math.max(0, CORNER + grow)
    path.roundRect(x, y, w, h, [!L && !U ? k : 0, !R && !U ? k : 0, !R && !D ? k : 0, !L && !D ? k : 0])
  })
  return path
}

/** Only the outer edge of the silhouette, `grow` px out, with rounded outer corners: for strokes. */
function outline(g: Geo, grow = 0): Path2D {
  const path = new Path2D()
  const k = CORNER + grow
  g.parts.forEach((b, i) => {
    // A shaped part strokes its own outline (a horn's slant, a fist's round).
    if (b.shape) return shapedPart(path, g, b, grow)
    const r = g.rects[i]
    const L = !g.has(b.col - 1, b.row)
    const R = !g.has(b.col + 1, b.row)
    const U = !g.has(b.col, b.row - 1)
    const D = !g.has(b.col, b.row + 1)
    const x1 = r.x
    const x2 = r.x + r.w
    const y1 = r.y
    const y2 = r.y + r.h
    const seg = (ax: number, ay: number, bx: number, by: number) => {
      path.moveTo(ax, ay)
      path.lineTo(bx, by)
    }
    if (U) seg(L ? x1 + CORNER : x1 - grow, y1 - grow, R ? x2 - CORNER : x2 + grow, y1 - grow)
    if (D) seg(L ? x1 + CORNER : x1 - grow, y2 + grow, R ? x2 - CORNER : x2 + grow, y2 + grow)
    if (L) seg(x1 - grow, U ? y1 + CORNER : y1 - grow, x1 - grow, D ? y2 - CORNER : y2 + grow)
    if (R) seg(x2 + grow, U ? y1 + CORNER : y1 - grow, x2 + grow, D ? y2 - CORNER : y2 + grow)
    const arc = (cx: number, cy: number, from: number) => {
      path.moveTo(cx + Math.cos(from) * k, cy + Math.sin(from) * k)
      path.arc(cx, cy, k, from, from + Math.PI / 2)
    }
    if (U && L) arc(x1 + CORNER, y1 + CORNER, Math.PI)
    if (U && R) arc(x2 - CORNER, y1 + CORNER, -Math.PI / 2)
    if (D && R) arc(x2 - CORNER, y2 - CORNER, 0)
    if (D && L) arc(x1 + CORNER, y2 - CORNER, Math.PI / 2)
  })
  return path
}

/** Outer top edges (for flames and spikes), as [x1, x2, y]. */
function topEdges(g: Geo): Array<[number, number, number]> {
  return g.parts.flatMap((b, i): Array<[number, number, number]> => {
    if (g.has(b.col, b.row - 1)) return []
    const r = g.rects[i]
    return [[r.x, r.x + r.w, r.y]]
  })
}

export interface BossLook {
  /** 0..1 white flash after damage. */
  hit: number
  /** 0..1 after a hit bounced off it (it smirks). */
  smug?: number
  /** 0..1 after it hurt the hero (it laughs). */
  gloat?: number
  /** Where its eyes look (a ball, or the launch point). */
  look?: { x: number; y: number }
  /** 0..1 flare while a skill goes off. */
  cast?: number
}

export function drawBoss(ctx: CanvasRenderingContext2D, s: BossView, time: number, look: BossLook): void {
  const g = geometry(s)
  const boss = s.boss
  if (!g || !boss) return
  const life = Math.max(0, boss.hp / boss.maxHp)
  const rage = boss.traits.includes('enrage') && life < 0.5
  const accent = skillInfo(boss.traits[0] ?? 'armored').color
  const tier = boss.tier ?? 1
  const danger =
    s.rows !== undefined &&
    Math.max(...g.parts.map((b) => b.row)) >= dims({ cols: s.cols ?? 7, rows: s.rows }).dangerRow - 3
  const body = bodyPath(g)
  const inner = bodyPath(g, -3)

  ctx.save()
  // Phase Shift: a ghost on its off turns.
  if (s.turn !== undefined && phased({ turn: s.turn }, boss)) ctx.globalAlpha = 0.4 + 0.1 * Math.sin(time * 6)
  // Aura: a glow from tier 2, living flames from tier 3.
  if (tier >= 3) drawFlames(ctx, g, time, rage ? theme.coral : accent)
  ctx.shadowColor = rage || danger ? theme.coral : accent
  ctx.shadowBlur =
    (tier >= 2 ? 26 + 10 * Math.sin(time * 4) : 14 + 6 * Math.sin(time * 4)) + 30 * (look.cast ?? 0)
  ctx.fillStyle = accent
  ctx.fill(body)
  ctx.shadowBlur = 0

  for (const id of boss.traits) drawSkill(ctx, s, id, g, boss, time, 'back')

  // Body and skin.
  const [top, bottom] = rage ? RAGE : (PALETTE[boss.noun] ?? PALETTE.Behemoth)
  const grad = ctx.createLinearGradient(0, g.box.y, 0, g.box.y + g.box.h)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  ctx.fillStyle = grad
  ctx.fill(inner)
  ctx.save()
  ctx.clip(inner)
  drawSkin(ctx, boss.noun, g, time)
  ctx.restore()

  drawFace(ctx, boss, g.core, time, { ...look, rage, danger, life })
  drawStatus(ctx, boss, g.core, life, rage)

  for (const id of boss.traits) drawSkill(ctx, s, id, g, boss, time, 'front')
  if (look.hit > 0) {
    ctx.fillStyle = `rgb(255 255 255 / ${0.55 * look.hit})`
    ctx.fill(body)
  }
  ctx.restore()
}

function drawFlames(ctx: CanvasRenderingContext2D, g: Geo, time: number, color: string): void {
  ctx.save()
  ctx.fillStyle = color
  for (const [x1, x2, y] of topEdges(g)) {
    const n = Math.max(2, Math.round((x2 - x1) / 14))
    for (let i = 0; i < n; i++) {
      const x = x1 + ((i + 0.5) * (x2 - x1)) / n
      const hgt = 10 + 8 * Math.sin(time * 9 + i * 1.7 + x)
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 7 + i)
      ctx.beginPath()
      ctx.moveTo(x - 7, y + 4)
      ctx.quadraticCurveTo(x - 4, y - hgt * 0.5, x + Math.sin(time * 5 + i) * 3, y - hgt)
      ctx.quadraticCurveTo(x + 4, y - hgt * 0.5, x + 7, y + 4)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** A texture for each kind of boss, drawn clipped to its body. */
function drawSkin(ctx: CanvasRenderingContext2D, noun: string, g: Geo, time: number): void {
  const { x, y, w, h } = g.box
  ctx.lineWidth = 2
  switch (noun) {
    case 'Golem': // stone blocks
      ctx.strokeStyle = 'rgb(0 0 0 / 0.25)'
      for (let row = 0; row * 18 < h; row++) {
        ctx.beginPath()
        ctx.moveTo(x, y + row * 18)
        ctx.lineTo(x + w, y + row * 18)
        for (let cx = x + (row % 2) * 14; cx < x + w; cx += 28) {
          ctx.moveTo(cx, y + row * 18)
          ctx.lineTo(cx, y + row * 18 + 18)
        }
        ctx.stroke()
      }
      return
    case 'Titan': // plates and rivets
      ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
      for (let py = y + 8; py < y + h; py += 26) {
        ctx.fillRect(x, py, w, 2)
        for (let px = x + 8; px < x + w; px += 22) {
          ctx.beginPath()
          ctx.arc(px, py + 7, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      return
    case 'Colossus': // glowing lava veins
      ctx.strokeStyle = `rgb(255 159 67 / ${0.45 + 0.25 * Math.sin(time * 3)})`
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        let vx = x + ((i + 0.5) * w) / 4
        ctx.moveTo(vx, y)
        for (let vy = y; vy < y + h; vy += 14) {
          vx += Math.sin(i * 3 + vy) * 8
          ctx.lineTo(vx, vy)
        }
        ctx.stroke()
      }
      return
    case 'Warden': // crystal facets
      ctx.strokeStyle = 'rgb(180 230 255 / 0.22)'
      for (let i = -h; i < w; i += 26) {
        ctx.beginPath()
        ctx.moveTo(x + i, y)
        ctx.lineTo(x + i + h, y + h)
        ctx.moveTo(x + i + h, y)
        ctx.lineTo(x + i, y + h)
        ctx.stroke()
      }
      return
    case 'Hydra': // scales
      ctx.strokeStyle = 'rgb(160 255 200 / 0.18)'
      for (let row = 0, sy = y; sy < y + h + 10; row++, sy += 10) {
        for (let sx = x + (row % 2) * 8; sx < x + w + 10; sx += 16) {
          ctx.beginPath()
          ctx.arc(sx, sy, 8, 0, Math.PI)
          ctx.stroke()
        }
      }
      return
    default: // Behemoth: bristling spikes along its top
      ctx.fillStyle = 'rgb(0 0 0 / 0.25)'
      for (const [x1, x2, ey] of topEdges(g)) {
        for (let sx = x1 + 6; sx < x2 - 6; sx += 12) {
          ctx.beginPath()
          ctx.moveTo(sx - 5, ey)
          ctx.lineTo(sx, ey + 12)
          ctx.lineTo(sx + 5, ey)
          ctx.fill()
        }
      }
  }
}

interface Mood {
  hit: number
  look?: { x: number; y: number }
  rage: boolean
  danger: boolean
  life: number
  /** 0..1 while a skill goes off: it roars. */
  cast?: number
  /** 0..1 after one of your hits bounced off: it smirks. */
  smug?: number
  /** 0..1 after it hurt the hero: it laughs. */
  gloat?: number
}

/** What the face is showing right now, most urgent first. */
type Expression = 'hurt' | 'roar' | 'laugh' | 'smug' | 'panic' | 'angry' | 'calm'

function expressionOf(m: Mood): Expression {
  if (m.hit > 0.3) return 'hurt'
  if ((m.cast ?? 0) > 0.3) return 'roar'
  if ((m.gloat ?? 0) > 0.2) return 'laugh'
  if ((m.smug ?? 0) > 0.2) return 'smug'
  if (m.life < 0.25) return 'panic'
  if (m.life < 0.5 || m.rage) return 'angry'
  return 'calm'
}

/**
 * One of BOSS_FACES faces, in the core rect, acting out its mood: it winces
 * when hit, roars when it casts, laughs when it hurts you, smirks when your
 * hit bounces off, scowls when hurt, panics near death. Eyes follow `look`.
 */
function drawFace(ctx: CanvasRenderingContext2D, boss: Boss, core: Rect, time: number, m: Mood): void {
  const k = Math.min(core.w / 160, core.h / 104, 1.2)
  const ex = expressionOf(m)
  // Panic trembles; a laugh bounces.
  const jitter = ex === 'panic' ? Math.sin(time * 45) * 1.5 * k : 0
  const bounce = ex === 'laugh' ? Math.abs(Math.sin(time * 14)) * 3 * k : 0
  const cx = core.x + core.w / 2 + jitter
  const eyeY = core.y + core.h * 0.42 - bounce
  const mouthY = core.y + core.h * 0.7 - bounce
  const blink = ex === 'calm' && (time * 0.6 + boss.turn) % 4 < 0.12
  const hot = ex === 'angry' || ex === 'roar' || m.rage || m.danger
  const pupil = hot ? theme.coral : '#1d1240'
  const ink = theme.chalk
  const toward = (x: number, y: number, r: number): [number, number] => {
    if (ex === 'smug') return [x + r * 0.8, y + r * 0.2] // side-eye
    if (ex === 'panic') return [x + Math.sin(time * 9) * r * 0.6, y]
    if (!m.look) return [x + Math.sin(time * 1.3) * r * 0.5, y]
    const a = Math.atan2(m.look.y - y, m.look.x - x)
    return [x + Math.cos(a) * r, y + Math.sin(a) * r]
  }
  ctx.save()
  if (m.danger || ex === 'roar') {
    ctx.shadowColor = theme.coral
    ctx.shadowBlur = 10
  }

  /** An eye that acts: squeezed shut, laughing arcs, half-lidded, wide with a tiny pupil… */
  const eye = (x: number, y: number, rx: number, ry: number, pr: number, side: number) => {
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.lineWidth = 3 * k
    ctx.lineCap = 'round'
    if (ex === 'hurt') {
      // > <
      ctx.beginPath()
      ctx.moveTo(x - side * rx, y - ry * 0.7)
      ctx.lineTo(x + side * rx * 0.6, y)
      ctx.lineTo(x - side * rx, y + ry * 0.7)
      ctx.stroke()
      return
    }
    if (ex === 'laugh' || blink) {
      ctx.beginPath()
      if (ex === 'laugh') ctx.arc(x, y + ry * 0.4, rx * 0.8, Math.PI * 1.15, Math.PI * 1.85)
      else {
        ctx.moveTo(x - rx, y)
        ctx.lineTo(x + rx, y)
      }
      ctx.stroke()
      return
    }
    const wide = ex === 'roar' || ex === 'panic' ? 1.2 : 1
    ctx.beginPath()
    ctx.ellipse(x, y, rx * wide, ry * wide, 0, 0, Math.PI * 2)
    ctx.fill()
    const small = ex === 'panic' || ex === 'roar' ? 0.55 : 1
    const [px, py] = toward(x, y, Math.min(rx, ry) * wide - pr * small - 1)
    ctx.fillStyle = pupil
    ctx.beginPath()
    ctx.arc(px, py, pr * small, 0, Math.PI * 2)
    ctx.fill()
    // Lids: smug half-closed, angry slanted.
    const skin = '#2a1840'
    if (ex === 'smug') {
      ctx.fillStyle = skin
      ctx.fillRect(x - rx - 1, y - ry - 1, rx * 2 + 2, ry * 1.05)
      ctx.strokeStyle = ink
      ctx.beginPath()
      ctx.moveTo(x - rx, y + 0.05 * ry)
      ctx.lineTo(x + rx, y + 0.05 * ry)
      ctx.stroke()
    } else if (ex === 'angry') {
      ctx.fillStyle = skin
      ctx.beginPath()
      ctx.moveTo(x - rx - 1, y - ry - 1)
      ctx.lineTo(x + rx + 1, y - ry - 1)
      ctx.lineTo(x + side * -rx, y - ry * 0.1)
      ctx.closePath()
      ctx.fill()
    }
  }
  /** Brows: angry slant down to the middle, worried up, one raised when smug. */
  const brow = (x: number, side: number, len = 12) => {
    const inner = ex === 'angry' || ex === 'roar' || ex === 'hurt' ? 7 : ex === 'panic' ? -6 : 3
    const lift = ex === 'smug' && side > 0 ? -7 : ex === 'panic' ? -3 : 0
    ctx.strokeStyle = ink
    ctx.lineWidth = 4 * k
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - side * len * k, eyeY - 17 * k + lift * k)
    ctx.lineTo(x + side * 8 * k, eyeY - 17 * k + (inner + lift) * k)
    ctx.stroke()
  }
  /** The mouth, by expression. `mw` is its half-width. */
  const mouth = (mw: number) => {
    ctx.strokeStyle = ink
    ctx.fillStyle = '#12081f'
    ctx.lineWidth = 3 * k
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    switch (ex) {
      case 'roar':
      case 'laugh': {
        // Wide open, teeth top and bottom; a laugh chatters.
        const open = (ex === 'roar' ? 16 : 9 + 5 * Math.abs(Math.sin(time * 18))) * k
        ctx.beginPath()
        if (ex === 'laugh') {
          ctx.moveTo(cx - mw, mouthY - 3 * k)
          ctx.quadraticCurveTo(cx, mouthY + open * 2, cx + mw, mouthY - 3 * k)
          ctx.closePath()
        } else ctx.ellipse(cx, mouthY, mw * 0.8, open, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = ink
        const n = 5
        for (let i = 0; i < n; i++) {
          const tx = cx - mw * 0.7 + ((i + 0.5) * 1.4 * mw) / n
          ctx.beginPath()
          ctx.moveTo(tx - 4 * k, mouthY - (ex === 'roar' ? open : 3 * k))
          ctx.lineTo(tx + 4 * k, mouthY - (ex === 'roar' ? open : 3 * k))
          ctx.lineTo(tx, mouthY - (ex === 'roar' ? open : 3 * k) + 6 * k)
          ctx.fill()
        }
        if (ex === 'roar')
          for (let i = 0; i < n - 1; i++) {
            const tx = cx - mw * 0.55 + ((i + 0.5) * 1.1 * mw) / (n - 1)
            ctx.beginPath()
            ctx.moveTo(tx - 4 * k, mouthY + open)
            ctx.lineTo(tx + 4 * k, mouthY + open)
            ctx.lineTo(tx, mouthY + open - 6 * k)
            ctx.fill()
          }
        return
      }
      case 'smug':
        // A lopsided smirk.
        ctx.beginPath()
        ctx.moveTo(cx - mw * 0.6, mouthY + 2 * k)
        ctx.quadraticCurveTo(cx + mw * 0.2, mouthY + 6 * k, cx + mw * 0.8, mouthY - 6 * k)
        ctx.stroke()
        return
      case 'hurt': {
        // Gritted teeth.
        ctx.fillStyle = ink
        ctx.beginPath()
        ctx.roundRect(cx - mw * 0.7, mouthY - 5 * k, mw * 1.4, 10 * k, 3 * k)
        ctx.fill()
        ctx.strokeStyle = '#12081f'
        ctx.lineWidth = 1.5 * k
        ctx.beginPath()
        ctx.moveTo(cx - mw * 0.7, mouthY)
        ctx.lineTo(cx + mw * 0.7, mouthY)
        for (let i = 1; i < 5; i++) {
          const tx = cx - mw * 0.7 + (i * 1.4 * mw) / 5
          ctx.moveTo(tx, mouthY - 5 * k)
          ctx.lineTo(tx, mouthY + 5 * k)
        }
        ctx.stroke()
        return
      }
      case 'panic':
        // A wobbling little O.
        ctx.beginPath()
        ctx.ellipse(cx, mouthY, 6 * k + Math.sin(time * 20) * k, 8 * k, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        return
      case 'angry':
      case 'calm': {
        // A jagged grin, turned down into a snarl when angry.
        const teeth = 6
        const down = ex === 'angry' ? 1 : -1
        ctx.beginPath()
        for (let i = 0; i <= teeth; i++) {
          const x = cx - mw + (i * 2 * mw) / teeth
          const curve = down * (1 - ((i - teeth / 2) / (teeth / 2)) ** 2) * -6 * k
          const y = mouthY + curve + (i % 2 ? 5 : -2) * k
          if (i) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        }
        ctx.stroke()
      }
    }
  }

  switch ((boss.face ?? 0) % 6) {
    case 1: {
      // Cyclops: one big eye under a heavy brow.
      eye(cx, eyeY, 24 * k, 18 * k, 9 * k, 1)
      const inner = ex === 'angry' || ex === 'roar' ? 10 : ex === 'panic' ? -8 : 0
      ctx.strokeStyle = ink
      ctx.lineWidth = 5 * k
      ctx.beginPath()
      ctx.moveTo(cx - 30 * k, eyeY - 32 * k)
      ctx.lineTo(cx, eyeY - (23 - inner) * k)
      ctx.lineTo(cx + 30 * k, eyeY - 32 * k)
      ctx.stroke()
      mouth(core.w * 0.16)
      break
    }
    case 2: {
      // Chomper: little eyes, a big toothy jaw. It gapes to roar, chatters to laugh, clamps when hit.
      for (const side of [-1, 1]) eye(cx + side * core.w * 0.16, eyeY - 6 * k, 7 * k, 7 * k, 3.5 * k, side)
      const open =
        (ex === 'roar'
          ? 18
          : ex === 'laugh'
            ? 6 + 8 * Math.abs(Math.sin(time * 18))
            : ex === 'hurt'
              ? 1
              : 4 + 6 * (0.5 + 0.5 * Math.sin(time * 3))) * k
      const mw = core.w * 0.26
      const my = mouthY - 4 * k
      ctx.fillStyle = '#12081f'
      ctx.beginPath()
      ctx.roundRect(cx - mw, my - open, mw * 2, open * 2, 6 * k)
      ctx.fill()
      ctx.fillStyle = ink
      for (let i = 0; i < 6; i++) {
        const tx = cx - mw + ((i + 0.5) * 2 * mw) / 6
        for (const dir of [1, -1]) {
          ctx.beginPath()
          ctx.moveTo(tx - 5 * k, my - dir * open)
          ctx.lineTo(tx + 5 * k, my - dir * open)
          ctx.lineTo(tx, my - dir * (open - 8 * k))
          ctx.fill()
        }
      }
      break
    }
    case 3: {
      // Skull: dark sockets with glowing pinpoints; the teeth chatter when it laughs or panics.
      for (const side of [-1, 1]) {
        const x = cx + side * core.w * 0.17
        const squash = ex === 'laugh' ? 0.5 : ex === 'hurt' ? 0.3 : 1
        ctx.fillStyle = '#0c0614'
        ctx.beginPath()
        ctx.ellipse(x, eyeY, 13 * k, 11 * k * squash, ex === 'angry' ? side * -0.3 : 0, 0, Math.PI * 2)
        ctx.fill()
        const [px, py] = toward(x, eyeY, 5 * k)
        ctx.fillStyle = hot ? theme.coral : '#7fe7ff'
        ctx.beginPath()
        ctx.arc(px, py, blink || ex === 'hurt' ? 1 : (ex === 'roar' ? 5 : 3.5) * k, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#0c0614'
      ctx.beginPath()
      ctx.moveTo(cx, eyeY + 8 * k)
      ctx.lineTo(cx - 5 * k, eyeY + 18 * k)
      ctx.lineTo(cx + 5 * k, eyeY + 18 * k)
      ctx.fill()
      const chatter =
        ex === 'laugh' || ex === 'panic' ? Math.abs(Math.sin(time * 20)) * 5 * k : ex === 'roar' ? 8 * k : 0
      ctx.fillStyle = ink
      for (let i = -3; i < 3; i++) {
        ctx.fillRect(cx + i * 8 * k + 1, mouthY - 5 * k - chatter / 2, 6 * k, 5 * k)
        ctx.fillRect(cx + i * 8 * k + 1, mouthY + chatter / 2, 6 * k, 5 * k)
      }
      break
    }
    case 4: {
      // Three eyes, blinking out of step.
      const spots: Array<[number, number]> = [
        [-0.22, 0.05],
        [0.22, 0.05],
        [0, -0.12],
      ]
      spots.forEach(([dx, dy], i) =>
        eye(cx + dx * core.w, eyeY + dy * core.h, 9 * k, 9 * k, 4 * k, i === 0 ? -1 : 1),
      )
      mouth(core.w * 0.2)
      break
    }
    case 5: {
      // Visor: a dark band with a glowing slit. It narrows to a smirk, Vs when angry, flickers in panic.
      const vh = 16 * k
      ctx.fillStyle = '#0c0614'
      ctx.beginPath()
      ctx.roundRect(core.x + core.w * 0.12, eyeY - vh / 2, core.w * 0.76, vh, vh / 2)
      ctx.fill()
      const glow = hot ? theme.coral : '#7fe7ff'
      const flicker = ex === 'panic' && Math.sin(time * 30) > 0.3
      ctx.strokeStyle = glow
      ctx.lineWidth = (ex === 'smug' || ex === 'hurt' ? 1.5 : 3) * k
      if (!flicker) {
        ctx.beginPath()
        const l = core.x + core.w * 0.16
        const r = core.x + core.w * 0.84
        if (ex === 'angry' || ex === 'roar') {
          ctx.moveTo(l, eyeY - 4 * k)
          ctx.lineTo(cx, eyeY + 3 * k)
          ctx.lineTo(r, eyeY - 4 * k)
        } else if (ex === 'laugh') {
          ctx.moveTo(l, eyeY + 2 * k)
          ctx.quadraticCurveTo(cx, eyeY - 6 * k, r, eyeY + 2 * k)
        } else {
          ctx.moveTo(l, eyeY)
          ctx.lineTo(r, eyeY)
        }
        ctx.stroke()
      }
      const scan = m.look
        ? Math.max(core.x + core.w * 0.18, Math.min(core.x + core.w * 0.82, m.look.x))
        : cx + Math.sin(time * 2) * core.w * 0.3
      ctx.fillStyle = glow
      ctx.shadowColor = glow
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(scan, eyeY, 5 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      mouth(core.w * 0.14)
      break
    }
    default: {
      // Angry brows, two eyes and a jagged grin.
      for (const side of [-1, 1]) {
        const x = cx + side * core.w * 0.17
        eye(x, eyeY, 11 * k, 9 * k, 5 * k, side)
        brow(x, side)
      }
      mouth(core.w * 0.22)
    }
  }
  ctx.restore()

  // Sweat when it's losing (more in a panic); steam when enraged; an anger mark when cross.
  if (m.life < 0.33 || ex === 'panic') {
    for (let i = 0; i < (ex === 'panic' ? 3 : 1); i++) {
      const d = (time * 1.4 + i * 0.33) % 1
      ctx.fillStyle = `rgb(127 231 255 / ${1 - d})`
      ctx.beginPath()
      ctx.ellipse(
        core.x + core.w * (0.86 - i * 0.7),
        core.y + core.h * 0.25 + d * 16,
        3,
        5,
        0,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }
  if (ex === 'angry' || ex === 'roar') {
    // A throbbing cross-vein in the corner.
    const vx = core.x + core.w * 0.82
    const vy = core.y + core.h * 0.15
    const p = 1 + 0.15 * Math.sin(time * 10)
    ctx.strokeStyle = theme.coral
    ctx.lineWidth = 3 * k
    ctx.lineCap = 'round'
    for (const [a, b] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      ctx.beginPath()
      ctx.moveTo(vx + a * 2 * k * p, vy + b * 7 * k * p)
      ctx.quadraticCurveTo(vx + a * 2 * k * p, vy + b * 2 * k * p, vx + a * 7 * k * p, vy + b * 2 * k * p)
      ctx.stroke()
    }
  }
  if (m.rage) {
    for (let i = 0; i < 3; i++) {
      const d = (time * 0.8 + i / 3) % 1
      ctx.fillStyle = `rgb(255 255 255 / ${0.35 * (1 - d)})`
      ctx.beginPath()
      ctx.arc(cx + (i - 1) * core.w * 0.3, core.y - d * 22, 4 + d * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Cracks as it weakens, then its name and hp bar. */
function drawStatus(
  ctx: CanvasRenderingContext2D,
  boss: Boss,
  core: Rect,
  life: number,
  rage: boolean,
): void {
  const { x, y, w, h } = core
  if (life < 0.66) {
    ctx.strokeStyle = 'rgb(0 0 0 / 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + w * 0.2, y)
    ctx.lineTo(x + w * 0.28, y + h * 0.3)
    ctx.lineTo(x + w * 0.22, y + h * 0.5)
    if (life < 0.33) {
      ctx.moveTo(x + w * 0.85, y + h)
      ctx.lineTo(x + w * 0.76, y + h * 0.65)
      ctx.lineTo(x + w * 0.82, y + h * 0.45)
    }
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 11px ${FONT}`
  ctx.fillStyle = skillInfo(boss.traits[0] ?? 'armored').color
  fillFitText(ctx, bossName(boss).toUpperCase(), x + w / 2, y + 11, w - 24)
  const barW = w - 24
  ctx.fillStyle = 'rgb(0 0 0 / 0.45)'
  ctx.beginPath()
  ctx.roundRect(x + 12, y + h - 18, barW, 10, 5)
  ctx.fill()
  ctx.fillStyle = rage ? theme.coral : '#ff9f43'
  ctx.beginPath()
  ctx.roundRect(x + 12, y + h - 18, Math.max(10, barW * life), 10, 5)
  ctx.fill()
  ctx.font = `700 13px ${FONT}`
  ctx.lineWidth = 3
  ctx.strokeStyle = theme.night
  ctx.fillStyle = theme.chalk
  fillFitText(ctx, compactNumber(Math.ceil(boss.hp)), x + w / 2, y + h - 13, barW, true)
}

/** Bricks a skill summoned, for tethers back to the boss. */
const SKILL_ROLE: Record<string, BossRole> = {
  guards: 'guard',
  mirror: 'decoy',
  totem: 'totem',
  runes: 'rune',
  powerCells: 'cell',
  rod: 'rod',
  core: 'core',
}

/** Small things circling the body: specks, coins, bricks, crumbs. */
function orbit(
  g: Geo,
  n: number,
  time: number,
  speed: number,
  draw: (x: number, y: number, i: number) => void,
): void {
  const { x, y, w, h } = g.box
  for (let i = 0; i < n; i++) {
    const a = time * speed + (i / n) * Math.PI * 2
    draw(x + w / 2 + Math.cos(a) * (w / 2 + 12), y + h / 2 + Math.sin(a) * (h / 2 + 10), i)
  }
}

/** A glowing bar along every outer edge on one side of the body. */
function edgeGlow(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  side: 'top' | 'bottom' | 'left' | 'right',
  color: string,
  time: number,
): void {
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  ctx.globalAlpha = 0.75 + 0.2 * Math.sin(time * 5)
  g.parts.forEach((b, i) => {
    const r = g.rects[i]
    if (side === 'top' && !g.has(b.col, b.row - 1)) ctx.fillRect(r.x + 4, r.y - 5, r.w - 8, 4)
    if (side === 'bottom' && !g.has(b.col, b.row + 1)) ctx.fillRect(r.x + 4, r.y + r.h + 1, r.w - 8, 4)
    if (side === 'left' && !g.has(b.col - 1, b.row)) ctx.fillRect(r.x - 5, r.y + 4, 4, r.h - 8)
    if (side === 'right' && !g.has(b.col + 1, b.row)) ctx.fillRect(r.x + r.w + 1, r.y + 4, 4, r.h - 8)
  })
  ctx.shadowBlur = 0
}

/** Each skill's look, behind or in front of the body, in the skill's colour. */
function drawSkill(
  ctx: CanvasRenderingContext2D,
  s: BossView,
  id: string,
  g: Geo,
  boss: Boss,
  time: number,
  layer: 'back' | 'front',
): void {
  const { box } = g
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const color = skillInfo(id).color
  const m = (name: string) => boss.mem?.[name] ?? 0
  const life = boss.hp / boss.maxHp
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  if (layer === 'back') {
    // Tethers to the bricks it powers.
    const role = SKILL_ROLE[id]
    if (role) {
      ctx.lineWidth = 2
      ctx.setLineDash([4, 6])
      ctx.lineDashOffset = -time * 30
      ctx.globalAlpha = 0.5
      for (const b of s.bricks.filter((b) => b.role === role)) {
        const c = cellCenter(b.col, b.row)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
    switch (id) {
      case 'drifter':
      case 'weaver': {
        const back = boss.dir > 0 ? box.x - 6 : box.x + box.w + 6
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.globalAlpha = 0.6
        for (let i = 0; i < (id === 'weaver' ? 5 : 3); i++) {
          const y = box.y + ((i + 1) * box.h) / (id === 'weaver' ? 6 : 4)
          const len = 12 + 6 * Math.sin(time * 6 + i)
          ctx.beginPath()
          ctx.moveTo(back, y)
          ctx.lineTo(back - boss.dir * len, y)
          ctx.stroke()
        }
        break
      }
      case 'gravity':
      case 'repulse': {
        // A vortex pulling in, or rings pushing out.
        ctx.lineWidth = 2
        for (let i = 0; i < 3; i++) {
          let k = (time * 0.6 + i / 3) % 1
          if (id === 'gravity') k = 1 - k
          ctx.globalAlpha = 0.5 * (id === 'gravity' ? k : 1 - k)
          ctx.beginPath()
          ctx.ellipse(
            cx,
            cy,
            box.w / 2 + 10 + k * 70,
            box.h / 2 + 8 + k * 60,
            time * (id === 'gravity' ? 1 : -1),
            0,
            Math.PI * 1.6,
          )
          ctx.stroke()
        }
        break
      }
      case 'mire':
        ctx.globalAlpha = 0.35
        for (let i = 0; i < 9; i++) {
          const bx = box.x - 20 + ((i * 37) % (box.w + 40))
          const r = 10 + 5 * Math.sin(time * 2 + i)
          ctx.beginPath()
          ctx.arc(bx, box.y + box.h + 10 + Math.sin(time + i) * 6, r, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      case 'hover':
        ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
        ctx.beginPath()
        ctx.ellipse(cx, box.y + box.h + 18, box.w * 0.4, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'blink':
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 9)
        ctx.lineWidth = 2
        ctx.setLineDash([5, 5])
        ctx.translate(Math.sin(time * 13) * 6, 0)
        ctx.stroke(outline(g, 3))
        break
      case 'frost':
      case 'icebound':
        // Snowflakes drifting around it.
        for (let i = 0; i < 10; i++) {
          const k = (time * 0.25 + i / 10) % 1
          ctx.globalAlpha = 0.7 * Math.sin(k * Math.PI)
          ctx.beginPath()
          ctx.arc(
            box.x - 10 + ((i * 41) % (box.w + 20)) + Math.sin(time + i) * 6,
            box.y - 10 + k * (box.h + 30),
            2,
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
        break
      case 'charge':
        // Faint crackle while idle; a pulsing ring while it charges.
        ctx.lineWidth = m('charging') ? 4 : 1.5
        ctx.globalAlpha = m('charging') ? 0.5 + 0.5 * Math.sin(time * 20) : 0.25 + 0.15 * Math.sin(time * 3)
        ctx.stroke(outline(g, m('charging') ? 8 + 4 * Math.sin(time * 10) : 10))
        break
      case 'retreat': {
        // Chevrons pointing up: brighter once it's about to back off.
        ctx.globalAlpha = m('retreat') ? 0.6 + 0.4 * Math.sin(time * 12) : 0.25
        for (const dx of [-0.3, 0.3]) {
          const ax = cx + dx * box.w
          const ay = box.y - 8 - ((time * 20) % 10)
          ctx.beginPath()
          ctx.moveTo(ax - 7, ay + 8)
          ctx.lineTo(ax, ay)
          ctx.lineTo(ax + 7, ay + 8)
          ctx.lineTo(ax + 7, ay + 11)
          ctx.lineTo(ax, ay + 3)
          ctx.lineTo(ax - 7, ay + 11)
          ctx.fill()
        }
        break
      }
      case 'lunge':
        // Arrows under it: faint while idle, flashing when it's about to lunge.
        ctx.globalAlpha = m('lunge') ? 0.6 + 0.4 * Math.sin(time * 12) : 0.2
        for (const dx of [-0.25, 0, 0.25]) {
          const ax = cx + dx * box.w
          const ay = box.y + box.h + 10 + ((time * 30) % 12)
          ctx.beginPath()
          ctx.moveTo(ax - 8, ay)
          ctx.lineTo(ax + 8, ay)
          ctx.lineTo(ax, ay + 10)
          ctx.fill()
        }
        break
      case 'shroud':
        ctx.fillStyle = 'rgb(30 30 40 / 0.45)'
        for (let i = 0; i < 6; i++) {
          const a = time * 0.3 + i
          ctx.beginPath()
          ctx.arc(cx + Math.cos(a) * box.w * 0.7, cy + Math.sin(a * 1.3) * box.h * 0.7, 26, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      case 'frenzy':
        ctx.lineWidth = life < 0.5 ? 3 : 1.5
        ctx.globalAlpha = life < 0.5 ? 0.4 + 0.4 * Math.sin(time * 14) : 0.2
        ctx.stroke(outline(g, 6))
        break
    }
    ctx.restore()
    return
  }
  switch (id) {
    case 'shield':
    case 'barrier': {
      // A shimmering hex bubble; Barrier shows how many hits it still blocks.
      const left = id === 'barrier' ? m('barrier') : 1
      if (!left) break
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 5)
      ctx.lineWidth = 2
      ctx.stroke(outline(g, id === 'barrier' ? 10 : 6))
      ctx.globalAlpha = 0.35
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + time * 0.4
        hexagon(ctx, cx + Math.cos(a) * (box.w / 2 + 4), cy + Math.sin(a) * (box.h / 2 + 4), 5)
      }
      if (id === 'barrier') {
        ctx.globalAlpha = 1
        ctx.font = `700 13px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(`◈${left}`, box.x + box.w + 4, box.y - 4)
      }
      break
    }
    case 'minions':
    case 'swarm':
    case 'splitters':
    case 'brood':
      orbit(g, id === 'swarm' ? 12 : 7, time, 1.6, (x, y, i) => {
        ctx.beginPath()
        ctx.arc(x + Math.sin(time * 20 + i) * 2, y, id === 'brood' ? 3.5 : 2.5, 0, Math.PI * 2)
        ctx.fill()
      })
      break
    case 'mason':
      orbit(g, 5, time, 0.8, (x, y) => ctx.fillRect(x - 5, y - 3, 10, 6))
      break
    case 'eggs':
      orbit(g, 3, time, 0.6, (x, y) => {
        ctx.beginPath()
        ctx.ellipse(x, y, 4, 5.5, 0, 0, Math.PI * 2)
        ctx.fill()
      })
      break
    case 'taxman':
      orbit(g, 6, time, 1.2, (x, y, i) => {
        ctx.globalAlpha = 0.9
        ctx.fillStyle = '#ffc83d'
        ctx.beginPath()
        ctx.ellipse(x, y, 5 * Math.abs(Math.cos(time * 4 + i)) + 1, 5, 0, 0, Math.PI * 2)
        ctx.fill()
      })
      break
    case 'glutton':
      orbit(g, 4, time, -1, (x, y) => {
        ctx.beginPath()
        ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fill()
      })
      break
    case 'armored':
      ctx.fillStyle = 'rgb(201 204 255 / 0.28)'
      for (const px of [g.core.x + 5, g.core.x + g.core.w - 21]) {
        ctx.beginPath()
        ctx.roundRect(px, g.core.y + 20, 16, g.core.h - 44, 5)
        ctx.fill()
      }
      break
    case 'bulwark':
      edgeGlow(ctx, g, 'left', color, time)
      edgeGlow(ctx, g, 'right', color, time)
      break
    case 'shell':
      edgeGlow(ctx, g, 'top', color, time)
      break
    case 'underplate':
      edgeGlow(ctx, g, 'bottom', color, time)
      break
    case 'heart': {
      // A beating heart on the middle of its underside.
      const beat = 1 + 0.15 * Math.sin(time * 8)
      const hx = cx
      const hy = box.y + box.h - 6
      ctx.translate(hx, hy)
      ctx.scale(beat, beat)
      ctx.shadowColor = color
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(0, 6)
      ctx.bezierCurveTo(-12, -2, -6, -10, 0, -4)
      ctx.bezierCurveTo(6, -10, 12, -2, 0, 6)
      ctx.fill()
      break
    }
    case 'reflect': {
      // A glint sweeping across.
      ctx.clip(bodyPath(g))
      const k = (time * 0.5) % 1.5
      const gx = box.x + k * (box.w + 80) - 40
      const grad = ctx.createLinearGradient(gx - 20, 0, gx + 20, 0)
      grad.addColorStop(0, 'rgb(255 255 255 / 0)')
      grad.addColorStop(0.5, 'rgb(255 255 255 / 0.35)')
      grad.addColorStop(1, 'rgb(255 255 255 / 0)')
      ctx.fillStyle = grad
      ctx.fillRect(box.x, box.y, box.w, box.h)
      break
    }
    case 'secondLife':
      // A halo while the second life is still there.
      if (m('revived')) break
      ctx.lineWidth = 3
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.ellipse(cx, box.y - 10 + Math.sin(time * 3) * 2, box.w * 0.22, 6, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'stoneSkin':
      ctx.globalAlpha = 0.3
      ctx.fillStyle = '#a8a29e'
      for (let i = 0; i < 6; i++) {
        ctx.beginPath()
        ctx.arc(box.x + ((i * 53) % box.w), box.y + ((i * 31) % box.h), 9, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'phase':
      ctx.globalAlpha = 0.4
      for (let i = 0; i < 4; i++) {
        const k = (time * 0.7 + i / 4) % 1
        ctx.beginPath()
        ctx.arc(box.x + ((i * 61) % box.w), box.y - k * 26, 4 * (1 - k) + 1, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'evasive':
      ctx.globalAlpha = 0.18
      ctx.translate(Math.sin(time * 7) * 8, 0)
      ctx.fill(bodyPath(g))
      break
    case 'volatile':
      // Fuse sparks on top.
      for (let i = 0; i < 6; i++) {
        const k = (time * 2 + i / 6) % 1
        ctx.globalAlpha = 1 - k
        ctx.beginPath()
        ctx.arc(cx + Math.sin(i * 7) * k * 24, box.y - 4 - k * 18, 2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'icebound':
      // Icicles under it.
      g.parts.forEach((b, i) => {
        if (g.has(b.col, b.row + 1)) return
        const r = g.rects[i]
        for (let x = r.x + 8; x < r.x + r.w - 6; x += 12) {
          const len = 6 + ((x * 7) % 8)
          ctx.globalAlpha = 0.8
          ctx.beginPath()
          ctx.moveTo(x - 3, r.y + r.h)
          ctx.lineTo(x + 3, r.y + r.h)
          ctx.lineTo(x, r.y + r.h + len)
          ctx.fill()
        }
      })
      break
    case 'cracked':
    case 'shatter':
      ctx.clip(bodyPath(g))
      ctx.lineWidth = 2
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 3)
      ctx.beginPath()
      ctx.moveTo(box.x + box.w * 0.7, box.y)
      ctx.lineTo(box.x + box.w * 0.62, box.y + box.h * 0.35)
      ctx.lineTo(box.x + box.w * 0.75, box.y + box.h * 0.6)
      ctx.lineTo(box.x + box.w * 0.68, box.y + box.h)
      ctx.stroke()
      break
    case 'leech':
      // Tendrils reaching down.
      ctx.lineWidth = 3
      ctx.globalAlpha = 0.6
      for (let i = 0; i < 3; i++) {
        const lx = box.x + ((i + 1) * box.w) / 4
        ctx.beginPath()
        ctx.moveTo(lx, box.y + box.h)
        ctx.quadraticCurveTo(
          lx + Math.sin(time * 3 + i) * 12,
          box.y + box.h + 16,
          lx + Math.sin(time * 2 + i) * 6,
          box.y + box.h + 30,
        )
        ctx.stroke()
      }
      break
    case 'spikes':
      // Thorns along its outer edges.
      ctx.fillStyle = color
      g.parts.forEach((b, i) => {
        const r = g.rects[i]
        if (g.has(b.col, b.row + 1)) return
        for (let x = r.x + 8; x < r.x + r.w - 6; x += 14) {
          ctx.beginPath()
          ctx.moveTo(x - 4, r.y + r.h)
          ctx.lineTo(x, r.y + r.h + 7 + Math.sin(time * 4 + x) * 1.5)
          ctx.lineTo(x + 4, r.y + r.h)
          ctx.fill()
        }
      })
      break
    case 'enrage':
      // Embers rising off it; it boils over below half health.
      for (let i = 0; i < (life < 0.5 ? 10 : 4); i++) {
        const k = (time * 0.9 + i / 7) % 1
        ctx.globalAlpha = (1 - k) * 0.8
        ctx.beginPath()
        ctx.arc(box.x + ((i * 43) % box.w), box.y - k * 30, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'lastStand': {
      const immune = s.turn !== undefined && s.turn < m('immuneUntil')
      if (m('stood') && !immune) break
      ctx.lineWidth = immune ? 4 : 1.5
      ctx.globalAlpha = immune ? 1 : 0.3
      ctx.shadowColor = color
      ctx.shadowBlur = immune ? 16 : 4
      ctx.stroke(outline(g, 5))
      break
    }
    case 'fortify':
      edgeGlow(ctx, g, 'bottom', color, time)
      break
    case 'rally':
      for (let i = 0; i < 5; i++) {
        const k = (time * 0.8 + i / 5) % 1
        ctx.globalAlpha = 1 - k
        ctx.font = `700 12px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText('+', box.x + ((i * 47) % box.w), box.y - k * 24)
      }
      break
    case 'hover':
    case 'drifter':
    case 'weaver':
    case 'blink':
    case 'gravity':
    case 'repulse':
    case 'mire':
    case 'shroud':
    case 'frost':
    case 'frenzy':
    case 'charge':
    case 'lunge':
    case 'retreat':
    case 'guards':
    case 'mirror':
    case 'totem':
    case 'runes':
    case 'powerCells':
    case 'rod':
    case 'core':
      break // drawn behind, or by the bricks it summons
  }
  ctx.restore()
}

const ROLE_COLOR: Record<BossRole, string> = {
  minion: '#6b5aa8',
  guard: '#5b6fbf',
  egg: '#f1e3b8',
  decoy: '#b9a6ff',
  spike: '#a3243b',
  totem: '#2f9e6e',
  rune: '#c9a227',
  cell: '#e0a800',
  rod: '#d9c55a',
  core: '#ffe066',
  ice: '#a5e4ff',
  thorn: '#7b2cbf',
  missile: '#e8590c',
  ward: '#6c7a89',
}

/** A brick a boss summoned, in its role's colours with a glyph; returns false to also draw its hp. */
export function drawRoleBrick(ctx: CanvasRenderingContext2D, b: Brick, time: number): boolean {
  const role = b.role
  if (!role) return false
  const r = brickRect(b)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  ctx.save()
  ctx.fillStyle = ROLE_COLOR[role]
  switch (role) {
    case 'ice':
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 6)
      ctx.fill()
      ctx.globalAlpha = 0.8
      ctx.strokeStyle = '#e8f9ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(r.x + 8, r.y + r.h - 10)
      ctx.lineTo(r.x + r.w - 14, r.y + 8)
      ctx.moveTo(r.x + 20, r.y + r.h - 6)
      ctx.lineTo(r.x + r.w - 6, r.y + 18)
      ctx.stroke()
      ctx.restore()
      return true
    case 'egg': {
      const wobble = (b.timer ?? 2) <= 1 ? Math.sin(time * 18) * 0.15 : Math.sin(time * 3) * 0.05
      ctx.translate(cx, cy)
      ctx.rotate(wobble)
      ctx.beginPath()
      ctx.ellipse(0, 2, r.w * 0.36, r.h * 0.44, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c9a27a'
      for (const [dx, dy] of [
        [-6, -6],
        [7, 2],
        [-3, 10],
      ]) {
        ctx.beginPath()
        ctx.arc(dx, dy, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      return false
    }
    case 'core': {
      const pulse = 1 + 0.12 * Math.sin(time * 6)
      ctx.shadowColor = ROLE_COLOR.core
      ctx.shadowBlur = 18
      ctx.translate(cx, cy)
      ctx.scale(pulse, pulse)
      ctx.beginPath()
      ctx.moveTo(0, -r.h * 0.45)
      ctx.lineTo(r.w * 0.36, 0)
      ctx.lineTo(0, r.h * 0.45)
      ctx.lineTo(-r.w * 0.36, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      return false
    }
    case 'thorn': {
      // A cursed bramble: thorns all round, pulsing purple.
      ctx.shadowColor = '#c77dff'
      ctx.shadowBlur = 8 + 4 * Math.sin(time * 5)
      ctx.beginPath()
      ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = '#c77dff'
      const n = 4
      for (let i = 0; i < n; i++) {
        const t2 = (i + 0.5) / n
        for (const [x0, y0, dx, dy] of [
          [r.x + r.w * t2, r.y + 3, 0, -1],
          [r.x + r.w * t2, r.y + r.h - 3, 0, 1],
          [r.x + 3, r.y + r.h * t2, -1, 0],
          [r.x + r.w - 3, r.y + r.h * t2, 1, 0],
        ]) {
          ctx.beginPath()
          ctx.moveTo(x0 - dy * 3.5, y0 - dx * 3.5)
          ctx.lineTo(x0 + dx * 7, y0 + dy * 7)
          ctx.lineTo(x0 + dy * 3.5, y0 + dx * 3.5)
          ctx.fill()
        }
      }
      ctx.restore()
      return false
    }
    case 'missile': {
      // A falling warhead with a flickering exhaust above it.
      const flick = 0.7 + 0.3 * Math.sin(time * 30 + b.id)
      ctx.fillStyle = `rgb(255 200 61 / ${flick})`
      ctx.beginPath()
      ctx.moveTo(cx - 7, r.y + 8)
      ctx.lineTo(cx, r.y - 8 * flick)
      ctx.lineTo(cx + 7, r.y + 8)
      ctx.fill()
      ctx.fillStyle = ROLE_COLOR.missile
      ctx.beginPath()
      ctx.moveTo(r.x + 8, r.y + 6)
      ctx.lineTo(r.x + r.w - 8, r.y + 6)
      ctx.lineTo(r.x + r.w - 8, r.y + r.h - 18)
      ctx.lineTo(cx, r.y + r.h - 2)
      ctx.lineTo(r.x + 8, r.y + r.h - 18)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#212529'
      ctx.fillRect(r.x + 8, r.y + 14, r.w - 16, 4)
      ctx.restore()
      return false
    }
    case 'ward':
      // Rough stone with cracks: it only guards.
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 6)
      ctx.fill()
      ctx.strokeStyle = 'rgb(0 0 0 / 0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(r.x + 6, r.y + r.h / 2)
      ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2 - 4)
      ctx.lineTo(r.x + r.w - 6, r.y + r.h / 2 + 3)
      ctx.moveTo(r.x + r.w / 2, r.y + 6)
      ctx.lineTo(r.x + r.w / 2 - 3, r.y + r.h / 2 - 4)
      ctx.stroke()
      break
    default:
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 9)
      ctx.fill()
  }
  ctx.fillStyle = 'rgb(255 255 255 / 0.85)'
  ctx.strokeStyle = 'rgb(255 255 255 / 0.85)'
  ctx.lineWidth = 2
  const gx = r.x + r.w - 11
  const gy = r.y + 11
  switch (role) {
    case 'minion':
      // Little horns.
      for (const dx of [10, r.w - 10]) {
        ctx.beginPath()
        ctx.moveTo(r.x + dx - 4, r.y + 2)
        ctx.lineTo(r.x + dx, r.y - 6)
        ctx.lineTo(r.x + dx + 4, r.y + 2)
        ctx.fill()
      }
      break
    case 'guard':
      ctx.beginPath()
      ctx.moveTo(gx - 6, gy - 6)
      ctx.lineTo(gx + 6, gy - 6)
      ctx.lineTo(gx + 6, gy)
      ctx.quadraticCurveTo(gx + 6, gy + 6, gx, gy + 8)
      ctx.quadraticCurveTo(gx - 6, gy + 6, gx - 6, gy)
      ctx.closePath()
      ctx.fill()
      break
    case 'decoy':
      ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 4)
      for (const dx of [-8, 8]) {
        ctx.beginPath()
        ctx.arc(cx + dx, r.y + 14, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'spike':
      for (let i = 0; i < 4; i++) {
        const x = r.x + 8 + (i * (r.w - 16)) / 3
        for (const [y0, y1] of [
          [r.y, r.y - 7],
          [r.y + r.h, r.y + r.h + 7],
        ]) {
          ctx.beginPath()
          ctx.moveTo(x - 4, y0)
          ctx.lineTo(x, y1)
          ctx.lineTo(x + 4, y0)
          ctx.fill()
        }
      }
      break
    case 'totem':
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 4)
      ctx.fillRect(gx - 6, gy - 1.5, 12, 3)
      ctx.fillRect(gx - 1.5, gy - 6, 3, 12)
      break
    case 'rune':
      ctx.translate(gx, gy)
      ctx.rotate(time)
      ctx.beginPath()
      ctx.arc(0, 0, 6, 0, Math.PI * 2)
      ctx.moveTo(-6, 0)
      ctx.lineTo(6, 0)
      ctx.moveTo(0, -6)
      ctx.lineTo(0, 6)
      ctx.stroke()
      break
    case 'cell':
    case 'rod':
      // A lightning bolt.
      ctx.beginPath()
      ctx.moveTo(gx + 2, gy - 8)
      ctx.lineTo(gx - 5, gy + 1)
      ctx.lineTo(gx, gy + 1)
      ctx.lineTo(gx - 2, gy + 8)
      ctx.lineTo(gx + 5, gy - 1)
      ctx.lineTo(gx, gy - 1)
      ctx.closePath()
      ctx.fill()
      break
  }
  ctx.restore()
  return false
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.stroke()
}
