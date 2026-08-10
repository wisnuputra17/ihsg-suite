/**
 * Volume Surge — engine deteksi lonjakan volume real-time.
 *
 * FILOSOFI: alat OBSERVASI, bukan sinyal prediktif. Mengukur "keramaian tak
 * biasa" = berapa kali lipat volume hari ini dibanding rata-rata 5 hari emiten
 * ITU SENDIRI. Tidak ada WLB/backtest — ranking realtime, bukan ramalan.
 *
 * PILIHAN DESAIN (dikonfirmasi Wisnu):
 * - Metrik = VOLUME (lembar), bukan value (Rp). Volume = angka mentah akurat,
 *   tanpa aproksimasi harga. Rasio relatif → adil antar-emiten beda harga.
 * - surge = volume hari ini / MA5(volume 5 hari SEBELUM hari ini)
 * - BIAS PAGI (diterima): volume hari berjalan terkumpul bertahap, jadi rasio
 *   kecil di pagi & membesar sepanjang sesi. Ranking tetap benar (teramai di
 *   puncak); hanya angka absolut yg bergeser. Ditandai di UI.
 *
 * Semua fungsi murni — input daily ascending, output angka.
 */

/**
 * Hitung surge 1 emiten dari daily ascending.
 * @param {Array} daily - candle ascending, terakhir = hari berjalan
 * @param {number} maLen - panjang MA (default 5)
 * @returns {{today, ma, ratio, nHist}} atau null bila data kurang
 */
export function volumeSurge(daily, maLen = 5) {
  if (!daily || daily.length < maLen + 1) return null
  const vols = daily.map(r => r.volume || 0)
  const today = vols[vols.length - 1]
  // Baseline dari maLen hari SEBELUM hari ini (exclude hari berjalan).
  const hist = vols.slice(-(maLen + 1), -1)
  if (hist.length < maLen) return null
  // MA5 rata-rata NYATA (keputusan Wisnu): outlier TIDAK diabaikan. Bila 1 hari
  // meledak lalu reda, ratio rendah memang benar — mencerminkan aktivitas turun
  // dari puncak. (Median sempat dicoba, ditolak: sembunyikan hari raksasa kemarin.)
  const ma = hist.reduce((s, x) => s + x, 0) / maLen
  if (!ma) return null  // baseline nol (tak likuid/suspend) → skip
  const prevClose = daily.length >= 2 ? (daily[daily.length - 2].close ?? null) : null
  const closeNow = daily[daily.length - 1].close ?? null
  const changePct = (prevClose && closeNow) ? (closeNow - prevClose) / prevClose * 100 : null
  return {
    today,
    ma,
    ratio: today / ma,
    nHist: hist.length,
    close: closeNow,
    changePct,
    date: daily[daily.length - 1].date ?? null,
  }
}

/**
 * Ranking banyak emiten dari surge tertinggi.
 * @param {Array} rows - [{sym, daily}]
 * @param {number} maLen
 * @returns {Array} [{sym, ...surge}] terurut ratio desc, hanya yg valid
 */
export function rankSurge(rows, maLen = 5) {
  const out = []
  for (const r of rows) {
    const s = volumeSurge(r.daily, maLen)
    if (s) out.push({ sym: r.sym, ...s })
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}

/** Tingkat alert dari rasio — utk penanda visual. */
export function alertLevel(ratio) {
  if (ratio >= 5) return 'extreme'   // ≥5× — sangat tak biasa
  if (ratio >= 3) return 'high'      // ≥3×
  if (ratio >= 2) return 'mid'       // ≥2×
  return 'normal'
}

/** Format rasio: 3.4× */
export function fmtRatio(r) {
  return (r == null) ? '–' : `${r.toFixed(1)}×`
}

/** Format volume ringkas: 152,7 jt / 1,2 M lembar */
export function fmtVol(v) {
  if (v == null) return '–'
  const a = Math.abs(v)
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)} M`
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} jt`
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)} rb`
  return String(a)
}
