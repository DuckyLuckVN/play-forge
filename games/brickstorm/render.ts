import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { ease, prefersReducedMotion } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { compactNumber, fillFitText, fitScale } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { ArenaPainter, type ArenaId } from './arenas'
import { drawBoss, drawRoleBrick } from './boss-art'
import { BossGlide } from './boss-glide'
import { BOSS_ROOM, bossHidesGuide } from './sim/boss'
import { drawCoin, formatCoins } from './coin'
import { drawBall, TRAIL_STYLE } from './cosmetics'
import { t } from './i18n'
import {
  barShake,
  COIN_FLY,
  GROW_FX_LIFE,
  ARENA_LAND,
  ARENA_OPEN,
  ARENA_SQUEEZE,
  BOSS_DEATH_BOOM,
  HEAL_COLOR,
  hpColor,
  SHOCKWAVE_LIFE,
  type Juice,
  LEVEL_POP_LIFE,
  orbAlpha,
  orbPoint,
  TOUGHER_LIFE,
  XP_ORB_FLY,
} from './juice'
import { runMods } from './sim/boosts'
import {
  BALL_R,
  boardSize,
  CELL,
  COLS,
  COMBO_TIERS,
  HEALTH_STRIP,
  LEVEL_POWER,
  PICKUP_R,
  ROWS,
  TOP,
} from './sim/config'
import { traceGuide } from './sim/physics'
import { restingBall } from './sim/run'
import { comboPower } from './sim/damage'
import { dims, type Dims } from './sim/dims'
import { brickRect, brickShape, cellCenter, hitShapes } from './sim/rows'
import type { Brick, BrickKind, PickupKind, Rect, RunState } from './sim/types'
import type { HeroAvatar } from './hero-avatar'
import { BrickTween } from './brick-tween'

const TRAIL = 4
const XP_COLOR = '#4be3a0'
/** XP bar colour by heat: calm, glowing, on fire, white-hot. */
const XP_HEAT_COLOR = [XP_COLOR, XP_COLOR, '#ffc83d', '#fff6d6']
/** The combo's XP multiplier colour by tier: warmer each step. */
const COMBO_XP_COLOR: Record<number, string> = { 1.25: '#ffc83d', 1.5: '#ff9f43', 2: theme.coral }
/** Seconds the multiplier takes to slam into place. */
const COMBO_SLAM = 0.18
/** White-hot bar: a bolt flickers BOLT_RATE times a second, each for BOLT_SHOW of the cycle. */
const BOLT_RATE = 2
const BOLT_SHOW = 0.12

/** A glyph in the corner (or frame) that tells special bricks apart. */
export function drawKindGlyph(ctx: CanvasRenderingContext2D, kind: BrickKind, r: Rect, time: number): void {
  if (kind === 'normal') return
  const cx = r.x + r.w - 10
  const cy = r.y + 11
  ctx.save()
  switch (kind) {
    case 'bomb':
      ctx.fillStyle = theme.night
      ctx.beginPath()
      ctx.arc(cx, cy + 1, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = Math.sin(time * 12) > 0 ? theme.coral : theme.yolk
      ctx.fillRect(cx + 3, cy - 7, 3, 3)
      break
    case 'gold':
      ctx.strokeStyle = '#fff3b0'
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 5)
      ctx.beginPath()
      ctx.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 7)
      ctx.stroke()
      break
    case 'lightning':
      ctx.fillStyle = '#eaf6ff'
      ctx.beginPath()
      ctx.moveTo(cx + 2, cy - 8)
      ctx.lineTo(cx - 5, cy + 1)
      ctx.lineTo(cx, cy + 1)
      ctx.lineTo(cx - 2, cy + 8)
      ctx.lineTo(cx + 5, cy - 1)
      ctx.lineTo(cx, cy - 1)
      ctx.closePath()
      ctx.fill()
      break
    case 'mystery':
      ctx.fillStyle = theme.night
      ctx.font = `700 14px ${FONT}`
      ctx.fillText('?', cx, cy + 1)
      break
    case 'armored':
      ctx.strokeStyle = '#d6dbe8'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8)
      ctx.stroke()
      break
    case 'splitter':
      ctx.strokeStyle = theme.night
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(r.x + r.w / 2, r.y + 4)
      ctx.lineTo(r.x + r.w / 2 - 4, r.y + r.h / 2 - 8)
      ctx.lineTo(r.x + r.w / 2 + 3, r.y + r.h / 2 + 8)
      ctx.lineTo(r.x + r.w / 2, r.y + r.h - 4)
      ctx.stroke()
      break
  }
  ctx.restore()
}

