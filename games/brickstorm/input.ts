import { guideIdsAt } from './guide'
import { bossParts } from './sim/boss-kit'
import { BOARD_H, BOARD_W } from './sim/config'
import { brickRect } from './sim/rows'
import type { Rect, RunState } from './sim/types'

/** Maps a client (page) point into board units. Points off the canvas map outside the board. */
export function toBoard(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  boardW = BOARD_W,
  boardH = BOARD_H,
): [number, number] {
  return [((clientX - rect.left) / rect.width) * boardW, ((clientY - rect.top) / rect.height) * boardH]
}

/** Hold this long on the boss, without dragging, to open its card instead of shooting. */
export const LONG_PRESS_MS = 450
/** A press that moves farther than this (board units) is an aim, not a long press. */
const PRESS_SLOP = 10

export function inRect(x: number, y: number, r: Rect | null): boolean {
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** Is the point on one of the boss's parts? */
export function onBoss(s: RunState, x: number, y: number): boolean {
  return !!s.boss && bossParts(s).some((b) => inRect(x, y, brickRect(b)))
}

/** Has a press drifted far enough to count as aiming? */
export function moved(from: [number, number], to: [number, number]): boolean {
  return Math.hypot(to[0] - from[0], to[1] - from[1]) > PRESS_SLOP
}

/**
 * The mouse cursor over the board: a pointer on the HUD chips (they open
 * something), "help" on what can be held to read about (the boss, special
 * bricks, pickups), a crosshair elsewhere while aiming, an arrow otherwise.
 */
export function hoverCursor(
  s: RunState,
  x: number,
  y: number,
  chips: { boss: Rect | null; points: Rect | null },
  aiming: boolean,
): 'pointer' | 'help' | 'crosshair' | 'default' {
  if (!aiming) return 'default'
  if (inRect(x, y, chips.boss) || inRect(x, y, chips.points)) return 'pointer'
  if (onBoss(s, x, y) || guideIdsAt(s, x, y).length) return 'help'
  return 'crosshair'
}
