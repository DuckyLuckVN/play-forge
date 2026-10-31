import {
  AIM_MIN,
  AUTO_2X,
  AUTO_3X,
  BALL_R,
  BALL_SPEED,
  BOARD_W,
  CELL,
  DANGER_ROW,
  FEVER_AT,
  FIRE_GAP,
  FLOOR_Y,
  PICKUP_R,
  RECALL_AFTER,
  SLOWMO,
  TICK,
} from './config'
import { random } from '@forge/core/rng'
import { modsOf, rollChoices, type Mods } from './boosts'
import { damageBrick, explode, zap } from './damage'
export { comboMultiplier } from './damage'
import { antiStall, bounceWalls, circleRect, deepestContact, reflect } from './physics'
import { brickRect, cellCenter, spawnRow } from './rows'
import type { Ball, Brick, RunState, SimEvent } from './types'

const COIN_PICKUP = 5
/** Turn reached → coin bonus. */
const MILESTONES: Record<number, number> = { 25: 50, 50: 150, 100: 500 }

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
    rerollsUsed: 0,
    revivesUsed: 0,
    secondWindUsed: false,
    boosts: {},
    doubleVolleys: 0,
    fireCharges: 0,
    freezeNext: false,
    surgeNext: false,
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
  let n = s.doubleVolleys > 0 ? s.ballCount * 2 : s.ballCount
  if (s.surgeNext) n = Math.ceil(n * 1.5)
  s.surgeNext = false
  const charges = Math.min(n, s.fireCharges)
  s.fireCharges -= charges
  const kindOf = (i: number): Ball['kind'] => {
    if (i < charges || (mods.fireEvery && (i + 1) % mods.fireEvery === 0)) return 'fire'
    if (mods.bombEvery && (i + 1) % mods.bombEvery === 0) return 'bomb'
    return 'normal'
  }
  s.balls = Array.from({ length: n }, (_, i): Ball => ({
    x: s.launchX,
    y: FLOOR_Y - mods.radius,
    vx,
    vy,
    status: 'queued',
    kind: kindOf(i),
    r: mods.radius,
    split: false,
    inside: [],
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
  if (s.sinceHit > mods.comboGap) s.combo = 0

  s.fireTimer -= TICK
  while (s.fireTimer <= 0) {
    const queued = s.balls.find((b) => b.status === 'queued')
    if (!queued) break
    queued.status = 'flying'
    s.events.push({ type: 'launch' })
    s.fireTimer += FIRE_GAP
  }

  for (const ball of s.balls) {
    if (ball.status === 'flying') moveBall(s, ball, mods)
  }

  if (s.balls.every((b) => b.status === 'landed')) endTurn(s)
}

function moveBall(s: RunState, ball: Ball, mods: Mods): void {
  const r = ball.r
  const dist = Math.hypot(ball.vx, ball.vy) * TICK
  const n = Math.max(1, Math.ceil(dist / (r / 2)))
  const dt = TICK / n
  for (let i = 0; i < n; i++) {
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (bounceWalls(ball, r)) {
      ;[ball.vx, ball.vy] = antiStall(ball.vx, ball.vy)
      if (mods.bouncy) ball.bounceBonus += 1
      s.events.push({ type: 'wall' })
    }

    if (ball.kind === 'fire') burnThrough(s, ball, mods)
    else bounceOffBricks(s, ball, mods)

    collectPickups(s, ball, mods)

    if (ball.y >= FLOOR_Y - r && ball.vy > 0) {
      ball.y = FLOOR_Y - r
      ball.status = 'landed'
      if (s.nextLaunchX === null) s.nextLaunchX = Math.max(BALL_R, Math.min(BOARD_W - BALL_R, ball.x))
      s.events.push({ type: 'land' })
      return
    }
  }
}

/** A fire ball never bounces off bricks: it burns each one it passes through, once per pass. */
function burnThrough(s: RunState, ball: Ball, mods: Mods): void {
  const touching = s.bricks.filter((b) => circleRect(ball.x, ball.y, ball.r, brickRect(b)))
  ball.inside = ball.inside.filter((id) => touching.some((b) => b.id === id))
  for (const brick of touching) {
    if (ball.inside.includes(brick.id)) continue
    ball.inside.push(brick.id)
    hitBrick(s, ball, brick, mods, 2)
  }
}

function bounceOffBricks(s: RunState, ball: Ball, mods: Mods): void {
  // A pierced brick is ignored until the ball has fully left it, so a
  // bounce off the next brick can't push the ball back into it for a re-hit.
  const pierced = s.bricks.find((b) => b.id === ball.lastBrick)
  if (!pierced || !circleRect(ball.x, ball.y, ball.r, brickRect(pierced))) ball.lastBrick = -1
  const solid = s.bricks.filter((b) => b.id !== ball.lastBrick)
  const contact = deepestContact(ball.x, ball.y, solid.map(brickRect), ball.r)
  if (!contact) return
  const brick = solid[contact.index]
  const { col, row } = brick
  hitBrick(s, ball, brick, mods, 1)
  if (ball.pierceLeft > 0) {
    ball.pierceLeft--
    ball.lastBrick = brick.id
  } else {
    ball.x += contact.nx * contact.depth
    ball.y += contact.ny * contact.depth
    ;[ball.vx, ball.vy] = antiStall(...reflect(ball.vx, ball.vy, contact.nx, contact.ny))
  }
  if (ball.kind === 'bomb') {
    ball.kind = 'normal'
    explode(s, col, row, s.turn, 0, 'bomb')
  }
  if (mods.twin && !ball.split) {
    ball.split = true
    s.balls.push({ ...ball, vx: -ball.vx, inside: [] })
  }
}

/** A ball hitting a brick: combo, fever, crit, damage, and chain lightning. */
function hitBrick(s: RunState, ball: Ball, brick: Brick, mods: Mods, power: number): void {
  s.combo++
  s.sinceHit = 0
  s.bestCombo = Math.max(s.bestCombo, s.combo)
  if (s.combo >= FEVER_AT && !s.fever) {
    s.fever = true
    s.events.push({ type: 'fever' })
  }
  const crit = mods.critChance > 0 && random(s.rng) < mods.critChance
  const damage = (power * mods.damageMult + ball.bounceBonus) * (s.fever ? 2 : 1) * (crit ? 3 : 1)
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'hit', x, y, combo: s.combo, crit })
  const from = { col: brick.col, row: brick.row }
  damageBrick(s, brick, damage, ball.kind === 'fire' ? 'fire' : 'ball')
  if (mods.zapChance > 0 && random(s.rng) < mods.zapChance) zap(s, from, 2, 1 * mods.damageMult, 0)
}

