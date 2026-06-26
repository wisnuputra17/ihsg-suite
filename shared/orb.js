/**
 * shared/orb.js
 * ===============
 * Opening Range Breakout (ORB) — murni matematika, tidak ada fetch/render/state.
 *
 * Definisi standar yang dipakai: tentukan high/low dari N candle PERTAMA
 * setelah market open ("opening range"), lalu pantau breakout di atas/bawah
 * range itu sepanjang sisa hari. Breakout ke ATAS range high = sinyal bull
 * (kandidat BUY). Breakout ke BAWAH range low = sinyal bear (kandidat SELL).
 *
 * SENGAJA tidak parsing timestamp/jam sama sekali di sini — caller (nanti
 * Chart real-time) yang tentukan alignment candle ke market-open & berapa
 * candle masuk window opening range (mis. candle 1 menit + rangeBarCount=5
 * → opening range 5 menit pertama; candle 5 menit + rangeBarCount=1 → opening
 * range 5 menit pertama juga). Ini supaya modul ini tidak terikat 1 resolusi
 * candle atau 1 timezone tertentu — bisa dipakai utk timeframe apa pun.
 *
 * ⚠️ BELUM PERNAH dites Wisnu dgn data pasar nyata — ini fondasi logic+test
 * (dikerjakan dlm "Mode Bakar Token"), BUKAN hasil analisis pasar yang sudah
 * divalidasi. Perlu diverifikasi pakai data intraday asli sebelum dipercaya
 * sbg basis alert real-time.
 */

/**
 * Hitung opening range (high, low) dari N candle PERTAMA di array.
 * @param {{high:number, low:number}[]} candles - candle[0] HARUS candle
 *   PALING AWAL setelah market open (urutan kronologis)
 * @param {number} rangeBarCount - berapa candle pertama jadi opening range
 * @returns {{high:number, low:number, barCount:number} | null} null kalau
 *   candles kosong/lebih sedikit dari rangeBarCount
 */
export function computeOpeningRange(candles, rangeBarCount) {
  if (!candles || !rangeBarCount || candles.length < rangeBarCount) return null
  const rangeBars = candles.slice(0, rangeBarCount)
  const high = Math.max(...rangeBars.map(c => c.high))
  const low  = Math.min(...rangeBars.map(c => c.low))
  return { high, low, barCount: rangeBarCount }
}

/**
 * Deteksi breakout 1 candle dibanding opening range yang sudah dihitung.
 * Breakout ditentukan dari CLOSE candle (bukan high/low candle itu sendiri)
 * — close di atas range.high = bull, close di bawah range.low = bear.
 * Alasan pakai close (bukan high/low): high/low candle breakout SEBENTAR
 * lalu balik (wick) terlalu sering memicu sinyal palsu; close yang
 * benar-benar menetap di luar range lebih jadi konfirmasi nyata.
 * @param {{close:number}} candle
 * @param {{high:number, low:number}} range
 * @returns {'bull'|'bear'|null} null = candle masih di dalam range (tidak breakout)
 */
export function detectBreakout(candle, range) {
  if (!range || !candle || candle.close == null) return null
  if (candle.close > range.high) return 'bull'
  if (candle.close < range.low)  return 'bear'
  return null
}

/**
 * Scan SEMUA candle SETELAH opening range, cari breakout PERTAMA (bull/bear).
 * Opsional syarat volume konfirmasi — breakout TANPA volume cukup di-skip,
 * lanjut cari breakout berikutnya (bukan langsung berhenti di candle pertama
 * yang sekadar menembus harga tanpa partisipasi volume nyata).
 * @param {{high:number, low:number, close:number, volume:number}[]} candles
 * @param {number} rangeBarCount
 * @param {{minVolumeMultiplier?:number}} [opts] - minVolumeMultiplier: candle
 *   breakout harus punya volume >= ini x rata-rata volume opening range
 *   (default 0 = tidak ada syarat volume sama sekali)
 * @returns {{direction:'bull'|'bear', barIndex:number, candle:Object, volumeRatio:(number|null)} | null}
 *   null kalau tidak ada breakout (memenuhi syarat volume kalau ada) sepanjang hari itu
 */
export function scanForFirstBreakout(candles, rangeBarCount, opts = {}) {
  const { minVolumeMultiplier = 0 } = opts
  const range = computeOpeningRange(candles, rangeBarCount)
  if (!range) return null

  const rangeBars = candles.slice(0, rangeBarCount)
  const avgRangeVolume = rangeBars.reduce((s, c) => s + (c.volume || 0), 0) / rangeBars.length

  for (let i = rangeBarCount; i < candles.length; i++) {
    const candle = candles[i]
    const direction = detectBreakout(candle, range)
    if (!direction) continue

    const volumeRatio = avgRangeVolume > 0 ? (candle.volume || 0) / avgRangeVolume : null
    if (minVolumeMultiplier > 0 && (volumeRatio === null || volumeRatio < minVolumeMultiplier)) continue

    return { direction, barIndex: i, candle, volumeRatio }
  }
  return null
}
