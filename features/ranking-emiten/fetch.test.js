/**
 * features/ranking-emiten/fetch.test.js
 * ========================================
 * Stockbit di-mock via global fetch (shared/api.js masih fetch() langsung,
 * tidak berubah). Sheets/Firebase di-mock via mock.module() ke
 * shared/firebase.js -- file itu TIDAK BISA di-load langsung di Node
 * (import 'https://www.gstatic.com/...' di top-level), jadi harus diganti
 * di level modul (butuh flag --experimental-test-module-mocks).
 */
import { test, mock } from 'node:test'
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

// --- Mock fetch: CUMA Stockbit (Sheets sekarang lewat mock.module di bawah) ---
let _mockDailyBySym    = {}
let _mockIntradayBySym = {} // {sym: [{unix_timestamp, close, open, volume, frequency}]} -- FLAT, tidak per-hari (mensimulasikan 1 response yg cover banyak hari)
let _mockSheets        = {}
let _stockbitIntradayCalls = []
let _forceDailyStatus  = {} // {sym: statusCode} -- simulasikan error HTTP tertentu utk fetchDaily simbol ini
let _dailyCallOrder    = [] // urutan simbol yang BENAR-BENAR di-fetchDaily (cek short-circuit abort)

globalThis.fetch = async (url, options) => {
  const symMatch = url.match(/chartbit\/([A-Z0-9]+)\/price\/(daily|intraday)/)
  const sym = symMatch[1], kind = symMatch[2]
  if (kind === 'daily') {
    _dailyCallOrder.push(sym)
    if (_forceDailyStatus[sym]) {
      return { ok: false, status: _forceDailyStatus[sym], json: async () => ({}) }
    }
    const rows = _mockDailyBySym[sym] || []
    return { ok: true, status: 200, json: async () => ({ data: { chartbit: rows } }) }
  }
  const u = new URL(url)
  const fromTs = Number(u.searchParams.get('from')), toTs = Number(u.searchParams.get('to'))
  _stockbitIntradayCalls.push({ sym, fromTs, toTs })
  const all = _mockIntradayBySym[sym] || []
  const rows = all.filter(c => {
    const ts = Number(c.unix_timestamp)
    return ts <= fromTs && ts >= toTs
  })
  return { ok: true, status: 200, json: async () => ({ data: { chartbit: rows } }) }
}

// --- Mock module: Sheets/Firebase (dipakai db.js, transitif dari fetch.js) ---
mock.module('../../shared/firebase.js', {
  namedExports: {
    gsLoad: async (sheet, filter = null) => {
      let rows = _mockSheets[sheet] || []
      if (filter) rows = rows.filter(r => r[filter.field] === filter.value)
      return rows
    },
    gsAppend: async (sheet, data) => {
      _mockSheets[sheet] = [...(_mockSheets[sheet] || []), ...data]
    },
    gsSave: async (sheet, data) => { _mockSheets[sheet] = [...data] },
    gsClear: async (sheet) => { _mockSheets[sheet] = [] },
    gsLoadFiltered: async (sheet, field, value) => (_mockSheets[sheet] || []).filter(r => r[field] === value)
  }
})

function resetMocks() {
  _mockDailyBySym = {}; _mockIntradayBySym = {}; _mockSheets = {}; _stockbitIntradayCalls = []
  _forceDailyStatus = {}; _dailyCallOrder = []
}

const { extractCheckpoints, extractIEPRaw, fetchIhsgTrend, fetchSymRange, fetchIhsgRange, fetchWatchlist } =
  await import('./fetch.js')

function wib1m(dateStr, hh, mm, fields = {}) {
  const unix = Math.floor(new Date(`${dateStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+07:00`).getTime() / 1000)
  return { unix_timestamp: String(unix), unix, ...fields }
}

// ============================================================
// extractCheckpoints — PURE, forward-fill only (0-2 menit SETELAH target)
// ============================================================

