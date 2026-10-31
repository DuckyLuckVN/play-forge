import { BOARD_H, BOARD_W } from './sim/config'

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
