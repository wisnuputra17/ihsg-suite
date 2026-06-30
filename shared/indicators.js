/**
 * shared/indicators.js
 * ====================
 * Kalkulasi indikator teknikal — murni matematika.
 * Aturan ketat:
 *   - Input: array angka biasa (BUKAN raw Stockbit response)
 *   - Output: array angka (panjang sama dengan input)
 *   - TIDAK ada fetch, simpan state, atau render
 *   - Return null untuk warmup period (BUKAN 0)
 *   - Semua pakai Wilder smoothing kecuali EMA standard
 *
 * Sanitasi format Stockbit (koma, object {raw}) dilakukan di api.js,
 * bukan di sini. indicators.js hanya terima angka bersih.
 */

// ============================================================
// SEKSI 1: MOVING AVERAGES
// ============================================================

/**
 * Simple Moving Average.
 * Return null untuk i < n-1 (warmup).
 * @param {number[]} arr
 * @param {number} n - periode
 * @returns {(number|null)[]}
 */
export function calcSMA(arr, n) {
  return arr.map((_, i) => {
    if (i < n - 1) return null
    return arr.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n
  })
}

/**
 * Exponential Moving Average — standard (k = 2/(n+1)).
 * Tidak return null — EMA mulai dari index 0 dengan nilai pertama.
 * @param {number[]} arr
 * @param {number} n - periode
 * @returns {number[]}
 */
export function calcEMA(arr, n) {
  const k   = 2 / (n + 1)
  const out = new Array(arr.length).fill(null)
  if (!arr.length) return out
  // Cari index pertama yang bukan null/NaN
  let start = arr.findIndex(v => v !== null && !isNaN(v))
  if (start === -1) return out
  out[start] = arr[start]
  for (let i = start + 1; i < arr.length; i++) {
    if (arr[i] === null || isNaN(arr[i])) { out[i] = out[i - 1]; continue }
    out[i] = arr[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

/**
 * Wilder Moving Average — dipakai internal RSI & ATR.
 * k = 1/n (lebih lambat dari EMA standard).
 * @param {number[]} arr
 * @param {number} n
 * @returns {number[]}
 */
function calcWilderMA(arr, n) {
  const out = new Array(arr.length).fill(null)
  if (arr.length < n) return out
  // Seed: SMA dari n periode pertama
  let sum = 0
  for (let i = 0; i < n; i++) sum += (arr[i] || 0)
  out[n - 1] = sum / n
  for (let i = n; i < arr.length; i++) {
    out[i] = (out[i - 1] * (n - 1) + (arr[i] || 0)) / n
  }
  return out
}

// ============================================================
// SEKSI 2: RSI (Relative Strength Index)
// ============================================================

/**
 * RSI dengan Wilder smoothing.
 * Return null untuk warmup period (i <= n).
 * @param {number[]} closes
 * @param {number} n - periode (default 14)
 * @returns {(number|null)[]}
 */
export function calcRSI(closes, n = 14) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= n) return out

  // Seed: rata-rata gain/loss dari n periode pertama
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch >= 0) gain += ch; else loss -= ch
  }
  let ag = gain / n, al = loss / n
  out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)

  // Wilder smoothing untuk periode berikutnya
  for (let i = n + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    const g  = ch >= 0 ? ch : 0
    const l  = ch < 0  ? -ch : 0
    ag = (ag * (n - 1) + g) / n
    al = (al * (n - 1) + l) / n
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return out
}

// ============================================================
// SEKSI 3: ATR (Average True Range)
// ============================================================

/**
 * ATR dengan Wilder smoothing (BUKAN SMA).
 * Input: array candle {high, low, close}.
 * Return null untuk warmup period (i < n-1).
 * @param {{high:number, low:number, close:number}[]} candles
 * @param {number} n - periode (default 14)
 * @returns {(number|null)[]}
 */
export function calcATR(candles, n = 14) {
  if (candles.length < n) return new Array(candles.length).fill(null)

  // Hitung True Range per candle
  const tr = candles.map((d, i) => {
    if (i === 0) return d.high - d.low
    return Math.max(
      d.high - d.low,
      Math.abs(d.high - candles[i - 1].close),
      Math.abs(d.low  - candles[i - 1].close)
    )
  })

  const out = new Array(candles.length).fill(null)
  // Seed: SMA dari n TR pertama
  let sum = 0
  for (let i = 0; i < n; i++) sum += tr[i]
  out[n - 1] = sum / n
  // Wilder smoothing
  for (let i = n; i < candles.length; i++) {
    out[i] = (out[i - 1] * (n - 1) + tr[i]) / n
  }
  return out
}