/** One pickup, centred at (x, y). */
export function drawPickupGlyph(
  ctx: CanvasRenderingContext2D,
  kind: PickupKind,
  x: number,
  y: number,
  time: number,
): void {
  if (kind === 'ball') {
    ctx.strokeStyle = theme.chalk
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, PICKUP_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = theme.chalk
    ctx.fillRect(x - 6, y - 1.5, 12, 3)
    ctx.fillRect(x - 1.5, y - 6, 3, 12)
  } else if (kind === 'fire') {
    ctx.fillStyle = '#ff9f43'
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    ctx.arc(x, y, PICKUP_R + 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    drawBall(ctx, 'ball:flame', x, y, PICKUP_R - 3, time, 0, -1)
  } else if (kind === 'laser') {
    ctx.strokeStyle = '#ff6fb5'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x - PICKUP_R, y)
    ctx.lineTo(x + PICKUP_R, y)
    ctx.moveTo(x + PICKUP_R - 5, y - 5)
    ctx.lineTo(x + PICKUP_R, y)
    ctx.lineTo(x + PICKUP_R - 5, y + 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, PICKUP_R, 0, Math.PI * 2)
    ctx.stroke()
  } else if (kind === 'heart') {
    const beat = 1 + 0.08 * Math.max(0, Math.sin(time * 6))
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(beat, beat)
    ctx.fillStyle = 'rgb(255 107 129 / 0.3)'
    ctx.beginPath()
    ctx.arc(0, 0, PICKUP_R + 4, 0, Math.PI * 2)
    ctx.fill()
    heartPath(ctx, 0, 1, PICKUP_R - 1)
    ctx.fillStyle = '#ff6b81'
    ctx.fill()
    ctx.strokeStyle = theme.night
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = 'rgb(255 255 255 / 0.7)'
    ctx.beginPath()
    ctx.arc(-4, -3, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  } else {
    drawCoin(ctx, x, y, PICKUP_R - 1)
  }
}

/** A heart shape `r` wide-ish, centred on (x, y); fill or stroke it after. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y + r * 0.9)
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45)
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9)
  ctx.closePath()
}

/** Outline path of a shaped brick (a triangle with its corners softened like a square's, or an orb). */
export function shapedBrickPath(
  ctx: CanvasRenderingContext2D,
  b: Pick<Brick, 'col' | 'row' | 'shape'>,
): void {
  const shape = brickShape(b)
  ctx.beginPath()
  if ('circle' in shape) {
    ctx.arc(shape.circle.x, shape.circle.y, shape.circle.r, 0, Math.PI * 2)
    return
  }
  if (!('poly' in shape)) return
  // Rounded corners: start mid-edge, arcTo through each corner.
  const p = shape.poly
  const mid = (i: number) => [(p[i][0] + p[(i + 1) % 3][0]) / 2, (p[i][1] + p[(i + 1) % 3][1]) / 2] as const
  ctx.moveTo(...mid(2))
  for (let i = 0; i < 3; i++) {
    // The right angle rounds like a square brick; the 45° tips stay sharp,
    // so the triangle reaches the same edges as a square.
    const prev = p[(i + 2) % 3]
    const next = p[(i + 1) % 3]
    const right =
      Math.abs((prev[0] - p[i][0]) * (next[0] - p[i][0]) + (prev[1] - p[i][1]) * (next[1] - p[i][1])) < 1e-6
    ctx.arcTo(p[i][0], p[i][1], ...mid(i), right ? 9 : 0.5)
  }
  ctx.closePath()
}

/** A triangle or orb brick, lit like a square brick: no rim, a soft light band along its top edge. */
function drawShapedBrick(ctx: CanvasRenderingContext2D, b: Brick, color: string): void {
  shapedBrickPath(ctx, b)
  ctx.fillStyle = color
  ctx.fill()
  ctx.save()
  ctx.clip()
  const r = brickRect(b)
  ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
  ctx.strokeStyle = 'rgb(255 255 255 / 0.18)'
  if (b.shape === 'orb') {
    // A curved shine, upper-left.
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 6, Math.PI * 1.1, Math.PI * 1.55)
    ctx.stroke()
  } else if (b.shape === 'tri-tl' || b.shape === 'tri-tr') {
    // A flat top edge: the same band a square has.
    const inset = b.shape === 'tri-tl' ? { x: r.x + 6, w: r.w - 18 } : { x: r.x + 12, w: r.w - 18 }
    ctx.fillRect(inset.x, r.y + 4, inset.w, 4)
  } else {
    // The top is the slanted side: a thin glint hugging it, on its upper half (the light is from above).
    const left = b.shape === 'tri-br'
    const tipX = left ? r.x + r.w : r.x
    const dir = left ? -1 : 1
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    // Inset 4 px into the brick, perpendicular to the slant.
    const off = 4 / Math.SQRT2
    ctx.moveTo(tipX + dir * (8 - off), r.y + 8 + off)
    ctx.lineTo(tipX + dir * (r.w * 0.55 - off), r.y + r.h * 0.55 + off)
    ctx.stroke()
  }
  ctx.restore()
}

/** Where a shaped brick's number and glyph go: a box around a triangle's centroid, or the orb's middle. */
function shapeLabelRect(b: Brick): Rect {
  const r = brickRect(b)
  if (b.shape === 'orb' || !b.shape) return r
  const right = b.shape === 'tri-tr' || b.shape === 'tri-br'
  const bottom = b.shape === 'tri-bl' || b.shape === 'tri-br'
  const cx = r.x + r.w * (right ? 2 / 3 : 1 / 3)
  const cy = r.y + r.h * (bottom ? 2 / 3 : 1 / 3)
  const w = r.w * 0.5
  return { x: cx - w / 2, y: cy - w / 2, w, h: w }
}

/** Health bar colour: green, then yellow, then red as it runs out. */
export function healthColor(share: number): string {
  return share > 0.5 ? HEAL_COLOR : share > 0.25 ? '#ffd43b' : theme.coral
}

/** Where a boss looks: the first ball in flight, else the ball waiting to launch. */
function bossLook(s: RunState): { x: number; y: number } {
  const ball = s.balls.find((b) => b.status === 'flying')
  return ball ? { x: ball.x, y: ball.y } : { x: s.launchX, y: dims(s).floorY }
}

export class BoardRenderer {
  /** Recent positions per ball, for the fever trail. */
  private trails: Array<Array<[number, number]>> = []
  private arenaPainter = new ArenaPainter()
  /** The equipped arena (background). */
  arena: ArenaId = 'indigo'
  /** Bricks glide to their new row instead of jumping. */
  private tween = new BrickTween()
  private tweenAt = 0
  /** A new or resumed run: its bricks appear where they are, no glide. */
  resetTween(): void {
    this.tween.reset()
  }

  /** The hero standing by the ball (set by the game). */
  avatar: HeroAvatar | null = null
  /** Equipped ball skin and trail ids, e.g. 'ball:star'. */
  ball = 'ball:classic'
  trail = 'trail:none'

  constructor(
    private view: Canvas2D,
    private particles: Particles,
    private shake: Shake,
  ) {}

  /** Board geometry for the frame being drawn. */
  private d: Dims = boardSize(COLS, ROWS)
  private glide = new BossGlide()
  private lastTime = 0
  /** Where the HUD wallet's coin is drawn, so flying coins land on it. */
  private coinIconX = 0

