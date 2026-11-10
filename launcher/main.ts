import '@forge/ui/base.css'
import './launcher.css'
import { playMusic } from '@forge/audio/music'
import { playSound, UI_SOUNDS } from '@forge/audio/sound'
import { LOUNGE } from '@forge/audio/tracks'
import { audioMenu } from '@forge/ui/audio-menu'
import { langMenu } from '@forge/ui/lang-menu'
import { h, icon } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { applyTheme } from '@forge/ui/theme'
import games from '../games/games.json'
import { t } from './i18n'

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
    // The cover's description is English in the file; screen readers get it translated.
    const art = cover.querySelector('svg[aria-label]')
    art?.setAttribute('aria-label', t(art.getAttribute('aria-label')!))
    const card = h(
      'a',
      { class: 'pf-card lc-game', href: `games/${g.id}/index.html` },
      cover,
      h(
        'div',
        { class: 'lc-game-body' },
        h('h2', { textContent: g.title }),
        h('p', { textContent: t(g.description) }),
      ),
      gameMeta(g.players),
      h('span', { class: 'pf-btn primary', textContent: t('Play') }),
    )
    card.style.setProperty('--i', String(i))
    const play = card.querySelector<HTMLElement>('.pf-btn')!
    card.addEventListener('click', (e) => {
      playSound(UI_SOUNDS.click)
      // Opening in a new tab (ctrl/cmd/middle click) leaves this page as it is.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      card.classList.add('loading')
      play.classList.add('loading')
      play.textContent = t('Loading…')
    })
    // Fetch the game while the pointer heads for it, so the click opens it faster.
    const warm = () => prefetch(card.href)
    card.addEventListener('pointerenter', warm, { once: true })
    card.addEventListener('touchstart', warm, { once: true, passive: true })
    card.addEventListener('focus', warm, { once: true })
    return card
  }),
)

const prefetched = new Set<string>()
/** Hint the browser to download a game page ahead of the click (once per page). */
function prefetch(href: string) {
  if (prefetched.has(href)) return
  prefetched.add(href)
  document.head.append(h('link', { rel: 'prefetch', href }))
}

// Back from a game (page restored from the back/forward cache): drop the "Loading…" state.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return
  for (const card of document.querySelectorAll<HTMLElement>('.lc-game.loading')) {
    card.classList.remove('loading')
    const play = card.querySelector('.pf-btn')!
    play.classList.remove('loading')
    play.textContent = t('Play')
  }
})

/** Card footer: the player count, one line, pinned above the button so every card lines up. */
function gameMeta(players: string) {
  return h(
    'div',
    { class: 'lc-meta' },
    icon(icons.users),
    t(players === '1' ? '{n} player' : '{n} players', { n: players }),
  )
}

const steps = [
  ['Pick a game', 'Everything runs in your browser. Nothing to install, no accounts.'],
  ['Create a room', 'You get a 5-character code, like K7QXP.'],
  ['Share the code', 'Friends type it in and take a seat. Start when everyone is ready.'],
].map(([title, text]) => [t(title), t(text)])

document.body.append(
  h('div', { class: 'lc-bar' }, langMenu(), audioMenu()),
  h(
    'main',
    { class: 'lc' },
    h(
      'header',
      { class: 'lc-head' },
      h('h1', { class: 'lc-title', textContent: 'Play Forge' }),
      h('p', { class: 'lc-lede', textContent: t('Quick games to play with friends, browser to browser.') }),
    ),
    shelf,
    h(
      'ol',
      { class: 'lc-steps' },
      ...steps.map(([title, text]) =>
        h('li', {}, h('strong', { textContent: title }), h('span', { textContent: text })),
      ),
    ),
    h('footer', { class: 'lc-version', textContent: `v${__APP_VERSION__}` }),
  ),
)
