import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import { BOARD_H, BOARD_W, FLOOR_Y } from './sim/config'

export type ArenaId = 'indigo' | 'space' | 'sunset' | 'ocean' | 'neon'

export const ARENAS: Record<
  ArenaId,
  { name: string; top: string; bottom: string; star: string; glow: string }
> = {
  indigo: { name: 'Indigo Night', top: '#1b2050', bottom: '#0c0f26', star: '#c9ccff', glow: '#5ab8ff' },
  space: { name: 'Deep Space', top: '#05060f', bottom: '#120a24', star: '#ffffff', glow: '#b48cff' },
  sunset: { name: 'Sunset Grid', top: '#3a1248', bottom: '#120618', star: '#ffc83d', glow: '#ff6fb5' },
  ocean: { name: 'Deep Ocean', top: '#06324a', bottom: '#020d18', star: '#7fe7ff', glow: '#2ed3d3' },
  neon: { name: 'Neon City', top: '#140726', bottom: '#05010c', star: '#4be3a0', glow: '#ff6fb5' },
}

/** Every 10 turns the storm grows: warmer colours, faster stars. 0..5. */
export function stormLevel(turn: number): number {
  return Math.min(5, Math.floor((turn - 1) / 10))
}

function mix(a: string, b: string, f: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * f)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
}

interface Star {
  x: number
  y: number
  size: number
  phase: number
}

/** Fixed pseudo-random stars (LCG), so the sky is the same every load. */
function makeStars(count: number, seed: number, size: number): Star[] {
  let s = seed
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  return Array.from({ length: count }, () => ({
    x: next() * BOARD_W,
    y: next() * BOARD_H,
    size: size * (0.6 + next() * 0.8),
    phase: next() * Math.PI * 2,
  }))
}

const STORM = '#ff6b6b'

/** Draws the arena: gradient sky, drifting stars, launch glow and the fever pulse. */
export class ArenaPainter {
  private far = makeStars(46, 7, 1.7)
  private near = makeStars(24, 99, 2.8)

  draw(ctx: CanvasRenderingContext2D, arena: ArenaId, turn: number, fever: boolean, time: number): void {
    const a = ARENAS[arena] ?? ARENAS.indigo
    const level = stormLevel(turn)
    const warm = 0.07 * level
    const sky = ctx.createLinearGradient(0, 0, 0, BOARD_H)
    sky.addColorStop(0, mix(a.top, STORM, warm))
    sky.addColorStop(1, mix(a.bottom, STORM, warm * 0.5))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)

    const still = prefersReducedMotion()
    const speed = 1 + 0.3 * level
    const layer = (stars: Star[], drift: number, alpha: number) => {
      ctx.fillStyle = a.star
      for (const st of stars) {
        const y = still ? st.y : (st.y + time * drift * speed) % BOARD_H
        ctx.globalAlpha = alpha * (0.55 + 0.45 * Math.sin(time * 2 + st.phase))
        ctx.fillRect(st.x, y, st.size, st.size)
      }
    }
    layer(this.far, 6, 0.5)
    layer(this.near, 16, 0.8)
    ctx.globalAlpha = 1

    const glow = ctx.createRadialGradient(BOARD_W / 2, FLOOR_Y, 10, BOARD_W / 2, FLOOR_Y, BOARD_W * 0.7)
    glow.addColorStop(0, a.glow + '40')
    glow.addColorStop(1, a.glow + '00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)

    if (fever) {
      ctx.fillStyle = theme.yolk
      ctx.globalAlpha = 0.12 * (0.5 + 0.5 * Math.sin((time * 2 * Math.PI) / 0.5))
      ctx.fillRect(0, 0, BOARD_W, BOARD_H)
      ctx.globalAlpha = 1
    }
  }
}
