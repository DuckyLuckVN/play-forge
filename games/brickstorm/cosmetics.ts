// Look-only cosmetics: ball skins, trails and brick-break effects. All drawn in code.
import type { BurstOptions } from '@forge/fx/particles'
import { theme } from '@forge/ui/theme'

type Shape = 'circle' | 'star' | 'cube' | 'planet' | 'eyeball' | 'gem' | 'pixel' | 'flame'

export const BALL_SKINS: Record<string, { shape: Shape; color: string; accent: string }> = {
  'ball:classic': { shape: 'circle', color: theme.chalk, accent: theme.haze },
  'ball:star': { shape: 'star', color: '#ffc83d', accent: '#fff3b0' },
  'ball:cube': { shape: 'cube', color: '#5ab8ff', accent: '#bfe4ff' },
  'ball:pixel': { shape: 'pixel', color: '#4be3a0', accent: '#c9ffe6' },
  'ball:planet': { shape: 'planet', color: '#b48cff', accent: '#ff9f43' },
  'ball:gem': { shape: 'gem', color: '#2ed3d3', accent: '#e0ffff' },
  'ball:eyeball': { shape: 'eyeball', color: '#ffffff', accent: '#ff6b6b' },
  'ball:flame': { shape: 'flame', color: '#ff9f43', accent: '#ffe066' },
}

/** Draws one ball. `vx`/`vy` orient skins that look where they go (eyeball, flame). */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  skinId: string,
  x: number,
  y: number,
  r: number,
  time: number,
  vx = 0,
  vy = -1,
): void {
  const skin = BALL_SKINS[skinId] ?? BALL_SKINS['ball:classic']
  ctx.fillStyle = skin.color
  ctx.beginPath()
  switch (skin.shape) {
    case 'circle':
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      return
    case 'star': {
      const spin = time * 4
      for (let i = 0; i < 10; i++) {
        const a = spin + (i * Math.PI) / 5
        const rr = i % 2 ? r * 0.5 : r * 1.25
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      }
      ctx.closePath()
      ctx.fill()
      return
    }
    case 'cube': {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(time * 3)
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.fillStyle = skin.accent
      ctx.fillRect(-r, -r, r * 2, r * 0.6)
      ctx.restore()
      return
    }
    case 'pixel': {
      const p = r * 0.55
      for (const [dx, dy] of [
        [-1, -2],
        [0, -2],
        [-2, -1],
        [-1, -1],
        [0, -1],
        [1, -1],
        [-2, 0],
        [-1, 0],
        [0, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
      ])
        ctx.rect(x + dx * p, y + dy * p, p, p)
      ctx.fill()
      return
    }
    case 'planet': {
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = skin.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(x, y, r * 1.7, r * 0.5, -0.4, 0, Math.PI * 2)
      ctx.stroke()
      return
    }
    case 'gem': {
      ctx.moveTo(x, y - r * 1.2)
      ctx.lineTo(x + r, y - r * 0.2)
      ctx.lineTo(x, y + r * 1.2)
      ctx.lineTo(x - r, y - r * 0.2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = skin.accent
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 8)
      ctx.fillRect(x - r * 0.25, y - r * 0.6, r * 0.4, r * 0.4)
      ctx.globalAlpha = 1
      return
    }
    case 'eyeball': {
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      const len = Math.hypot(vx, vy) || 1
      const px = x + (vx / len) * r * 0.4
      const py = y + (vy / len) * r * 0.4
      ctx.fillStyle = skin.accent
      ctx.beginPath()
      ctx.arc(px, py, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#161a3a'
      ctx.beginPath()
      ctx.arc(px, py, r * 0.25, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'flame': {
      const len = Math.hypot(vx, vy) || 1
      const bx = x - (vx / len) * r * 1.6
      const by = y - (vy / len) * r * 1.6
      const flick = 1 + 0.15 * Math.sin(time * 30)
      ctx.fillStyle = skin.accent
      ctx.moveTo(bx, by)
      ctx.arc(x, y, r * flick, Math.atan2(vy, vx) - Math.PI / 2, Math.atan2(vy, vx) + Math.PI / 2)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = skin.color
      ctx.beginPath()
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2)
      ctx.fill()
      return
    }
  }
}

const RAINBOW = ['#ff6b6b', '#ff9f43', '#ffc83d', '#4be3a0', '#5ab8ff', '#b48cff']

export const TRAIL_STYLE: Record<
  string,
  { len: number; size: number; shape: 'circle' | 'square'; color: (i: number, time: number) => string }
> = {
  'trail:none': { len: 0, size: 0, shape: 'circle', color: () => theme.chalk },
  'trail:sparkle': {
    len: 6,
    size: 0.5,
    shape: 'square',
    color: (i, t) => (Math.sin(t * 20 + i) > 0 ? '#fff3b0' : '#ffc83d'),
  },
  'trail:bubbles': { len: 7, size: 0.6, shape: 'circle', color: () => '#7fe7ff' },
  'trail:pixel': { len: 6, size: 0.7, shape: 'square', color: () => '#4be3a0' },
  'trail:comet': { len: 10, size: 0.9, shape: 'circle', color: () => '#ff9f43' },
  'trail:rainbow': { len: 9, size: 0.8, shape: 'circle', color: (i) => RAINBOW[i % RAINBOW.length] },
}

export const IMPACT_STYLE: Record<string, BurstOptions & { text?: string }> = {
  'impact:shards': { count: 10, speed: 160, shape: 'square' },
  'impact:confetti': { count: 16, speed: 220, gravity: 500, shape: 'square', color: RAINBOW },
  'impact:pixels': { count: 14, speed: 140, size: 5, shape: 'square', gravity: 300 },
  'impact:stardust': {
    count: 18,
    speed: 90,
    size: 2.5,
    life: 0.9,
    shape: 'circle',
    color: ['#ffffff', '#fff3b0', '#c9ccff'],
  },
  'impact:ink': { count: 12, speed: 260, size: 7, life: 0.4, shape: 'circle', gravity: 900 },
}