  draw(s: RunState | null, juice: Juice, aim: number | null, time: number): void {
    this.d = s ? dims(s) : boardSize(COLS, ROWS)
    const { ctx } = this.view
    ctx.save()
    this.arenaPainter.draw(ctx, this.arena, s?.turn ?? 1, s?.fever ?? false, time, this.d)
    this.shake.apply(ctx)
    this.drawBoard(ctx, s, time)
    if (s) {
      this.tween.update([...s.bricks.filter((b) => b.kind !== 'boss'), ...s.pickups], time - this.tweenAt)
      this.tweenAt = time
    }
    if (s) this.drawHealth(ctx, s, juice, time)
    if (s) {
      this.drawPickups(ctx, s, time)
      this.drawBricks(ctx, s, time)
      this.drawMovingBoss(ctx, s, time, juice)
      this.drawBossDeath(ctx, juice, time)
      this.drawArenaFx(ctx, juice, time)
      if (s.phase === 'aim' && aim !== null) this.drawGuide(ctx, s, aim)
      // The hero first, so the ball it holds is drawn in its hand.
      if (this.avatar) {
        this.avatar.drawBall = (c, x, y, r) => drawBall(c, this.ball, x, y, r, time)
        this.avatar.draw(ctx, this.d.floorY)
      }
      this.drawBalls(ctx, s, time, juice.zaps)
    }
    if (juice.growFx) this.drawGrowFx(ctx, juice.growFx)
    for (const l of juice.lasers) {
      ctx.fillStyle = '#ff6fb5'
      ctx.globalAlpha = l.life / 0.3
      ctx.fillRect(0, l.y - 6 * (l.life / 0.3), this.d.boardW, 12 * (l.life / 0.3))
      ctx.globalAlpha = 1
    }
    this.particles.draw(ctx)
    ctx.restore()
    if (s) {
      this.drawHud(ctx, s, juice, time)
      this.drawCombo(ctx, s)
      this.drawLevelPop(ctx, juice)
    }
    this.drawCoinFlyers(ctx, juice)
    this.drawTougher(ctx, juice)
    this.drawBanner(ctx, juice)
    if (juice.flash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${juice.flash * 0.45})`
      ctx.fillRect(0, 0, this.d.boardW, this.d.boardH)
    }
    if (juice.hurtFlash > 0) {
      // A red vignette: strongest at the edges, so the board stays readable.
      const { boardW: w, boardH: h } = this.d
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.3,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      )
      g.addColorStop(0, 'rgb(255 60 60 / 0)')
      g.addColorStop(1, `rgb(255 60 60 / ${0.55 * juice.hurtFlash})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }

  /**
   * The hero's health, in a strip under the floor, out of the way of play:
   * a heart, the bar (a ghost of lost health drains after a crash), "72 / 100".
   */
  private drawHealth(ctx: CanvasRenderingContext2D, s: RunState, juice: Juice, time: number): void {
    const share = Math.max(0, Math.min(1, s.hp / s.maxHp))
    const low = share <= 0.25
    const still = prefersReducedMotion()
    const cy = this.d.floorY + 24 + HEALTH_STRIP / 2 - 1
    const bh = 10
    const by = cy - bh / 2
    // Heart: beats faster when low, jolts on a hit.
    const beat = still ? 1 : 1 + (low ? 0.15 : 0.06) * Math.max(0, Math.sin(time * (low ? 10 : 4)))
    const jolt = still ? 0 : juice.heroHurt * 3 * (Math.random() * 2 - 1)
    ctx.save()
    ctx.translate(18 + jolt, cy + 1)
    ctx.scale(beat, beat)
    heartPath(ctx, 0, 0, 8)
    ctx.fillStyle = juice.heroHurt > 0.3 ? '#ffffff' : '#ff6b81'
    ctx.fill()
    ctx.strokeStyle = theme.night
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    const x0 = 34
    const w = this.d.boardW - 12 - x0
    ctx.fillStyle = 'rgb(0 0 0 / 0.45)'
    ctx.beginPath()
    ctx.roundRect(x0, by, w, bh, 5)
    ctx.fill()
    const ghost = Math.max(0, Math.min(1, (juice.hpGhost ?? s.hp) / s.maxHp))
    if (ghost > share) {
      ctx.fillStyle = 'rgb(255 255 255 / 0.75)'
      ctx.beginPath()
      ctx.roundRect(x0, by, w * ghost, bh, 5)
      ctx.fill()
    }
    ctx.save()
    ctx.globalAlpha = low && !still ? 0.6 + 0.4 * Math.sin(time * 9) : 1
    if (juice.healGlow > 0) {
      ctx.shadowColor = HEAL_COLOR
      ctx.shadowBlur = 14 * juice.healGlow
    }
    ctx.fillStyle = healthColor(share)
    ctx.beginPath()
    ctx.roundRect(x0, by, Math.max(share > 0 ? 5 : 0, w * share), bh, 5)
    ctx.fill()
    ctx.restore()
    // Shine and 25-health ticks, so a big pool reads as big.
    ctx.fillStyle = 'rgb(255 255 255 / 0.25)'
    ctx.fillRect(x0 + 3, by + 2, Math.max(0, w * share - 6), 2)
    ctx.fillStyle = 'rgb(0 0 0 / 0.3)'
    for (let v = 25; v < s.maxHp; v += 25) ctx.fillRect(x0 + (w * v) / s.maxHp - 0.5, by + 2, 1, bh - 4)
    ctx.font = `800 10px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = theme.night
    const label = `${Math.ceil(s.hp)} / ${s.maxHp}`
    ctx.strokeText(label, x0 + w / 2, cy + 0.5)
    ctx.fillStyle = theme.chalk
    ctx.fillText(label, x0 + w / 2, cy + 0.5)
    // "−18" / "+20" rising from the bar's end.
    const pop = juice.hpPop
    if (pop) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, (1.4 - pop.age) / 0.4))
      ctx.font = `800 ${pop.amount < 0 ? 16 : 14}px ${FONT}`
      ctx.textAlign = 'right'
      const text = pop.amount < 0 ? `−${-pop.amount}` : `+${pop.amount}`
      const y = by - 6 - pop.age * 14
      ctx.strokeText(text, x0 + w, y)
      ctx.fillStyle = pop.amount < 0 ? theme.coral : HEAL_COLOR
      ctx.fillText(text, x0 + w, y)
      ctx.restore()
    }
    juice.width = this.d.boardW
    juice.healY = by
  }

  private drawBoard(ctx: CanvasRenderingContext2D, s: RunState | null, time: number): void {
    // A translucent well, so the arena shows through the board.
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
    ctx.beginPath()
    ctx.roundRect(0, TOP, this.d.boardW, this.d.floorY + BALL_R - TOP, 10)
    ctx.fill()
    const y = TOP + this.d.dangerRow * CELL
    const danger = s?.bricks.some((b) => b.row === this.d.dangerRow - 1) ?? false
    const pulse = danger ? 0.55 + 0.45 * Math.sin(time * 8) : 0.25
    ctx.strokeStyle = theme.coral
    ctx.globalAlpha = pulse
    ctx.lineWidth = danger ? 3 : 2
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(this.d.boardW, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawBricks(ctx: CanvasRenderingContext2D, s: RunState, time: number): void {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const b of s.bricks) {
      if (b.kind === 'boss') continue // drawn as one body by drawBoss
      const dy = this.tween.dy(b.id)
      ctx.save()
      if (dy) {
        ctx.translate(0, dy)
        // Sliding in from above: fade in as it arrives.
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 + dy / CELL + 0.4))
      }
      this.drawBrick(ctx, s, b, time)
      ctx.restore()
    }
  }

  private drawBrick(ctx: CanvasRenderingContext2D, s: RunState, b: Brick, time: number): void {
    {
      const r = brickRect(b)
      if (b.role) {
        // Summoned by a boss skill: its own look (ice has no number).
        if (drawRoleBrick(ctx, b, time)) return
      } else if (b.shape) {
        drawShapedBrick(ctx, b, b.kind === 'gold' ? '#ffc83d' : hpColor(b.hp, s.turn))
      } else {
        ctx.fillStyle = b.kind === 'gold' ? '#ffc83d' : hpColor(b.hp, s.turn)
        ctx.beginPath()
        ctx.roundRect(r.x, r.y, r.w, r.h, 9)
        ctx.fill()
        ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
        ctx.fillRect(r.x + 6, r.y + 4, r.w - 12, 4)
      }
      // A triangle's glyph and number sit in its fat half, around its centroid.
      const label = b.shape && !b.role ? shapeLabelRect(b) : r
      drawKindGlyph(ctx, b.kind, label, time)
      const hp = compactNumber(Math.ceil(b.hp))
      ctx.fillStyle = theme.night
      const small = b.shape && b.shape !== 'orb'
      ctx.font = `700 ${hp.length >= 4 || small ? 14 : 20}px ${FONT}`
      fillFitText(ctx, hp, label.x + label.w / 2, label.y + label.h / 2 + 1, label.w - 2)
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, s: RunState, time: number): void {
    for (const p of s.pickups) {
      const c = cellCenter(p.col, p.row)
      const x = c.x
      const y = c.y + this.tween.dy(p.id)
      if (p.used) {
        // A fired laser stays charged until the volley ends.
        ctx.fillStyle = `rgb(255 111 181 / ${0.25 + 0.15 * Math.sin(time * 12)})`
        ctx.beginPath()
        ctx.arc(x, y, PICKUP_R + 6, 0, Math.PI * 2)
        ctx.fill()
      }
      drawPickupGlyph(ctx, p.kind, x, y + Math.sin(time * 4 + p.id) * 3, time)
    }
  }

  private drawGuide(ctx: CanvasRenderingContext2D, s: RunState, aim: number): void {
    const rest = restingBall(s)
    const pts = traceGuide(
      s.launchX,
      rest.y,
      aim,
      runMods(s).guideLength,
      hitShapes(s.bricks),
      this.d.boardW,
      this.d.floorY,
      rest.r,
    ).slice(0, bossHidesGuide(s) ? 2 : undefined)
    ctx.strokeStyle = 'rgb(244 241 255 / 0.7)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.setLineDash([2, 10])
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawBalls(ctx: CanvasRenderingContext2D, s: RunState, time: number, zaps: Juice['zaps']): void {
    const flying = s.balls.filter((b) => b.status === 'flying')
    const style = TRAIL_STYLE[this.trail] ?? TRAIL_STYLE['trail:none']
    const len = s.fever ? Math.max(style.len, TRAIL) : style.len
    if (len > 0) {
      flying.forEach((b, i) => {
        const trail = (this.trails[i] ??= [])
        trail.unshift([b.x, b.y])
        trail.length = Math.min(trail.length, len)
        trail.forEach(([x, y], k) => {
          if (k === 0) return
          const r = BALL_R * (s.fever ? 1.2 : style.size) * (1 - k / (len + 1))
          ctx.fillStyle = s.fever ? theme.yolk : style.color(k, time)
          ctx.globalAlpha = (s.fever ? 0.4 : 0.6) * (1 - k / len)
          if (style.shape === 'square' && !s.fever) ctx.fillRect(x - r, y - r, r * 2, r * 2)
          else {
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
          }
        })
      })
      ctx.globalAlpha = 1
    } else {
      this.trails = []
    }

    for (const b of flying) {
      if (s.fever) {
        ctx.fillStyle = theme.yolk
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.arc(b.x, b.y, BALL_R * 1.8, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      if (b.kind === 'fire') {
        ctx.fillStyle = '#ff9f43'
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(time * 40)
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
        drawBall(ctx, 'ball:flame', b.x, b.y, b.r * 1.2, time, b.vx, b.vy)
      } else if (b.kind === 'bomb') {
        this.drawBombBall(ctx, b.x, b.y, b.r, time)
      } else {
        drawBall(ctx, this.ball, b.x, b.y, b.r, time, b.vx, b.vy)
      }
    }
    for (const z of zaps) {
      ctx.strokeStyle = '#bfe4ff'
      ctx.lineWidth = 3
      ctx.globalAlpha = Math.max(0, z.life / 0.18)
      ctx.beginPath()
      ctx.moveTo(z.x1, z.y1)
      const mx = (z.x1 + z.x2) / 2 + Math.sin(time * 90) * 10
      const my = (z.y1 + z.y2) / 2 + Math.cos(time * 70) * 10
      ctx.lineTo(mx, my)
      ctx.lineTo(z.x2, z.y2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const rest = restingBall(s)
    // Balls waiting at the launch point, and balls that already landed.
    const home = s.phase === 'volley' ? (s.nextLaunchX ?? s.launchX) : s.launchX
    const waiting = s.phase === 'volley' ? s.balls.some((b) => b.status !== 'flying') : true
    // Between volleys the hero holds the ball (and draws it); during one, the queue waits at the launch point.
    if (waiting && (s.phase === 'volley' || !this.avatar))
      drawBall(ctx, this.ball, s.phase === 'volley' ? s.launchX : home, rest.y, rest.r, time)
    // The first ball home rests on the floor until the hero picks it up.
    if (s.phase === 'volley' && s.nextLaunchX !== null) {
      drawBall(ctx, this.ball, s.nextLaunchX, this.d.floorY - rest.r, rest.r, time)
    }
    if (s.phase === 'aim') {
      const n = s.doubleVolleys > 0 ? s.ballCount * 2 : s.ballCount
      ctx.fillStyle = theme.haze
      ctx.font = `600 14px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`×${n}`, home, this.d.floorY + 4)
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, s: RunState, juice: Juice, time: number): void {
    ctx.textBaseline = 'middle'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = theme.chalk
    ctx.textAlign = 'left'
    fillFitText(ctx, t('Turn {n}', { n: s.turn }), 12, TOP / 2 - 4, this.d.boardW * 0.4)
    ctx.textAlign = 'right'
    // The wallet: the same number as the shop and the pick screen.
    ctx.fillStyle = theme.yolk
    const coins = formatCoins(juice.shownCoins)
    ctx.fillText(coins, this.d.boardW - 12, TOP / 2 - 4)
    this.coinIconX = this.d.boardW - 24 - ctx.measureText(coins).width
    drawCoin(ctx, this.coinIconX, TOP / 2 - 4, 10)
    // "+N" under the wallet as coins come in.
    const gain = juice.coinTally
    if (gain) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, Math.max(0, (1.2 - gain.age) / 0.4))
      ctx.font = `700 12px ${FONT}`
      ctx.textAlign = 'right'
      ctx.lineWidth = 3
      ctx.strokeStyle = theme.night
      const text = `+${formatCoins(gain.amount)}`
      ctx.strokeText(text, this.d.boardW - 12, TOP / 2 + 12)
      ctx.fillText(text, this.d.boardW - 12, TOP / 2 + 12)
      ctx.restore()
    }

    // A big combo makes the bar and its badge tremble.
    const tremble = prefersReducedMotion() ? 0 : barShake(juice.barMult)
    ctx.save()
    if (tremble > 0) ctx.translate((Math.random() * 2 - 1) * tremble, (Math.random() * 2 - 1) * tremble)
    // XP bar: eases toward the real XP, heats up during a rush (glow, fire,
    // white-hot) and flashes when it fills. The "Lv N" badge at its left says
    // which level it fills toward, and pops when a level is gained.
    const fill = juice.shownXp % 1
    const heat = juice.xpHeat
    const color = XP_HEAT_COLOR[heat]
    const grow = juice.xpGlow * 3 + (heat >= 3 ? 3 : 0)
    const y = TOP - 12 - grow / 2
    const pop = juice.levelPop && juice.levelPop.age < 0.3 ? 1 + 0.6 * (1 - juice.levelPop.age / 0.3) : 1
    ctx.font = `800 12px ${FONT}`
    const badge = t('Lv {n}', { n: Math.floor(juice.shownXp) + 1 })
    const badgeW = ctx.measureText(badge).width
    ctx.save()
    ctx.translate(12 + badgeW / 2, TOP - 9)
    ctx.scale(pop, pop)
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = theme.night
    ctx.strokeText(badge, 0, 0)
    ctx.fillStyle = juice.levelPop ? theme.yolk : XP_COLOR
    ctx.fillText(badge, 0, 0)
    ctx.restore()
    const x0 = 12 + badgeW + 6
    const w = this.d.boardW - 12 - x0
    ctx.fillStyle = 'rgb(255 255 255 / 0.1)'
    ctx.beginPath()
    ctx.roundRect(x0, y, w, 6 + grow, 3)
    ctx.fill()
    ctx.save()
    if (juice.xpGlow > 0) {
      ctx.shadowColor = heat >= 2 ? '#ff9f43' : XP_COLOR
      ctx.shadowBlur = (heat >= 3 ? 26 : 14) * juice.xpGlow
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x0, y, Math.max(6, w * fill), 6 + grow, 3)
    ctx.fill()
    ctx.restore()
    // Nearly there: a shine sweeps the bar to build up to the level.
    if (fill > 0.8 && !prefersReducedMotion()) {
      const sweep = x0 + ((time * 1.5) % 1) * w * fill
      const left = Math.max(x0, sweep - 8)
      const right = Math.min(x0 + w * fill, sweep + 8)
      ctx.fillStyle = `rgb(255 255 255 / ${(0.45 * (fill - 0.8)) / 0.2})`
      if (right > left) ctx.fillRect(left, y, right - left, 6 + grow)
    }
    if (juice.xpFlash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.8 * juice.xpFlash})`
      ctx.beginPath()
      ctx.roundRect(x0, y, w, 6 + grow, 3)
      ctx.fill()
    }
    // On fire: flames lick up from the filled part of the bar.
    if (heat >= 2 && !prefersReducedMotion()) {
      for (let i = 0; i < heat; i++) {
        this.particles.burst(x0 + Math.random() * Math.max(6, w * fill), y, {
          count: 1,
          color: heat >= 3 ? ['#ffffff', '#fff3b0', '#ffc83d'] : ['#ff9f43', '#ffc83d', '#ff6b6b'],
          speed: 70,
          angle: -Math.PI / 2,
          spread: 0.7,
          life: 0.45,
          size: 3,
          gravity: -160,
          shape: 'circle',
        })
      }
    }
    // White-hot: now and then a single thin bolt flickers over part of the bar.
    if (heat >= 3 && !prefersReducedMotion() && (time * BOLT_RATE) % 1 < BOLT_SHOW) {
      const filled = Math.max(6, w * fill)
      const from = x0 + filled * Math.random() * 0.5
      const to = Math.min(x0 + filled, from + filled * (0.3 + Math.random() * 0.3))
      const mid = y + (6 + grow) / 2
      const points: Array<[number, number]> = [[from, mid]]
      for (let x = from + 8; x < to; x += 8) points.push([x, mid + (Math.random() - 0.5) * 6])
      points.push([to, mid])
      ctx.save()
      ctx.lineJoin = 'round'
      // One path, two strokes: a faint wide one under a thin white core.
      for (const [color, width] of [
        ['rgb(159 216 255 / 0.35)', 3],
        ['#ffffff', 1],
      ] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        for (const [px, py] of points) ctx.lineTo(px, py)
        ctx.stroke()
      }
      ctx.restore()
    }
    // XP orbs from hit bricks, curving out to the side wall and up into the
    // bar where it's filled up to, clear of the bricks' numbers.
    const ends = { tip: x0 + Math.max(6, w * fill), y: y + 3, boardW: this.d.boardW }
    for (const o of juice.xpOrbs) {
      const k = ease.inOutCubic(Math.min(1, o.age / XP_ORB_FLY))
      const { x: ox, y: oy } = orbPoint(o.x0, o.y0, k, ends)
      // A faint halo under a solid core: the look of a glow without a (slow) blur.
      // Hidden over its brick so the number stays readable; fades in once clear.
      const shown = orbAlpha(Math.hypot(ox - o.x0, oy - o.y0))
      if (shown <= 0) continue
      const r = 2.5 - 1 * k
      ctx.fillStyle = XP_COLOR
      ctx.globalAlpha = 0.25 * shown
      ctx.beginPath()
      ctx.arc(ox, oy, r * 1.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.95 * shown
      ctx.beginPath()
      ctx.arc(ox, oy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    for (; juice.xpSparks > 0; juice.xpSparks--) {
      this.particles.burst(x0 + Math.max(6, w * fill), y + 3, {
        count: 6,
        color: [XP_COLOR, theme.chalk],
        speed: 140,
        life: 0.4,
        size: 3,
        gravity: 300,
      })
    }
    ctx.restore()
    this.drawXpTally(ctx, juice, heat)
  }

  /**
   * A bomb ball, made to stand out on the dark board: a pulsing red warning halo
   * (like the fire ball's orange one), a dark body with a bright red rim and a
   * shine, and a lit fuse with a flickering spark.
   */
  private drawBombBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number): void {
    const body = r * 1.3
    ctx.save()
    ctx.fillStyle = theme.coral
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 18)
    ctx.beginPath()
    ctx.arc(x, y, body * 1.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    // Body with a bright rim, then a shine.
    ctx.fillStyle = '#1c1c28'
    ctx.strokeStyle = theme.coral
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, body, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgb(255 255 255 / 0.75)'
    ctx.beginPath()
    ctx.arc(x - body * 0.35, y - body * 0.35, body * 0.25, 0, Math.PI * 2)
    ctx.fill()
    // A curled fuse sticking out of the top right.
    const fx = x + body * 1.45
    const fy = y - body * 1.55
    ctx.strokeStyle = '#e8c48a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x + body * 0.7, y - body * 0.7)
    ctx.quadraticCurveTo(x + body * 1.4, y - body * 0.9, fx, fy)
    ctx.stroke()
    // The spark: flickers between white and yellow, and in size.
    const flick = Math.sin(time * 40) > 0
    ctx.fillStyle = flick ? '#ffffff' : theme.yolk
    ctx.beginPath()
    ctx.arc(fx, fy, r * (flick ? 0.38 : 0.28), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /**
   * "+N XP" in the middle of the HUD, popping as it grows, and next to it the
   * combo's XP multiplier ("×1.5") in the tier colour. The multiplier slams in
   * once per tier (big → settled, white for an instant) and otherwise sits
   * still; it fades out when the combo ends. The pair stays centred.
   */
  private drawXpTally(ctx: CanvasRenderingContext2D, juice: Juice, heat: number): void {
    const tally = juice.xpTally
    const showMult = juice.comboFade > 0 && juice.comboShown > 1
    if (!tally && !showMult) return
    const cx = this.d.boardW / 2
    const cy = TOP / 2 - 4
    const tallyFont = `700 ${heat >= 2 ? 20 : 17}px ${FONT}`
    const multFont = `800 19px ${FONT}`
    const text = tally ? `+${compactNumber(Math.round(tally.amount))} XP` : ''
    // Says what it multiplies: XP.
    const mult = t('XP ×{m}', { m: juice.comboShown })
    ctx.font = tallyFont
    const tw = tally ? ctx.measureText(text).width : 0
    ctx.font = multFont
    const mw = showMult ? ctx.measureText(mult).width : 0
    const gap = tally && showMult ? 8 : 0
    const left = cx - (tw + gap + mw) / 2
    ctx.save()
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = theme.night
    if (tally) {
      const pop = tally.age < 0.15 ? 1 + 0.35 * (1 - tally.age / 0.15) : 1
      ctx.save()
      ctx.globalAlpha = Math.min(1, Math.max(0, (1.2 - tally.age) / 0.4))
      ctx.translate(left + tw / 2, cy)
      ctx.scale(pop, pop)
      ctx.font = tallyFont
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeText(text, 0, 0)
      ctx.fillStyle = heat >= 2 ? XP_HEAT_COLOR[heat] : XP_COLOR
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
    if (showMult) {
      const age = juice.comboTierAge ?? 1
      const calm = prefersReducedMotion()
      const slam = calm ? 1 : 1.6 - 0.6 * ease.outBack(Math.min(1, age / COMBO_SLAM))
      ctx.save()
      ctx.globalAlpha = juice.comboFade
      ctx.translate(left + tw + gap + mw / 2, cy)
      ctx.scale(slam, slam)
      ctx.font = multFont
      ctx.textAlign = 'center'
      ctx.lineWidth = 4
      ctx.strokeText(mult, 0, 0)
      ctx.fillStyle = age < 0.04 && !calm ? '#ffffff' : (COMBO_XP_COLOR[juice.comboShown] ?? theme.yolk)
      ctx.fillText(mult, 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }

  /** "LEVEL UP!" bursting out under the XP bar the moment it crosses the line. */
  private drawLevelPop(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const pop = juice.levelPop
    if (!pop) return
    const scale =
      pop.age < 0.15 ? 0.6 + 0.8 * (pop.age / 0.15) : 1.4 - 0.4 * Math.min(1, (pop.age - 0.15) / 0.15)
    ctx.save()
    ctx.globalAlpha = Math.min(1, (LEVEL_POP_LIFE - pop.age) / 0.3)
    ctx.translate(this.d.boardW / 2, TOP + 44 - 10 * Math.min(1, pop.age / LEVEL_POP_LIFE))
    ctx.scale(scale, scale)
    ctx.font = `800 26px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 5
    ctx.strokeStyle = theme.night
    const text = pop.count > 1 ? t('LEVEL UP ×{n}!', { n: pop.count }) : t('LEVEL UP!')
    ctx.strokeText(text, 0, 0)
    ctx.fillStyle = theme.yolk
    ctx.fillText(text, 0, 0)
    // Every level makes balls hit harder: say so.
    ctx.font = `700 14px ${FONT}`
    ctx.lineWidth = 4
    const bonus = t('+{p}% ball damage', { p: Math.round(LEVEL_POWER * 100 * pop.count) })
    ctx.strokeText(bonus, 0, 22)
    ctx.fillStyle = XP_COLOR
    ctx.fillText(bonus, 0, 22)
    ctx.restore()
  }

  private drawCombo(ctx: CanvasRenderingContext2D, s: RunState): void {
    if (s.phase !== 'volley' || s.combo < 5) return
    const tier = COMBO_TIERS.length - 1 - COMBO_TIERS.findIndex(([min]) => comboPower(s) >= min)
    ctx.font = `700 ${18 + tier * 7}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = s.fever ? theme.yolk : theme.chalk
    ctx.globalAlpha = 0.85
    ctx.fillText(`x${s.combo}${s.combo >= 25 ? '!' : ''}`, this.d.boardW / 2, TOP + 6)
    ctx.globalAlpha = 1
  }

  private drawCoinFlyers(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const tx = this.coinIconX
    const ty = TOP / 2 - 4
    for (const c of juice.coinFlyers) {
      const t = (c.age - c.delay) / COIN_FLY
      if (t < 0) continue
      const k = ease.inCubic(Math.min(1, t))
      const x = c.x0 + (tx - c.x0) * k
      const y = c.y0 + (ty - c.y0) * k - Math.sin(k * Math.PI) * 60
      drawCoin(ctx, x, y, 7, c.age * 14)
    }
  }

  /** The boss, eased from where it was when it moves, with dust (or a teleport puff) as it goes. */
  private drawMovingBoss(ctx: CanvasRenderingContext2D, s: RunState, time: number, juice: Juice): void {
    this.glide.update(Math.min(0.1, Math.max(0, time - this.lastTime)))
    this.lastTime = time
    const parts = s.bricks.filter((b) => b.kind === 'boss')
    if (!s.boss || !parts.length) return
    const col = Math.min(...parts.map((b) => b.col))
    const row = Math.min(...parts.map((b) => b.row))
    const fromX = this.glide.x
    const { dc, dr } = this.glide.track(s.boss, col, row)
    if (dc || dr > 1 || dr < 0) {
      const xs = parts.map((b) => cellCenter(b.col, b.row))
      const cx = xs.reduce((a, p) => a + p.x, 0) / xs.length
      const cy = xs.reduce((a, p) => a + p.y, 0) / xs.length
      if (s.boss.traits.includes('blink') && Math.abs(dc) > 0) {
        // Teleport: a puff where it was and where it lands.
        for (const x of [cx + fromX - dc * CELL, cx]) {
          this.particles.burst(x, cy, { count: 24, color: ['#d68cff', '#ffffff'], speed: 260, life: 0.5 })
        }
        this.glide.x = 0 // a teleport snaps, the puffs sell it
      } else {
        this.particles.burst(cx - Math.sign(dc) * 60, cy + 30, {
          count: 14,
          color: ['#b9b3d9', '#ffffff'],
          speed: 120,
        })
      }
    }
    // A little squash when it's hit.
    const pts = parts.map((b) => cellCenter(b.col, b.row))
    const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
    const squash = 0.035 * juice.bossHit
    ctx.save()
    ctx.translate(this.glide.x + mx, this.glide.y + my)
    ctx.scale(1 + squash, 1 - squash)
    ctx.translate(-mx, -my)
    drawBoss(ctx, s, time, {
      hit: juice.bossHit,
      look: bossLook(s),
      cast: juice.bossCast,
      smug: juice.bossSmug,
      gloat: juice.bossGloat,
    })
    ctx.restore()
    // It talks back: a laugh when it hurts you, a sneer when your hit bounces off.
    const say = juice.bossGloat > 0.25 ? t('HA HA!') : juice.bossSmug > 0.4 ? t('Heh.') : null
    if (say) {
      const top = Math.min(...parts.map((b) => b.row))
      const alpha = Math.min(1, (juice.bossGloat > 0.25 ? juice.bossGloat : juice.bossSmug) * 2)
      const bx = this.glide.x + mx
      const by = TOP + top * CELL - 12 + this.glide.y
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = `800 16px ${FONT}`
      const w = ctx.measureText(say).width + 16
      ctx.fillStyle = theme.chalk
      ctx.beginPath()
      ctx.roundRect(bx - w / 2, Math.max(TOP + 2, by - 24), w, 24, 12)
      ctx.fill()
      ctx.fillStyle = theme.night
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(say, bx, Math.max(TOP + 2, by - 24) + 12.5)
      ctx.restore()
    }
  }

  /**
   * A dying boss: its body shakes harder and harder, flashes white faster and
   * cracks open while explosions go off; after the finale, a shockwave ring.
   */
  private drawBossDeath(ctx: CanvasRenderingContext2D, juice: Juice, time: number): void {
    const d = juice.bossDeath
    if (d?.ghost && !d.finished) {
      const k = Math.min(1, d.age / BOSS_DEATH_BOOM)
      const still = prefersReducedMotion()
      const jitter = still ? 0 : 2 + 7 * k
      ctx.save()
      ctx.translate((Math.random() * 2 - 1) * jitter, (Math.random() * 2 - 1) * jitter)
      // Swells a little as it is about to burst.
      const cx = d.box.x + d.box.w / 2
      const cy = d.box.y + d.box.h / 2
      const swell = 1 + 0.08 * k * k
      ctx.translate(cx, cy)
      ctx.scale(swell, swell)
      ctx.translate(-cx, -cy)
      const blink = Math.sin(time * (8 + 30 * k)) > 0.3 ? 0.4 + 0.6 * k : 0
      drawBoss(ctx, { boss: d.ghost.boss, bricks: d.ghost.parts }, time, { hit: blink, cast: k })
      // Cracks of light spreading across the body.
      ctx.strokeStyle = `rgb(255 240 200 / ${0.5 + 0.5 * k})`
      ctx.lineWidth = 2 + 2 * k
      ctx.shadowColor = '#ffc83d'
      ctx.shadowBlur = 12
      ctx.beginPath()
      const cracks = 3 + Math.floor(9 * k)
      for (let i = 0; i < cracks; i++) {
        // Fixed per crack (seeded by i), so they grow instead of flickering.
        const a = i * 2.39996
        const len = Math.min(d.box.w, d.box.h) * 0.5 * Math.min(1, k * 1.6 - i * 0.05)
        if (len <= 0) continue
        ctx.moveTo(cx, cy)
        const mx = cx + Math.cos(a) * len * 0.5 + Math.sin(i * 7) * 6
        const my = cy + Math.sin(a) * len * 0.5 + Math.cos(i * 5) * 6
        ctx.lineTo(mx, my)
        ctx.lineTo(cx + Math.cos(a + 0.2) * len, cy + Math.sin(a + 0.2) * len)
      }
      ctx.stroke()
      ctx.restore()
    }
    const w = juice.shockwave
    if (w) {
      const k = w.age / SHOCKWAVE_LIFE
      ctx.save()
      ctx.strokeStyle = `rgb(255 255 255 / ${1 - k})`
      ctx.lineWidth = 14 * (1 - k) + 2
      ctx.beginPath()
      ctx.arc(w.x, w.y, 20 + ease.outCubic(k) * this.d.boardW * 0.9, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = `rgb(255 200 61 / ${0.7 * (1 - k)})`
      ctx.lineWidth = 6 * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(w.x, w.y, 10 + ease.outCubic(k) * this.d.boardW * 0.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  /**
   * The arena growing for a boss: the new rows sit under a dark cover with a
   * glowing edge that pulses (the rumble), then slides down to open them.
   * Shrinking: the floor flashes and bars squeeze in from the bottom.
   */
  private drawArenaFx(ctx: CanvasRenderingContext2D, juice: Juice, time: number): void {
    const a = juice.arenaFx
    juice.floorY = this.d.floorY
    if (!a) return
    const w = this.d.boardW
    const floor = this.d.floorY + BALL_R
    ctx.save()
    if (a.grow) {
      const bandTop = floor - BOSS_ROOM * CELL
      const k = Math.max(0, Math.min(1, (a.age - ARENA_OPEN) / (ARENA_LAND - ARENA_OPEN)))
      const edge = bandTop + ease.outCubic(k) * (floor - bandTop)
      if (k < 1) {
        ctx.fillStyle = 'rgb(10 8 25 / 0.82)'
        ctx.fillRect(0, edge, w, floor - edge)
        const pulse = a.age < ARENA_OPEN ? 0.5 + 0.5 * Math.sin(time * 40) : 1
        ctx.shadowColor = '#ffc83d'
        ctx.shadowBlur = 18
        ctx.fillStyle = `rgb(255 200 61 / ${0.6 + 0.4 * pulse})`
        ctx.fillRect(0, edge - 2, w, 4)
      }
    } else {
      const k = Math.min(1, a.age / ARENA_SQUEEZE)
      const h = (1 - ease.outCubic(k)) * CELL * 0.6
      ctx.fillStyle = 'rgb(10 8 25 / 0.75)'
      ctx.fillRect(0, floor - h, w, h)
      ctx.shadowColor = theme.coral
      ctx.shadowBlur = 14
      ctx.fillStyle = `rgb(255 107 107 / ${1 - k * 0.6})`
      ctx.fillRect(0, floor - h - 2, w, 3)
    }
    // After the thud: a light line along the new floor that fades.
    const land = a.grow ? ARENA_LAND : ARENA_SQUEEZE
    if (a.age > land) {
      const f = 1 - (a.age - land) / 0.6
      ctx.shadowBlur = 0
      ctx.fillStyle = `rgb(255 255 255 / ${0.6 * f})`
      ctx.fillRect(0, floor - 1, w, 2)
    }
    ctx.restore()
  }

  /** The column or row the board just gained: a glow that fades, a light sweeping along it, sparks at its edge. */
  private drawGrowFx(ctx: CanvasRenderingContext2D, fx: { axis: 'col' | 'row'; age: number }): void {
    const k = fx.age / GROW_FX_LIFE
    const col = fx.axis === 'col'
    const band = col
      ? { x: (this.d.cols - 1) * CELL, y: TOP, w: CELL, h: this.d.floorY - TOP }
      : { x: 0, y: TOP + (this.d.dangerRow - 1) * CELL, w: this.d.boardW, h: CELL }
    ctx.save()
    ctx.globalAlpha = 1 - k
    ctx.fillStyle = 'rgb(75 227 160 / 0.22)'
    ctx.fillRect(band.x, band.y, band.w, band.h)
    // A bright line sweeping along the new space.
    const sweep = ease.outCubic(Math.min(1, k * 1.6))
    const g = col
      ? ctx.createLinearGradient(0, band.y, 0, band.y + band.h)
      : ctx.createLinearGradient(band.x, 0, band.x + band.w, 0)
    g.addColorStop(Math.max(0, sweep - 0.15), 'rgb(75 227 160 / 0)')
    g.addColorStop(sweep, 'rgb(200 255 230 / 0.9)')
    g.addColorStop(Math.min(1, sweep + 0.02), 'rgb(75 227 160 / 0)')
    ctx.fillStyle = g
    ctx.fillRect(band.x, band.y, band.w, band.h)
    // Sparks drifting out of the outer edge.
    ctx.fillStyle = '#c8ffe6'
    for (let i = 0; i < 14; i++) {
      const along = ((i * 0.618) % 1) * (col ? band.h : band.w)
      const out = k * 30 * (0.5 + ((i * 0.37) % 1))
      const x = col ? band.x + band.w - 4 + out * 0.3 : band.x + along
      const y = col ? band.y + along : band.y + band.h - 4 + out * 0.3
      ctx.beginPath()
      ctx.arc(
        x + (col ? 0 : Math.sin(i + k * 9) * 3),
        y + (col ? Math.sin(i + k * 9) * 3 : 0),
        2.2 * (1 - k) + 0.5,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
    ctx.restore()
  }

  /** "▲ Tougher bricks" under the HUD on the turn a new hp stretch starts. */
  private drawTougher(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const age = juice.tougherAge
    if (age === null) return
    const text = t('▲ Tougher bricks')
    ctx.save()
    ctx.globalAlpha = Math.min(1, age / 0.2, (TOUGHER_LIFE - age) / 0.5)
    ctx.font = `700 14px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = Math.min(ctx.measureText(text).width + 24, this.d.boardW - 24)
    const x = this.d.boardW / 2
    const y = TOP + 16 + Math.min(0, (age - 0.25) * 40)
    ctx.fillStyle = 'rgb(255 107 107 / 0.92)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 12, w, 24, 12)
    ctx.fill()
    ctx.fillStyle = theme.chalk
    fillFitText(ctx, text, x, y + 1, w - 16)
    ctx.restore()
  }

  private drawBanner(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const b = juice.banner
    if (!b) return
    const grow = ease.outBack(Math.min(1, b.age / 0.3))
    const fade = Math.min(1, Math.max(0, (1.4 - b.age) / 0.4))
    ctx.save()
    ctx.translate(this.d.boardW / 2, this.d.boardH * 0.42)
    ctx.scale(grow, grow)
    ctx.globalAlpha = fade
    ctx.font = `700 ${b.big ? 60 : 46}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Long banners shrink to fit the board.
    const fit = fitScale(ctx.measureText(b.text).width, this.d.boardW - 32)
    ctx.scale(fit, fit)
    ctx.lineWidth = b.big ? 10 : 8
    ctx.strokeStyle = theme.night
    ctx.strokeText(b.text, 0, 0)
    ctx.fillStyle = b.big ? XP_COLOR : theme.yolk
    ctx.fillText(b.text, 0, 0)
    ctx.restore()
  }
}
