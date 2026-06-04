/**
 * scalping/haka.js
 * ================
 * Monitor BUY agresif (HAKA — Hajar Kanan) real-time.
 * Aturan ketat:
 *   - HANYA fetch running-trade + deteksi transaksi besar
 *   - TIDAK ada render, TIDAK ada akses DB langsung
 *   - Semua alert → lapor ke koordinator via callback onAlert()
 *   - STATE internal (timer, lastIds, pollCount) — tidak di store/db
 *
 * Arsitektur polling:
 *   setInterval 3000ms
 *   → bagi watchlist jadi batch 20 saham
 *   → tiap batch = 1 request limit=300
 *   → proses tiap transaksi: parse lot+price (strip koma!), hitung value
 *   → value >= threshold && action==='buy' → onAlert()
 *   → dedup via _lastIds (Set transaksi id)
 *   → reset _lastIds tiap 200 poll (cegah memory leak)
 */

import { TOKEN } from '../shared/store.js'

// ============================================================
// SEKSI 1: KONSTANTA
// ============================================================

const HOST         = 'https://exodus.stockbit.com'
const POLL_MS      = 3000    // interval polling (ms)
const BATCH_SIZE   = 20      // saham per request
const LIMIT        = 300     // transaksi per request (jangan turunkan ke bawah 150)
const RESET_EVERY  = 200     // reset lastIds tiap N poll

// ============================================================
// SEKSI 2: STATE INTERNAL — tidak di store/db
// ============================================================

let _timer     = null        // setInterval id
let _lastIds   = new Set()   // dedup transaksi id
let _pollCount = 0           // counter untuk reset lastIds
let _running   = false       // status polling
let _callbacks = {}          // callback dari koordinator

// ============================================================
// SEKSI 3: INIT
// ============================================================

/**
 * Inisialisasi HAKA monitor.
 * Dipanggil koordinator sekali saat load.
 * @param {Object} callbacks
 * @param {Function} callbacks.onAlert    - (alert) => void — dipanggil tiap alert baru
 * @param {Function} callbacks.onError    - (err) => void — dipanggil saat error fatal
 * @param {Function} callbacks.onPollDone - (count) => void — dipanggil tiap poll selesai (opsional)
 */
export function init(callbacks) {
  _callbacks = callbacks
}

// ============================================================
// SEKSI 4: START / STOP
// ============================================================

/**
 * Mulai polling HAKA.
 * @param {string[]} watchlist - saham yang dimonitor
 * @param {number}   threshold - nilai minimum transaksi (Rp)
 */
export function start(watchlist, threshold) {
  if (_running) return
  if (!watchlist.length) return
  if (!TOKEN.isSet()) {
    if (_callbacks.onError) _callbacks.onError(new Error('TOKEN_NOT_SET'))
    return
  }

  _running   = true
  _pollCount = 0
  _lastIds   = new Set()

  // Poll langsung sekali, lalu tiap POLL_MS
  _poll(watchlist, threshold)
  _timer = setInterval(() => _poll(watchlist, threshold), POLL_MS)
}

/**
 * Stop polling HAKA.
 */
export function stop() {
  if (_timer) { clearInterval(_timer); _timer = null }
  _running   = false
  _pollCount = 0
}

export function isRunning() { return _running }

// ============================================================
// SEKSI 5: POLLING LOGIC
// ============================================================

/**
 * Satu siklus poll — bagi watchlist jadi batch, fetch tiap batch.
 * @param {string[]} watchlist
 * @param {number}   threshold
 */
async function _poll(watchlist, threshold) {
  _pollCount++

  // Reset lastIds tiap RESET_EVERY poll — cegah memory leak
  if (_pollCount % RESET_EVERY === 0) {
    _lastIds = new Set()
  }

  // Bagi watchlist jadi batch BATCH_SIZE
  const batches = _chunk(watchlist, BATCH_SIZE)
  let totalAlert = 0

  for (const batch of batches) {
    try {
      const trades = await _fetchBatch(batch)
      const found  = _processTrades(trades, threshold)
      totalAlert  += found
    } catch (e) {
      // Token expired → stop polling, lapor ke koordinator
      if (e.code === 'TOKEN_EXPIRED') {
        stop()
        if (_callbacks.onError) _callbacks.onError(e)
        return
      }
      // Error lain (network) → skip batch ini, lanjut batch berikutnya
      console.warn('[haka] batch error:', e.message)
    }
  }

  if (_callbacks.onPollDone) _callbacks.onPollDone(_pollCount)
}

// ============================================================
// SEKSI 6: FETCH BATCH
// ============================================================

/**
 * Fetch running-trade untuk 1 batch saham.
 * @param {string[]} syms - maks BATCH_SIZE saham
 * @returns transaksi mentah[]
 */
async function _fetchBatch(syms) {
  const token = TOKEN.get()
  if (!token) throw Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' })

  // Build query: symbols%5B%5D=BBCA&symbols%5B%5D=TPIA&...
  const symParams = syms.map(s => `symbols%5B%5D=${encodeURIComponent(s)}`).join('&')
  const url = `${HOST}/order-trade/running-trade?${symParams}&sort=DESC&limit=${LIMIT}&order_by=RUNNING_TRADE_ORDER_BY_TIME`

  let res
  try {
    res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token }
    })
  } catch (e) {
    throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', detail: e.message })
  }

  if (res.status === 401) throw Object.assign(new Error('TOKEN_EXPIRED'), { code: 'TOKEN_EXPIRED' })
  if (res.status === 429) throw Object.assign(new Error('RATE_LIMITED'),  { code: 'RATE_LIMITED' })
  if (!res.ok)            throw Object.assign(new Error('FETCH_FAILED'),  { code: 'FETCH_FAILED', status: res.status })

  const json = await res.json()
  return json?.data?.running_trade || []
}

// ============================================================
// SEKSI 7: PROSES TRANSAKSI
// ============================================================

/**
 * Proses array transaksi mentah — deteksi HAKA.
 * @param {Object[]} trades  - transaksi dari running-trade API
 * @param {number}   threshold
 * @returns {number} jumlah alert yang ditemukan
 */
function _processTrades(trades, threshold) {
  let found = 0

  for (const t of trades) {
    // Dedup — skip kalau sudah diproses
    const id = t.id || `${t.code}-${t.time}-${t.lot}-${t.price}`
    if (_lastIds.has(id)) continue
    _lastIds.add(id)

    // ⚠️ WAJIB strip koma — price "1,740" → 1740 (bug #1 dari handoff)
    const lot   = parseFloat((t.lot   || '0').toString().replace(/,/g, '')) || 0
    const price = parseFloat((t.price || '0').toString().replace(/,/g, '')) || 0
    const value = lot * price * 100   // 100 lembar per lot

    // HAKA = BUY agresif >= threshold
    if (t.action === 'buy' && value >= threshold) {
      const alert = {
        sym:    t.code,
        price,
        lot,
        value,
        action: 'buy',
        time:   t.time || new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }),
        id
      }
      if (_callbacks.onAlert) _callbacks.onAlert(alert)
      found++
    }
  }

  return found
}

// ============================================================
// SEKSI 8: HELPER INTERNAL
// ============================================================

/**
 * Bagi array jadi chunks.
 * @param {any[]} arr
 * @param {number} size
 * @returns {any[][]}
 */
function _chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}
