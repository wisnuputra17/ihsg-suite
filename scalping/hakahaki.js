/**
 * scalping/hakahaki.js
 * ====================
 * Monitor BUY + SELL agresif untuk posisi aktif (maks 20 saham).
 * HAKA = Hajar Kanan (BUY agresif) — sinyal akumulasi
 * HAKI = Hajar Kiri  (SELL agresif) — sinyal distribusi
 *
 * Perbedaan dari haka.js:
 *   - Deteksi KEDUA action: buy (HAKA) dan sell (HAKI)
 *   - Fokus posisi aktif — maks 20 saham (bukan alert entry)
 *   - Watchlist berbeda dari HAKA
 *
 * Aturan ketat:
 *   - HANYA fetch + deteksi
 *   - TIDAK ada render, TIDAK ada akses DB langsung
 *   - Semua alert → koordinator via onAlert()
 *   - STATE internal tidak di store/db
 */

import { TOKEN } from '../shared/store.js'

// ============================================================
// SEKSI 1: KONSTANTA
// ============================================================

const HOST        = 'https://exodus.stockbit.com'
const POLL_MS     = 3000
const BATCH_SIZE  = 20      // maks 20 saham — pas 1 batch saja
const LIMIT       = 300
const RESET_EVERY = 200

// ============================================================
// SEKSI 2: STATE INTERNAL
// ============================================================

let _timer     = null
let _lastIds   = new Set()
let _pollCount = 0
let _running   = false
let _callbacks = {}

// ============================================================
// SEKSI 3: INIT
// ============================================================

/**
 * @param {Object} callbacks
 * @param {Function} callbacks.onAlert    - (alert) => void
 * @param {Function} callbacks.onError    - (err) => void
 * @param {Function} callbacks.onPollDone - (count) => void (opsional)
 */
export function init(callbacks) {
  _callbacks = callbacks
}

// ============================================================
// SEKSI 4: START / STOP
// ============================================================

/**
 * Mulai polling HAKA+HAKI.
 * @param {string[]} watchlist - maks 20 saham posisi aktif
 * @param {number}   threshold
 */
export function start(watchlist, threshold) {
  if (_running) return
  if (!watchlist.length) return
  if (!TOKEN.isSet()) {
    if (_callbacks.onError) _callbacks.onError(new Error('TOKEN_NOT_SET'))
    return
  }

  // Batasi maks 20 saham — lebih dari itu potong
  const wl = watchlist.slice(0, BATCH_SIZE)

  _running   = true
  _pollCount = 0
  _lastIds   = new Set()

  _poll(wl, threshold)
  _timer = setInterval(() => _poll(wl, threshold), POLL_MS)
}

/**
 * Stop polling HAKA+HAKI.
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
 * Satu siklus poll.
 * Karena maks 20 saham — selalu 1 batch saja, tidak perlu loop.
 */
async function _poll(watchlist, threshold) {
  _pollCount++

  if (_pollCount % RESET_EVERY === 0) {
    _lastIds = new Set()
  }

  try {
    const trades = await _fetchBatch(watchlist)
    const found  = _processTrades(trades, threshold)
    if (_callbacks.onPollDone) _callbacks.onPollDone(_pollCount)
  } catch (e) {
    if (e.code === 'TOKEN_EXPIRED') {
      stop()
      if (_callbacks.onError) _callbacks.onError(e)
      return
    }
    console.warn('[hakahaki] poll error:', e.message)
  }
}

// ============================================================
// SEKSI 6: FETCH BATCH
// ============================================================

async function _fetchBatch(syms) {
  const token = TOKEN.get()
  if (!token) throw Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' })

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
 * Proses transaksi — deteksi HAKA (buy) DAN HAKI (sell).
 * Perbedaan utama dari haka.js: tidak filter action, keduanya diproses.
 */
function _processTrades(trades, threshold) {
  let found = 0

  for (const t of trades) {
    const id = t.id || `${t.code}-${t.time}-${t.lot}-${t.price}-${t.action}`
    if (_lastIds.has(id)) continue
    _lastIds.add(id)

    // ⚠️ WAJIB strip koma — bug #1 dari handoff
    const lot   = parseFloat((t.lot   || '0').toString().replace(/,/g, '')) || 0
    const price = parseFloat((t.price || '0').toString().replace(/,/g, '')) || 0
    const value = lot * price * 100

    // Hanya proses kalau >= threshold — berlaku untuk buy DAN sell
    if (value < threshold) continue

    // Tentukan tipe: HAKA (buy) atau HAKI (sell)
    const isHaka = t.action === 'buy'
    const isHaki = t.action === 'sell'

    if (!isHaka && !isHaki) continue

    const alert = {
      sym:    t.code,
      price,
      lot,
      value,
      action: t.action,           // 'buy' | 'sell'
      type:   isHaka ? 'HAKA' : 'HAKI',
      time:   t.time || new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }),
      id
    }

    if (_callbacks.onAlert) _callbacks.onAlert(alert)
    found++
  }

  return found
}
