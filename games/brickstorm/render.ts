import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { ease } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { FONT, theme } from '@forge/ui/theme'
import { ArenaPainter, type ArenaId } from './arenas'
import { hpColor, type Juice } from './juice'
import { xpToNext } from './sim/boosts'
import {
  BALL_R,
  BOARD_H,
  BOARD_W,
  CELL,
  COLS,
  COMBO_TIERS,
  DANGER_ROW,
  FLOOR_Y,
  PICKUP_R,
  ROWS,
  TOP,
} from './sim/config'
import { traceGuide } from './sim/physics'
import { brickRect, cellCenter } from './sim/rows'
import type { RunState } from './sim/types'

const GUIDE_LENGTH = 260
const TRAIL = 4

export class BoardRenderer {
  /** Recent positions per ball, for the fever trail. */
  private trails: Array<Array<[number, number]>> = []
  private arenaPainter = new ArenaPainter()
  /** The equipped arena (background). */
  arena: ArenaId = 'indigo'

  constructor(
    private view: Canvas2D,
    private particles: Particles,
    private shake: Shake,
  ) {}

  draw(s: RunState | null, juice: Juice, aim: number | null, time: number): void {
    const { ctx } = this.view
    ctx.save()
    this.arenaPainter.draw(ctx, this.arena, s?.turn ?? 1, s?.fever ?? false, time)
    this.shake.apply(ctx)
    this.drawBoard(ctx, s, time)
    if (s) {
      this.drawPickups(ctx, s, time)
      this.drawBricks(ctx, s)
      if (s.phase === 'aim' && aim !== null) this.drawGuide(ctx, s, aim)
      this.drawBalls(ctx, s)
    }
    this.particles.draw(ctx)
    ctx.restore()
    if (s) {
      this.drawHud(ctx, s)
      this.drawCombo(ctx, s)
    }
    this.drawBanner(ctx, juice)
    if (juice.flash > 0) {
      ctx.fillStyle = `rgb(255 255 255 / ${juice.flash * 0.45})`
      ctx.fillRect(0, 0, BOARD_W, BOARD_H)
    }
  }

