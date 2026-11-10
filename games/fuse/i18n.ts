// Fuse in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  // Options
  'Playing alone': 'Chơi một mình',
  'Just me': 'Một mình',
  'Race the computer': 'Đua với máy',
  Board: 'Bàn',
  Rocks: 'Đá',
  On: 'Bật',
  Off: 'Tắt',
  Time: 'Thời gian',
  'Until stuck': 'Đến khi kẹt',
  '{n} min': '{n} phút',
  Computer: 'Máy',

  // Start screen
  'Slide, fuse, chase huge numbers. Smash rocks, chain combos, race your friends.':
    'Trượt, ghép, săn những con số khổng lồ. Đập đá, nối combo, đua cùng bạn bè.',
  'Slide every tile': 'Trượt mọi ô',
  'Two equal tiles fuse into one': 'Hai ô bằng nhau ghép thành một',
  'Merges next to a rock crack it': 'Ghép cạnh hòn đá sẽ làm nó nứt',
  'Blast one tile': 'Phá một ô',
  bomb: 'bom',
  undo: 'đi lại',

  // Board and HUD
  'Fuse board': 'Bàn chơi Fuse',
  Score: 'Điểm',
  'Best tile': 'Ô lớn nhất',
  Blast: 'Bom',
  '#{rank} of {n}': 'Hạng {rank}/{n}',
  'Incoming ×{n}': 'Đá sắp rơi ×{n}',
  Out: 'Thua',
  Left: 'Đã rời',
  'Out of moves': 'Hết nước đi',
  "Time's up!": 'Hết giờ!',
  'Watch the others finish': 'Xem mọi người chơi tiếp',

  // Moments
  'Combo ×{n}': 'Combo ×{n}',
  'Smash!': 'Vỡ!',
  'BOOM!': 'BÙM!',
  'Incoming!': 'Đá rơi!',
  'Blast ready!': 'Có bom!',
  'Blocked!': 'Chặn được!',
  'Sent {n} rock!': 'Ném {n} đá!',
  '{name} is out of moves.': '{name} đã hết nước đi.',

  // Toolbar
  'Tap a tile to blast': 'Chạm một ô để phá',
  'Blast ({n})': 'Bom ({n})',
  'Undo ({n})': 'Đi lại ({n})',
  Undo: 'Đi lại',

  // Results
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
  "It's a tie!": 'Hòa!',
  'You win the race!': 'Bạn thắng cuộc đua!',
  'The computer wins. Rematch?': 'Máy thắng rồi. Đấu lại nhé?',
  '{name} wins!': '{name} thắng!',
}

export const t = translator(VI)
