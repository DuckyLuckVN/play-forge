import '@forge/ui/base.css'
import './launcher.css'
import { playMusic } from '@forge/audio/music'
import { playSound, UI_SOUNDS } from '@forge/audio/sound'
import { LOUNGE } from '@forge/audio/tracks'
import { audioMenu } from '@forge/ui/audio-menu'
import { h } from '@forge/ui/dom'
import { applyTheme } from '@forge/ui/theme'
import games from '../games/games.json'

interface GameEntry {
  id: string
  title: string
  description: string
  players: string
}

const covers = import.meta.glob<string>('../games/*/cover.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

applyTheme()
// Music starts with the first click or key press (browsers block autoplay).
playMusic(LOUNGE)

const shelf = h(
  'div',
  { class: 'lc-shelf' },
  ...(games as GameEntry[]).map((g, i) => {
    const cover = h('div', { class: 'lc-cover' })
    cover.innerHTML = covers[`../games/${g.id}/cover.svg`] ?? ''
    const card = h(
      'a',
      { class: 'lc-game', href: `games/${g.id}/index.html` },
      cover,
      h(
        'div',
        { class: 'lc-game-body' },
        h('h2', { textContent: g.title }),
        h('p', { textContent: g.description }),
        h('span', {
          class: 'lc-players',
          textContent: `${g.players} ${g.players === '1' ? 'player' : 'players'}`,
        }),
      ),
      h('span', { class: 'pf-btn primary', textContent: 'Play' }),
    )
    card.style.setProperty('--i', String(i))
    card.addEventListener('click', () => playSound(UI_SOUNDS.click))
    return card
  }),
)

const steps = [
  ['Pick a game', 'Everything runs in your browser. Nothing to install, no accounts.'],
  ['Create a room', 'You get a 5-character code, like K7QXP.'],
  ['Share the code', 'Friends type it in and take a seat. Start when everyone is ready.'],
]

document.body.append(
  h('div', { class: 'lc-bar' }, audioMenu()),
  h(
    'main',
    { class: 'lc' },
    h(
      'header',
      { class: 'lc-head' },
      h('h1', { class: 'lc-title', textContent: 'Play Forge' }),
      h('p', { class: 'lc-lede', textContent: 'Quick games to play with friends, browser to browser.' }),
    ),
    shelf,
    h(
      'ol',
      { class: 'lc-steps' },
      ...steps.map(([title, text]) =>
        h('li', {}, h('strong', { textContent: title }), h('span', { textContent: text })),
      ),
    ),
  ),
)
