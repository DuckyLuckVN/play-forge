// Scoring + service box helpers. Pure.

export interface Score {
  s: [number, number]
}

/** Rally point scoring: to 11, win by 2, cap at 15 (14-14 → next point wins). */
export const TARGET = 11
export const CAP = 15

export function award(score: [number, number], side: 0 | 1): [number, number] {
  return side === 0 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1]
}

export function winner(score: [number, number]): 0 | 1 | null {
  for (const side of [0, 1] as const) {
    const me = score[side]
    const them = score[1 - side]
    if (me >= CAP || (me >= TARGET && me - them >= 2)) return side
  }
  return null
}

/** Even own score → right service box, odd → left. View-relative (screen right = +1) for the server. */
export function serveBox(server: 0 | 1, serverScore: number): { xSign: 1 | -1 } {
  void server
  return { xSign: serverScore % 2 === 0 ? 1 : -1 }
}
