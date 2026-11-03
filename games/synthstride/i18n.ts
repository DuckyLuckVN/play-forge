// Synthstride in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  'Step to the beat. Dodge what lands on it.': 'Bước theo nhịp. Né những gì giáng xuống theo nhịp.',
  'Step with the arrows or WASD, or swipe. Moves on the beat score and build your groove. Glowing tiles strike on the beat. Space or the ring starts the Drop when full.':
    'Bước bằng phím mũi tên hoặc WASD, hoặc vuốt. Bước đúng nhịp để ghi điểm và tăng groove. Ô phát sáng sẽ nổ đúng nhịp. Space hoặc chạm vòng tròn để kích hoạt Drop khi đầy.',
  'Synthstride dance floor': 'Sàn nhảy Synthstride',
  TAP: 'CHẠM',
  PERFECT: 'HOÀN HẢO',
  GOOD: 'TỐT',
  'OFF BEAT': 'LỆCH NHỊP',
  // Run summary
  Time: 'Thời gian',
  'Top tempo': 'Nhịp cao nhất',
  'Perfect steps': 'Bước hoàn hảo',
  Notes: 'Nốt nhạc',
  Dodges: 'Lần né',
  'Best groove': 'Groove cao nhất',
  // Moments
  'IN THE GROOVE!': 'VÀO NHỊP RỒI!',
  'ON FIRE!': 'BÙNG CHÁY!',
  'RHYTHM GOD!': 'THẦN NHỊP ĐIỆU!',
  'MAX GROOVE ×4!': 'GROOVE TỐI ĐA ×4!',
  'TEMPO UP! {bpm} BPM': 'TĂNG NHỊP! {bpm} BPM',
  'DROP!': 'DROP!',
  '{n} MIN!': '{n} PHÚT!',
  'NEW BEST!': 'KỶ LỤC MỚI!',
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
}

export const t = translator(VI)
