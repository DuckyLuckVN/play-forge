// Look-only cosmetics: ball skins, trails and brick-break effects. All drawn in code.
import type { BurstOptions } from '@forge/fx/particles'
import { theme } from '@forge/ui/theme'

type Shape =
  | 'circle'
  | 'star'
  | 'cube'
  | 'planet'
  | 'eyeball'
  | 'gem'
  | 'pixel'
  | 'flame'
  | 'moon'
  | 'heart'
  | 'donut'
  | 'orb'
  | 'beach'
  | 'eight'
  | 'sun'
  | 'snowflake'
  | 'atom'
  | 'cookie'
  | 'bubble'
  | 'ghost'

export const BALL_SKINS: Record<string, { shape: Shape; color: string; accent: string }> = {
  'ball:classic': { shape: 'circle', color: theme.chalk, accent: theme.haze },
  'ball:star': { shape: 'star', color: '#ffc83d', accent: '#fff3b0' },
  'ball:cube': { shape: 'cube', color: '#5ab8ff', accent: '#bfe4ff' },
  'ball:pixel': { shape: 'pixel', color: '#4be3a0', accent: '#c9ffe6' },
  'ball:planet': { shape: 'planet', color: '#b48cff', accent: '#ff9f43' },
  'ball:gem': { shape: 'gem', color: '#2ed3d3', accent: '#e0ffff' },
  'ball:eyeball': { shape: 'eyeball', color: '#ffffff', accent: '#ff6b6b' },
  'ball:flame': { shape: 'flame', color: '#ff9f43', accent: '#ffe066' },
  'ball:moon': { shape: 'moon', color: '#fff3b0', accent: '#c9ccff' },
  'ball:heart': { shape: 'heart', color: '#ff6fb5', accent: '#ffd1e8' },
  'ball:donut': { shape: 'donut', color: '#ff9fcf', accent: '#5ab8ff' },
  'ball:orb': { shape: 'orb', color: '#5ab8ff', accent: '#e0f4ff' },
  'ball:beach': { shape: 'beach', color: '#ff6b6b', accent: '#ffc83d' },
  'ball:eight': { shape: 'eight', color: '#1a1a24', accent: '#ffffff' },
  'ball:sun': { shape: 'sun', color: '#ffc83d', accent: '#ff9f43' },
  'ball:snowflake': { shape: 'snowflake', color: '#e0ffff', accent: '#7fe7ff' },
  'ball:atom': { shape: 'atom', color: '#4be3a0', accent: '#b48cff' },
  'ball:cookie': { shape: 'cookie', color: '#d9a066', accent: '#5a3418' },
  'ball:bubble': { shape: 'bubble', color: '#7fe7ff', accent: '#ffffff' },
  'ball:ghost': { shape: 'ghost', color: '#f4f1ff', accent: '#161a3a' },
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
    case 'moon':
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.arc(x + r * 0.45, y - r * 0.25, r * 0.82, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      return
    case 'heart': {
      const k = r * (1 + 0.08 * Math.sin(time * 8))
      ctx.moveTo(x, y + k)
      ctx.bezierCurveTo(x - k * 1.6, y - k * 0.2, x - k * 0.6, y - k * 1.4, x, y - k * 0.5)
      ctx.bezierCurveTo(x + k * 0.6, y - k * 1.4, x + k * 1.6, y - k * 0.2, x, y + k)
      ctx.fill()
      return
    }
    case 'donut': {
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.arc(x, y, r * 0.4, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      const sprinkles = ['#5ab8ff', '#ffc83d', '#4be3a0', '#ffffff']
      for (let i = 0; i < 6; i++) {
        const a = time * 2 + (i * Math.PI) / 3
        ctx.fillStyle = sprinkles[i % sprinkles.length]
        ctx.fillRect(x + Math.cos(a) * r * 0.7 - 1, y + Math.sin(a) * r * 0.7 - 1, 2.5, 2.5)
      }
      return
    }
    case 'orb': {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.2)
      g.addColorStop(0, skin.accent)
      g.addColorStop(1, skin.color)
      ctx.save()
      ctx.shadowColor = skin.color
      ctx.shadowBlur = 10 + 4 * Math.sin(time * 6)
      ctx.fillStyle = g
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      return
    }
    case 'beach': {
      const cols = [skin.color, '#ffffff', skin.accent, '#5ab8ff']
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = cols[i]
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.arc(x, y, r, time * 3 + (i * Math.PI) / 2, time * 3 + ((i + 1) * Math.PI) / 2)
        ctx.closePath()
        ctx.fill()
      }
      return
    }
    case 'eight':
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = skin.accent
      ctx.beginPath()
      ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.42, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = skin.color
      ctx.fillRect(x - r * 0.22, y - r * 0.3, r * 0.14, r * 0.3)
      return
    case 'sun': {
      ctx.fillStyle = skin.accent
      for (let i = 0; i < 8; i++) {
        const a = time * 2 + (i * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(x + Math.cos(a - 0.25) * r * 0.8, y + Math.sin(a - 0.25) * r * 0.8)
        ctx.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5)
        ctx.lineTo(x + Math.cos(a + 0.25) * r * 0.8, y + Math.sin(a + 0.25) * r * 0.8)
        ctx.fill()
      }
      ctx.fillStyle = skin.color
      ctx.beginPath()
      ctx.arc(x, y, r * 0.85, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'snowflake': {
      ctx.strokeStyle = skin.color
      ctx.lineWidth = Math.max(1.5, r * 0.25)
      ctx.lineCap = 'round'
      for (let i = 0; i < 3; i++) {
        const a = time + (i * Math.PI) / 3
        ctx.moveTo(x - Math.cos(a) * r * 1.2, y - Math.sin(a) * r * 1.2)
        ctx.lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2)
      }
      ctx.stroke()
      ctx.fillStyle = skin.accent
      ctx.beginPath()
      ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'atom': {
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = skin.accent
      ctx.lineWidth = 1.5
      for (const tilt of [0.6, -0.6]) {
        ctx.beginPath()
        ctx.ellipse(x, y, r * 1.3, r * 0.5, tilt, 0, Math.PI * 2)
        ctx.stroke()
        const a = time * 6 * Math.sign(tilt)
        const ex = Math.cos(a) * r * 1.3
        const ey = Math.sin(a) * r * 0.5
        ctx.fillStyle = skin.accent
        ctx.beginPath()
        ctx.arc(
          x + ex * Math.cos(tilt) - ey * Math.sin(tilt),
          y + ex * Math.sin(tilt) + ey * Math.cos(tilt),
          2.2,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      return
    }
    case 'cookie':
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = skin.accent
      for (const [dx, dy] of [
        [-0.4, -0.3],
        [0.35, -0.4],
        [0.1, 0.1],
        [-0.3, 0.45],
        [0.45, 0.35],
      ]) {
        ctx.beginPath()
        ctx.arc(x + dx * r, y + dy * r, r * 0.16, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    case 'bubble':
      ctx.globalAlpha = 0.25
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = skin.color
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.strokeStyle = skin.accent
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, r * 0.65, Math.PI * 1.1, Math.PI * 1.5)
      ctx.stroke()
      return
    case 'ghost': {
      ctx.arc(x, y - r * 0.1, r, Math.PI, 0)
      const base = y + r * 0.9
      for (let i = 0; i <= 4; i++) {
        const gx = x + r - (i * 2 * r) / 4
        ctx.lineTo(gx, base + (i % 2 ? -r * 0.25 : 0) + Math.sin(time * 10 + i) * 1.2)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = skin.accent
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(x + side * r * 0.35, y - r * 0.15, r * 0.18, 0, Math.PI * 2)
        ctx.fill()
      }
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
  'trail:mint': { len: 5, size: 0.55, shape: 'circle', color: () => '#9ff5cf' },
  'trail:candy': { len: 7, size: 0.6, shape: 'circle', color: (i) => (i % 2 ? '#ffffff' : '#ff6fb5') },
  'trail:ocean': {
    len: 8,
    size: 0.65,
    shape: 'circle',
    color: (i) => shade(['#e0f4ff', '#5ab8ff', '#1e5aa8'], i, 8),
  },
  'trail:ice': { len: 7, size: 0.55, shape: 'square', color: (i) => (i % 3 ? '#e0ffff' : '#7fe7ff') },
  'trail:toxic': {
    len: 8,
    size: 0.6,
    shape: 'circle',
    color: (i, t) => (Math.sin(t * 25 + i * 2) > 0 ? '#4be3a0' : '#b8ff3d'),
  },
  'trail:fire': {
    len: 9,
    size: 0.8,
    shape: 'circle',
    color: (i) => shade(['#ffe066', '#ff9f43', '#ff6b6b'], i, 9),
  },
  'trail:gold': {
    len: 8,
    size: 0.45,
    shape: 'square',
    color: (i, t) => (Math.sin(t * 30 + i * 3) > 0.3 ? '#ffffff' : '#ffc83d'),
  },
  'trail:shadow': { len: 10, size: 0.9, shape: 'circle', color: () => '#3a2266' },
  'trail:neon': { len: 9, size: 0.6, shape: 'square', color: (i) => (i % 2 ? '#ff6fb5' : '#5ab8ff') },
  'trail:lava': {
    len: 10,
    size: 0.85,
    shape: 'circle',
    color: (i) => shade(['#ffc83d', '#ff6b35', '#7a1830'], i, 10),
  },
  'trail:sunset': {
    len: 10,
    size: 0.7,
    shape: 'circle',
    color: (i) => shade(['#ffc83d', '#ff6fb5', '#6b3fd4'], i, 10),
  },
  'trail:lightning': {
    len: 8,
    size: 0.5,
    shape: 'square',
    color: (i, t) => (Math.sin(t * 50 + i * 5) > 0 ? '#ffffff' : '#fff36b'),
  },
  'trail:galaxy': {
    len: 12,
    size: 0.7,
    shape: 'circle',
    color: (i, t) => (Math.sin(t * 15 + i * 4) > 0.6 ? '#ffffff' : i % 2 ? '#b48cff' : '#3a5bd9'),
  },
  'trail:ghostly': { len: 14, size: 0.95, shape: 'circle', color: () => 'rgb(244 241 255 / 0.5)' },
}

/** Colour `i` of `len` along a gradient of stops (trails fade from the first stop). */
function shade(stops: string[], i: number, len: number): string {
  return stops[Math.min(stops.length - 1, Math.floor((i / (len + 1)) * stops.length))]
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
  'impact:dust': { count: 8, speed: 70, size: 4, life: 0.6, shape: 'circle', color: ['#c9ccff', '#8a8fbf'] },
  'impact:bubbles': {
    count: 10,
    speed: 80,
    size: 4,
    life: 0.9,
    shape: 'circle',
    gravity: -180,
    color: ['#7fe7ff', '#e0ffff'],
  },
  'impact:snow': { count: 14, speed: 60, size: 3, life: 1.1, shape: 'circle', gravity: 60, color: '#ffffff' },
  'impact:leaves': {
    count: 10,
    speed: 120,
    size: 5,
    life: 0.9,
    shape: 'square',
    gravity: 120,
    color: ['#4be3a0', '#ffc83d', '#ff9f43'],
  },
  'impact:embers': {
    count: 16,
    speed: 110,
    size: 3,
    life: 0.8,
    shape: 'circle',
    gravity: -220,
    color: ['#ff9f43', '#ffc83d', '#ff6b6b'],
  },
  'impact:toxic': {
    count: 14,
    speed: 150,
    size: 5,
    life: 0.6,
    shape: 'circle',
    gravity: 400,
    color: ['#4be3a0', '#b8ff3d'],
  },
  'impact:coins': {
    count: 10,
    speed: 200,
    size: 5,
    life: 0.7,
    shape: 'circle',
    gravity: 700,
    color: ['#ffc83d', '#fff3b0'],
  },
  'impact:hearts': {
    count: 10,
    speed: 110,
    size: 5,
    life: 0.8,
    shape: 'circle',
    gravity: -120,
    color: ['#ff6fb5', '#ffd1e8'],
  },
  'impact:glitter': {
    count: 24,
    speed: 180,
    size: 2,
    life: 0.7,
    shape: 'square',
    color: ['#ffffff', '#fff3b0', '#ff9fcf', '#7fe7ff'],
  },
  'impact:pow': { count: 10, speed: 180, shape: 'square', color: ['#ffc83d', '#ff6b6b'], text: 'POW!' },
  'impact:smoke': {
    count: 10,
    speed: 50,
    size: 9,
    life: 1,
    shape: 'circle',
    gravity: -80,
    color: ['#5a5f80', '#3a3f60'],
  },
  'impact:fireworks': {
    count: 30,
    speed: 320,
    size: 3,
    life: 0.7,
    shape: 'circle',
    gravity: 200,
    color: RAINBOW,
  },
  'impact:plasma': {
    count: 20,
    speed: 240,
    size: 4,
    life: 0.5,
    shape: 'circle',
    color: ['#b48cff', '#ff6fb5', '#ffffff'],
  },
  'impact:boom': {
    count: 18,
    speed: 260,
    size: 6,
    life: 0.5,
    shape: 'square',
    color: ['#ff9f43', '#ff6b6b', '#ffc83d'],
    text: 'BOOM!',
  },
  'impact:supernova': {
    count: 40,
    speed: 380,
    size: 3,
    life: 0.9,
    shape: 'circle',
    color: ['#ffffff', '#fff3b0', '#7fe7ff', '#b48cff'],
  },
}
