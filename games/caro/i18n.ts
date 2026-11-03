// Caro in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  // Options
  'Playing alone': 'Chơi một mình',
  'Easy AI': 'Máy dễ',
  'Normal AI': 'Máy vừa',
  'Hard AI': 'Máy khó',
  '2 players, 1 device': '2 người, 1 máy',
  Board: 'Bàn cờ',
  Rule: 'Luật',
  'Five wins': '5 con là thắng',
  'Blocked ends': 'Chặn 2 đầu',
  'Turn timer': 'Giới hạn lượt',
  Off: 'Tắt',
  On: 'Bật',
  'Four warnings': 'Cảnh báo 4 quân',

  // Start screen
  'Five in a row on notebook paper. Beat the computer, a friend beside you, or anyone online.':
    'Năm con liên tiếp trên giấy ô ly. Thắng máy, thắng bạn ngồi cạnh, hoặc bất kỳ ai trực tuyến.',
  'Click a square to play (on a phone, tap twice). Arrow keys and Enter work too. Press D to draw on the board, U to undo.':
    'Bấm vào một ô để đánh (trên điện thoại, chạm hai lần). Cũng dùng được phím mũi tên và Enter. Nhấn D để vẽ lên bàn cờ, U để đi lại.',

  // Players and turns
  Computer: 'Máy',
  Easy: 'Dễ',
  Normal: 'Vừa',
  Hard: 'Khó',
  'Player X': 'Người chơi X',
  'Player O': 'Người chơi O',
  '{name} (you)': '{name} (bạn)',
  'Your turn': 'Đến lượt bạn',
  "{name}'s turn": 'Lượt của {name}',
  'X to move': 'Lượt của X',
  'O to move': 'Lượt của O',
  'Computer is thinking…': 'Máy đang nghĩ…',
  'Caro board': 'Bàn cờ caro',

  // Moments
  'Four!': 'Bốn con!',
  'Watch out!': 'Cẩn thận!',
  "Time's up! A move was played for you.": 'Hết giờ! Một nước đã được đánh thay bạn.',
  '{name} ran out of time.': '{name} đã hết giờ.',
  '{name} resigned.': '{name} đã đầu hàng.',

  // Results
  '{name} wins!': '{name} thắng!',
  'Draw!': 'Hòa!',
  'Draw! The board is full.': 'Hòa! Bàn cờ đã kín.',
  'Five in a row. You win!': 'Năm con liên tiếp. Bạn thắng!',
  'Your opponent left. You win!': 'Đối thủ đã rời đi. Bạn thắng!',
  'Your opponent resigned. You win!': 'Đối thủ đã đầu hàng. Bạn thắng!',
  'The computer got five. Try again!': 'Máy đã có năm con. Thử lại nhé!',

  // Toolbar
  'Undo ({n})': 'Đi lại ({n})',
  Resign: 'Đầu hàng',
  'Sure? Tap again': 'Chắc chưa? Bấm lần nữa',
  Draw: 'Vẽ',
  'Done drawing': 'Vẽ xong',
  'Ink colour': 'Màu mực',
  'Ink {n}': 'Mực {n}',
  Highlighter: 'Bút dạ quang',
  'Erase my last': 'Xóa nét cuối',
  'Clear drawing': 'Xóa hết hình vẽ',
}

export const t = translator(VI)
