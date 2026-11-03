import type { EyeStyle, Mood, Pose } from '../hero-avatar'

export type BodyKind = 'robot' | 'slime' | 'golem' | 'sprite' | 'critter' | 'flyer' | 'crab' | 'frog'

export interface CreatureLook {
  body: BodyKind
  /** Picks a per-hero shape inside a body type (e.g. 'boulder'). */
  variant: string
  main: string
  second: string
  hand: string
  eye: string
  /** Names the idle fidget. */
  signature: string
}

export interface Frame {
  t: number
  still: boolean
  mood: Mood
  moodAge: number
  pose: Pose
  eyes: EyeStyle
  blink: number
  lookX: number
  lookY: number
  hop: number
  squash: number
  knock: number
  smear: number
  hold: { x: number; y: number; r: number } | null
  holding: boolean
  /** 0..1 while the signature move plays, else 0. */
  fidget: number
}

export interface HeadBox {
  x: number
  y: number
  rx: number
  ry: number
}

/** Axis-aligned rectangle (x, y = top-left). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Everything in the kit's (outer) frame: local units, feet at 0, facing +x. */
export interface BodyMetrics {
  headTop: number
  head: HeadBox
  socketF: { x: number; y: number }
  socketB: { x: number; y: number }
  /** Bounds of the parts drawn over the back hand (torso, legs), used to keep it from vanishing behind them. */
  bodyBox: Rect
  upper: number
  fore: number
  armed: boolean
  handR: number
}

export interface HandPose {
  x: number
  y: number
  ex: number
  ey: number
  open: number
  front: boolean
  /** Radius of the ball this hand carries, set by the kit while it draws one, so a body can shape the hand round it. */
  grip?: number
}

export interface DrawKit {
  metrics: BodyMetrics
  /**
   * The solved hands. Bodies may replace an entry (e.g. set `open`) before calling backHand/frontHand; the kit draws
   * what is there at call time. The object is fresh each frame.
   */
  hands: { front: HandPose; back: HandPose }
  /** Bodies call before the body. Call it in the kit's frame, not inside a body's own transform. */
  backHand(): void
  /** Bodies call after the body; draws the held ball and grip too. Call it in the kit's frame, not inside a body's own transform. */
  frontHand(): void
  hat(box: HeadBox): void
  emblem(x: number, y: number, size: number): void
}

export interface BodyType {
  metrics(look: CreatureLook, f: Frame): BodyMetrics
  draw(ctx: CanvasRenderingContext2D, look: CreatureLook, f: Frame, k: DrawKit): void
  /** Body-specific hand (e.g. claws, paws). */
  drawHand?(ctx: CanvasRenderingContext2D, h: HandPose, look: CreatureLook, r: number): void
  /** Body-specific grip drawn over the carried ball (e.g. the crab's upper pincer); default: a thumb over its front edge. */
  drawGrip?(
    ctx: CanvasRenderingContext2D,
    h: HandPose,
    ball: { x: number; y: number; r: number },
    look: CreatureLook,
  ): void
  /** Body shift for this frame in local forward units (+ = the way the creature faces; the avatar applies `facing`). */
  offsetX?(look: CreatureLook, f: Frame): number
  /** Body-specific arm reactions layered on the mood pose (e.g. both arms up on cheer), before the hands are solved. */
  pose?(look: CreatureLook, f: Frame): Pose
}