// ============================================================
// SEKSI 4: MACD
// ============================================================

/**
 * MACD null-safe.
 * @param {number[]} closes
 * @param {number} fast   - EMA cepat (default 12)
 * @param {number} slow   - EMA lambat (default 26)
 * @param {number} signal - EMA signal (default 9)
 * @returns {{macd:(number|null)[], signal:(number|null)[], hist:(number|null)[]}}
 */
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const ema12 = calcEMA(closes, fast)
  const ema26 = calcEMA(closes, slow)

  const macd = ema12.map((v, i) =>
    (v === null || ema26[i] === null) ? null : v - ema26[i]
  )

  // EMA signal dihitung dari array macd — null diganti 0 untuk EMA seed
  const macdForEma = macd.map(v => v === null ? 0 : v)
  const sig        = calcEMA(macdForEma, signal)

  const hist = macd.map((v, i) =>
    (v === null || sig[i] === null) ? null : v - sig[i]
  )

  return { macd, signal: sig, hist }
}

// ============================================================
// SEKSI 5: BOLLINGER BANDS
// ============================================================

/**
 * Bollinger Bands.
 * @param {number[]} closes
 * @param {number} n    - periode SMA (default 20)
 * @param {number} mult - multiplier standar deviasi (default 2)
 * @returns {{upper:(number|null)[], middle:(number|null)[], lower:(number|null)[]}}
 */
export function calcBollinger(closes, n = 20, mult = 2) {
  const middle = calcSMA(closes, n)
  const upper  = new Array(closes.length).fill(null)
  const lower  = new Array(closes.length).fill(null)

  for (let i = n - 1; i < closes.length; i++) {
    const slice = closes.slice(i - n + 1, i + 1)
    const mean  = middle[i]
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
    upper[i]    = mean + mult * std
    lower[i]    = mean - mult * std
  }

  return { upper, middle, lower }
}

// ============================================================
// SEKSI 6: VWAP
// ============================================================

/**
 * VWAP (Volume Weighted Average Price) — untuk intraday.
 * Reset tiap hari baru.
 * @param {{unix:number, high:number, low:number, close:number, volume:number}[]} candles
 * @returns {number[]}
 */
export function calcVWAP(candles) {
  const out          = new Array(candles.length).fill(null)
  let cumPV          = 0
  let cumVol         = 0
  let lastDate       = null

  for (let i = 0; i < candles.length; i++) {
    const c        = candles[i]
    const dateStr  = new Date(c.unix * 1000).toISOString().slice(0, 10)

    // Reset VWAP di awal hari baru
    if (dateStr !== lastDate) {
      cumPV   = 0
      cumVol  = 0
      lastDate = dateStr
    }

    const typical = (c.high + c.low + c.close) / 3
    cumPV  += typical * c.volume
    cumVol += c.volume
    out[i]  = cumVol > 0 ? cumPV / cumVol : null
  }

  return out
}

// ============================================================
// SEKSI 7: SUPERTREND
// ============================================================

/**
 * Supertrend indicator.
 * @param {{high:number, low:number, close:number}[]} candles
 * @param {number} n    - ATR periode (default 10)
 * @param {number} mult - ATR multiplier (default 3)
 * @returns {{value:(number|null)[], direction:('up'|'down'|null)[]}
 */
export function calcSupertrend(candles, n = 10, mult = 3) {
  const atr    = calcATR(candles, n)
  const value  = new Array(candles.length).fill(null)
  const dir    = new Array(candles.length).fill(null)

  let upperBand = null, lowerBand = null
  let prevUpper = null, prevLower = null
  let prevDir   = 'up'

  for (let i = n - 1; i < candles.length; i++) {
    const c   = candles[i]
    const hl2 = (c.high + c.low) / 2
    const atrV = atr[i]

    if (atrV === null) continue

    const basicUpper = hl2 + mult * atrV
    const basicLower = hl2 - mult * atrV

    upperBand = (prevUpper === null || basicUpper < prevUpper || candles[i - 1]?.close > prevUpper)
      ? basicUpper : prevUpper
    lowerBand = (prevLower === null || basicLower > prevLower || candles[i - 1]?.close < prevLower)
      ? basicLower : prevLower

    const currDir = prevDir === 'up'
      ? (c.close < lowerBand ? 'down' : 'up')
      : (c.close > upperBand ? 'up'  : 'down')

    value[i] = currDir === 'up' ? lowerBand : upperBand
    dir[i]   = currDir

    prevUpper = upperBand
    prevLower = lowerBand
    prevDir   = currDir
  }

  return { value, direction: dir }
}

