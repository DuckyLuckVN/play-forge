// Doubles (2v2) rules: modes, seats, wider court, serve rotation, who takes the shuttle.
// Pure leaf (physics / courtsize / court / i18n only) so sim, AI and the lobby can share it.
import { toWorld } from './court'
import { courtDims, type CourtSize } from './courtsize'
import { t } from './i18n'
import { COURT, type CourtDims } from './physics'

export type Mode = '1v1' | '2v2'
export const MODES: readonly Mode[] = ['1v1', '2v2']
export const MAX_SEATS = 4

/** A stored / sent option value → a mode; anything unknown is 1v1. */
export function modeOf(v: unknown): Mode {
  return MODES.includes(v as Mode) ? (v as Mode) : '1v1'
}

/** Room seat → team side (alternating A, B, A, B) and slot within the team. */
export function seatOf(roomSeat: number): { side: 0 | 1; slot: 0 | 1 } {
  return { side: (roomSeat % 2) as 0 | 1, slot: ((roomSeat >> 1) & 1) as 0 | 1 }
}

/** Doubles sidelines (real badminton 3.05 m); court size multiplies on top. */
export const DOUBLES_COURT: CourtDims = { ...COURT, halfWidth: 3.05 }

export function courtFor(mode: Mode, size: CourtSize): CourtDims {
  return mode === '2v2' ? courtDims(size, DOUBLES_COURT) : courtDims(size)
}

type Seat = { id: string; side: 0 | 1; slot: 0 | 1 }

export function mateOf<T extends Seat>(players: readonly T[], p: T): T | undefined {
  return players.find((q) => q.side === p.side && q.id !== p.id)
}

/** The side's player whose slot is the one due to serve, else the side's first player. */
export function serverOf<T extends Seat>(
  players: readonly T[],
  server: 0 | 1,
  serveSlot: readonly [0 | 1, 0 | 1],
): T | undefined {
  const team = players.filter((p) => p.side === server)
  return team.find((p) => p.slot === serveSlot[server]) ?? team[0]
}

/** Serve passes to the winner; the team that just lost the serve swaps its server. New tuple. */
export function flipServe(
  serveSlot: [0 | 1, 0 | 1],
  oldServer: 0 | 1,
  winner: 0 | 1,
  doubles: boolean,
): [0 | 1, 0 | 1] {
  const next: [0 | 1, 0 | 1] = [serveSlot[0], serveSlot[1]]
  if (doubles && winner !== oldServer) next[oldServer] = next[oldServer] === 0 ? 1 : 0
  return next
}

export function sideName(names: readonly string[]): string {
  return names.length > 1 ? t('{a} & {b}', { a: names[0], b: names[1] }) : (names[0] ?? '')
}

/** A team's label: "{a} & {b}", but one name when every member is a computer. */
export function teamName<T extends { kind: 'human' | 'ai' }>(
  team: readonly T[],
  nameOf: (p: T) => string,
): string {
  const names = team.map(nameOf)
  return team.length > 1 && team.every((p) => p.kind === 'ai') ? names[0] : sideName(names)
}

/**
 * tie: distance gap (m) under which slot 0 takes; centre: view-x dead zone; splitX: cover lane × halfWidth;
 * depth: the pair's waiting / cover depth × the 1v1 ready depth (ai.ts readyDepth).
 */
export const COVER = { tie: 0.05, centre: 0.3, splitX: 0.5, depth: 0.9 } as const

/** AI teammate who hits: nearest (xz) to the predicted landing, ties → slot 0, skipping `busy` (stunned / locked). */
export function takerOf<T extends Seat & { x: number; z: number }>(
  players: readonly T[],
  side: 0 | 1,
  land: { x: number; z: number },
  busy: (p: T) => boolean,
): T | null {
  let best: T | null = null
  let bestD = Infinity
  for (const p of players) {
    if (p.side !== side || busy(p)) continue
    const d = Math.hypot(p.x - land.x, p.z - land.z)
    if (best === null || d < bestD - COVER.tie || (d <= bestD + COVER.tie && p.slot < best.slot)) {
      best = p
      bestD = d
    }
  }
  return best
}

/**
 * World spot for the non-taker: opposite lane of the taker (view x), or the own half when the taker is
 * centred. takerX / ownX are view-relative x; `depth` is metres behind the net (view z = -depth).
 */
export function coverSpot(
  court: CourtDims,
  side: 0 | 1,
  takerX: number,
  ownX: number,
  depth: number,
): { x: number; z: number } {
  const lane = Math.abs(takerX) < COVER.centre ? (ownX < 0 ? -1 : 1) : takerX > 0 ? -1 : 1
  return toWorld(side, lane * court.halfWidth * COVER.splitX, -depth)
}
