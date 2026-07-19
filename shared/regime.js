/**
 * shared/regime.js
 * ================
 * Analisa "market regime": tren IHSG, tren sektor, dan kekuatan relatif
 * sektor terhadap IHSG. Semua pure function — input array close, output
 * klasifikasi. Sumber data: fetchDaily('IHSG'/'IDXENERGY'/dst) — index
 * IDX bisa di-fetch lewat endpoint chartbit yang sama seperti saham.
 */

/** Simple moving average pada index i (butuh i >= period-1). */
function _sma(closes, i, period) {
  if (i < period - 1) return null
  let s = 0
  for (let j = i - period + 1; j <= i; j++) s += closes[j]
  return s / period
}

/**
 * Klasifikasi tren dari posisi close vs MA20 & MA50.
 * UPTREND   : close > MA20 > MA50
 * DOWNTREND : close < MA20 < MA50
 * SIDEWAYS  : selain itu
 * @returns {'UPTREND'|'DOWNTREND'|'SIDEWAYS'|null}
 */
export function classifyTrend(closes, i = closes.length - 1) {
  const c = closes[i]
  const ma20 = _sma(closes, i, 20)
  const ma50 = _sma(closes, i, 50)
  if (c == null || ma20 == null || ma50 == null) return null
  if (c > ma20 && ma20 > ma50) return 'UPTREND'
  if (c < ma20 && ma20 < ma50) return 'DOWNTREND'
  return 'SIDEWAYS'
}

/**
 * Momentum % : perubahan close selama `lookback` hari.
 */
export function momentum(closes, lookback = 20, i = closes.length - 1) {
  if (i < lookback) return null
  const past = closes[i - lookback]
  return past ? (closes[i] - past) / past * 100 : null
}

/**
 * Kekuatan relatif sektor vs benchmark (IHSG).
 * Rasio dinormalisasi ke basis pertama = 100; naik = sektor outperform.
 * @returns {{ratio:number, rs:'OUTPERFORM'|'INLINE'|'UNDERPERFORM'}|null}
 */
export function relativeStrength(sectorCloses, benchCloses, lookback = 20, i = null) {
  const n = Math.min(sectorCloses.length, benchCloses.length)
  if (i == null) i = n - 1
  if (i < lookback) return null
  const rNow  = sectorCloses[i] / benchCloses[i]
  const rPast = sectorCloses[i - lookback] / benchCloses[i - lookback]
  if (!rPast) return null
  const chg = (rNow - rPast) / rPast * 100
  const rs = chg > 2 ? 'OUTPERFORM' : chg < -2 ? 'UNDERPERFORM' : 'INLINE'
  return { ratio: +chg.toFixed(2), rs }
}

/**
 * Skor regime gabungan untuk keputusan trading (0-100).
 * Menggabungkan tren IHSG, tren sektor, dan RS sektor.
 * >=66 hijau (kondusif), 33-65 kuning (hati-hati), <33 merah (defensif).
 */
export function regimeScore(ihsgTrend, sectorTrend, rs) {
  let s = 50
  const tScore = { UPTREND: +25, SIDEWAYS: 0, DOWNTREND: -25 }
  s += tScore[ihsgTrend] ?? 0
  s += (tScore[sectorTrend] ?? 0) * 0.6
  if (rs === 'OUTPERFORM') s += 10
  else if (rs === 'UNDERPERFORM') s -= 10
  return Math.max(0, Math.min(100, Math.round(s)))
}

/** Label + warna dari skor regime. */
export function regimeLabel(score) {
  if (score >= 66) return { label: 'KONDUSIF', color: 'live', emoji: '🟢' }
  if (score >= 33) return { label: 'HATI-HATI', color: 'wait', emoji: '🟡' }
  return { label: 'DEFENSIF', color: 'down', emoji: '🔴' }
}

// Mapping emiten → indeks sektor IDX-IC (untuk konteks per saham).
export const SECTOR_MAP = {
  RAJA: 'IDXENERGY', DEWA: 'IDXENERGY', ADMR: 'IDXENERGY', ADRO: 'IDXENERGY', PGAS: 'IDXENERGY',
  MBMA: 'IDXBASIC', TPIA: 'IDXBASIC', ANTM: 'IDXBASIC', INCO: 'IDXBASIC', AMMN: 'IDXBASIC',
  BBCA: 'IDXFINANCE', BBRI: 'IDXFINANCE', BMRI: 'IDXFINANCE', BBNI: 'IDXFINANCE',
  BUVA: 'IDXCYCLIC', ACES: 'IDXCYCLIC',
  TLKM: 'IDXINFRA', TOWR: 'IDXINFRA',
  GOTO: 'IDXTECHNO', BUKA: 'IDXTECHNO',
}

// Daftar indeks sektor IDX-IC (semua terverifikasi ada di Stockbit).
export const SECTOR_INDICES = [
  ['IDXENERGY',  'Energi'],
  ['IDXBASIC',   'Basic Materials'],
  ['IDXINDUST',  'Industrials'],
  ['IDXCYCLIC',  'Consumer Cyclicals'],
  ['IDXNONCYC',  'Consumer Non-Cyclicals'],
  ['IDXHEALTH',  'Healthcare'],
  ['IDXFINANCE', 'Financials'],
  ['IDXPROPERT', 'Properties & Real Estate'],
  ['IDXTECHNO',  'Technology'],
  ['IDXINFRA',   'Infrastructure'],
  ['IDXTRANS',   'Transportation & Logistics'],
]
