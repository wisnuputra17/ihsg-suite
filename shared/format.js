/**
 * shared/format.js
 * =================
 * Helper format angka — dipakai semua fitur yang tampilkan nilai Rupiah/angka.
 */

/** Format nilai Rupiah ringkas: 1.2M, 450jt, atau angka biasa kalau di bawah 1 juta. Tangani negatif. */
export function fmtRp(v) {
  if (v === null || v === undefined || isNaN(v)) return '–'
  const sign = v < 0 ? '-' : ''
  const abs  = Math.abs(v)
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'M'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(0) + 'jt'
  return sign + new Intl.NumberFormat('id-ID').format(Math.round(abs))
}

/** Format angka biasa dengan pemisah ribuan ala Indonesia. */
export function fmtNum(v) {
  if (v === null || v === undefined || isNaN(v)) return '–'
  return new Intl.NumberFormat('id-ID').format(Math.round(v))
}

/** Format volume ringkas: 1.2jt, 450rb, atau angka biasa. */
export function fmtVol(v) {
  if (v === null || v === undefined || isNaN(v)) return '–'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'jt'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'rb'
  return String(v)
}
