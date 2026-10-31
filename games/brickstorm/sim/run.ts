import {
  AIM_MIN,
  AUTO_2X,
  AUTO_3X,
  BALL_R,
  BALL_SPEED,
  BOARD_W,
  DANGER_ROW,
  FIRE_GAP,
  FLOOR_Y,
  PICKUP_R,
  RECALL_AFTER,
  TICK,
} from './config'
import { antiStall, bounceWalls, deepestContact, reflect } from './physics'
import { brickRect, cellCenter, spawnRow } from './rows'
import type { Ball, BoostId, RunState, SimEvent } from './types'

/** Stat modifiers from the run's boosts. Replaced by boosts.ts in a later task. */
function modsOf(_boosts: Partial<Record<BoostId, number>>) {
  return { damageMult: 1, coinMult: 1, speedMult: 1, pierce: 0, critChance: 0, bouncy: false }
}

const COIN_PICKUP = 5

export function createRun(seed: number): RunState {
  const s: RunState = {
    rng: { seed },
    seed,
    turn: 1,
    phase: 'aim',
    launchX: BOARD_W / 2,
    nextLaunchX: null,
    ballCount: 1,
    pendingBalls: 0,
    bricks: [],
    pickups: [],
    balls: [],
    volleyTime: 0,
    fireTimer: 0,
    sinceHit: 0,
    combo: 0,
    bestCombo: 0,
    fever: false,
    dangerAtStart: false,
    coins: 0,
    xp: 0,
    level: 0,
    pendingPicks: 0,
    choices: [],
    rerolls: 1,
    boosts: {},
    doubleVolleys: 0,
    nextId: 1,
    events: [],
  }
  spawnRow(s)
  return s
}

export function drainEvents(s: RunState): SimEvent[] {
  const events = s.events
  s.events = []
  return events
}

/** Starts a volley in direction (cos a, -sin a). Only valid while aiming. */
export function fire(s: RunState, angle: number): void {
  if (s.phase !== 'aim') return
  const mods = modsOf(s.boosts)
  const a = Math.max(AIM_MIN, Math.min(Math.PI - AIM_MIN, angle))
  const speed = BALL_SPEED * mods.speedMult
  const [vx, vy] = antiStall(Math.cos(a) * speed, -Math.sin(a) * speed)
  const n = s.doubleVolleys > 0 ? s.ballCount * 2 : s.ballCount
  s.balls = Array.from({ length: n }, (): Ball => ({
    x: s.launchX,
    y: FLOOR_Y - BALL_R,
    vx,
    vy,
    status: 'queued',
    pierceLeft: mods.pierce,
    bounceBonus: 0,
    lastBrick: -1,
  }))
  s.phase = 'volley'
  s.volleyTime = 0
  s.fireTimer = 0
  s.sinceHit = 0
  s.combo = 0
  s.fever = false
  s.nextLaunchX = null
  s.dangerAtStart = s.bricks.some((b) => b.row === DANGER_ROW - 1)
  s.events.push({ type: 'fire' })
}

/** Advances the volley by one fixed tick. */
export function step(s: RunState): void {
  if (s.phase !== 'volley') return
  const mods = modsOf(s.boosts)
  s.volleyTime += TICK
  s.sinceHit += TICK

  s.fireTimer -= TICK
  while (s.fireTimer <= 0) {
    const queued = s.balls.find((b) => b.status === 'queued')
    if (!queued) break
    queued.status = 'flying'
    s.fireTimer += FIRE_GAP
  }

  for (const ball of s.balls) {
    if (ball.status === 'flying') moveBall(s, ball, mods)
  }

  if (s.balls.every((b) => b.status === 'landed')) endTurn(s)
}

type Mods = ReturnType<typeof modsOf>

