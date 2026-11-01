// How a boss looks and reads: one big body over its parts, its name and traits.
import { compactNumber, fillFitText } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { t } from './i18n'
import { bossBody } from './sim/rows'
import type { Boss, BossTrait, RunState } from './sim/types'

const ADJECTIVE: Record<BossTrait, string> = {
  shield: t('Crystal'),
  minions: t('Hive'),
  drifter: t('Wandering'),
  armored: t('Iron'),
  enrage: t('Raging'),
}

const NOUN: Record<string, string> = {
  Golem: t('Golem'),
  Titan: t('Titan'),
  Colossus: t('Colossus'),
  Warden: t('Warden'),
  Behemoth: t('Behemoth'),
  Hydra: t('Hydra'),
}

export const TRAIT_TEXT: Record<BossTrait, string> = {
  shield: t('Shield: heals a little every turn.'),
  minions: t('Minions: summons 2 small bricks every turn.'),
  drifter: t('Drifter: slides one column every turn.'),
  armored: t('Armored: plain balls deal half damage.'),
  enrage: t('Enrage: below half health it falls twice as fast.'),
}

const TRAIT_COLOR: Record<BossTrait, string> = {
  shield: '#7fe7ff',
  minions: '#4be3a0',
  drifter: '#b48cff',
  armored: '#c9ccff',
  enrage: '#ff6b6b',
}

export function bossName(boss: Pick<Boss, 'traits' | 'noun'>): string {
  return t('{adj} {noun}', { adj: ADJECTIVE[boss.traits[0]], noun: NOUN[boss.noun] ?? boss.noun })
}

/** The boss's body over its parts. `hit` (0..1) flashes it white after damage. */
export function drawBoss(ctx: CanvasRenderingContext2D, s: RunState, time: number, hit: number): void {
  const boss = s.boss
  const body = bossBody(s.bricks)
  if (!boss || !body) return
  // Drawn exactly on the hitbox (no bobbing), so balls bounce off what you see.
  const { x, y, w, h } = body
  const life = Math.max(0, boss.hp / boss.maxHp)
  const rage = boss.traits.includes('enrage') && life < 0.5
  const accent = TRAIT_COLOR[boss.traits[0]]

  ctx.save()
  // Aura.
  ctx.shadowColor = rage ? theme.coral : accent
  ctx.shadowBlur = 18 + 8 * Math.sin(time * 4)
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, rage ? '#7a1830' : '#4a2a8a')
  g.addColorStop(1, rage ? '#3a0814' : '#1d1240')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 16)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 3
  ctx.strokeStyle = accent
  ctx.stroke()

  // Armour plates.
  if (boss.traits.includes('armored')) {
    ctx.fillStyle = 'rgb(201 204 255 / 0.25)'
    for (const px of [x + 6, x + w - 22]) {
      ctx.beginPath()
      ctx.roundRect(px, y + 8, 16, h - 16, 5)
      ctx.fill()
    }
  }

  // Face: angry eyes that track the middle, and a jagged mouth.
  const cx = x + w / 2
  const eyeY = y + h * 0.42
  for (const side of [-1, 1]) {
    const ex = cx + side * w * 0.17
    ctx.fillStyle = theme.chalk
    ctx.beginPath()
    ctx.ellipse(ex, eyeY, 11, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rage ? theme.coral : '#1d1240'
    ctx.beginPath()
    ctx.arc(ex + Math.sin(time * 1.3) * 3, eyeY + 1, 5, 0, Math.PI * 2)
    ctx.fill()
    // Brow.
    ctx.strokeStyle = theme.chalk
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ex - side * 12, eyeY - 16)
    ctx.lineTo(ex + side * 8, eyeY - 10)
    ctx.stroke()
  }
  ctx.strokeStyle = theme.chalk
  ctx.lineWidth = 3
  ctx.beginPath()
  const mw = w * 0.22
  for (let i = 0; i <= 6; i++) {
    const mx = cx - mw + (i * 2 * mw) / 6
    const my = y + h * 0.66 + (i % 2 ? 5 : -2)
    if (i) ctx.lineTo(mx, my)
    else ctx.moveTo(mx, my)
  }
  ctx.stroke()

  // Cracks as it weakens.
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

  // Name, then the hp bar and number along the bottom.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 11px ${FONT}`
  ctx.fillStyle = accent
  fillFitText(ctx, bossName(boss).toUpperCase(), cx, y + 11, w - 24)
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
  fillFitText(ctx, compactNumber(Math.ceil(boss.hp)), cx, y + h - 13, barW, true)

  // Shield bubble.
  if (boss.traits.includes('shield')) {
    ctx.strokeStyle = `rgb(127 231 255 / ${0.35 + 0.2 * Math.sin(time * 5)})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 20)
    ctx.stroke()
  }
  if (hit > 0) {
    ctx.fillStyle = `rgb(255 255 255 / ${0.6 * hit})`
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 16)
    ctx.fill()
  }
  ctx.restore()
}
