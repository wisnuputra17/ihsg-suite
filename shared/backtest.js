/**
 * shared/backtest.js
 * ==================
 * Pure functions untuk kalkulasi backtest intraday.
 * Tidak ada fetch/render/state — semua input lewat parameter.
 * Bisa di-test dengan node --test.
 */

/**
 * Hitung Wilson Lower Bound (WLB) untuk win rate.
 * Lebih akurat dari win rate mentah untuk sample kecil.
 * @param {number} wins - jumlah trade profit
 * @param {number} n    - total trade
 * @param {number} z    - confidence level (default 1.96 = 95%)
 * @returns {number} WLB antara 0-1
 */
export function wilsonLowerBound(wins, n, z = 1.96) {
  if (n === 0) return 0
  const p = wins / n
  const dd = 1 + z * z / n
  const cc = p + z * z / (2 * n)
  return (cc - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / dd
}

/**
 * Hitung equity curve compounded dari array return (%).
 * @param {number[]} rets   - array return per trade dalam %
 * @param {number}   fee    - fee per round-trip dalam % (default 0.26)
 * @param {number}   modal  - modal awal (default 100)
 * @returns {{ eq: number, mdd: number, peak: number }}
 */
export function calcEquity(rets, fee = 0.26, modal = 100) {
  let eq = modal, peak = modal, mdd = 0
  for (const r of rets) {
    eq *= (1 + (r - fee) / 100)
    peak = Math.max(peak, eq)
    mdd  = Math.max(mdd, (peak - eq) / peak * 100)
  }
  return { eq, mdd, peak }
}

/**
 * Klasifikasi IEP gap terhadap prev close.
 * @param {number} iepPrice
 * @param {number} prevClose
 * @param {number} threshold - default 0.5%
 * @returns {'UP'|'DOWN'|'STABIL'}
 */
export function classifyGap(iepPrice, prevClose, threshold = 0.5) {
  if (!iepPrice || !prevClose) return 'STABIL'
  const pct = (iepPrice - prevClose) / prevClose * 100
  if (pct >  threshold) return 'UP'
  if (pct < -threshold) return 'DOWN'
  return 'STABIL'
}

/**
 * Hitung return sesi 2 (entry jam X, exit jam Y).
 * @param {Array}  candles   - candles 1m/5m dengan field datetime, open, close
 * @param {string} entryTime - jam entry, format 'HH:MM'
 * @param {string} exitTime  - jam exit, format 'HH:MM'
 * @returns {number|null} return % atau null kalau data tidak cukup
 */
export function calcSesi2Return(candles, entryTime, exitTime) {
  const sorted = [...candles].sort((a, b) => a.datetime < b.datetime ? -1 : 1)
  if (!sorted.length) return null

  // Jadwal IDX: Jumat sesi 2 mulai 14:00 (Senin–Kamis 13:30)
  const dateStr  = sorted[0].datetime.slice(0, 10)
  const isFriday = new Date(dateStr + 'T07:00:00Z').getUTCDay() === 5
  const effEntry = (isFriday && entryTime < '14:00') ? '14:00' : entryTime

  const entryC = sorted.find(c => c.datetime.slice(11, 16) >= effEntry)
  const exitCs  = sorted.filter(c => c.datetime.slice(11, 16) <= exitTime)
  if (!entryC || !exitCs.length) return null

  // Guard: entry candle tidak boleh nyasar >30 menit dari target
  const [th, tm] = effEntry.split(':').map(Number)
  const [eh, em] = entryC.datetime.slice(11, 16).split(':').map(Number)
  if ((eh * 60 + em) - (th * 60 + tm) > 30) return null

  const exitC = exitCs[exitCs.length - 1]
  if (!entryC.open || !exitC.close) return null
  if (exitC.datetime <= entryC.datetime) return null
  return (exitC.close - entryC.open) / entryC.open * 100
}

/**
 * Simulasi backtest ORB intraday.
 * @param {Object} params
 * @param {Array}  params.candles      - semua candle (1m), field: datetime, open, high, low, close
 * @param {number} params.gapThreshold - threshold gap IEP (%)
 * @param {string} params.orbDeadline  - deadline ORB, format 'HH:MM'
 * @param {string} params.exitOrb      - jam exit kalau ORB confirmed
 * @param {string} params.exitAvoid    - jam exit kalau AVOID
 * @param {number} [params.slPct]      - stop loss % dari entry (opsional)
 * @param {number} [params.fee]        - fee round-trip % (default 0.26)
 * @returns {{ trades: Array, eq: number, mdd: number, wlb: number }}
 */
export function backtestORB({
  candles, gapThreshold = 0.5, orbDeadline = '09:15',
  exitOrb = '10:00', exitAvoid = '09:15',
  slPct = null, fee = 0.26
}) {
  // Kelompokkan per hari
  const byDate = {}
  for (const c of candles) {
    const d = c.datetime.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(c)
  }

  const dates = Object.keys(byDate).sort()
  const trades = []

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i]
    const prevDate = dates[i - 1]
    const day  = [...byDate[date]].sort((a, b) => a.datetime < b.datetime ? -1 : 1)
    const prev = [...byDate[prevDate]].sort((a, b) => a.datetime < b.datetime ? -1 : 1)

    // Prev close
    const prevCandles = prev.filter(c => c.datetime.slice(11, 16) <= '15:50')
    const prevClose = prevCandles.length ? prevCandles[prevCandles.length - 1].close : null
    if (!prevClose) continue

    // IEP
    const iepCandles = day.filter(c => c.datetime.slice(11, 16) >= '08:45' && c.datetime.slice(11, 16) <= '08:59')
    if (!iepCandles.length) continue
    const iepPrice = iepCandles[iepCandles.length - 1].close

    // Gap classification
    const gap = classifyGap(iepPrice, prevClose, gapThreshold)
    if (gap === 'STABIL') continue

    // Entry = open 09:00
    const open9 = day.find(c => c.datetime.slice(11, 16) === '09:00')
    if (!open9) continue
    const entry = open9.open

    // ORB range 09:00-09:04
    const orbCandles = day.filter(c => c.datetime.slice(11, 16) >= '09:00' && c.datetime.slice(11, 16) <= '09:04')
    if (!orbCandles.length) continue
    const orbHigh = Math.max(...orbCandles.map(c => c.high))

    // SL level
    const slLevel = slPct ? entry * (1 - slPct / 100) : null

    // Scan 09:05 sampai deadline
    const postOrb = day.filter(c => c.datetime.slice(11, 16) >= '09:05' && c.datetime.slice(11, 16) < orbDeadline)
    let slHit = false, orbBroken = false

    for (const c of postOrb) {
      if (slLevel && !slHit && c.low <= slLevel) { slHit = true; break }
      if (c.close > orbHigh) { orbBroken = true; break }
    }

    // Tentukan exit price
    let exitPrice = null, type = 'av'
    if (slHit) {
      exitPrice = slLevel; type = 'sl'
    } else if (orbBroken) {
      const exitCandle = day.filter(c => c.datetime.slice(11, 16) <= exitOrb)
      exitPrice = exitCandle.length ? exitCandle[exitCandle.length - 1].close : null
      type = 'orb'
    } else {
      const exitCandle = day.filter(c => c.datetime.slice(11, 16) <= exitAvoid)
      exitPrice = exitCandle.length ? exitCandle[exitCandle.length - 1].close : null
      type = 'av'
    }

    if (!exitPrice) continue
    const ret = (exitPrice - entry) / entry * 100
    trades.push({ date, gap, type, ret, entry, exitPrice })
  }

  const rets  = trades.map(t => t.ret)
  const wins  = trades.filter(t => t.ret > 0).length
  const { eq, mdd } = calcEquity(rets, fee)
  const wlb   = wilsonLowerBound(wins, trades.length)

  return { trades, eq, mdd, wlb, wins, n: trades.length }
}
