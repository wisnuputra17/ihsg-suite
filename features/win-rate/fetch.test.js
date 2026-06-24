/**
 * features/win-rate/fetch.test.js
 * ================================
 * extractCheckpoints() — pure, ditest menyeluruh tanpa mock apa pun.
 * fetchWindow/fetchSymRange — mock fetch (Stockbit + Sheets sekaligus,
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
let _mockDailyBySym     = {} // {sym: [{date,open,high,low,close,volume,foreignbuy,foreignsell}]}
let _mockIntradayBySym  = {} // {sym: {date: [{unix_timestamp,open,close,volume}]}} -- 1 hari = 1 array candle 5-menitan
let _mockSheets         = {}
let _stockbitIntradayCalls = [] // {fromTs, toTs} -- dicek rentang window-nya
let _forceDailyStatus   = {} // {sym: statusCode} -- simulasikan error HTTP tertentu utk fetchDaily simbol ini
let _dailyCallOrder     = [] // urutan simbol yang BENAR-BENAR di-fetchDaily (cek short-circuit abort)

globalThis.fetch = async (url, options) => {
  if (url.startsWith('https://exodus.stockbit.com')) {
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
    // Gabungkan SEMUA candle simbol ini yg jatuh di window [toTs, fromTs] (Stockbit: from>to)
    const allDates = Object.keys(_mockIntradayBySym[sym] || {})
    let rows = []
    for (const d of allDates) {
      const dayCandles = _mockIntradayBySym[sym][d]
      rows = rows.concat(dayCandles.filter(c => {
        const ts = Number(c.unix_timestamp)
        return ts <= fromTs && ts >= toTs
      }))
    }
    return { ok: true, status: 200, json: async () => ({ data: { chartbit: rows } }) }
  }
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

function resetMocks() {
  _mockDailyBySym = {}; _mockIntradayBySym = {}; _mockSheets = {}; _stockbitIntradayCalls = []
  _forceDailyStatus = {}; _dailyCallOrder = []
}

const { extractCheckpoints, fetchWindow, fetchSymRange, estimateFetch, fetchWatchlist } = await import('./fetch.js')
const { DB } = await import('./db.js')

// ============================================================
// extractCheckpoints — PURE, tanpa mock
// ============================================================

function wibCandle5m(dateStr, hh, mm, open) {
  // Candle mult=5 berlabel jam:menit ini -> field `open` = harga PERSIS di jam:menit ini
  const unix = Math.floor(new Date(`${dateStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+07:00`).getTime() / 1000)
  return { unix, open }
}

test('extractCheckpoints: pakai field `open` candle (harga PERSIS di jam itu), BUKAN `close`', () => {
  const candles = [
    wibCandle5m('2026-01-15', 9, 5, 1010),  // open candle 09:05 = harga PERSIS 09:05
  ]
  const snap = extractCheckpoints(candles)
  assert.equal(snap.p0905, 1010)
})

test('extractCheckpoints: ambil semua 9 exit point kalau candle-nya pas semua', () => {
  const candles = [
    wibCandle5m('2026-01-15', 9, 5, 1010), wibCandle5m('2026-01-15', 9, 10, 1020),
    wibCandle5m('2026-01-15', 9, 20, 1015), wibCandle5m('2026-01-15', 9, 35, 1030),
    wibCandle5m('2026-01-15', 10, 0, 1025), wibCandle5m('2026-01-15', 10, 30, 1040),
    wibCandle5m('2026-01-15', 11, 30, 1050), wibCandle5m('2026-01-15', 13, 30, 1045),
    wibCandle5m('2026-01-15', 16, 0, 1060),
  ]
  const snap = extractCheckpoints(candles)
  assert.equal(Object.keys(snap).length, 9)
  assert.equal(snap.p1600, 1060)
})

test('extractCheckpoints: candle hilang -> key tidak muncul (TIDAK comot candle 5 menit tetangga)', () => {
  const candles = [wibCandle5m('2026-01-15', 9, 0, 999)] // candle 09:00, BUKAN 09:05
  const snap = extractCheckpoints(candles)
  // selisih candle 09:00 ke target p0905 = 5 menit, di luar toleransi 2 menit
  assert.equal('p0905' in snap, false)
})

test('extractCheckpoints: toleransi kecil (<=2 menit) tetap dipakai sbg jaring pengaman', () => {
  const candles = [wibCandle5m('2026-01-15', 9, 6, 1005)] // selisih 1 menit dari p0905
  const snap = extractCheckpoints(candles)
  assert.equal(snap.p0905, 1005)
})

test('extractCheckpoints: array kosong -> object kosong, tidak crash', () => {
  assert.deepEqual(extractCheckpoints([]), {})
})

// ============================================================
// fetchWindow — integration: 1 call API utk BANYAK hari sekaligus
// ============================================================

test('fetchWindow: 1 call API menghasilkan checkpoint utk beberapa hari sekaligus', async () => {
  resetMocks()
  _mockIntradayBySym.BBCA = {
    '2026-01-19': [{ unix_timestamp: String(wibCandle5m('2026-01-19', 9, 5, 100).unix), open: 100 }],
    '2026-01-20': [{ unix_timestamp: String(wibCandle5m('2026-01-20', 9, 5, 200).unix), open: 200 }],
  }
  const result = await fetchWindow('BBCA', ['2026-01-19', '2026-01-20'])
  assert.equal(result['2026-01-19'].p0905, 100)
  assert.equal(result['2026-01-20'].p0905, 200)
  assert.equal(_stockbitIntradayCalls.length, 1) // CUMA 1 call API, walau 2 hari
})

test('fetchWindow: hari tanpa candle sama sekali tidak muncul di hasil', async () => {
  resetMocks()
  _mockIntradayBySym.TLKM = {
    '2026-01-19': [{ unix_timestamp: String(wibCandle5m('2026-01-19', 9, 5, 100).unix), open: 100 }]
    // 2026-01-20 sengaja tidak ada data sama sekali (misal libur)
  }
  const result = await fetchWindow('TLKM', ['2026-01-19', '2026-01-20'])
  assert.equal('2026-01-19' in result, true)
  assert.equal('2026-01-20' in result, false)
})

// ============================================================
// fetchSymRange — integration: skip cache, chunking per 5 hari kerja
// ============================================================

test('fetchSymRange: hari yang sudah ada di cache intraday TIDAK di-fetch ulang', async () => {
  resetMocks()
  _mockSheets['winrate-intraday'] = [
    { sym: 'UNVR', date: '2026-01-19', p0905: 100, p0910: '', p0920: '', p0935: '',
      p1000: '', p1030: '', p1130: '', p1330: '', p1600: 105 }
  ]
  _mockDailyBySym.UNVR = [
    { date: '2026-01-19', open: 100, high: 110, low: 95, close: 105, volume: 1000, foreignbuy: 0, foreignsell: 0 },
    { date: '2026-01-20', open: 105, high: 112, low: 100, close: 108, volume: 900, foreignbuy: 0, foreignsell: 0 },
  ]
  _mockIntradayBySym.UNVR = {
    '2026-01-20': [{ unix_timestamp: String(wibCandle5m('2026-01-20', 9, 5, 106).unix), open: 106 }]
  }

  const r = await fetchSymRange('UNVR', '2026-01-19', '2026-01-20')
  assert.equal(r.daysSkipped, 1) // 2026-01-19 sudah di cache
  assert.equal(r.daysFetched, 1) // 2026-01-20 baru

  // Window fetch yang dikirim ke Stockbit HARUS cuma cover 01-20, BUKAN ikut 01-19 yg sudah di-cache
  assert.equal(_stockbitIntradayCalls.length, 1)
  const call = _stockbitIntradayCalls[0]
  const calledDate = new Date(call.toTs * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  assert.equal(calledDate, '2026-01-20')
})

test('fetchSymRange: rentang panjang (>5 hari kerja) dipecah jadi beberapa chunk window', async () => {
  resetMocks()
  // 8 hari kerja (Senin-Jumat x ~1.5 minggu) -- harus jadi 2 chunk (5 + 3)
  _mockDailyBySym.ASII = [
    '2026-01-19','2026-01-20','2026-01-21','2026-01-22','2026-01-23', // minggu 1 (5 hari)
    '2026-01-26','2026-01-27','2026-01-28'                            // minggu 2 (3 hari)
  ].map(date => ({ date, open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }))
  _mockIntradayBySym.ASII = {}
  for (const d of _mockDailyBySym.ASII) {
    _mockIntradayBySym.ASII[d.date] = [{ unix_timestamp: String(wibCandle5m(d.date, 9, 5, 100).unix), open: 100 }]
  }

  const r = await fetchSymRange('ASII', '2026-01-19', '2026-01-28')
  assert.equal(r.daysFetched, 8)
  assert.equal(_stockbitIntradayCalls.length, 2) // dipecah jadi 2 chunk, BUKAN 8 call terpisah
})

test('REGRESI BUG: response fetchDaily Stockbit DESCENDING (terbaru duluan) -- fetchSymRange WAJIB sort ascending sebelum proses, jika tidak window intraday & urutan indikator jadi terbalik', async () => {
  resetMocks()
  const dates = ['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06']
  // Sengaja kirim DESCENDING (terbaru duluan) -- ini PERSIS yang ditemukan di
  // response asli Stockbit (lihat laporan bug Wisnu: from/to intraday terbalik)
  _mockDailyBySym.PGAS = [...dates].reverse().map(date => ({
    date, open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0
  }))
  _mockIntradayBySym.PGAS = {}
  for (const d of dates) {
    _mockIntradayBySym.PGAS[d] = [{ unix_timestamp: String(wibCandle5m(d, 9, 5, 100).unix), open: 100 }]
  }

  await fetchSymRange('PGAS', dates[0], dates[dates.length - 1])

  // 1. Cache in-memory HARUS ascending walau input API descending
  const cachedDates = DB.emiten.PGAS.daily.map(d => d.date)
  assert.deepEqual(cachedDates, dates) // ascending, BUKAN reverse(dates)

  // 2. Tiap call intraday HARUS from > to (lebih baru > lebih lama) sesuai
  // konvensi Stockbit -- kalau sort-nya tidak jalan, ini akan terbalik (from < to)
  assert.ok(_stockbitIntradayCalls.length > 0)
  for (const call of _stockbitIntradayCalls) {
    assert.ok(call.fromTs > call.toTs, `from (${call.fromTs}) harus > to (${call.toTs})`)
  }
})

// ============================================================
// estimateFetch
// ============================================================

test('estimateFetch: hitung hari kalender (skip weekend) yang belum ter-cache', async () => {
  resetMocks()
  _mockSheets['winrate-intraday'] = [] // ICBP belum ada cache sama sekali
  const est = await estimateFetch(['ICBP'], '2026-01-19', '2026-01-23') // Senin-Jumat
  assert.equal(est[0].sym, 'ICBP')
  assert.equal(est[0].missingDays, 5)
})

// ============================================================
// fetchWatchlist — resilience: 1 simbol gagal tidak gagalkan semua
// ============================================================

test('fetchWatchlist: 1 simbol gagal (SERVER_ERROR) -- simbol lain TETAP lanjut diproses', async () => {
  resetMocks()
  _mockDailyBySym.AAAA = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _mockDailyBySym.CCCC = [{ date: '2026-01-15', open: 200, high: 205, low: 195, close: 202, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _forceDailyStatus.BBBB = 503 // SERVER_ERROR utk simbol tengah

  const results = await fetchWatchlist(['AAAA', 'BBBB', 'CCCC'], '2026-01-15', '2026-01-15')

  assert.equal(results.length, 3) // SEMUA 3 simbol tetap tercatat hasilnya
  assert.equal(results[0].sym, 'AAAA'); assert.equal(results[0].error, null)
  assert.equal(results[1].sym, 'BBBB'); assert.equal(results[1].error.code, 'SERVER_ERROR')
  assert.equal(results[2].sym, 'CCCC'); assert.equal(results[2].error, null) // simbol SETELAH yg gagal tetap diproses
  assert.deepEqual(_dailyCallOrder, ['AAAA', 'BBBB', 'CCCC']) // CCCC benar2 di-fetch, bukan di-skip
})

test('fetchWatchlist: TOKEN_EXPIRED langsung ABORT -- simbol setelahnya TIDAK PERNAH dicoba', async () => {
  resetMocks()
  _mockDailyBySym.AAAA = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]
  _forceDailyStatus.BBBB = 401 // TOKEN_EXPIRED

  await assert.rejects(
    () => fetchWatchlist(['AAAA', 'BBBB', 'CCCC'], '2026-01-15', '2026-01-15'),
    (err) => err.code === 'TOKEN_EXPIRED'
  )
  assert.deepEqual(_dailyCallOrder, ['AAAA', 'BBBB']) // CCCC TIDAK PERNAH dicoba -- tidak ada gunanya, token sama pasti gagal lagi
})

test('fetchWatchlist: onResult dipanggil utk simbol gagal JUGA (bukan cuma yg sukses)', async () => {
  resetMocks()
  _forceDailyStatus.AAAA = 503
  const calls = []
  await fetchWatchlist(['AAAA'], '2026-01-15', '2026-01-15', () => {}, (sym, result) => calls.push({ sym, hasError: !!result.error }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].sym, 'AAAA')
  assert.equal(calls[0].hasError, true)
})

test('fetchWatchlist: RATE_LIMITED tidak abort (lanjut ke simbol berikutnya, BUKAN seperti TOKEN_EXPIRED)', { timeout: 10000 }, async () => {
  resetMocks()
  _forceDailyStatus.AAAA = 429
  _mockDailyBySym.BBBB = [{ date: '2026-01-15', open: 100, high: 105, low: 95, close: 102, volume: 1, foreignbuy: 0, foreignsell: 0 }]

  const results = await fetchWatchlist(['AAAA', 'BBBB'], '2026-01-15', '2026-01-15')
  assert.equal(results[0].error.code, 'RATE_LIMITED')
  assert.equal(results[1].error, null) // BBBB tetap diproses, BEDA dari TOKEN_EXPIRED yg abort total
  assert.deepEqual(_dailyCallOrder, ['AAAA', 'BBBB'])
})
