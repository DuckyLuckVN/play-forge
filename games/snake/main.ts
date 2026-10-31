import {
  bindInput,
  createCanvas2D,
  createGameApp,
  playSound,
  smoothState,
  startRenderLoop,
  type Direction,
} from '@forge'
import { CELL, SnakeRenderer } from './render'
import { snakeGame, type SnakeState } from './sim'
import { SNAKE_SOUNDS } from './sounds'

createGameApp<SnakeState, Direction>({
  def: snakeGame,
  title: 'Snake',
  tagline: 'Eat, grow, and be the last snake moving.',
  controls: 'Steer with the arrow keys or WASD. On a phone, swipe.',
  mount(session, stage) {
    const view = createCanvas2D(stage, 32 * CELL, 24 * CELL)
    const smooth = smoothState(session)
    const renderer = new SnakeRenderer(view, smooth, session.selfId)
    const offState = session.on('state', (s) => {
      if (view.width !== s.width * CELL || view.height !== s.height * CELL)
        view.setSize(s.width * CELL, s.height * CELL)
      renderer.onState(s)
      for (const e of s.events) {
        // Your own sounds are loud; everyone else's are quieter.
        playSound(SNAKE_SOUNDS[e.type], e.player === session.selfId ? 1 : 0.35)
      }
    })
    const stopRender = startRenderLoop((dt) => renderer.frame(dt))
    const stopInput = bindInput<Direction>(
      {
        keys: {
          ArrowUp: 'up',
          KeyW: 'up',
          ArrowDown: 'down',
          KeyS: 'down',
          ArrowLeft: 'left',
          KeyA: 'left',
          ArrowRight: 'right',
          KeyD: 'right',
        },
        swipe: { up: 'up', down: 'down', left: 'left', right: 'right' },
        swipeTarget: stage,
      },
      (dir) => session.sendInput(dir),
    )
    return () => {
      offState()
      smooth.dispose()
      stopRender()
      stopInput()
      view.destroy()
    }
  },
  scores: (state) => state.snakes.map((s) => ({ id: s.id, score: s.score, out: !s.alive })),
  outcome(state, selfId) {
    if (state.snakes.length === 1) {
      const n = state.snakes[0].score
      return { headline: `You ate ${n} ${n === 1 ? 'apple' : 'apples'}`, result: n > 0 ? 'done' : 'lose' }
    }
    const winner = state.snakes.find((s) => s.id === state.winner)
    if (!winner) return { headline: 'Draw!', result: 'draw' }
    return winner.id === selfId
      ? { headline: 'You win!', result: 'win' }
      : { headline: `${winner.name} wins`, result: 'lose' }
  },
})
