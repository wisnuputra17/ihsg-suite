/**
 * shared/watchlist-h1.js
 * ========================
 * Watchlist H-1 — scoring saham "layak dipantau besok" murni dari data
 * H-1 (kemarin), TANPA butuh data hari ini sama sekali (beda dari Gap/IEP
 * Surge yang butuh harga pra-pembukaan hari ini). Bisa dihitung MALAM
 * SEBELUMNYA, sebelum market besok buka sama sekali — itu tujuan utamanya:
 * lapisan PERTAMA dari arsitektur 2-lapis ("siapa dipantau" H-1 + "kapan
 * masuk" trigger real-time/ORB-VWAP, lihat shared/orb.js & vwap-signal.js).
 *
 * SINYAL yang dipakai SENGAJA di-reuse PERSIS dari 7 (dari 16) kondisi
 * Ranking Emiten yang murni H-1 (lihat features/ranking-emiten/engine.js
 * CONDITIONS) — BUKAN ambang batas baru yang dikarang sendiri. 9 kondisi
 * lain Ranking Emiten (IEP Surge, Gap Up, kombinasi yang melibatkan itu)
 * SENGAJA TIDAK dipakai di sini krn butuh data hari ini (IEP/p0902).
 *
 * @typedef {Object} H1Row
 * @property {number} atrPct      - ATR% H-1 (ATR / close * 100)
 * @property {number} atrRatio    - ATR H-1 / rata-rata ATR beberapa hari sebelumnya
 * @property {number} rsi         - RSI H-1
 * @property {number} macdHist    - MACD histogram H-1
 * @property {number} vmaRatio    - Volume H-1 / MA volume
 * @property {number} foreignNet  - Net asing H-1 (+ = net beli)
 * @property {('up'|'down'|'flat')} ihsgH1Trend - tren IHSG H-1
 *
 * ⚠️ BELUM PERNAH dites Wisnu dgn data pasar nyata — ini fondasi logic+test
 * (dikerjakan dlm "Mode Bakar Token"), BUKAN hasil analisis pasar yang
 * sudah divalidasi/dikalibrasi. Kombinasi sinyal & threshold "berapa skor
 * dianggap layak dipantau" PERLU dikalibrasi Wisnu dgn data nyata sebelum
 * dipercaya sbg basis keputusan.
 */

/**
 * 7 sinyal H-1 murni — REUSE definisi & threshold PERSIS dari
 * features/ranking-emiten/engine.js CONDITIONS (yg tidak butuh data hari ini).
 */
export const H1_SIGNALS = [
  { name: 'ATR% H-1 > 1%',      f: r => r.atrPct > 1 },
  { name: 'ATR Ratio > 1.5x',   f: r => r.atrRatio > 1.5 },
  { name: 'RSI H-1 < 40',       f: r => r.rsi < 40 },
  { name: 'MACD Hist H-1 > 0',  f: r => r.macdHist > 0 },
  { name: 'Vol/MA H-1 >= 1.5x', f: r => r.vmaRatio >= 1.5 },
  { name: 'Foreign Net H-1 +',  f: r => r.foreignNet > 0 },
  { name: 'IHSG H-1 Naik',      f: r => r.ihsgH1Trend === 'up' }
]

/**
 * Hitung skor 1 saham — berapa dari 7 sinyal H-1 yang TERPENUHI.
 * Sinyal dgn field yang null/undefined/NaN dianggap TIDAK terpenuhi (bukan
 * error) — data H-1 yang belum lengkap (mis. ATR masih warmup) tidak
 * menggagalkan penilaian sinyal LAIN yang datanya sudah ada.
 * @param {H1Row} row
 * @returns {{score:number, total:number, matched:string[]}}
 */
export function scoreH1Watchlist(row) {
  const matched = []
  for (const sig of H1_SIGNALS) {
    let ok = false
    try { ok = !!sig.f(row) } catch (_) { ok = false }
    if (ok) matched.push(sig.name)
  }
  return { score: matched.length, total: H1_SIGNALS.length, matched }
}

/**
 * Ranking BANYAK saham berdasar skor H-1 — descending (skor tertinggi dulu).
 * Tie-break: ATR Ratio lebih tinggi menang (proxy "lebih layak dipantau"
 * di antara skor yg sama) -- BUKAN aturan baku, cuma tie-break yang masuk
 * akal, BOLEH diganti kalau Wisnu punya preferensi tie-break lain.
 * @param {Object<string,H1Row>} rowsBySym - {sym: H1Row}
 * @param {number} [minScore] - cuma sertakan saham dgn score >= ini (default 0 = semua)
 * @returns {{sym:string, score:number, total:number, matched:string[]}[]}
 */
export function rankWatchlistCandidates(rowsBySym, minScore = 0) {
  const results = Object.entries(rowsBySym).map(([sym, row]) => ({
    sym, ...scoreH1Watchlist(row), _atrRatio: row.atrRatio ?? -Infinity
  }))
  return results
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score || b._atrRatio - a._atrRatio)
    .map(({ _atrRatio, ...rest }) => rest) // buang field internal tie-break dari output
}
