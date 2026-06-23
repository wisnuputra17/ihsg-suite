/**
 * features/winrate/engine.js
 * ===========================
 * Kalkulasi Win Rate Scanner — murni matematika.
 * Aturan ketat (sama seperti shared/indicators.js):
 *   - TIDAK ada fetch, simpan state, atau render
 *   - Semua fungsi pure, mudah ditest
 *
 * ⚠️ ASUMSI DESAIN YANG PERLU DIKONFIRMASI WISNU — lihat HANDOFF/chat:
 *   1. "IEP surge" dan "Gap" digabung jadi 1 metrik (Gap = IEP vs close kemarin, %).
 *      Spek asli menyebut keduanya terpisah tapi tidak ada definisi beda yang jelas.
 *   2. ATR diperlakukan sebagai filter terpisah, BUKAN bagian dari 27 kondisi.
 *      27 kondisi = 3 (Gap) x 3 (RSI) x 3 (MACD histogram %).
 *   3. RSI & MACD histogram yang dipakai untuk klasifikasi adalah nilai HARI
 *      SEBELUMNYA (d-1) — karena saat entry pagi (09:02), indikator HARI INI
 *      belum kebentuk (candle harian belum close).
 *   4. Entry = harga jam 09:02 (p0902), BUKAN IEP murni — IEP tidak realistis
 *      dieksekusi (baru ketahuan tepat saat lelang pra-pembukaan selesai).
 *   5. 9 exit time: 09:05,09:10,09:20,09:35,10:00,10:30,11:30,13:30,16:00
 *      (lebih rapat di awal utk scalping, 13:30 = buka lagi setelah istirahat siang IDX)
 *
 * Kalau definisi di atas tidak sesuai maksud Wisnu, GANTI di sini saja —
 * runBacktest() & UI di atasnya tidak perlu diubah strukturnya.
 */

export const ENTRY_KEY = 'p0902'
export const EXIT_KEYS = ['p0905', 'p0910', 'p0920', 'p0935', 'p1000', 'p1030', 'p1130', 'p1330', 'p1600']

// ============================================================
// SEKSI 1: BAND KLASIFIKASI (3 level per dimensi)
// ============================================================

const GAP_BANDS = [
  { id: 'turun',  label: 'Gap Turun',     test: v => v < 0 },
  { id: 'netral', label: 'Gap Netral',    test: v => v >= 0 && v < 3 },
  { id: 'kuat',   label: 'Gap Naik Kuat', test: v => v >= 3 }
]
const RSI_BANDS = [
  { id: 'oversold',   label: 'RSI Oversold',   test: v => v < 30 },
  { id: 'netral',     label: 'RSI Netral',     test: v => v >= 30 && v <= 70 },
  { id: 'overbought', label: 'RSI Overbought', test: v => v > 70 }
]
const MACD_BANDS = [
  { id: 'negatif', label: 'MACD Negatif', test: v => v < -0.2 },
  { id: 'netral',  label: 'MACD Netral',  test: v => v >= -0.2 && v <= 0.2 },
  { id: 'positif', label: 'MACD Positif', test: v => v > 0.2 }
]

function classifyBand(bands, v) {
  if (v === null || v === undefined || isNaN(v)) return null
  return bands.find(b => b.test(v)) || null
}

// ============================================================
// SEKSI 2: KLASIFIKASI KONDISI (27 total)
// ============================================================

/**
 * Klasifikasi 1 hari entry ke salah satu dari 27 kondisi.
 * @param {number} gapPct       - (IEP - closeKemarin) / closeKemarin * 100
 * @param {number} rsi          - RSI HARI SEBELUMNYA
 * @param {number} macdHistPct  - MACD histogram HARI SEBELUMNYA, dinormalisasi (hist/close*100)
 * @returns {{id:string, label:string} | null} null kalau ada data warmup/kosong
 */
export function classifyCondition(gapPct, rsi, macdHistPct) {
  const gap = classifyBand(GAP_BANDS, gapPct)
  const r   = classifyBand(RSI_BANDS, rsi)
  const m   = classifyBand(MACD_BANDS, macdHistPct)
  if (!gap || !r || !m) return null
  return { id: `${gap.id}|${r.id}|${m.id}`, label: `${gap.label} + ${r.label} + ${m.label}` }
}

/** Daftar semua 27 kondisi (dipakai untuk inisialisasi matrix hasil & render UI). */
export function allConditionIds() {
  const out = []
  for (const g of GAP_BANDS) {
    for (const r of RSI_BANDS) {
      for (const m of MACD_BANDS) {
        out.push({ id: `${g.id}|${r.id}|${m.id}`, label: `${g.label} + ${r.label} + ${m.label}` })
      }
    }
  }
  return out
}

