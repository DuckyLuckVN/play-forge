import '@forge/ui/base.css'
import './launcher.css'
import { playMusic } from '@forge/audio/music'
import { playSound, UI_SOUNDS } from '@forge/audio/sound'
import { LOUNGE } from '@forge/audio/tracks'
import { translator } from '@forge/core/i18n'
import { audioMenu } from '@forge/ui/audio-menu'
import { langMenu } from '@forge/ui/lang-menu'
import { h, icon } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
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
  'Aim, launch, and break the storm. 25 heroes, skills, special bricks and a shop.':
    'Ngắm, bắn và phá tan cơn bão gạch. 25 anh hùng, kỹ năng, gạch đặc biệt và cửa hàng.',
  'Five in a row. Play the computer, a friend on one device, or online. Draw on the board together.':
    'Năm con liên tiếp. Chơi với máy, với bạn trên cùng một máy, hoặc trực tuyến. Cùng vẽ lên bàn cờ.',
  'Slide and fuse tiles into huge numbers. Smash rocks, chain combos, race the computer or up to 4 friends.':
    'Trượt và ghép ô thành những con số khổng lồ. Đập đá, nối combo, đua với máy hoặc tối đa 4 người bạn.',
  'Dodge down a neon rift. Read the danger, graze it for points, go Phantom and phase through.':
    'Né trong khe nứt neon. Đọc nguy hiểm, sượt qua để ghi điểm, hóa Bóng ma và xuyên qua.',
  'Dance across a neon grid to the beat. Read the warned tiles, dodge on the drop, grab the notes. Solo or with up to 4 friends.':
    'Nhảy trên lưới neon theo nhịp. Đọc ô cảnh báo, né đúng nhịp, nhặt nốt nhạc. Chơi một mình hoặc tối đa 4 người.',
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
      ),
      gameMeta(g.players),
      h('span', { class: 'pf-btn primary', textContent: t('Play') }),
    )
    card.style.setProperty('--i', String(i))
    card.addEventListener('click', () => playSound(UI_SOUNDS.click))
    return card
  }),
)

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
