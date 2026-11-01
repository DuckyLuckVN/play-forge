import {
  AIM_MIN,
  AUTO_2X,
  AUTO_3X,
  BALL_R,
  BALL_SPEED,
  BOARD_W,
  CELL,
  COLS,
  FEVER_AT,
  FIRE_GAP,
  GROW_EVERY,
  MAX_COLS,
  MAX_ROWS,
  PICKUP_R,
  RECALL_AFTER,
  ROWS,
  SLOWMO,
  TICK,
} from './config'
import { random } from '@forge/core/rng'
import { modsOf, rollChoices, type Mods } from './boosts'
import { damageBrick, explode, zap } from './damage'
import { dims } from './dims'
export { comboMultiplier } from './damage'
import { antiStall, bounceWalls, circleRect, deepestContact, reflect } from './physics'
import {
  BOSS_EVERY,
  bossContact,
  bossDrop,
  bossForce,
  bossLaunch,
  bossTurn,
  bossVolleyEnd,
  liftBoss,
  spawnBoss,
} from './boss'
import type { Face } from './boss-skills'
import { brickRect, cellCenter, hitRects, hpStepStart, spawnRow } from './rows'
import type { Ball, Brick, Pickup, RunState, SimEvent } from './types'

const COIN_PICKUP = 5
/** Turn reached → coin bonus. */
const MILESTONES: Record<number, number> = { 25: 50, 50: 150, 100: 500 }