  private drawBoard(ctx: CanvasRenderingContext2D, s: RunState | null, time: number): void {
    // A translucent well, so the arena shows through the board.
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
    ctx.beginPath()
    ctx.roundRect(0, TOP, BOARD_W, FLOOR_Y + BALL_R - TOP, 10)
    ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / 0.025)'
    for (let r = 0; r < ROWS; r++) {
      for (let c = (r % 2) as number; c < COLS; c += 2) ctx.fillRect(c * CELL, TOP + r * CELL, CELL, CELL)
    }
    const y = TOP + DANGER_ROW * CELL
    const danger = s?.bricks.some((b) => b.row === DANGER_ROW - 1) ?? false
    const pulse = danger ? 0.55 + 0.45 * Math.sin(time * 8) : 0.25
    ctx.strokeStyle = theme.coral
    ctx.globalAlpha = pulse
    ctx.lineWidth = danger ? 3 : 2
    ctx.setLineDash([10, 8])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(BOARD_W, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawBricks(ctx: CanvasRenderingContext2D, s: RunState): void {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const b of s.bricks) {
      const r = brickRect(b)
      ctx.fillStyle = hpColor(b.hp, s.turn)
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, 9)
      ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
      ctx.fillRect(r.x + 6, r.y + 4, r.w - 12, 4)
      const hp = Math.ceil(b.hp)
      ctx.fillStyle = theme.night
      ctx.font = `700 ${hp >= 1000 ? 15 : 20}px ${FONT}`
      ctx.fillText(String(hp), r.x + r.w / 2, r.y + r.h / 2 + 1)
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D, s: RunState, time: number): void {
    for (const p of s.pickups) {
      const { x, y } = cellCenter(p.col, p.row)
      const bob = Math.sin(time * 4 + p.id) * 3
      if (p.kind === 'ball') {
        ctx.strokeStyle = theme.chalk
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(x, y + bob, PICKUP_R, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = theme.chalk
        ctx.fillRect(x - 6, y + bob - 1.5, 12, 3)
        ctx.fillRect(x - 1.5, y + bob - 6, 3, 12)
      } else {
        ctx.fillStyle = theme.yolk
        ctx.beginPath()
        ctx.arc(x, y + bob, PICKUP_R - 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = theme.yolkEdge
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  private drawGuide(ctx: CanvasRenderingContext2D, s: RunState, aim: number): void {
    const pts = traceGuide(s.launchX, FLOOR_Y - BALL_R, aim, GUIDE_LENGTH, s.bricks.map(brickRect))
    ctx.strokeStyle = 'rgb(244 241 255 / 0.7)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.setLineDash([2, 10])
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    ctx.setLineDash([])
  }

  private drawBalls(ctx: CanvasRenderingContext2D, s: RunState): void {
    const flying = s.balls.filter((b) => b.status === 'flying')
    if (s.fever) {
      flying.forEach((b, i) => {
        const trail = (this.trails[i] ??= [])
        trail.unshift([b.x, b.y])
        trail.length = Math.min(trail.length, TRAIL)
        trail.forEach(([x, y], k) => {
          ctx.fillStyle = theme.yolk
          ctx.globalAlpha = 0.35 * (1 - k / TRAIL)
          ctx.beginPath()
          ctx.arc(x, y, BALL_R + 2, 0, Math.PI * 2)
          ctx.fill()
        })
      })
      ctx.globalAlpha = 1
    } else {
      this.trails = []
    }

    ctx.fillStyle = s.fever ? theme.yolk : theme.chalk
    for (const b of flying) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
      ctx.fill()
    }

    // Balls waiting at the launch point, and balls that already landed.
    const home = s.phase === 'volley' ? (s.nextLaunchX ?? s.launchX) : s.launchX
    const waiting = s.phase === 'volley' ? s.balls.some((b) => b.status !== 'flying') : true
    if (waiting) {
      ctx.fillStyle = theme.chalk
      ctx.beginPath()
      ctx.arc(s.phase === 'volley' ? s.launchX : home, FLOOR_Y - BALL_R, BALL_R, 0, Math.PI * 2)
      ctx.fill()
    }
    if (s.phase === 'volley' && s.nextLaunchX !== null) {
      ctx.beginPath()
      ctx.arc(s.nextLaunchX, FLOOR_Y - BALL_R, BALL_R, 0, Math.PI * 2)
      ctx.fill()
    }
    if (s.phase === 'aim') {
      const n = s.doubleVolleys > 0 ? s.ballCount * 2 : s.ballCount
      ctx.fillStyle = theme.haze
      ctx.font = `600 14px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(`×${n}`, home, FLOOR_Y + 4)
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, s: RunState): void {
    ctx.textBaseline = 'middle'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = theme.chalk
    ctx.textAlign = 'left'
    ctx.fillText(`Turn ${s.turn}`, 12, TOP / 2 - 4)
    ctx.textAlign = 'right'
    ctx.fillStyle = theme.yolk
    ctx.fillText(`● ${s.coins}`, BOARD_W - 12, TOP / 2 - 4)

    const need = xpToNext(s.level)
    const w = BOARD_W - 24
    ctx.fillStyle = 'rgb(255 255 255 / 0.1)'
    ctx.beginPath()
    ctx.roundRect(12, TOP - 12, w, 6, 3)
    ctx.fill()
    ctx.fillStyle = '#4be3a0'
    ctx.beginPath()
    ctx.roundRect(12, TOP - 12, Math.max(6, (w * s.xp) / need), 6, 3)
    ctx.fill()
  }

  private drawCombo(ctx: CanvasRenderingContext2D, s: RunState): void {
    if (s.phase !== 'volley' || s.combo < 5) return
    const tier = COMBO_TIERS.length - 1 - COMBO_TIERS.findIndex(([min]) => s.combo >= min)
    ctx.font = `700 ${18 + tier * 7}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = s.fever ? theme.yolk : theme.chalk
    ctx.globalAlpha = 0.85
    ctx.fillText(`x${s.combo}${s.combo >= 25 ? '!' : ''}`, BOARD_W / 2, TOP + 6)
    ctx.globalAlpha = 1
  }

  private drawBanner(ctx: CanvasRenderingContext2D, juice: Juice): void {
    const b = juice.banner
    if (!b) return
    const grow = ease.outBack(Math.min(1, b.age / 0.3))
    const fade = Math.min(1, Math.max(0, (1.4 - b.age) / 0.4))
    ctx.save()
    ctx.translate(BOARD_W / 2, BOARD_H * 0.42)
    ctx.scale(grow, grow)
    ctx.globalAlpha = fade
    ctx.font = `700 46px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 8
    ctx.strokeStyle = theme.night
    ctx.strokeText(b.text, 0, 0)
    ctx.fillStyle = theme.yolk
    ctx.fillText(b.text, 0, 0)
    ctx.restore()
  }
}