// ============================================================
// SEKSI 8: HELPER EKSTRAK DATA
// ============================================================

/**
 * Ekstrak harga IEP dari array intraday 1-menit.
 * Ambil candle jam 08:57–08:59, prioritas 08:59.
 * @param {{unix:number, close:number, volume:number}[]} minuteCandles
 * @returns {{date:string, price:number, vol:number}[]}
 */
export function extractIEP(minuteCandles) {
  const byDay = {}
  for (const c of minuteCandles) {
    const dt   = new Date(c.unix * 1000)
    const date = dt.toISOString().slice(0, 10)
    const hhmm = dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
    if (!['08:57', '08:58', '08:59'].includes(hhmm)) continue
    if (!byDay[date] || hhmm > byDay[date].hhmm) {
      byDay[date] = { hhmm, price: c.close, vol: c.volume }
    }
  }
  return Object.entries(byDay).map(([date, d]) => ({ date, price: d.price, vol: d.vol }))
}

/**
 * Agregasi candle intraday per hari → daily candle.
 * Dipakai untuk reconstruct data harian dari intraday.
 * @param {{unix:number, open:number, high:number, low:number, close:number, volume:number}[]} candles
 * @returns {{date:string, open:number, high:number, low:number, close:number, volume:number}[]}
 */
export function aggregateToDaily(candles) {
  const byDay = {}
  for (const c of candles) {
    const date = new Date(c.unix * 1000).toISOString().slice(0, 10)
    if (!byDay[date]) {
      byDay[date] = { date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      byDay[date].high   = Math.max(byDay[date].high, c.high)
      byDay[date].low    = Math.min(byDay[date].low,  c.low)
      byDay[date].close  = c.close
      byDay[date].volume += c.volume
    }
  }
  return Object.values(byDay).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
}

// ============================================================
// SEKSI 9: ENRICH DAILY — tambah semua indikator ke array daily
// ============================================================

/**
 * Enrich array daily candle dengan semua indikator teknikal.
 * Ini fungsi utama yang dipanggil koordinator setelah fetchDaily().
 *
 * Input:  [{date, open, high, low, close, volume, foreignbuy, foreignsell}]
 * Output: input + {rsi, macdHist, atr, atrPct, vmaRatio, foreignNet, returnPct}
 *
 * @param {{date:string, open:number, high:number, low:number, close:number,
 *          volume:number, foreignbuy:number, foreignsell:number}[]} days
 * @returns enriched array (mutates + returns)
 */
export function enrichDaily(days) {
  if (!days.length) return days

  const closes  = days.map(d => d.close)
  const volumes = days.map(d => d.volume)

  const rsiArr    = calcRSI(closes)
  const macdRes   = calcMACD(closes)
  const atrArr    = calcATR(days)
  const vol20     = calcSMA(volumes, 20)

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    d.rsi        = rsiArr[i]
    d.macdHist   = macdRes.hist[i]
    d.atr        = atrArr[i]
    d.atrPct     = (atrArr[i] !== null && d.close > 0) ? atrArr[i] / d.close * 100 : null
    d.vmaRatio   = (vol20[i] !== null && vol20[i] > 0) ? d.volume / vol20[i] : null
    d.foreignNet = d.foreignbuy - d.foreignsell   // positif = net buy asing
    d.returnPct  = d.open > 0 ? (d.close - d.open) / d.open * 100 : 0
  }

  return days
}

// ============================================================
// SEKSI 9: VWMA — Volume Weighted Moving Average
// ============================================================
// CATATAN: ini BUKAN VWAP asli (yang reset harian, butuh data intraday).
// VWMA adalah rata-rata harga N hari tertimbang volume, dihitung murni
// dari data harian — dipakai sebagai eksperimen pengganti MA biasa.
export function calcVWMA(closes, volumes, n = 20) {
  const out = new Array(closes.length).fill(null)
  for (let i = n - 1; i < closes.length; i++) {
    const cSlice = closes.slice(i - n + 1, i + 1)
    const vSlice = volumes.slice(i - n + 1, i + 1)
    const totalV = vSlice.reduce((s, v) => s + v, 0)
    if (totalV === 0) continue
    const weighted = cSlice.reduce((s, c, j) => s + c * vSlice[j], 0)
    out[i] = weighted / totalV
  }
  return out
}

