import '@forge/ui/base.css'
import './launcher.css'
import { playMusic } from '@forge/audio/music'
import { playSound, UI_SOUNDS } from '@forge/audio/sound'
import { LOUNGE } from '@forge/audio/tracks'
import { translator } from '@forge/core/i18n'
import { audioMenu } from '@forge/ui/audio-menu'
import { langMenu } from '@forge/ui/lang-menu'
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

const t = translator({
  'Eat, grow, outlast. Solo or up to 8 players.':
    'Ăn, lớn lên, trụ lâu nhất. Chơi một mình hoặc tối đa 8 người.',
  'Aim, launch, and break the storm. Boosts, special bricks and a shop.':
    'Ngắm, bắn và phá tan cơn bão gạch. Có nâng cấp, gạch đặc biệt và cửa hàng.',
  '{n} player': '{n} người chơi',
  '{n} players': '{n} người chơi',
  Play: 'Chơi',
  'Pick a game': 'Chọn một trò chơi',
  'Everything runs in your browser. Nothing to install, no accounts.':
    'Mọi thứ chạy ngay trên trình duyệt. Không cần cài đặt, không cần tài khoản.',
  'Create a room': 'Tạo phòng',
  'You get a 5-character code, like K7QXP.': 'Bạn nhận một mã 5 ký tự, ví dụ K7QXP.',
  'Share the code': 'Chia sẻ mã',
  'Friends type it in and take a seat. Start when everyone is ready.':
    'Bạn bè nhập mã và vào chỗ. Bắt đầu khi mọi người đã sẵn sàng.',
  'Quick games to play with friends, browser to browser.':
    'Trò chơi nhanh cùng bạn bè, từ trình duyệt đến trình duyệt.',
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
        h('p', { textContent: t(g.description) }),
        h('span', {
          class: 'lc-players',
          textContent: t(g.players === '1' ? '{n} player' : '{n} players', { n: g.players }),
        }),
      ),
      h('span', { class: 'pf-btn primary', textContent: t('Play') }),
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
  ),
)
