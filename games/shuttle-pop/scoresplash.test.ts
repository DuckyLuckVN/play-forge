// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scoreboard, type BoardSide, type BoardView } from './scoreboard'
import { SPLASH_MS } from './scoresplash'

const side = (name: string, score: number): BoardSide => ({
  name,
  score,
  tint: '#ff0000',
  serving: false,
  matchPoint: false,
})
const view = (l: number, r: number): BoardView => ({
  left: side('Ann', l),
  right: side('Bo', r),
  match: null,
  note: null,
  pairs: false,
})

afterEach(() => vi.useRealTimers())

describe('score splash (after each point)', () => {
  it('shows the score big, the changed side marked, then hides; never on the first draw', () => {
    vi.useFakeTimers()
    const board = new Scoreboard()
    const el = board.splash.root
    board.update(view(0, 0))
    expect(el.classList.contains('show')).toBe(false)
    board.update(view(0, 1))
    expect(el.classList.contains('show')).toBe(true)
    const nums = [...el.querySelectorAll('.sp-splash-num')]
    expect(nums.map((n) => n.textContent)).toEqual(['0', '1'])
    expect(nums.map((n) => n.classList.contains('changed'))).toEqual([false, true])
    vi.advanceTimersByTime(SPLASH_MS)
    expect(el.classList.contains('show')).toBe(false)
    board.update(view(1, 1))
    expect([...el.querySelectorAll('.sp-splash-num')].map((n) => n.classList.contains('changed'))).toEqual([
      true,
      false,
    ])
  })

  it('a new match (reset) hides it and the next draw does not splash', () => {
    const board = new Scoreboard()
    board.update(view(3, 2))
    board.update(view(4, 2))
    board.reset()
    expect(board.splash.root.classList.contains('show')).toBe(false)
    board.update(view(0, 0))
    expect(board.splash.root.classList.contains('show')).toBe(false)
  })
})