test('extractCheckpoints: exact match pas di target', () => {
  const candles = [{ unix: wib1m('2026-01-15', 9, 2).unix, close: 1000 }]
  const result = extractCheckpoints(candles)
  assert.equal(result['2026-01-15'].p0902, 1000)
})

test('extractCheckpoints: forward-fill 1-2 menit SETELAH target', () => {
  const candles = [{ unix: wib1m('2026-01-15', 9, 4).unix, close: 1005 }] // 2 menit setelah p0902 (09:02)
  const result = extractCheckpoints(candles)
  assert.equal(result['2026-01-15'].p0902, 1005)
})

test('extractCheckpoints: TIDAK PERNAH mundur ke candle SEBELUM target (beda dari win-rate)', () => {
  const candles = [{ unix: wib1m('2026-01-15', 9, 0).unix, close: 999 }] // 2 menit SEBELUM p0902
  const result = extractCheckpoints(candles)
  assert.equal('p0902' in (result['2026-01-15'] || {}), false)
})

test('extractCheckpoints: lebih dari 2 menit setelah target -> tidak terisi', () => {
  const candles = [{ unix: wib1m('2026-01-15', 9, 5).unix, close: 1010 }] // 3 menit setelah p0902
  const result = extractCheckpoints(candles)
  assert.equal('p0902' in (result['2026-01-15'] || {}), false)
})

test('extractCheckpoints: candle PERTAMA dalam window menang, candle berikutnya TIDAK overwrite', () => {
  const candles = [
    { unix: wib1m('2026-01-15', 9, 2).unix, close: 1000 }, // exact, set duluan
    { unix: wib1m('2026-01-15', 9, 3).unix, close: 9999 }, // 1 menit setelah, TIDAK boleh overwrite
  ]
  const result = extractCheckpoints(candles)
  assert.equal(result['2026-01-15'].p0902, 1000)
})

test('extractCheckpoints: lintas beberapa hari sekaligus dalam 1 response', () => {
  const candles = [
    { unix: wib1m('2026-01-15', 9, 2).unix, close: 100 },
    { unix: wib1m('2026-01-16', 9, 2).unix, close: 200 },
  ]
  const result = extractCheckpoints(candles)
  assert.equal(result['2026-01-15'].p0902, 100)
  assert.equal(result['2026-01-16'].p0902, 200)
})

// ============================================================
// extractIEPRaw — window 08:45-08:59 WIB
// ============================================================

test('extractIEPRaw: jam 08:45-08:59 masuk, di luar itu tidak', () => {
  const candles = [
    { unix: wib1m('2026-01-15', 8, 44).unix, volume: 100, frequency: 5 }, // di luar (44 < 45)
    { unix: wib1m('2026-01-15', 8, 45).unix, volume: 200, frequency: 10 }, // masuk (batas bawah)
    { unix: wib1m('2026-01-15', 8, 59).unix, volume: 300, frequency: 15 }, // masuk (batas atas jam 8)
    { unix: wib1m('2026-01-15', 9, 0).unix,  volume: 999, frequency: 99 }, // di luar (jam sudah 9)
  ]
  const result = extractIEPRaw(candles)
  assert.equal(result.length, 1)
  assert.equal(result[0].totalVol, 200 + 300)
  assert.equal(result[0].totalFreq, 10 + 15)
})

test('extractIEPRaw: hasil terurut tanggal ascending', () => {
  const candles = [
    { unix: wib1m('2026-01-16', 8, 50).unix, volume: 1, frequency: 1 },
    { unix: wib1m('2026-01-15', 8, 50).unix, volume: 1, frequency: 1 },
  ]
  const result = extractIEPRaw(candles)
  assert.deepEqual(result.map(r => r.date), ['2026-01-15', '2026-01-16'])
})

// ============================================================
// fetchIhsgTrend — mock Stockbit, sort-defensiveness
// ============================================================

