// Every tuning constant for Brickstorm. Units are board units (the canvas's
// logical pixels) and seconds.

export const CELL = 56
/** Starting board size; a run's board can grow (see dims.ts). */
export const COLS = 7
export const ROWS = 12
export const MAX_COLS = 10
export const MAX_ROWS = 16
/** Every this many turns the player may grow the board. */
export const GROW_EVERY = 50
/** HUD band above row 0. */
export const TOP = 56
export const BOARD_W = COLS * CELL
/** Where balls rest between volleys. */
export const FLOOR_Y = TOP + ROWS * CELL + 48
export const BOARD_H = FLOOR_Y + 24
/** Gap of 2 × inset between neighbouring bricks. */
export const BRICK_INSET = 2

export const BALL_R = 7
export const PICKUP_R = 12
/** Units per second at 1× speed. */
export const BALL_SPEED = 620
export const TICK = 1 / 120
/** Seconds between balls in a volley. */
export const FIRE_GAP = 0.07
/** Balls always keep at least this share of their speed vertical. */
export const MIN_VY_RATIO = 0.15
export const AIM_MIN = (8 * Math.PI) / 180

/** Seconds without a hit before the combo resets. */
export const COMBO_GAP = 1.5
export const FEVER_AT = 100
/** [min combo, coin multiplier], highest first. */
export const COMBO_TIERS = [
  [100, 3],
  [50, 2],
  [25, 1.5],
  [0, 1],
] as const

/** Volley time (s) after which the game runs at 2× and 3×. */
export const AUTO_2X = 6
export const AUTO_3X = 12
export const RECALL_AFTER = 6
export const SLOWMO = 0.3

/** A brick entering this row ends the run (starting board). */
export const DANGER_ROW = ROWS - 1

/** Pixel and row geometry for a board of a given size. */
export function boardSize(cols: number, rows: number) {
  const floorY = TOP + rows * CELL + 48
  return { cols, rows, dangerRow: rows - 1, boardW: cols * CELL, floorY, boardH: floorY + 24 }
}
