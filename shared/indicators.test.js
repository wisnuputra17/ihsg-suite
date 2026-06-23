/**
 * shared/indicators.test.js
 * ==========================
 * Test untuk kalkulasi indikator teknikal. SEMUA nilai referensi di file ini
 * (RSI/ATR/MACD/Bollinger/Supertrend) dihitung dulu secara INDEPENDEN (Python,
 * formula Wilder standar) lalu dicross-check cocok dengan implementasi JS
 * sebelum dijadikan fixture di sini — bukan sekadar "salin balik" rumus JS-nya.
 * Tujuannya: kalau suatu saat ada yang tidak sengaja mengubah implementasi
 * (misal salah index, salah periode smoothing), test ini gagal walau
 * perubahannya kelihatan kecil/tidak disengaja.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcSMA, calcEMA, calcRSI, calcATR, calcMACD, calcBollinger,
  calcVWAP, calcSupertrend, extractIEP, aggregateToDaily, enrichDaily
} from './indicators.js'

const EPS = 1e-6
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < EPS, msg || `${a} !== ${b}`)

// Dataset 30 hari, dipakai bersama RSI/ATR/MACD/Bollinger/Supertrend.
// high = close+8, low = close-8 (deterministik, selaras dengan referensi Python).
const CLOSES = [1000,1010,1005,1020,1015,1030,1025,1040,1035,1050,
                1045,1030,1020,1010,1000, 990, 985, 995,1005,1015,
                1010,1025,1030,1020,1015,1030,1040,1035,1050,1060]
const CANDLES = CLOSES.map((c, i) => ({
  open: i > 0 ? CLOSES[i - 1] : c, high: c + 8, low: c - 8, close: c
}))

// ============================================================
// calcSMA
// ============================================================

test('calcSMA: null selama warmup (i < n-1), nilai benar setelahnya', () => {
  const arr = [1, 2, 3, 4, 5]
  const sma = calcSMA(arr, 3)
  assert.deepEqual(sma.slice(0, 2), [null, null])
  close(sma[2], 2)   // (1+2+3)/3
  close(sma[3], 3)   // (2+3+4)/3
  close(sma[4], 4)   // (3+4+5)/3
})

// ============================================================
// calcEMA
// ============================================================

test('calcEMA: mulai dari index pertama yang bukan null/NaN', () => {
  const ema = calcEMA([null, null, 10, 20], 3)
  assert.equal(ema[0], null)
  assert.equal(ema[1], null)
  close(ema[2], 10) // seed = nilai pertama yang valid
  const k = 2 / 4
  close(ema[3], 20 * k + 10 * (1 - k))
})

test('calcEMA: null di tengah carry-forward nilai sebelumnya (bukan reset ke null)', () => {
  const ema = calcEMA([10, 20, null, 30], 3)
  close(ema[1], 20 * (2/4) + 10 * (1 - 2/4))
  assert.equal(ema[2], ema[1]) // carry-forward, sesuai komentar kode
})

test('calcEMA: array kosong tidak crash', () => {
  assert.deepEqual(calcEMA([], 10), [])
})

// ============================================================
// calcRSI
// ============================================================

test('calcRSI: closes.length <= n → semua null (belum cukup data warmup)', () => {
  const closes14 = Array.from({ length: 14 }, (_, i) => 1000 + i)
  const rsi = calcRSI(closes14, 14)
  assert.equal(rsi.length, 14)
  assert.ok(rsi.every(v => v === null))
})

test('calcRSI: kalau semua gain (tidak ada loss sama sekali) → RSI = 100 tepat', () => {
  // 15 closes naik 1 terus tiap hari → loss=0 di seed → cabang al===0
  const closes15 = Array.from({ length: 15 }, (_, i) => 1000 + i)
  const rsi = calcRSI(closes15, 14)
  assert.deepEqual(rsi.slice(0, 14), Array(14).fill(null))
  assert.equal(rsi[14], 100)
})

test('calcRSI: dataset campuran naik/turun, cocok dengan referensi Wilder RSI independen', () => {
  const rsi = calcRSI(CLOSES) // n=14 default
  assert.deepEqual(rsi.slice(0, 14), Array(14).fill(null))
  close(rsi[14], 50.0)
  close(rsi[15], 46.428571)
  close(rsi[16], 44.708995)
  close(rsi[17], 48.793818)
  close(rsi[18], 52.567615)
  close(rsi[19], 56.055374)
  close(rsi[29], 66.725891)
})

// ============================================================
// calcATR
// ============================================================

test('calcATR: candles.length < n → semua null', () => {
  const c = CANDLES.slice(0, 10) // < 14
  const atr = calcATR(c, 14)
  assert.ok(atr.every(v => v === null))
})

test('calcATR: cocok dengan referensi Wilder ATR independen', () => {
  const atr = calcATR(CANDLES) // n=14 default
  assert.deepEqual(atr.slice(0, 13), Array(13).fill(null))
  close(atr[13], 18.928571)
  close(atr[14], 18.862245)
  close(atr[15], 18.800656)
  close(atr[29], 18.643591)
})

// ============================================================
// calcMACD
// ============================================================

test('calcMACD: struktur output benar & null-safe', () => {
  const { macd, signal, hist } = calcMACD(CLOSES)
  assert.equal(macd.length, CLOSES.length)
  assert.equal(signal.length, CLOSES.length)
  assert.equal(hist.length, CLOSES.length)
})

test('calcMACD: cocok dengan referensi independen (EMA12/EMA26/signal9)', () => {
  const { macd, hist, signal } = calcMACD(CLOSES)
  close(macd[25], 2.804901)
  close(macd[26], 4.390309)
  close(macd[27], 5.183546)
  close(hist[29], 4.361419)
  close(signal[29], 4.677848)
})

// ============================================================
// calcBollinger
// ============================================================

test('calcBollinger: null selama warmup (i < n-1)', () => {
  const { upper, middle, lower } = calcBollinger(CLOSES, 20, 2)
  assert.deepEqual(upper.slice(0, 19), Array(19).fill(null))
  assert.deepEqual(middle.slice(0, 19), Array(19).fill(null))
  assert.deepEqual(lower.slice(0, 19), Array(19).fill(null))
})

test('calcBollinger: harga konstan → std=0 → upper=middle=lower', () => {
  const flat = Array(20).fill(500)
  const { upper, middle, lower } = calcBollinger(flat, 20, 2)
  close(upper[19], 500)
  close(middle[19], 500)
  close(lower[19], 500)
})

test('calcBollinger: cocok dengan referensi independen', () => {
  const { upper, middle, lower } = calcBollinger(CLOSES, 20, 2)
  close(upper[19], 1051.869517)
  close(middle[19], 1016.25)
  close(lower[19], 980.630483)
  close(upper[29], 1059.73009)
  close(lower[29], 981.26991)
})

// ============================================================
// calcVWAP
// ============================================================

test('calcVWAP: reset cumulative tiap hari baru (BUKAN carry-over antar hari)', () => {
  const day1 = Math.floor(Date.UTC(2026, 0, 15, 2, 0, 0) / 1000)
  const day2 = Math.floor(Date.UTC(2026, 0, 16, 2, 0, 0) / 1000)
  const candles = [
    { unix: day1,     high: 110, low: 90,  close: 100, volume: 10 },
    { unix: day1+60,  high: 120, low: 100, close: 110, volume: 10 },
    { unix: day2,     high: 60,  low: 40,  close: 50,  volume: 5 }, // hari baru — harus reset
  ]
  const vwap = calcVWAP(candles)
  // VWAP candle pertama hari 1 = typical price candle itu sendiri
  close(vwap[0], (110+90+100)/3)
  // VWAP candle ke-3 (hari baru) TIDAK boleh ketarik rata-rata hari sebelumnya
  close(vwap[2], (60+40+50)/3)
})

// ============================================================
// calcSupertrend
// ============================================================

test('calcSupertrend: null sebelum warmup ATR, panjang output = panjang input', () => {
  const { value, direction } = calcSupertrend(CANDLES, 10, 3)
  assert.equal(value.length, CANDLES.length)
  assert.deepEqual(value.slice(0, 9), Array(9).fill(null))
  assert.deepEqual(direction.slice(0, 9), Array(9).fill(null))
})

test('calcSupertrend: cocok dengan referensi independen, termasuk titik flip arah', () => {
  const { value, direction } = calcSupertrend(CANDLES, 10, 3)
  assert.deepEqual(direction.slice(9, 15), ['up','up','up','up','up','up'])
  close(value[9], 993.0)
  // flip up → down tepat di index 15 (harga jatuh dari 1000 ke 990)
  assert.equal(direction[15], 'down')
  close(value[15], 1046.2241786, 'val[15] harus pakai upperBand setelah flip ke down')
  assert.deepEqual(direction.slice(16, 21), ['down','down','down','down','down'])
  close(value[16], 1040.4017611)
  // flip down → up tepat di index 28 (harga rebound dari 1035 ke 1050)
  assert.equal(direction[27], 'down')
  assert.equal(direction[28], 'up')
  close(value[28], 993.8039608382699)
  close(value[29], 1004.0235647544429)
})

// ============================================================
// extractIEP
// ============================================================

test('extractIEP: ambil candle 08:57-08:59 WIB saja, prioritas 08:59 (paling akhir)', () => {
  const ts = (h, m) => Math.floor(Date.UTC(2026, 0, 15, h, m, 0) / 1000) // UTC+7 → WIB
  const candles = [
    { unix: ts(1, 56), close: 100, volume: 10 }, // 08:56 WIB — di luar window
    { unix: ts(1, 57), close: 101, volume: 20 }, // 08:57 WIB
    { unix: ts(1, 58), close: 102, volume: 30 }, // 08:58 WIB
    { unix: ts(1, 59), close: 103, volume: 40 }, // 08:59 WIB — harus menang
    { unix: ts(2, 0),  close: 104, volume: 50 }, // 09:00 WIB — di luar window
  ]
  const result = extractIEP(candles)
  assert.equal(result.length, 1)
  assert.equal(result[0].date, '2026-01-15')
  assert.equal(result[0].price, 103)
  assert.equal(result[0].vol, 40)
})

test('extractIEP: tidak ada candle di window 08:57-08:59 → hasil kosong, tidak crash', () => {
  const ts = (h, m) => Math.floor(Date.UTC(2026, 0, 15, h, m, 0) / 1000)
  const candles = [{ unix: ts(3, 0), close: 100, volume: 10 }] // jam 10:00 WIB
  assert.deepEqual(extractIEP(candles), [])
})

// ============================================================
// aggregateToDaily
// ============================================================

test('aggregateToDaily: agregasi candle intraday jadi 1 candle harian per tanggal', () => {
  const ts = (h, m) => Math.floor(Date.UTC(2026, 0, 15, h, m, 0) / 1000)
  const intraday = [
    { unix: ts(2, 0), open: 100, high: 105, low: 98,  close: 102, volume: 100 },
    { unix: ts(2, 5), open: 102, high: 110, low: 101, close: 108, volume: 50 },
    { unix: ts(2, 10), open: 108, high: 109, low: 95, close: 96, volume: 70 },
  ]
  const daily = aggregateToDaily(intraday)
  assert.equal(daily.length, 1)
  assert.equal(daily[0].date, '2026-01-15')
  assert.equal(daily[0].open, 100)   // open dari candle pertama
  assert.equal(daily[0].high, 110)   // max dari semua high
  assert.equal(daily[0].low, 95)     // min dari semua low
  assert.equal(daily[0].close, 96)   // close dari candle terakhir
  assert.equal(daily[0].volume, 220) // sum semua volume
})

test('aggregateToDaily: hasil terurut tanggal ascending', () => {
  const ts = (day) => Math.floor(Date.UTC(2026, 0, day, 5, 0, 0) / 1000)
  const intraday = [
    { unix: ts(20), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { unix: ts(18), open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { unix: ts(19), open: 1, high: 1, low: 1, close: 1, volume: 1 },
  ]
  const daily = aggregateToDaily(intraday)
  assert.deepEqual(daily.map(d => d.date), ['2026-01-18', '2026-01-19', '2026-01-20'])
})

// ============================================================
// enrichDaily
// ============================================================

test('enrichDaily: tambah rsi/macdHist/atr/atrPct/vmaRatio/foreignNet/returnPct, mutate in-place', () => {
  const days = CLOSES.map((c, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: i > 0 ? CLOSES[i - 1] : c,
    high: c + 8, low: c - 8, close: c, volume: 1000 + i * 10,
    foreignbuy: 500, foreignsell: 300
  }))
  const out = enrichDaily(days)

  assert.equal(out, days) // mutate in-place, bukan return array baru
  assert.equal(out[0].rsi, null) // warmup
  close(out[14].rsi, 50.0)       // sama dengan calcRSI standalone di atas
  close(out[13].atr, 18.928571)
  assert.equal(out[5].foreignNet, 200) // 500 - 300
  // returnPct candle pertama: open===close (sengaja diset sama) → 0
  close(out[0].returnPct, 0)
})

test('enrichDaily: array kosong tidak crash, return apa adanya', () => {
  assert.deepEqual(enrichDaily([]), [])
})