function collectPickups(s: RunState, ball: Ball, mods: Mods): void {
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const p = s.pickups[i]
    const { x, y } = cellCenter(p.col, p.row)
    if (Math.hypot(ball.x - x, ball.y - y) >= PICKUP_R + ball.r + mods.pickupReach) continue
    s.pickups.splice(i, 1)
    s.events.push({ type: 'pickup', kind: p.kind, x, y })
    if (p.kind === 'ball') s.pendingBalls++
    else if (p.kind === 'coin') s.coins += Math.round(COIN_PICKUP * mods.coinMult)
    else if (p.kind === 'fire') s.fireCharges += 3
    else {
      s.events.push({ type: 'laser', y })
      for (const b of s.bricks.filter((b) => b.row === p.row)) damageBrick(s, b, s.turn, 'laser')
    }
  }
}

function endTurn(s: RunState): void {
  s.launchX = s.nextLaunchX ?? s.launchX
  s.ballCount += s.pendingBalls
  s.pendingBalls = 0
  s.balls = []
  if (s.doubleVolleys > 0) s.doubleVolleys--

  if (s.bricks.length === 0) bonus(s, { type: 'allClear', coins: s.turn * 3 })
  if (s.dangerAtStart && !s.bricks.some((b) => b.row === DANGER_ROW - 1)) {
    bonus(s, { type: 'closeOne', coins: s.turn * 5 })
  }

  const mods = modsOf(s.boosts)
  const drops = s.freezeNext ? 0 : mods.glass && s.turn % 10 === 0 ? 2 : 1
  s.freezeNext = false
  for (const b of s.bricks) b.row += drops
  for (const p of s.pickups) p.row += drops
  s.pickups = s.pickups.filter((p) => p.row < DANGER_ROW)

  if (mods.secondWind && !s.secondWindUsed && s.bricks.some((b) => b.row >= DANGER_ROW)) {
    s.secondWindUsed = true
    s.bricks = s.bricks.filter((b) => b.row < DANGER_ROW)
    s.events.push({ type: 'secondWind' })
  }
  if (s.bricks.some((b) => b.row >= DANGER_ROW)) {
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  startNextTurn(s)
}

/** Advances to the next turn: a new row at the top, then aim (or a pending boost pick). */
export function startNextTurn(s: RunState): void {
  s.turn++
  const milestone = MILESTONES[s.turn]
  if (milestone) bonus(s, { type: 'milestone', turn: s.turn, coins: milestone })
  spawnRow(s)
  s.events.push({ type: 'turn', turn: s.turn })
  if (s.bricks.some((b) => b.row === DANGER_ROW - 1)) s.events.push({ type: 'danger' })
  if (s.pendingPicks > 0) {
    s.phase = 'pick'
    s.choices = rollChoices(s)
  } else {
    s.phase = 'aim'
  }
}

function bonus(s: RunState, e: SimEvent & { coins: number }): void {
  s.coins += e.coins
  s.events.push(e)
}

/** One brick left, low on hp, with a ball closing in: play it in slow motion. */
export function slowMoActive(s: RunState): boolean {
  if (s.phase !== 'volley' || s.bricks.length !== 1) return false
  const brick = s.bricks[0]
  if (brick.hp > 1 * modsOf(s.boosts).damageMult) return false
  const c = cellCenter(brick.col, brick.row)
  return s.balls.some((b) => {
    if (b.status !== 'flying') return false
    const dx = c.x - b.x
    const dy = c.y - b.y
    return Math.hypot(dx, dy) < 2 * CELL && dx * b.vx + dy * b.vy > 0
  })
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
  const base = forced || s.volleyTime > AUTO_3X ? 3 : s.volleyTime > AUTO_2X ? 2 : 1
  return slowMoActive(s) ? base * SLOWMO : base
}
