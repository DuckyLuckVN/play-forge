// Phantom Drift in Vietnamese. Keys are the English text as written in the
// code (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  'Drift through the rift. Dodge, graze, go Phantom.': 'Lướt qua khe nứt. Né, sượt qua, hóa Bóng ma.',
  'Move with ←/→ or A/D, swipe, or tap either side. Space, ↑ or swipe up turns you Phantom when the ring is full.':
    'Di chuyển bằng ←/→ hoặc A/D, vuốt, hoặc chạm hai bên. Space, ↑ hoặc vuốt lên để hóa Bóng ma khi vòng đầy.',
  'Phantom Drift rift': 'Khe nứt Phantom Drift',
  // Run summary
  Distance: 'Quãng đường',
  Time: 'Thời gian',
  'Top speed': 'Tốc độ tối đa',
  Wisps: 'Đốm sáng',
  'Near misses': 'Né sát',
  'Best combo': 'Combo cao nhất',
  // Moments
  'DAREDEVIL!': 'LIỀU LĨNH!',
  'UNTOUCHABLE!': 'BẤT KHẢ XÂM PHẠM!',
  'GHOST LEGEND!': 'HUYỀN THOẠI BÓNG MA!',
  'MAX COMBO ×5!': 'COMBO TỐI ĐA ×5!',
  'SPEED UP! {kmh} km/h': 'TĂNG TỐC! {kmh} km/h',
  'THE RIFT WIDENS!': 'KHE NỨT MỞ RỘNG!',
  'PHANTOM!': 'BÓNG MA!',
  '{n} KM!': '{n} KM!',
  'NEW BEST!': 'KỶ LỤC MỚI!',
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
}

export const t = translator(VI)
