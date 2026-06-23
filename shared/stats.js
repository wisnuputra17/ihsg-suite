/**
 * shared/stats.js
 * =================
 * Helper statistik kecil, generik — dipakai fitur mana pun yang perlu
 * ranking/filter berdasarkan proporsi (win rate) dengan sample size kecil.
 *
 * Formula DIVERIFIKASI independen pakai Python `statsmodels.stats.
 * proportion.proportion_confint(method='wilson')` (library teruji luas,
 * bukan ditranskrip ulang dari rumus JS-nya sendiri) — cocok presisi penuh
 * di 6 kasus uji sebelum dijadikan fixture test, sesuai prinsip yang sudah
 * dipakai utk RSI/ATR/MACD/Supertrend di shared/indicators.js.
 */

const Z_95 = 1.959963984540054 // z-score persis utk confidence level 95% (BUKAN 1.96 yg dibulatkan)

/**
 * Wilson score interval lower bound — estimasi KONSERVATIF dari proporsi
 * sebenarnya (win rate sebenarnya), menghukum sample kecil secara otomatis.
 *
 * Kenapa ini penting: win rate mentah gampang menyesatkan kalau sample-nya
 * kecil — "menang 100% dari 3 trade" kelihatan sempurna, tapi confidence
 * interval-nya sangat lebar (bisa jadi aslinya cuma 40%). Wilson lower
 * bound menangkap ini — kalau diranking pakai nilai ini (bukan win rate
 * mentah), kondisi yang menang cuma kebetulan akan otomatis turun rank,
 * sementara kondisi dgn sample besar & konsisten naik rank.
 *
 * @param {number} wins
 * @param {number} n
 * @param {number} z - z-score utk confidence level (default ≈95%)
 * @returns {number|null} lower bound dalam skala 0-100 (%), null kalau n=0
 */
export function wilsonLowerBound(wins, n, z = Z_95) {
  if (n === 0) return null
  const p = wins / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const halfWidth = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const lower = center - halfWidth
  return Math.max(0, Math.min(1, lower)) * 100
}
