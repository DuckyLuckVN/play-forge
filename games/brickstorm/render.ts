import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { ease, prefersReducedMotion } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { compactNumber, fillFitText, fitScale } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { ArenaPainter, type ArenaId } from './arenas'
import { drawBoss } from './boss-ui'
import { drawCoin } from './coin'
import { drawBall, TRAIL_STYLE } from './cosmetics'
import { t } from './i18n'
import { COIN_FLY, GROW_FX_LIFE, hpColor, type Juice, TOUGHER_LIFE } from './juice'
import { modsOf } from './sim/boosts'
import { BALL_R, boardSize, CELL, COLS, COMBO_TIERS, PICKUP_R, ROWS, TOP } from './sim/config'
import { traceGuide } from './sim/physics'
import { restingBall } from './sim/run'
import { dims, type Dims } from './sim/dims'
import { brickRect, cellCenter, hitRects } from './sim/rows'
import type { BrickKind, PickupKind, Rect, RunState } from './sim/types'

const TRAIL = 4
const XP_COLOR = '#4be3a0'
/** XP bar colour by heat: calm, glowing, on fire, white-hot. */
const XP_HEAT_COLOR = [XP_COLOR, XP_COLOR, '#ffc83d', '#fff6d6']

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
  } else {
    drawCoin(ctx, x, y, PICKUP_R - 1)
  }
}

export class BoardRenderer {
  /** Recent positions per ball, for the fever trail. */
  private trails: Array<Array<[number, number]>> = []
  private arenaPainter = new ArenaPainter()
  /** The equipped arena (background). */
  arena: ArenaId = 'indigo'
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