test('fetchIhsgTrend: klasifikasi trend up/down/flat/unknown dengan benar', async () => {
  resetMocks()
  _mockIntradayBySym.IHSG = [
    wib1m('2026-01-15', 15, 0, { close: 7000 }),
    wib1m('2026-01-16', 15, 0, { close: 7100 }), // +1.43% -> up
    wib1m('2026-01-19', 15, 0, { close: 7080 }), // -0.28% -> flat (di bawah ambang 0.5%)
    wib1m('2026-01-20', 15, 0, { close: 6950 }), // -1.84% -> down
  ]
  const fromTs = wib1m('2026-01-20', 16, 0).unix
  const toTs   = wib1m('2026-01-15', 0, 0).unix
  const trend = await fetchIhsgTrend(fromTs, toTs)
  assert.equal(trend['2026-01-15'].trend, 'unknown') // hari pertama, tidak ada prev
  assert.equal(trend['2026-01-16'].trend, 'up')
  assert.equal(trend['2026-01-19'].trend, 'flat')
  assert.equal(trend['2026-01-20'].trend, 'down')
})

test('fetchIhsgTrend: WAJIB sort by unix dulu -- hasil benar walau response API tidak terurut', async () => {
  resetMocks()
  // Sengaja taruh candle TIDAK terurut (terbaru duluan) -- mensimulasikan bug yg sempat ketemu di win-rate
  _mockIntradayBySym.IHSG = [
    wib1m('2026-01-16', 15, 0, { close: 7100 }),
    wib1m('2026-01-15', 15, 0, { close: 7000 }), // padahal ini lebih lama, tapi diletakkan ke-2
  ]
  const fromTs = wib1m('2026-01-16', 16, 0).unix
  const toTs   = wib1m('2026-01-15', 0, 0).unix
  const trend = await fetchIhsgTrend(fromTs, toTs)
  close(trend['2026-01-16'].ret, (7100 - 7000) / 7000 * 100) // tetap benar walau input tidak terurut
})
function close(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`) }

// ============================================================
// fetchSymRange — skip cache, chunking 30 hari kalender
// ============================================================

test('fetchSymRange: hari yang sudah ada di cache TIDAK di-fetch ulang', async () => {
  resetMocks()
  _mockSheets['ranking-intraday'] = [
    { sym: 'TLKM', date: '2026-01-15', p0902: 100, p0905: '', p0910: '', p0915: '', p0920: '',
      p0930: '', p1000: '', p1100: '', p1530: '', p1600: 105 }
  ]
  _mockDailyBySym.TLKM = [
    { date: '2026-01-15', open: 100, high: 110, low: 95, close: 105, volume: 1000, foreignbuy: 0, foreignsell: 0 },
    { date: '2026-01-16', open: 105, high: 112, low: 100, close: 108, volume: 900, foreignbuy: 0, foreignsell: 0 },
  ]
  _mockIntradayBySym.TLKM = [wib1m('2026-01-16', 9, 2, { close: 106, volume: 50, frequency: 2 })]

  const r = await fetchSymRange('TLKM', '2026-01-15', '2026-01-16')
  assert.equal(r.daysSkipped, 1)
  assert.equal(r.daysFetched, 1)
})

test('fetchSymRange: chunk yang SEMUA harinya sudah ter-cache di-skip total (tidak ada call Stockbit)', async () => {
  resetMocks()
  _mockSheets['ranking-intraday'] = [
    { sym: 'BBRI', date: '2026-01-15', p0902: 100, p0905: '', p0910: '', p0915: '', p0920: '',
      p0930: '', p1000: '', p1100: '', p1530: '', p1600: 105 }
  ]
  _mockDailyBySym.BBRI = [
    { date: '2026-01-15', open: 100, high: 110, low: 95, close: 105, volume: 1000, foreignbuy: 0, foreignsell: 0 }
  ]

  await fetchSymRange('BBRI', '2026-01-15', '2026-01-15') // 1 hari, sudah di cache semua
  assert.equal(_stockbitIntradayCalls.length, 0) // TIDAK ada call sama sekali ke intraday
})

// ============================================================
// fetchIhsgRange — skip kalau sudah lengkap
// ============================================================

test('fetchIhsgRange: skip fetch total kalau semua hari kerja sudah ter-cache', async () => {
  resetMocks()
  _mockSheets['ranking-ihsg'] = [
    { date: '2026-01-19', close: '7000', ret: '', trend: 'unknown' },
    { date: '2026-01-20', close: '7050', ret: '0.71', trend: 'up' },
  ]
  const r = await fetchIhsgRange('2026-01-19', '2026-01-20') // Senin-Selasa, keduanya sudah ada
  assert.equal(r.written, 0)
  assert.equal(_stockbitIntradayCalls.filter(c => c.sym === 'IHSG').length, 0)
})

// ============================================================
// fetchWatchlist — IHSG di-fetch sekali sebelum loop simbol
// ============================================================

test('fetchWatchlist: IHSG di-fetch SEKALI di awal, sebelum loop simbol', async () => {
  resetMocks()
  _mockSheets['ranking-ihsg'] = []
  _mockIntradayBySym.IHSG = [wib1m('2026-01-15', 15, 0, { close: 7000 })]
  _mockDailyBySym.GOTO = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _mockDailyBySym.ASII = [{ date: '2026-01-15', open: 200, high: 205, low: 195, close: 202, volume: 1, foreignbuy: 0, foreignsell: 0 }]

  const order = []
  const origFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (url.includes('IHSG')) order.push('IHSG')
    else if (url.includes('GOTO')) order.push('GOTO')
    else if (url.includes('ASII')) order.push('ASII')
    return origFetch(url, options)
  }

  await fetchWatchlist(['GOTO', 'ASII'], '2026-01-15', '2026-01-15')
  globalThis.fetch = origFetch

  assert.ok(order.indexOf('IHSG') < order.indexOf('GOTO'))
  assert.ok(order.indexOf('IHSG') < order.indexOf('ASII'))
})

// ============================================================
// fetchWatchlist — resilience: 1 simbol gagal tidak gagalkan semua
// ============================================================

test('fetchWatchlist: 1 simbol gagal (SERVER_ERROR) -- simbol lain TETAP lanjut diproses', async () => {
  resetMocks()
  _mockDailyBySym.AAAA = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _mockDailyBySym.CCCC = [{ date: '2026-01-15', open: 200, high: 205, low: 195, close: 202, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _forceDailyStatus.BBBB = 503

  const results = await fetchWatchlist(['AAAA', 'BBBB', 'CCCC'], '2026-01-15', '2026-01-15')

  assert.equal(results.length, 3)
  assert.equal(results[0].sym, 'AAAA'); assert.equal(results[0].error, null)
  assert.equal(results[1].sym, 'BBBB'); assert.equal(results[1].error.code, 'SERVER_ERROR')
  assert.equal(results[2].sym, 'CCCC'); assert.equal(results[2].error, null)
  assert.ok(_dailyCallOrder.includes('CCCC')) // CCCC benar2 di-fetch, bukan di-skip
})

test('fetchWatchlist: TOKEN_EXPIRED langsung ABORT -- simbol setelahnya TIDAK PERNAH dicoba', async () => {
  resetMocks()
  _mockDailyBySym.AAAA = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _forceDailyStatus.BBBB = 401

  await assert.rejects(
    () => fetchWatchlist(['AAAA', 'BBBB', 'CCCC'], '2026-01-15', '2026-01-15'),
    (err) => err.code === 'TOKEN_EXPIRED'
  )
  assert.ok(!_dailyCallOrder.includes('CCCC')) // CCCC TIDAK PERNAH dicoba
})

test('fetchWatchlist: RATE_LIMITED tidak abort (lanjut ke simbol berikutnya, BUKAN seperti TOKEN_EXPIRED)', { timeout: 10000 }, async () => {
  resetMocks()
  _forceDailyStatus.AAAA = 429
  _mockDailyBySym.BBBB = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]

  const results = await fetchWatchlist(['AAAA', 'BBBB'], '2026-01-15', '2026-01-15')
  assert.equal(results[0].error.code, 'RATE_LIMITED')
  assert.equal(results[1].error, null)
  assert.ok(_dailyCallOrder.includes('BBBB'))
})
