/**
 * features/winrate/fetch.test.js
 * ================================
 * extractCheckpoints() — pure, ditest menyeluruh tanpa mock apa pun.
 * fetchOneDay/fetchSymRange — mock fetch (Stockbit + Sheets sekaligus,
 * dibedakan dari host URL) + mock localStorage (token Stockbit).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- Mock localStorage (dibutuhkan TOKEN.get() di shared/store.js) ---
class LocalStorageMock {
  constructor() { this.store = {} }
  getItem(k)    { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null }
  setItem(k, v) { this.store[k] = String(v) }
  removeItem(k) { delete this.store[k] }
}
globalThis.localStorage = new LocalStorageMock()
globalThis.localStorage.setItem('ihsglab_token', 'fake.token.value')

// --- Mock fetch: cabang berdasarkan host (Stockbit vs Apps Script) ---
let _mockDailyBySym    = {} // {sym: [{date,open,high,low,close,volume,foreignbuy,foreignsell}]}
let _mockIntradayBySym = {} // {sym: {date: [{datetime,unix_timestamp,open,high,low,close,volume}]}}
let _mockSheets        = {}
let _stockbitCalls      = []

globalThis.fetch = async (url, options) => {
  if (url.startsWith('https://exodus.stockbit.com')) {
    _stockbitCalls.push(url)
    const symMatch = url.match(/chartbit\/([A-Z0-9]+)\/price\/(daily|intraday)/)
    const sym = symMatch[1], kind = symMatch[2]
    if (kind === 'daily') {
      const rows = _mockDailyBySym[sym] || []
      return { ok: true, status: 200, json: async () => ({ data: { chartbit: rows } }) }
    }
    // intraday — tentukan tanggal dari param 'to' (unix lebih lama = awal hari yg di-request)
    const toTs = Number(new URL(url).searchParams.get('to'))
    const dateGuess = new Date(toTs * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const rows = (_mockIntradayBySym[sym] || {})[dateGuess] || []
    return { ok: true, status: 200, json: async () => ({ data: { chartbit: rows } }) }
  }
  // Apps Script (Sheets)
  if (!options || !options.method) {
    const sheet = new URL(url).searchParams.get('sheet')
    return { ok: true, json: async () => ({ ok: true, data: _mockSheets[sheet] || [] }) }
  }
  const body = JSON.parse(options.body)
  if (body.action === 'append') {
    _mockSheets[body.sheet] = [...(_mockSheets[body.sheet] || []), ...body.data]
  }
  return { ok: true, json: async () => ({ ok: true, written: body.data.length }) }
}

function resetMocks() { _mockDailyBySym = {}; _mockIntradayBySym = {}; _mockSheets = {}; _stockbitCalls = [] }

const { extractCheckpoints, fetchOneDay, fetchSymRange, estimateFetch } = await import('./fetch.js')

// ============================================================
// extractCheckpoints — PURE, tanpa mock
// ============================================================

function wibCandle(dateStr, hh, mm, close) {
  const unix = Math.floor(new Date(`${dateStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+07:00`).getTime() / 1000)
  return { unix, close }
}

test('extractCheckpoints: ambil harga PERSIS pada candle exact match', () => {
  const candles = [
    wibCandle('2026-01-15', 9, 2, 1000),
    wibCandle('2026-01-15', 9, 5, 1010),
    wibCandle('2026-01-15', 16, 0, 1100),
  ]
  const snap = extractCheckpoints(candles)
  assert.equal(snap.p0902, 1000)
  assert.equal(snap.p0905, 1010)
  assert.equal(snap.p1600, 1100)
  assert.equal('p0910' in snap, false) // tidak ada candle dekat 09:10 -> key tidak muncul
})

test('extractCheckpoints: toleransi 2 menit kalau candle pas tidak ada', () => {
  const candles = [wibCandle('2026-01-15', 9, 3, 1005)] // candle di 09:03, bukan 09:02
  const snap = extractCheckpoints(candles)
  assert.equal(snap.p0902, 1005) // selisih 1 menit, masih dalam toleransi
})

test('extractCheckpoints: di luar toleransi 2 menit -> key tidak muncul (BUKAN nilai asal comot)', () => {
  const candles = [wibCandle('2026-01-15', 9, 6, 1005)] // selisih 4 menit dari 09:02
  const snap = extractCheckpoints(candles)
  assert.equal('p0902' in snap, false)
})

test('extractCheckpoints: pilih candle TERDEKAT kalau ada beberapa kandidat dalam toleransi', () => {
  const candles = [
    wibCandle('2026-01-15', 9, 0, 999),  // selisih 2 menit dari p0902
    wibCandle('2026-01-15', 9, 1, 998),  // selisih 1 menit -- harus menang
  ]
  const snap = extractCheckpoints(candles)
  assert.equal(snap.p0902, 998)
})

test('extractCheckpoints: array kosong -> object kosong, tidak crash', () => {
  assert.deepEqual(extractCheckpoints([]), {})
})

// ============================================================
// fetchOneDay — integration ringan (mock Stockbit)
// ============================================================

test('fetchOneDay: ekstrak snap + IEP sekaligus dari 1 response intraday', async () => {
  resetMocks()
  const date = '2026-01-15'
  _mockIntradayBySym.BBCA = {
    [date]: [
      { unix_timestamp: String(wibCandle(date, 8, 59, 1500).unix), close: 1500, volume: 1000 }, // IEP
      { unix_timestamp: String(wibCandle(date, 9, 2, 1505).unix),  close: 1505, volume: 200 },  // entry
      { unix_timestamp: String(wibCandle(date, 16, 0, 1550).unix), close: 1550, volume: 300 },  // exit terakhir
    ]
  }
  const { snap, iep } = await fetchOneDay('BBCA', date)
  assert.equal(snap.p0902, 1505)
  assert.equal(snap.p1600, 1550)
  assert.equal(iep.price, 1500)
  assert.equal(iep.vol, 1000)
})

// ============================================================
// fetchSymRange — integration: cek skip yang sudah di-cache
// ============================================================

test('fetchSymRange: hari yang sudah ada di cache intraday TIDAK di-fetch ulang dari Stockbit', async () => {
  resetMocks()
  // Sheet sudah punya intraday utk 1 hari (simulasi sudah pernah di-scan sebelumnya)
  _mockSheets['winrate-intraday'] = [
    { sym: 'TLKM', date: '2026-01-15', p0902: 100, p0905: '', p0910: '', p0920: '', p0935: '',
      p1000: '', p1030: '', p1130: '', p1330: '', p1600: 105 }
  ]
  _mockDailyBySym.TLKM = [
    { date: '2026-01-15', open: 100, high: 110, low: 95, close: 105, volume: 1000, foreignbuy: 0, foreignsell: 0 },
    { date: '2026-01-16', open: 105, high: 112, low: 100, close: 108, volume: 900, foreignbuy: 0, foreignsell: 0 },
  ]
  _mockIntradayBySym.TLKM = {
    '2026-01-16': [
      { unix_timestamp: String(wibCandle('2026-01-16', 9, 2, 106).unix), close: 106, volume: 50 }
    ]
  }

  const r = await fetchSymRange('TLKM', '2026-01-15', '2026-01-16')
  assert.equal(r.daysSkipped, 1)   // 2026-01-15 sudah di cache
  assert.equal(r.daysFetched, 1)   // 2026-01-16 baru di-fetch

  // Pastikan TIDAK ada call Stockbit intraday utk 2026-01-15 (cuma utk 01-16)
  const calledFor15 = _stockbitCalls.some(u => {
    const toTs = Number(new URL(u).searchParams.get('to'))
    return toTs && new Date(toTs * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === '2026-01-15'
  })
  assert.equal(calledFor15, false)
})

// ============================================================
// estimateFetch
// ============================================================

test('estimateFetch: hitung hari kalender (skip weekend) yang belum ter-cache', async () => {
  resetMocks()
  _mockSheets['winrate-intraday'] = [] // ASII belum ada cache sama sekali
  // 2026-01-19 (Senin) s.d. 2026-01-23 (Jumat) = 5 hari kerja, 0 di-cache
  const est = await estimateFetch(['ASII'], '2026-01-19', '2026-01-23')
  assert.equal(est[0].sym, 'ASII')
  assert.equal(est[0].missingDays, 5)
})
