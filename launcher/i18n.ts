// The launcher in Vietnamese. Keys are the English text: the game descriptions
// from games/games.json, the cover descriptions and the page's own text.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
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
  'Chibi badminton. Time your swing for a Perfect, smash on high balls. Play the computer or friends online, 1 vs 1 or 2 vs 2.':
    'Cầu lông chibi. Vung vợt đúng lúc để được Perfect, đập mạnh khi cầu cao. Chơi với máy hoặc với bạn bè trực tuyến, 1 đấu 1 hoặc 2 đấu 2.',
  Background: 'Hình nền',
  'Background: {name}': 'Hình nền: {name}',
  Random: 'Ngẫu nhiên',
  Sunset: 'Hoàng hôn',
  Autumn: 'Mùa thu',
  Canyon: 'Hẻm núi',
  Candy: 'Kẹo ngọt',
  Day: 'Ban ngày',
  Night: 'Ban đêm',
  '{n} player': '{n} người chơi',
  'Updated {date}': 'Cập nhật {date}',
  '{n} players': '{n} người chơi',
  Play: 'Chơi',
  'Loading…': 'Đang tải…',
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
  // Cover art descriptions (aria-label in games/<id>/cover.svg)
  'A fan of balls flying up into numbered bricks': 'Chùm bóng bay lên phá những viên gạch có số',
  'Five crosses in a row struck through on notebook paper':
    'Năm dấu X liên tiếp bị gạch ngang trên giấy ô ly',
  'Two snakes racing for an apple': 'Hai con rắn đua nhau tới quả táo',
  'A chibi player swinging a racket at a shuttlecock': 'Một nhân vật chibi vung vợt đánh quả cầu lông',
}

export const t = translator(VI)
