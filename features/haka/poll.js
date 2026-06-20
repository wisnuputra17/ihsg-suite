/**
 * features/haka/poll.js
 * ======================
 * Monitor running-trade real-time — mode HAKA (buy saja) atau HAKA+HAKI (buy+sell).
 * Logic ini sudah diverifikasi langsung ke API Stockbit di sesi sebelumnya — jangan
 * ubah parameter inti (batch size, limit, format query) tanpa alasan kuat.
 *
 * Aturan ketat:
 *   - HANYA fetch + deteksi transaksi besar
 *   - TIDAK ada render, TIDAK ada akses db.js langsung
 *   - Semua alert → koordinator via callback onAlert()
 *   - STATE internal (timer, lastIds, pollCount) — tidak disimpan ke db/Sheets
 *
 * Arsitektur polling:
 *   setInterval 3000ms
 *   → bagi watchlist jadi batch 20 saham
 *   → tiap batch = 1 request, query: symbols[]=BBCA&symbols[]=TLKM&...&limit=300
 *   → proses tiap transaksi: strip koma dari lot & price, hitung value
 *   → dedup via Set transaksi id, reset tiap 200 poll (cegah memory leak)
 */

import { TOKEN } from '../../shared/store.js'

// ============================================================
// SEKSI 1: KONSTANTA
// ============================================================

const HOST         = 'https://exodus.stockbit.com'
const POLL_MS      = 3000
const BATCH_SIZE   = 20
const LIMIT        = 300
const RESET_EVERY  = 200

// ============================================================
// SEKSI 2: STATE INTERNAL — per-monitor (bukan modul-level)
// Dibuat lewat createMonitor() supaya HAKA dan HAKA+HAKI bisa
// punya 2 instance independen tanpa saling tabrak state.
// ============================================================

/**
 * Buat 1 instance monitor independen.
 * @param {'buy'|'both'} mode - 'buy' = HAKA saja, 'both' = HAKA + HAKI
 */
export function createMonitor(mode = 'buy') {
  let _timer     = null
  let _lastIds   = new Set()
  let _pollCount = 0
  let _running   = false
  let _callbacks = {}

  function init(callbacks) {
    _callbacks = callbacks
  }

  function start(watchlist, threshold) {
    if (_running) return
    if (!watchlist.length) return
    if (!TOKEN.isSet()) {
      if (_callbacks.onError) _callbacks.onError(Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' }))
      return
    }

    _running   = true
    _pollCount = 0
    _lastIds   = new Set()

    _poll(watchlist, threshold)
    _timer = setInterval(() => _poll(watchlist, threshold), POLL_MS)
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null }
    _running   = false
    _pollCount = 0
  }

  function isRunning() { return _running }

  async function _poll(watchlist, threshold) {
    _pollCount++
    if (_pollCount % RESET_EVERY === 0) _lastIds = new Set()

    const batches = _chunk(watchlist, BATCH_SIZE)

    for (const batch of batches) {
      try {
        const trades = await _fetchBatch(batch)
        _processTrades(trades, threshold)
      } catch (e) {
        if (e.code === 'TOKEN_EXPIRED') {
          stop()
          if (_callbacks.onError) _callbacks.onError(e)
          return
        }
        console.warn('[haka/poll] batch error:', e.message)
      }
    }

    if (_callbacks.onPollDone) _callbacks.onPollDone(_pollCount)
  }

  async function _fetchBatch(syms) {
    const token = TOKEN.get()
    if (!token) throw Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' })

    const symParams = syms.map(s => `symbols%5B%5D=${encodeURIComponent(s)}`).join('&')
    const url = `${HOST}/order-trade/running-trade?${symParams}&sort=DESC&limit=${LIMIT}&order_by=RUNNING_TRADE_ORDER_BY_TIME`

    let res
    try {
      res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
    } catch (e) {
      throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', detail: e.message })
    }

    if (res.status === 401) throw Object.assign(new Error('TOKEN_EXPIRED'), { code: 'TOKEN_EXPIRED' })
    if (res.status === 429) throw Object.assign(new Error('RATE_LIMITED'),  { code: 'RATE_LIMITED' })
    if (!res.ok)            throw Object.assign(new Error('FETCH_FAILED'),  { code: 'FETCH_FAILED', status: res.status })

    const json = await res.json()
    return json?.data?.running_trade || []
  }

  function _processTrades(trades, threshold) {
    for (const t of trades) {
      const id = t.id || `${t.code}-${t.time}-${t.lot}-${t.price}-${t.action}`
      if (_lastIds.has(id)) continue
      _lastIds.add(id)

      // WAJIB strip koma — price/lot bisa berformat "1,740"
      const lot   = parseFloat((t.lot   || '0').toString().replace(/,/g, '')) || 0
      const price = parseFloat((t.price || '0').toString().replace(/,/g, '')) || 0
      const value = lot * price * 100   // 100 lembar per lot

      if (value < threshold) continue

      const isBuy  = t.action === 'buy'
      const isSell = t.action === 'sell'

      // Mode 'buy': hanya proses transaksi buy (HAKA)
      if (mode === 'buy' && !isBuy) continue
      // Mode 'both': proses buy DAN sell (HAKA + HAKI)
      if (mode === 'both' && !isBuy && !isSell) continue

      const alert = {
        sym:    t.code,
        price,
        lot,
        value,
        action: t.action,
        type:   isBuy ? 'HAKA' : 'HAKI',
        time:   t.time || new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }),
        id
      }
      if (_callbacks.onAlert) _callbacks.onAlert(alert)
    }
  }

  return { init, start, stop, isRunning }
}

// ============================================================
// SEKSI 3: HELPER INTERNAL
// ============================================================

function _chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
