// Synthstride in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  'Step to the beat. Dodge what lands on it.': 'Bước theo nhịp. Né những gì giáng xuống theo nhịp.',
  'Step with the arrows or WASD, tap a tile, or swipe. Moves on the beat score and build your groove. Warned tiles show a dashed edge, then stripes on the beat before they strike; a half-moon means between beats. Step through note chains in order. Space or the ring starts Overdrive when full.':
    'Bước bằng phím mũi tên hoặc WASD, chạm vào ô, hoặc vuốt. Bước đúng nhịp để ghi điểm và tăng groove. Ô cảnh báo có viền nét đứt, rồi có sọc ở nhịp ngay trước khi nổ; ô có hình bán nguyệt nổ giữa hai nhịp. Đi qua chuỗi nốt nhạc theo thứ tự. Space hoặc chạm vòng tròn để bật Overdrive khi đầy.',
  'Synthstride dance floor': 'Sàn nhảy Synthstride',
  TAP: 'CHẠM',
  PERFECT: 'HOÀN HẢO',
  GOOD: 'TỐT',
  'OFF BEAT': 'LỆCH NHỊP',
  // Tempo option
  Tempo: 'Nhịp độ',
  Chill: 'Thư giãn',
  Normal: 'Bình thường',
  Hyper: 'Cuồng nhiệt',
  // Timing calibration
  'Timing offset': 'Độ trễ',
  'Calibrate timing': 'Chỉnh độ trễ',
  'Tap Space, Enter or the screen when the ring meets the circle.':
    'Nhấn Space, Enter hoặc chạm màn hình khi vòng sáng chạm vào hình tròn.',
  Cancel: 'Hủy',
  'Tap!': 'Nhấn!',
  'Save {ms} ms': 'Lưu {ms} ms',
  'Try again': 'Thử lại',
  'Not enough taps. Tap once on every click.': 'Chưa đủ lần nhấn. Hãy nhấn một lần theo mỗi tiếng tách.',
  // Multiplayer
  'With friends': 'Chơi cùng bạn',
  'Shared floor': 'Chung sàn',
  'Own boards': 'Sàn riêng',
  OUT: 'BỊ LOẠI',
  "YOU'RE OUT!": 'BẠN BỊ LOẠI!',
  '{name} IS OUT!': '{name} BỊ LOẠI!',
  'YOU TAKE THE LEAD!': 'BẠN DẪN ĐẦU!',
  'LAST ONE DANCING!': 'NGƯỜI CUỐI CÙNG TRÊN SÀN!',
  'Match over': 'Trận đấu kết thúc',
  'You win! {score} points': 'Bạn thắng! {score} điểm',
  '#{rank} of {n} · {score} points': 'Hạng {rank}/{n} · {score} điểm',
  // Run summary
  Time: 'Thời gian',
  'Top tempo': 'Nhịp cao nhất',
  'Perfect steps': 'Bước hoàn hảo',
  Chains: 'Chuỗi nốt',
  Dodges: 'Lần né',
  'Best groove': 'Groove cao nhất',
  // Moments
  'IN THE GROOVE!': 'VÀO NHỊP RỒI!',
  'ON FIRE!': 'BÙNG CHÁY!',
  'RHYTHM GOD!': 'THẦN NHỊP ĐIỆU!',
  'MAX GROOVE ×4!': 'GROOVE TỐI ĐA ×4!',
  'TEMPO UP! {bpm} BPM': 'TĂNG NHỊP! {bpm} BPM',
  'DROP!': 'DROP!',
  'OVERDRIVE!': 'OVERDRIVE!',
  'CHAIN ×{n}!': 'CHUỖI ×{n}!',
  'THE FLOOR EXPANDS!': 'SÀN NHẢY MỞ RỘNG!',
  '{n} MIN!': '{n} PHÚT!',
  'NEW BEST!': 'KỶ LỤC MỚI!',
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
}

export const t = translator(VI)