// ============================================================
// SEKSI 10: VOLUME PROFILE / POC (Point of Control)
// ============================================================
// Rolling window: bagi rentang high-low jadi `bins` bucket harga, akumulasi
// volume per bucket, POC = harga tengah bucket dengan volume terbanyak.
export function calcVolumeProfilePOC(candles, window = 60, bins = 20) {
  const out = new Array(candles.length).fill(null)
  for (let i = window; i < candles.length; i++) {
    const slice = candles.slice(i - window, i)
    const lo = Math.min(...slice.map(d => d.low))
    const hi = Math.max(...slice.map(d => d.high))
    if (hi === lo) continue
    const bucketSize = (hi - lo) / bins
    const volPerBucket = new Array(bins).fill(0)
    slice.forEach(d => {
      const mid = (d.high + d.low) / 2
      const b = Math.min(bins - 1, Math.floor((mid - lo) / bucketSize))
      volPerBucket[b] += d.volume
    })
    const maxBucket = volPerBucket.indexOf(Math.max(...volPerBucket))
    out[i] = lo + (maxBucket + 0.5) * bucketSize
  }
  return out
}

// ============================================================
// SEKSI 11: RSI DIVERGENCE (bullish) — deteksi via swing low
// ============================================================
// Swing low = titik dengan close terendah dalam window simetris.
// Bullish divergence = harga bikin lower-low DIBANDING swing low
// sebelumnya, tapi RSI di titik itu justru lebih TINGGI (higher-low).
// Sinyal langka secara alami (saham trending kuat jarang divergence).
export function calcRSIDivergence(closes, rsiArr, swingWindow = 3) {
  const n = closes.length
  const flags = new Array(n).fill(false)

  const swingLows = []
  for (let i = swingWindow; i < n - swingWindow; i++) {
    const slice = closes.slice(i - swingWindow, i + swingWindow + 1)
    if (closes[i] === Math.min(...slice)) swingLows.push(i)
  }

  for (let j = 1; j < swingLows.length; j++) {
    const iPrev = swingLows[j - 1]
    const iCurr = swingLows[j]
    if (rsiArr[iPrev] == null || rsiArr[iCurr] == null) continue
    const priceLowerLow = closes[iCurr] < closes[iPrev]
    const rsiHigherLow  = rsiArr[iCurr] > rsiArr[iPrev]
    if (priceLowerLow && rsiHigherLow) flags[iCurr] = true
  }

  return flags
}

// ============================================================
// SEKSI 12: CONNORS RSI
// ============================================================
// Gabungan 3 komponen: RSI harga (periode pendek), RSI dari streak
// (berapa hari berturut naik/turun), dan percent rank perubahan 1-hari
// terhadap window historis. Didesain untuk mengurangi cluster sinyal
// dibanding RSI standar (lebih banyak sinyal independen, bukan numpuk
// beberapa hari berturut).
function _streakSeries(closes) {
  const n = closes.length
  const streak = new Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) streak[i] = streak[i - 1] > 0 ? streak[i - 1] + 1 : 1
    else if (closes[i] < closes[i - 1]) streak[i] = streak[i - 1] < 0 ? streak[i - 1] - 1 : -1
    else streak[i] = 0
  }
  return streak
}

function _percentRankSeries(closes, period = 100) {
  const n = closes.length
  const pctChange = new Array(n).fill(null)
  for (let i = 1; i < n; i++) {
    if (closes[i - 1] !== 0) pctChange[i] = (closes[i] - closes[i - 1]) / closes[i - 1] * 100
  }
  const rank = new Array(n).fill(null)
  for (let i = period; i < n; i++) {
    const window = []
    for (let j = i - period + 1; j <= i; j++) {
      if (pctChange[j] != null) window.push(pctChange[j])
    }
    if (!window.length) continue
    const below = window.filter(x => x < pctChange[i]).length
    rank[i] = below / window.length * 100
  }
  return rank
}

export function calcConnorsRSI(closes, rsiPeriod = 3, streakPeriod = 2, rankPeriod = 100) {
  const rsiPrice = calcRSI(closes, rsiPeriod)
  const streak = _streakSeries(closes)
  const rsiStreak = calcRSI(streak.map(Number), streakPeriod)
  const pctRank = _percentRankSeries(closes, rankPeriod)

  const n = closes.length
  const out = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (rsiPrice[i] != null && rsiStreak[i] != null && pctRank[i] != null) {
      out[i] = (rsiPrice[i] + rsiStreak[i] + pctRank[i]) / 3
    }
  }
  return out
}