function moveBall(s: RunState, ball: Ball, mods: Mods): void {
  const dist = Math.hypot(ball.vx, ball.vy) * TICK
  const n = Math.max(1, Math.ceil(dist / (BALL_R / 2)))
  const dt = TICK / n
  for (let i = 0; i < n; i++) {
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (bounceWalls(ball)) {
      ;[ball.vx, ball.vy] = antiStall(ball.vx, ball.vy)
      if (mods.bouncy) ball.bounceBonus += 1
      s.events.push({ type: 'wall' })
    }

    const contact = deepestContact(ball.x, ball.y, s.bricks.map(brickRect))
    if (!contact) {
      ball.lastBrick = -1
    } else {
      const brick = s.bricks[contact.index]
      if (brick.id !== ball.lastBrick) {
        hitBrick(s, ball, contact.index, mods)
        if (ball.pierceLeft > 0) {
          ball.pierceLeft--
          ball.lastBrick = brick.id
        } else {
          ball.x += contact.nx * contact.depth
          ball.y += contact.ny * contact.depth
          ;[ball.vx, ball.vy] = antiStall(...reflect(ball.vx, ball.vy, contact.nx, contact.ny))
          ball.lastBrick = -1
        }
      }
    }

    collectPickups(s, ball, mods)

    if (ball.y >= FLOOR_Y - BALL_R && ball.vy > 0) {
      ball.y = FLOOR_Y - BALL_R
      ball.status = 'landed'
      if (s.nextLaunchX === null) s.nextLaunchX = Math.max(BALL_R, Math.min(BOARD_W - BALL_R, ball.x))
      s.events.push({ type: 'land' })
      return
    }
  }
}

function hitBrick(s: RunState, ball: Ball, index: number, mods: Mods): void {
  const brick = s.bricks[index]
  const damage = 1 * mods.damageMult + ball.bounceBonus
  brick.hp -= damage
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'hit', x, y, combo: s.combo, crit: false })
  if (brick.hp > 0) return
  s.bricks.splice(index, 1)
  s.coins += Math.max(1, Math.round(1 * mods.coinMult))
  s.xp += 1
  s.events.push({ type: 'kill', x, y, maxHp: brick.maxHp })
}

function collectPickups(s: RunState, ball: Ball, mods: Mods): void {
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const p = s.pickups[i]
    const { x, y } = cellCenter(p.col, p.row)
    if (Math.hypot(ball.x - x, ball.y - y) >= PICKUP_R + BALL_R) continue
    s.pickups.splice(i, 1)
    if (p.kind === 'ball') s.pendingBalls++
    else s.coins += Math.round(COIN_PICKUP * mods.coinMult)
    s.events.push({ type: 'pickup', kind: p.kind, x, y })
  }
}

function endTurn(s: RunState): void {
  s.launchX = s.nextLaunchX ?? s.launchX
  s.ballCount += s.pendingBalls
  s.pendingBalls = 0
  s.balls = []
  if (s.doubleVolleys > 0) s.doubleVolleys--

  for (const b of s.bricks) b.row++
  for (const p of s.pickups) p.row++
  s.pickups = s.pickups.filter((p) => p.row < DANGER_ROW)

  if (s.bricks.some((b) => b.row >= DANGER_ROW)) {
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  s.turn++
  spawnRow(s)
  s.events.push({ type: 'turn', turn: s.turn })
  if (s.bricks.some((b) => b.row === DANGER_ROW - 1)) s.events.push({ type: 'danger' })
  s.phase = s.pendingPicks > 0 ? 'pick' : 'aim'
}

export function canRecall(s: RunState): boolean {
  return s.phase === 'volley' && s.volleyTime >= RECALL_AFTER
}

/** Brings every ball home at once and ends the volley. */
export function recall(s: RunState): void {
  if (!canRecall(s)) return
  if (s.nextLaunchX === null) s.nextLaunchX = s.launchX
  for (const b of s.balls) b.status = 'landed'
  endTurn(s)
}

export function speedMultiplier(s: RunState, forced: boolean): number {
  if (forced || s.volleyTime > AUTO_3X) return 3
  if (s.volleyTime > AUTO_2X) return 2
  return 1
}
