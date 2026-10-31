import { bindInput, createCanvas2D, createGameApp, startRenderLoop, type Direction } from '@forge'
import { CELL, HUD, render } from './render'
import { snakeGame, type SnakeState } from './sim'

const stage = document.getElementById('stage')!

createGameApp<SnakeState, Direction>({
  def: snakeGame,
  title: 'Snake',
  subtitle: 'Eat, grow, outlast. Arrow keys / WASD or swipe.',
  stage,
  mount(session) {
    const view = createCanvas2D(stage, 32 * CELL, 24 * CELL + HUD)
    const offState = session.on('state', (s) => {
      const w = s.width * CELL
      const h = s.height * CELL + HUD
      if (view.width !== w || view.height !== h) view.setSize(w, h)
    })
    const stopRender = startRenderLoop((_dt, time) => render(view, session.state, session.selfId, time))
    const stopInput = bindInput<Direction>(
      {
        keys: {
          ArrowUp: 'up', KeyW: 'up',
          ArrowDown: 'down', KeyS: 'down',
          ArrowLeft: 'left', KeyA: 'left',
          ArrowRight: 'right', KeyD: 'right',
        },
        swipe: { up: 'up', down: 'down', left: 'left', right: 'right' },
        swipeTarget: stage,
      },
      (dir) => session.sendInput(dir),
    )
    return () => {
      offState()
      stopRender()
      stopInput()
      view.destroy()
    }
  },
  resultText(state, session) {
    if (state.snakes.length === 1) return `Score: ${state.snakes[0].score}`
    const winner = state.snakes.find((s) => s.id === state.winner)
    if (!winner) return 'Draw!'
    return winner.id === session.selfId ? 'You win!' : `${winner.name} wins!`
  },
})