  draw(s: RunState | null, juice: Juice, aim: number | null, time: number): void {
    this.d = s ? dims(s) : boardSize(COLS, ROWS)
    const { ctx } = this.view
    ctx.save()
    this.arenaPainter.draw(ctx, this.arena, s?.turn ?? 1, s?.fever ?? false, time, this.d)
    this.shake.apply(ctx)
    this.drawBoard(ctx, s, time)
    if (s) {
      this.drawPickups(ctx, s, time)
      this.drawBricks(ctx, s, time)
      drawBoss(ctx, s, time, juice.bossHit)
      if (s.phase === 'aim' && aim !== null) this.drawGuide(ctx, s, aim)
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
      this.drawHud(ctx, s, juice)
      this.drawCombo(ctx, s)
    }
    this.drawCoinFlyers(ctx, juice)
    this.drawTougher(ctx, juice)
    this.drawBanner(ctx, juice)
    if (juice.flash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${juice.flash * 0.45})`
      ctx.fillRect(0, 0, this.d.boardW, this.d.boardH)
    }
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
      const r = brickRect(b)
      ctx.fillStyle = b.kind === 'gold' ? '#ffc83d' : hpColor(b.hp, s.turn)
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 9)
      ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
      ctx.fillRect(r.x + 6, r.y + 4, r.w - 12, 4)
      drawKindGlyph(ctx, b.kind, r, time)
      const hp = compactNumber(Math.ceil(b.hp))
      ctx.fillStyle = theme.night
      ctx.font = `700 ${hp.length >= 4 ? 15 : 20}px ${FONT}`
      fillFitText(ctx, hp, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 6)
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, s: RunState, time: number): void {
    for (const p of s.pickups) {
      const { x, y } = cellCenter(p.col, p.row)
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
      modsOf(s.boosts).guideLength,
      hitRects(s.bricks),
      this.d.boardW,
      this.d.floorY,
      rest.r,
    )
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
        ctx.fillStyle = '#2b1d00'
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r * 1.15, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = Math.sin(time * 30) > 0 ? theme.coral : theme.yolk
        ctx.beginPath()
        ctx.arc(b.x + b.r * 0.6, b.y - b.r * 0.6, b.r * 0.4, 0, Math.PI * 2)
        ctx.fill()
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
    if (waiting) drawBall(ctx, this.ball, s.phase === 'volley' ? s.launchX : home, rest.y, rest.r, time)
    if (s.phase === 'volley' && s.nextLaunchX !== null) {
      drawBall(ctx, this.ball, s.nextLaunchX, rest.y, rest.r, time)
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

  private drawHud(ctx: CanvasRenderingContext2D, s: RunState, juice: Juice): void {
    ctx.textBaseline = 'middle'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = theme.chalk
    ctx.textAlign = 'left'
    fillFitText(ctx, t('Turn {n}', { n: s.turn }), 12, TOP / 2 - 4, this.d.boardW * 0.4)
    ctx.textAlign = 'right'
    ctx.fillStyle = theme.yolk
    const coins = compactNumber(Math.floor(juice.shownCoins))
    ctx.fillText(coins, this.d.boardW - 12, TOP / 2 - 4)
    drawCoin(ctx, this.d.boardW - 24 - ctx.measureText(coins).width, TOP / 2 - 4, 10)

    // XP bar: eases toward the real XP, heats up during a rush (glow, fire,
    // white-hot) and flashes when it fills.
    const w = this.d.boardW - 24
    const fill = juice.shownXp % 1
    const heat = juice.xpHeat
    const color = XP_HEAT_COLOR[heat]
    const grow = juice.xpGlow * 3 + (heat >= 3 ? 3 : 0)
    const y = TOP - 12 - grow / 2
    ctx.fillStyle = 'rgb(255 255 255 / 0.1)'
    ctx.beginPath()
    ctx.roundRect(12, y, w, 6 + grow, 3)
    ctx.fill()
    ctx.save()
    if (juice.xpGlow > 0) {
      ctx.shadowColor = heat >= 2 ? '#ff9f43' : XP_COLOR
      ctx.shadowBlur = (heat >= 3 ? 26 : 14) * juice.xpGlow
    }
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(12, y, Math.max(6, w * fill), 6 + grow, 3)
    ctx.fill()
    ctx.restore()
    if (juice.xpFlash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.8 * juice.xpFlash})`
      ctx.beginPath()
      ctx.roundRect(12, y, w, 6 + grow, 3)
      ctx.fill()
    }
    // On fire: flames lick up from the filled part of the bar.
    if (heat >= 2 && !prefersReducedMotion()) {
      for (let i = 0; i < heat; i++) {
        this.particles.burst(12 + Math.random() * Math.max(6, w * fill), y, {
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
    for (; juice.xpSparks > 0; juice.xpSparks--) {
      this.particles.burst(12 + Math.max(6, w * fill), y + 3, {
        count: 6,
        color: [XP_COLOR, theme.chalk],
        speed: 140,
        life: 0.4,
        size: 3,
        gravity: 300,
      })
    }
    // "+N XP" in the HUD, popping as it grows.
    const tally = juice.xpTally
    if (tally) {
      const pop = tally.age < 0.15 ? 1 + 0.35 * (1 - tally.age / 0.15) : 1
      ctx.save()
      ctx.globalAlpha = Math.min(1, Math.max(0, (1.2 - tally.age) / 0.4))
      // Centre of the HUD row, between the turn and the coins.
      ctx.translate(this.d.boardW / 2, TOP / 2 - 4)
      ctx.scale(pop, pop)
      ctx.font = `700 ${heat >= 2 ? 20 : 17}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 4
      ctx.strokeStyle = theme.night
      const text = `+${compactNumber(tally.amount)} XP`
      ctx.strokeText(text, 0, 0)
      ctx.fillStyle = heat >= 2 ? XP_HEAT_COLOR[heat] : XP_COLOR
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
  }

  private drawCombo(ctx: CanvasRenderingContext2D, s: RunState): void {
    if (s.phase !== 'volley' || s.combo < 5) return
    const tier = COMBO_TIERS.length - 1 - COMBO_TIERS.findIndex(([min]) => s.combo >= min)
    ctx.font = `700 ${18 + tier * 7}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = s.fever ? theme.yolk : theme.chalk
    ctx.globalAlpha = 0.85
    ctx.fillText(`x${s.combo}${s.combo >= 25 ? '!' : ''}`, this.d.boardW / 2, TOP + 6)
    ctx.globalAlpha = 1
  }

  private drawCoinFlyers(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const tx = this.d.boardW - 50
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
      ctx.arc(x + (col ? 0 : Math.sin(i + k * 9) * 3), y + (col ? Math.sin(i + k * 9) * 3 : 0), 2.2 * (1 - k) + 0.5, 0, Math.PI * 2)
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