export function createRun(seed: number): RunState {
  const s: RunState = {
    rng: { seed },
    seed,
    turn: 1,
    phase: 'aim',
    cols: COLS,
    rows: ROWS,
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
    growPending: false,
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

/** The ball waiting on the floor: as big as the balls the run will fire. */
export function restingBall(s: RunState): { y: number; r: number } {
  const r = modsOf(s.boosts).radius
  return { y: dims(s).floorY - r, r }
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
  n += s.rainNext ?? 0
  s.rainNext = 0
  s.overcharged = !!s.overchargeNext
  s.overchargeNext = false
  const pierce = mods.pierce + (s.pierceNext ? 2 : 0)
  s.pierceNext = false
  const charges = Math.min(n, s.fireCharges)
  s.fireCharges -= charges
  const kindOf = (i: number): Ball['kind'] => {
    if (i < charges || (mods.fireEvery && (i + 1) % mods.fireEvery === 0)) return 'fire'
    if (mods.bombEvery && (i + 1) % mods.bombEvery === 0) return 'bomb'
    return 'normal'
  }
  s.balls = Array.from({ length: n }, (_, i): Ball => ({
    x: s.launchX,
    y: restingBall(s).y,
    vx,
    vy,
    status: 'queued',
    kind: kindOf(i),
    r: mods.radius,
    split: false,
    inside: [],
    pierceLeft: pierce,
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
  s.dangerAtStart = s.bricks.some((b) => b.row === dims(s).dangerRow - 1)
  bossLaunch(s)
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
  const d = dims(s)
  // A boss may pull, push or slow balls.
  const pace = bossForce(s, ball, TICK)
  const dist = Math.hypot(ball.vx, ball.vy) * TICK * pace
  const n = Math.max(1, Math.ceil(dist / (r / 2)))
  const dt = (TICK * pace) / n
  for (let i = 0; i < n; i++) {
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (bounceWalls(ball, r, d.boardW)) {
      ;[ball.vx, ball.vy] = antiStall(ball.vx, ball.vy)
      if (mods.bouncy) ball.bounceBonus += 1
      s.events.push({ type: 'wall' })
    }

    let popped: boolean
    if (ball.kind === 'fire') {
      burnThrough(s, ball, mods)
      popped = bounceOffBricks(
        s,
        ball,
        mods,
        s.bricks.filter((b) => b.kind === 'boss'),
      )
    } else popped = bounceOffBricks(s, ball, mods, s.bricks)
    if (popped) return

    collectPickups(s, ball, mods)

    if (ball.y >= d.floorY - r && ball.vy > 0) {
      ball.y = d.floorY - r
      ball.status = 'landed'
      if (s.nextLaunchX === null) s.nextLaunchX = Math.max(BALL_R, Math.min(d.boardW - BALL_R, ball.x))
      s.events.push({ type: 'land' })
      return
    }
  }
}

/** A fire ball never bounces off bricks: it burns each one it passes through, once per pass. A boss is too big to burn through. */
function burnThrough(s: RunState, ball: Ball, mods: Mods): void {
  const touching = s.bricks.filter(
    (b) => b.kind !== 'boss' && circleRect(ball.x, ball.y, ball.r, brickRect(b)),
  )
  ball.inside = ball.inside.filter((id) => touching.some((b) => b.id === id))
  for (const brick of touching) {
    if (ball.inside.includes(brick.id)) continue
    ball.inside.push(brick.id)
    hitBrick(s, ball, brick, mods, 2)
  }
}

/** Which side of a brick a contact normal (pointing at the ball) is on. */
function faceOf(nx: number, ny: number): Face {
  if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? 'top' : 'bottom'
  return nx < 0 ? 'left' : 'right'
}

/**
 * Bounces off the deepest of `bricks`; the boss is one solid body that can't
 * be pierced. Returns true if the ball hit spikes and is gone for this volley.
 */
function bounceOffBricks(s: RunState, ball: Ball, mods: Mods, bricks: Brick[]): boolean {
  // A pierced brick is ignored until the ball has fully left it, so a
  // bounce off the next brick can't push the ball back into it for a re-hit.
  const pierced = s.bricks.find((b) => b.id === ball.lastBrick)
  if (!pierced || !circleRect(ball.x, ball.y, ball.r, brickRect(pierced))) ball.lastBrick = -1
  const solid = bricks.filter((b) => b.id !== ball.lastBrick)
  const contact = deepestContact(ball.x, ball.y, hitRects(solid), ball.r)
  if (!contact) return false
  const brick = solid[contact.index]
  const { col, row } = brick
  const face = faceOf(contact.nx, contact.ny)
  const touch = brick.kind === 'boss' ? bossContact(s, ball, face) : 'hit'
  if (touch === 'pass') return false
  if (touch === 'hit') hitBrick(s, ball, brick, mods, ball.kind === 'fire' ? 2 : 1, face)
  if (brick.role === 'spike') {
    ball.status = 'landed'
    s.events.push({ type: 'pop', x: ball.x, y: ball.y })
    return true
  }
  if (ball.pierceLeft > 0 && brick.kind !== 'boss') {
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
    // The twin leaves mirrored across the contact normal, so it also heads away from the brick.
    ball.split = true
    const vn = ball.vx * contact.nx + ball.vy * contact.ny
    const tx = ball.vx - vn * contact.nx
    const ty = ball.vy - vn * contact.ny
    s.balls.push({ ...ball, vx: vn * contact.nx - tx, vy: vn * contact.ny - ty, inside: [] })
  }
  return false
}

/** A ball hitting a brick: combo, fever, crit, damage, and chain lightning. */
function hitBrick(s: RunState, ball: Ball, brick: Brick, mods: Mods, power: number, face?: Face): void {
  s.combo++
  s.sinceHit = 0
  s.bestCombo = Math.max(s.bestCombo, s.combo)
  if (s.combo >= FEVER_AT && !s.fever) {
    s.fever = true
    s.events.push({ type: 'fever' })
  }
  const crit = mods.critChance > 0 && random(s.rng) < mods.critChance
  const damage =
    (power * mods.damageMult + ball.bounceBonus) *
    (s.fever ? 2 : 1) *
    (crit ? 3 : 1) *
    (s.overcharged ? 2 : 1)
  const { x, y } = cellCenter(brick.col, brick.row)
  s.events.push({ type: 'hit', x, y, combo: s.combo, crit })
  const from = { col: brick.col, row: brick.row }
  damageBrick(s, brick, damage, ball.kind === 'fire' ? 'fire' : 'ball', 0, { face, crit })
  if (mods.zapChance > 0 && random(s.rng) < mods.zapChance) zap(s, from, 2, 1 * mods.damageMult, 0)
}

function collectPickups(s: RunState, ball: Ball, mods: Mods): void {
  const over: number[] = []
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const p = s.pickups[i]
    const { x, y } = cellCenter(p.col, p.row)
    if (Math.hypot(ball.x - x, ball.y - y) >= PICKUP_R + ball.r + mods.pickupReach) continue
    if (p.kind === 'laser') {
      // Lasers stay all volley and fire once per pass of each ball.
      over.push(p.id)
      if (ball.lasers?.includes(p.id)) continue
      p.used = true
      laserRow(s, p.row, LASER_POWER * mods.damageMult * (s.overcharged ? 2 : 1))
      continue
    }
    s.pickups.splice(i, 1)
    applyPickup(s, p, mods)
  }
  ball.lasers = over
}

/** What a pickup does once collected (by a ball, or the Vacuum helper). Remove it from the board first. */
export function applyPickup(s: RunState, p: Pickup, mods = modsOf(s.boosts)): void {
  const { x, y } = cellCenter(p.col, p.row)
  s.events.push({ type: 'pickup', kind: p.kind, x, y })
  if (p.kind === 'ball') s.pendingBalls++
  else if (p.kind === 'coin') s.coins += Math.round(COIN_PICKUP * mods.coinMult)
  else if (p.kind === 'fire') s.fireCharges += 3
  else laserRow(s, p.row)
}

/** A ball over a laser pickup fires it for this many times a ball hit's damage. */
const LASER_POWER = 2

/** A laser across a row: every brick in it takes `damage` (the turn's worth unless told). */
export function laserRow(s: RunState, row: number, damage = s.turn): void {
  s.events.push({ type: 'laser', y: cellCenter(0, row).y })
  for (const b of s.bricks.filter((b) => b.row === row)) damageBrick(s, b, damage, 'laser')
}

function endTurn(s: RunState): void {
  bossVolleyEnd(s)
  s.launchX = s.nextLaunchX ?? s.launchX
  s.ballCount += s.pendingBalls
  s.pendingBalls = 0
  s.balls = []
  s.pickups = s.pickups.filter((p) => !p.used)
  s.overcharged = false
  if (s.doubleVolleys > 0) s.doubleVolleys--

  if (s.bricks.length === 0) bonus(s, { type: 'allClear', coins: s.turn })
  const { dangerRow } = dims(s)
  if (s.dangerAtStart && !s.bricks.some((b) => b.row === dangerRow - 1)) {
    bonus(s, { type: 'closeOne', coins: s.turn * 5 })
  }

  const mods = modsOf(s.boosts)
  const frozen = s.freezeNext
  const drops = frozen ? 0 : mods.glass && s.turn % 10 === 0 ? 2 : 1
  s.freezeNext = false
  for (const b of s.bricks) b.row += drops
  for (const p of s.pickups) p.row += drops
  if (!frozen) bossDrop(s)
  s.pickups = s.pickups.filter((p) => p.row < dangerRow)

  if (mods.secondWind && !s.secondWindUsed && s.bricks.some((b) => b.row >= dangerRow)) {
    s.secondWindUsed = true
    liftBoss(s)
    s.bricks = s.bricks.filter((b) => b.row < dangerRow)
    s.events.push({ type: 'secondWind' })
  }
  if (s.bricks.some((b) => b.row >= dangerRow)) {
    s.phase = 'over'
    s.events.push({ type: 'over' })
    return
  }
  // A frozen turn adds no row: nothing moved, so row 0 is still occupied.
  startNextTurn(s, !frozen)
}

/** Advances to the next turn: a new row at the top, then aim (or a pending boost pick). */
export function startNextTurn(s: RunState, spawn = true): void {
  s.turn++
  const milestone = MILESTONES[s.turn]
  if (milestone) bonus(s, { type: 'milestone', turn: s.turn, coins: milestone })
  if (s.boss) bossTurn(s)
  else if (spawn) {
    if (s.turn % BOSS_EVERY === 0) spawnBoss(s)
    else spawnRow(s)
  }
  if (s.turn % GROW_EVERY === 0) s.growPending = true
  s.events.push({ type: 'turn', turn: s.turn })
  if (hpStepStart(s.turn) === s.turn) s.events.push({ type: 'tougher' })
  if (s.bricks.some((b) => b.row === dims(s).dangerRow - 1)) s.events.push({ type: 'danger' })
  openPickOrAim(s)
}

/** Back to aiming, or to the boost pick first if one is waiting. */
export function openPickOrAim(s: RunState): void {
  if (s.pendingPicks > 0) {
    s.phase = 'pick'
    s.choices = rollChoices(s)
  } else if (s.growPending && (s.cols < MAX_COLS || s.rows < MAX_ROWS)) {
    s.phase = 'grow'
  } else {
    s.growPending = false
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