// ============================================================
// SEKSI 3: SIMULASI 1 TRADE
// ============================================================

/**
 * Simulasi 1 trade: entry di ENTRY_KEY, exit di exitKey.
 * MaxDD dihitung dari titik TERENDAH yang tercatat di antara entry s.d. exit
 * (bukan cuma harga exit) — butuh semua snapshot intraday, bukan cuma 9 exit point.
 * @param {Object} intraday - {p0902:price, p0905:price, ...} untuk 1 hari
 * @param {string} exitKey
 * @returns {{entryPrice:number, exitPrice:number, returnPct:number, maxDDPct:number} | null}
 */
export function simulateTrade(intraday, exitKey) {
  const entryPrice = intraday[ENTRY_KEY]
  const exitPrice  = intraday[exitKey]
  if (!entryPrice || !exitPrice) return null

  const allKeys  = Object.keys(intraday).filter(k => /^p\d{4}$/.test(k)).sort()
  const entryIdx = allKeys.indexOf(ENTRY_KEY)
  const exitIdx  = allKeys.indexOf(exitKey)
  if (entryIdx === -1 || exitIdx === -1 || exitIdx < entryIdx) return null

  let minPrice = entryPrice
  for (let i = entryIdx; i <= exitIdx; i++) {
    const p = intraday[allKeys[i]]
    if (p !== null && p !== undefined && p < minPrice) minPrice = p
  }

  return {
    entryPrice,
    exitPrice,
    returnPct: (exitPrice - entryPrice) / entryPrice * 100,
    maxDDPct:  (minPrice - entryPrice) / entryPrice * 100 // selalu <= 0
  }
}

// ============================================================
// SEKSI 4: BACKTEST 1 SIMBOL — agregat WinRate/AvgReturn/MaxRet/MaxDD
// ============================================================

/**
 * Backtest 1 simbol penuh: loop semua hari historis, klasifikasi kondisi
 * pakai data SEBELUM entry, simulasi trade utk semua 9 exit time.
 * @param {Object} emitenData
 * @param {{date:string, close:number, rsi:(number|null), macdHist:(number|null), atr:(number|null)}[]} emitenData.daily - hasil enrichDaily()
 * @param {Object<string,Object>} emitenData.intraday - {date: {p0902:price, ...}}
 * @param {{date:string, price:number}[]} emitenData.iep - hasil extractIEP()
 * @returns {Object} matrix[conditionId] = {label, [exitKey]: {n,wins,winRate,avgReturn,maxRet,maxDD}}
 */
export function runBacktest({ daily, intraday, iep }) {
  const iepByDate = {}
  for (const e of iep) iepByDate[e.date] = e.price

  const matrix = {}
  for (const cond of allConditionIds()) {
    matrix[cond.id] = { label: cond.label }
    for (const exitKey of EXIT_KEYS) {
      matrix[cond.id][exitKey] = { n: 0, wins: 0, sumReturn: 0, maxRet: null, maxDD: 0 }
    }
  }

  for (let i = 1; i < daily.length; i++) {
    const today = daily[i]
    const prev  = daily[i - 1]
    const iepPrice = iepByDate[today.date]
    const todayIntraday = intraday[today.date]
    if (!iepPrice || !todayIntraday || prev.close === null || prev.close === undefined || prev.close <= 0) continue

    const gapPct = (iepPrice - prev.close) / prev.close * 100
    const macdHistPct = (prev.macdHist !== null && prev.macdHist !== undefined && prev.close > 0)
      ? prev.macdHist / prev.close * 100 : null
    const cond = classifyCondition(gapPct, prev.rsi, macdHistPct)
    if (!cond) continue

    for (const exitKey of EXIT_KEYS) {
      const trade = simulateTrade(todayIntraday, exitKey)
      if (!trade) continue
      const cell = matrix[cond.id][exitKey]
      cell.n++
      if (trade.returnPct > 0) cell.wins++
      cell.sumReturn += trade.returnPct
      cell.maxRet = cell.maxRet === null ? trade.returnPct : Math.max(cell.maxRet, trade.returnPct)
      cell.maxDD  = Math.min(cell.maxDD, trade.maxDDPct)
    }
  }

  for (const condId in matrix) {
    for (const exitKey of EXIT_KEYS) {
      const cell = matrix[condId][exitKey]
      cell.winRate   = cell.n > 0 ? (cell.wins / cell.n * 100) : null
      cell.avgReturn = cell.n > 0 ? (cell.sumReturn / cell.n) : null
      cell.maxDD     = cell.n > 0 ? cell.maxDD : null
      delete cell.sumReturn
    }
  }

  return matrix
}
