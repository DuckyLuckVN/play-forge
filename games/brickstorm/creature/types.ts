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

export interface BodyMetrics {
  headTop: number
  head: HeadBox
  socketF: { x: number; y: number }
  socketB: { x: number; y: number }
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
}

export interface DrawKit {
  metrics: BodyMetrics
  hands: { front: HandPose; back: HandPose }
  /** Bodies call before the body. */
  backHand(): void
  /** Bodies call after the body; draws the held ball and grip too. */
  frontHand(): void
  hat(box: HeadBox): void
  emblem(x: number, y: number, size: number): void
}

export interface BodyType {
  metrics(look: CreatureLook, f: Frame): BodyMetrics
  draw(ctx: CanvasRenderingContext2D, look: CreatureLook, f: Frame, k: DrawKit): void
  /** Body-specific hand (e.g. claws, paws). */
  drawHand?(ctx: CanvasRenderingContext2D, h: HandPose, look: CreatureLook, r: number): void
  /** Horizontal body shift for this frame. */
  offsetX?(look: CreatureLook, f: Frame): number
  /** Body-specific arm reactions layered on the mood pose (e.g. both arms up on cheer), before the hands are solved. */
  pose?(look: CreatureLook, f: Frame): Pose
}
