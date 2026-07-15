/**
 * shared/idx-calendar.js
 * ======================
 * Kalender libur bursa IDX + utilitas fraksi harga (tick size).
 * Dipakai untuk: cegah entry date salah di hari libur (BSJP), dan
 * pembulatan harga realistis di backtest.
 */

// Libur bursa IDX 2026 (hari tanpa perdagangan — di luar Sabtu/Minggu).
// Sumber: kalender IDX. Update tiap tahun.
export const IDX_HOLIDAYS_2026 = [
  '2026-01-01', // Tahun Baru
  '2026-02-17', // Isra Miraj
  '2026-03-19', // Nyepi
  '2026-03-20', // Cuti bersama Nyepi
  '2026-03-31', // Idul Fitri (perkiraan)
  '2026-04-01', // Idul Fitri
  '2026-04-02', // Idul Fitri
  '2026-04-03', // Cuti bersama
  '2026-05-01', // Hari Buruh
  '2026-05-14', // Kenaikan Isa Almasih
  '2026-05-27', // Idul Adha (perkiraan)
  '2026-06-01', // Pancasila
  '2026-06-17', // Tahun Baru Islam
  '2026-08-17', // Kemerdekaan
  '2026-08-26', // Maulid Nabi (perkiraan)
  '2026-12-25', // Natal
]

const _holidaySet = new Set(IDX_HOLIDAYS_2026)

/** True kalau tanggal (YYYY-MM-DD) hari bursa buka (bukan weekend/libur). */
export function isTradingDay(dateStr) {
  const d = new Date(dateStr + 'T07:00:00Z')
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !_holidaySet.has(dateStr)
}

/** Hari bursa terakhir SEBELUM dateStr (skip weekend + libur). */
export function prevTradingDay(dateStr) {
  const d = new Date(dateStr + 'T07:00:00Z')
  do { d.setUTCDate(d.getUTCDate() - 1) }
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || _holidaySet.has(d.toISOString().slice(0, 10)))
  return d.toISOString().slice(0, 10)
}

/** Hari bursa berikutnya SETELAH dateStr. */
export function nextTradingDay(dateStr) {
  const d = new Date(dateStr + 'T07:00:00Z')
  do { d.setUTCDate(d.getUTCDate() + 1) }
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || _holidaySet.has(d.toISOString().slice(0, 10)))
  return d.toISOString().slice(0, 10)
}

/**
 * Fraksi harga (tick size) IDX berdasarkan rentang harga.
 * Aturan BEI berlaku sejak 2023.
 */
export function tickSize(price) {
  if (price < 200)   return 1
  if (price < 500)   return 2
  if (price < 2000)  return 5
  if (price < 5000)  return 10
  return 25
}

/** Bulatkan harga ke tick terdekat (ke bawah untuk konservatif di sisi jual). */
export function roundToTick(price, dir = 'nearest') {
  const t = tickSize(price)
  if (dir === 'down') return Math.floor(price / t) * t
  if (dir === 'up')   return Math.ceil(price / t) * t
  return Math.round(price / t) * t
}
