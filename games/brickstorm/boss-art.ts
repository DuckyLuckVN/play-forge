// Drawing a boss: its body follows its exact hitbox (a set of cells), with a
// skin for its kind, one of several faces that react to the fight, an aura for
// harder bosses, and an effect for each of its skills.
import { compactNumber, fillFitText } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { bossName, skillInfo } from './boss-skill-ui'
import { shapeOf } from './sim/boss-shapes'
import { BRICK_INSET, CELL, TOP } from './sim/config'
import { dims } from './sim/dims'
import { hitRects } from './sim/rows'
import type { Boss, Brick, Rect, RunState } from './sim/types'

/** What drawBoss needs from the run; the boss card's preview fakes this. */
export type BossView = Pick<RunState, 'boss' | 'bricks'> & Partial<Pick<RunState, 'cols' | 'rows'>>

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
  const box = { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
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
function bodyPath(g: Geo, grow = 0): Path2D {
  const path = new Path2D()
  g.parts.forEach((b, i) => {
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
  /** Where its eyes look (a ball, or the launch point). */
  look?: { x: number; y: number }
}

export function drawBoss(ctx: CanvasRenderingContext2D, s: BossView, time: number, look: BossLook): void {
  const g = geometry(s)
  const boss = s.boss
  if (!g || !boss) return
  const life = Math.max(0, boss.hp / boss.maxHp)
  const rage = boss.traits.includes('enrage') && life < 0.5
  const accent = skillInfo(boss.traits[0] ?? 'armored').color
  const tier = boss.tier ?? 1
  const danger = s.rows !== undefined && Math.max(...g.parts.map((b) => b.row)) >= dims({ cols: s.cols ?? 7, rows: s.rows }).dangerRow - 3
  const body = bodyPath(g)
  const inner = bodyPath(g, -3)

  ctx.save()
  // Aura: a glow from tier 2, living flames from tier 3.
  if (tier >= 3) drawFlames(ctx, g, time, rage ? theme.coral : accent)
  ctx.shadowColor = rage || danger ? theme.coral : accent
  ctx.shadowBlur = tier >= 2 ? 26 + 10 * Math.sin(time * 4) : 14 + 6 * Math.sin(time * 4)
  ctx.fillStyle = accent
  ctx.fill(body)
  ctx.shadowBlur = 0

  for (const id of boss.traits) drawSkill(ctx, id, g, boss, time, 'back')

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

  for (const id of boss.traits) drawSkill(ctx, id, g, boss, time, 'front')
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
}

/** One of BOSS_FACES faces, in the core rect. Eyes follow `look`, blink, wince when hit, glow when close to the line. */
function drawFace(ctx: CanvasRenderingContext2D, boss: Boss, core: Rect, time: number, m: Mood): void {
  const k = Math.min(core.w / 160, core.h / 104, 1.2)
  const cx = core.x + core.w / 2
  const eyeY = core.y + core.h * 0.44
  const blink = (time * 0.6 + boss.turn) % 4 < 0.12
  const wince = m.hit > 0.3
  const pupil = m.rage || m.danger ? theme.coral : '#1d1240'
  const toward = (ex: number, ey: number, r: number): [number, number] => {
    if (!m.look) return [ex + Math.sin(time * 1.3) * r * 0.5, ey]
    const a = Math.atan2(m.look.y - ey, m.look.x - ex)
    return [ex + Math.cos(a) * r, ey + Math.sin(a) * r]
  }
  ctx.save()
  if (m.danger) {
    ctx.shadowColor = theme.coral
    ctx.shadowBlur = 10
  }
  const eye = (ex: number, ey: number, rx: number, ry: number, pr: number) => {
    if (blink || wince) {
      ctx.strokeStyle = theme.chalk
      ctx.lineWidth = 3 * k
      ctx.beginPath()
      ctx.moveTo(ex - rx, ey)
      ctx.lineTo(ex + rx, ey)
      ctx.stroke()
      return
    }
    ctx.fillStyle = theme.chalk
    ctx.beginPath()
    ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    const [px, py] = toward(ex, ey, Math.min(rx, ry) - pr - 1)
    ctx.fillStyle = pupil
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
  }
  const brow = (ex: number, side: number) => {
    ctx.strokeStyle = theme.chalk
    ctx.lineWidth = 4 * k
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - side * 12 * k, eyeY - 17 * k)
    ctx.lineTo(ex + side * 8 * k, eyeY - 10 * k)
    ctx.stroke()
  }
  const jagged = (y: number, mw: number, teeth = 6) => {
    ctx.strokeStyle = theme.chalk
    ctx.lineWidth = 3 * k
    ctx.beginPath()
    for (let i = 0; i <= teeth; i++) {
      const mx = cx - mw + (i * 2 * mw) / teeth
      const my = y + (i % 2 ? 5 : -2) * k
      if (i) ctx.lineTo(mx, my)
      else ctx.moveTo(mx, my)
    }
    ctx.stroke()
  }
  switch ((boss.face ?? 0) % 6) {
    case 1: {
      // Cyclops: one big eye under a heavy brow.
      eye(cx, eyeY, 24 * k, 18 * k, 9 * k)
      ctx.strokeStyle = theme.chalk
      ctx.lineWidth = 5 * k
      ctx.beginPath()
      ctx.moveTo(cx - 30 * k, eyeY - 32 * k)
      ctx.lineTo(cx, eyeY - 23 * k)
      ctx.lineTo(cx + 30 * k, eyeY - 32 * k)
      ctx.stroke()
      jagged(core.y + core.h * 0.72, core.w * 0.16, 4)
      break
    }
    case 2: {
      // Chomper: little eyes, a big toothy jaw that snaps when hit.
      for (const side of [-1, 1]) eye(cx + side * core.w * 0.16, eyeY - 6 * k, 7 * k, 7 * k, 3.5 * k)
      const open = (4 + 6 * (0.5 + 0.5 * Math.sin(time * 3)) + m.hit * 10) * k
      const mw = core.w * 0.26
      const my = core.y + core.h * 0.64
      ctx.fillStyle = '#12081f'
      ctx.beginPath()
      ctx.roundRect(cx - mw, my - open, mw * 2, open * 2, 6 * k)
      ctx.fill()
      ctx.fillStyle = theme.chalk
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
      // Skull: dark sockets with glowing pinpoints, a nose, a row of teeth.
      for (const side of [-1, 1]) {
        const ex = cx + side * core.w * 0.17
        ctx.fillStyle = '#0c0614'
        ctx.beginPath()
        ctx.ellipse(ex, eyeY, 13 * k, 11 * k, 0, 0, Math.PI * 2)
        ctx.fill()
        const [px, py] = toward(ex, eyeY, 5 * k)
        ctx.fillStyle = m.rage || m.danger ? theme.coral : '#7fe7ff'
        ctx.beginPath()
        ctx.arc(px, py, blink ? 1 : 3.5 * k, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#0c0614'
      ctx.beginPath()
      ctx.moveTo(cx, eyeY + 8 * k)
      ctx.lineTo(cx - 5 * k, eyeY + 18 * k)
      ctx.lineTo(cx + 5 * k, eyeY + 18 * k)
      ctx.fill()
      const ty = core.y + core.h * 0.7
      ctx.fillStyle = theme.chalk
      for (let i = -3; i < 3; i++) ctx.fillRect(cx + i * 8 * k + 1, ty - 5 * k, 6 * k, 10 * k)
      break
    }
    case 4: {
      // Three eyes, blinking out of step.
      const spots: Array<[number, number]> = [[-0.22, 0.05], [0.22, 0.05], [0, -0.12]]
      spots.forEach(([dx, dy], i) => {
        const shut = (time * 0.6 + i * 1.3 + boss.turn) % 3 < 0.12 || wince
        const ex = cx + dx * core.w
        const ey = eyeY + dy * core.h
        if (shut) {
          ctx.strokeStyle = theme.chalk
          ctx.lineWidth = 3 * k
          ctx.beginPath()
          ctx.moveTo(ex - 9 * k, ey)
          ctx.lineTo(ex + 9 * k, ey)
          ctx.stroke()
        } else {
          ctx.fillStyle = theme.chalk
          ctx.beginPath()
          ctx.arc(ex, ey, 9 * k, 0, Math.PI * 2)
          ctx.fill()
          const [px, py] = toward(ex, ey, 4 * k)
          ctx.fillStyle = pupil
          ctx.beginPath()
          ctx.arc(px, py, 4 * k, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      jagged(core.y + core.h * 0.7, core.w * 0.2, 8)
      break
    }
    case 5: {
      // Visor: a dark band with a glowing slit and a scanning light.
      const vh = 16 * k
      ctx.fillStyle = '#0c0614'
      ctx.beginPath()
      ctx.roundRect(core.x + core.w * 0.12, eyeY - vh / 2, core.w * 0.76, vh, vh / 2)
      ctx.fill()
      const glow = m.rage || m.danger ? theme.coral : '#7fe7ff'
      ctx.fillStyle = glow
      ctx.fillRect(core.x + core.w * 0.16, eyeY - 1.5 * k, core.w * 0.68, blink || wince ? 1 : 3 * k)
      const scan = m.look
        ? Math.max(core.x + core.w * 0.18, Math.min(core.x + core.w * 0.82, m.look.x))
        : cx + Math.sin(time * 2) * core.w * 0.3
      ctx.shadowColor = glow
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(scan, eyeY, 5 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgb(255 255 255 / 0.5)'
      ctx.lineWidth = 2
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(cx + i * 7 * k, core.y + core.h * 0.62)
        ctx.lineTo(cx + i * 7 * k, core.y + core.h * 0.74)
        ctx.stroke()
      }
      break
    }
    default: {
      // Angry brows and a jagged grin.
      for (const side of [-1, 1]) {
        const ex = cx + side * core.w * 0.17
        eye(ex, eyeY, 11 * k, 9 * k, 5 * k)
        brow(ex, side)
      }
      jagged(core.y + core.h * 0.66, core.w * 0.22)
    }
  }
  ctx.restore()

  // Sweat when it's losing; steam when it's enraged.
  if (m.life < 0.33) {
    const d = (time * 1.2) % 1
    ctx.fillStyle = `rgb(127 231 255 / ${1 - d})`
    ctx.beginPath()
    ctx.ellipse(core.x + core.w * 0.86, core.y + core.h * 0.25 + d * 14, 3, 5, 0, 0, Math.PI * 2)
    ctx.fill()
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
function drawStatus(ctx: CanvasRenderingContext2D, boss: Boss, core: Rect, life: number, rage: boolean): void {
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

/** Each skill's look, behind or in front of the body. */
function drawSkill(
  ctx: CanvasRenderingContext2D,
  id: string,
  g: Geo,
  boss: Boss,
  time: number,
  layer: 'back' | 'front',
): void {
  const { box } = g
  const color = skillInfo(id).color
  ctx.save()
  switch (id) {
    case 'shield':
      if (layer !== 'front') break
      // A shimmering hex bubble around the whole body.
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 5)
      ctx.lineWidth = 2
      ctx.stroke(outline(g, 6))
      ctx.globalAlpha = 0.35
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + time * 0.4
        hexagon(ctx, box.x + box.w / 2 + Math.cos(a) * (box.w / 2 + 4), box.y + box.h / 2 + Math.sin(a) * (box.h / 2 + 4), 5)
      }
      break
    case 'minions':
      if (layer !== 'front') break
      // A buzzing swarm.
      ctx.fillStyle = color
      for (let i = 0; i < 7; i++) {
        const a = time * (1.5 + i * 0.2) + i * 2
        ctx.beginPath()
        ctx.arc(
          box.x + box.w / 2 + Math.cos(a) * (box.w / 2 + 10) + Math.sin(time * 20 + i) * 2,
          box.y + box.h / 2 + Math.sin(a * 1.3) * (box.h / 2 + 8),
          2.5,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      break
    case 'drifter': {
      if (layer !== 'back') break
      // Speed streaks behind it.
      const back = boss.dir > 0 ? box.x - 6 : box.x + box.w + 6
      ctx.strokeStyle = color
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      for (let i = 0; i < 3; i++) {
        const y = box.y + ((i + 1) * box.h) / 4
        const len = 12 + 6 * Math.sin(time * 6 + i)
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(back, y)
        ctx.lineTo(back - boss.dir * len, y)
        ctx.stroke()
      }
      break
    }
    case 'armored':
      if (layer !== 'front') break
      // Bolted plates on its flanks.
      ctx.fillStyle = 'rgb(201 204 255 / 0.28)'
      for (const px of [g.core.x + 5, g.core.x + g.core.w - 21]) {
        ctx.beginPath()
        ctx.roundRect(px, g.core.y + 20, 16, g.core.h - 44, 5)
        ctx.fill()
      }
      break
  }
  ctx.restore()
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
