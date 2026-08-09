/**
 * Deteksi "tanda tangan bot" dari running-trade.
 *
 * KONSEP (Wisnu): market maker pakai bot yg memecah order jadi ukuran lot
 * IDENTIK berulang, dieksekusi AGRESIF (buy=angkat harga / sell=tekan).
 * Tiap ukuran-lot yg berulang-agresif = 1 kandidat bot. Lacak volume kumulatif
 * tiap bot → garis: naik=akumulasi, turun=distribusi.
 *
 * Auditable: tiap garis bisa ditelusuri ke transaksi individualnya. Kebalikan
 * dari LPM kotak-hitam.
 *
 * Definisi terkunci (dikonfirmasi Wisnu):
 * - "konsisten" = lot IDENTIK berulang (bukan rentang, bukan group_order)
 * - filter = agresif DAN lot berulang (irisan)
 * - output = volume kumulatif per (lot, sisi), sbg deret garis
 *
 * Semua fungsi murni.
 */

/**
 * Kelompokkan transaksi per (ukuran lot × sisi), hitung frekuensi.
 * @param {Array} trades - [{lot, action:'buy'|'sell', time, value}]
 * @returns {Array} [{lot, action, count, totalLot, totalValue}] desc by count
 */
export function lotSignatures(trades) {
  const map = new Map()
  for (const t of trades) {
    const lot = +t.lot || 0
    if (!lot || (t.action !== 'buy' && t.action !== 'sell')) continue
    const key = `${lot}|${t.action}`
    const cur = map.get(key) || { lot, action: t.action, count: 0, totalLot: 0, totalValue: 0 }
    cur.count++
    cur.totalLot += lot
    cur.totalValue += (t.value?.raw ?? t.value ?? lot * (+t.price || 0) * 100) || 0
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/**
 * Kandidat bot: signature yg berulang >= minRepeat kali.
 * Ritel jarang eksekusi ukuran identik berkali-kali agresif.
 */
export function detectBots(trades, minRepeat = 5) {
  return lotSignatures(trades).filter(s => s.count >= minRepeat)
}

/**
 * Deret volume KUMULATIF utk 1 bot (lot+action tertentu) sepanjang waktu.
 * Untuk grafik garis. Waktu naik → kumulatif naik.
 * @returns {Array} [{time, cumVolume, cumValue, n}]
 */
export function botCumulative(trades, lot, action) {
  const rows = trades
    .filter(t => (+t.lot || 0) === lot && t.action === action)
    .sort((a, b) => (a.time > b.time ? 1 : -1))
  let cumV = 0, cumVal = 0, n = 0
  return rows.map(t => {
    cumV += lot
    cumVal += (t.value?.raw ?? t.value ?? lot * (+t.price || 0) * 100) || 0
    n++
    return { time: t.time, cumVolume: cumV, cumValue: cumVal, n }
  })
}

/**
 * Ringkasan semua bot terdeteksi + deret kumulatifnya (utk multi-garis).
 * @returns {Array} [{lot, action, count, totalLot, series:[{time,cumVolume}]}]
 */
export function botSeries(trades, minRepeat = 5) {
  return detectBots(trades, minRepeat).map(b => ({
    ...b,
    series: botCumulative(trades, b.lot, b.action),
  }))
}

/** Net arah 1 bot: totalLot buy − totalLot sell utk ukuran lot yg sama. */
export function botNetDirection(trades, lot) {
  const buy = trades.filter(t => (+t.lot||0) === lot && t.action === 'buy').length * lot
  const sell = trades.filter(t => (+t.lot||0) === lot && t.action === 'sell').length * lot
  return { lot, buyVol: buy, sellVol: sell, net: buy - sell,
           bias: buy > sell ? 'akumulasi' : sell > buy ? 'distribusi' : 'netral' }
}
