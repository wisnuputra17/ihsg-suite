/**
 * features/haka/poll.js
 * ======================
 * Monitor running-trade real-time — SATU instance bersama untuk SEMUA card
 * (bukan per-mode lagi). Poller ini MODE-AGNOSTIK: selalu proses transaksi
 * buy DAN sell, kasih tahu coordinator (index.html) lewat onAlert(trade) —
 * coordinator yang putuskan card mana yang relevan & mode card itu (HAKA saja
 * atau HAKA+HAKI), karena keputusan itu sekarang per-card, bukan per-monitor.
 *
 * Kenapa SATU monitor bersama (bukan 1 monitor per card): API running-trade
 * sudah bisa terima banyak simbol per request (batch 20) — kalau tiap card
 * punya monitor sendiri, simbol yang sama (misal ada di card tunggal MAUPUN
 * di card multi) akan di-fetch dobel. Jadi: kumpulkan SEMUA simbol unik dari
 * SEMUA card, baru di-batch-poll bersama.
 *
 * Logic inti TIDAK diubah dari versi sebelumnya (sudah diverifikasi ke API
 * Stockbit) — batch size, limit, interval, dedup semua sama persis.
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
// SEKSI 2: STATE INTERNAL
// ============================================================

export function createMonitor() {
  let _timer       = null
  let _lastIds     = new Set()
  let _pollCount   = 0
  let _running     = false
  let _callbacks   = {}
  let _getSymbols  = () => []   // dipanggil tiap poll — selalu ambil simbol TERBARU dari coordinator
  let _startedAt   = null       // timestamp mulai monitor, utk diagnostik timing

  function init(callbacks) {
    _callbacks = callbacks
  }

  /**
   * @param {() => string[]} getSymbolsFn - dipanggil tiap poll, supaya kalau
   *   coordinator nambah/hapus card di tengah jalan, poller otomatis ikut
   *   tanpa perlu di-restart manual.
   */
  function start(getSymbolsFn) {
    if (_running) return
    if (!TOKEN.isSet()) {
      if (_callbacks.onError) _callbacks.onError(Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' }))
      return
    }

    _getSymbols = getSymbolsFn
    _running    = true
    _pollCount  = 0
    _lastIds    = new Set()
    _startedAt  = Date.now()
    console.log(`[haka/poll] START — ${new Date(_startedAt).toLocaleTimeString('id-ID')}, simbol:`, getSymbolsFn())

    _poll()
    _timer = setInterval(_poll, POLL_MS)
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null }
    _running   = false
    _pollCount = 0
  }

  function isRunning() { return _running }

  async function _poll() {
    const watchlist = _getSymbols()
    if (!watchlist.length) return

    _pollCount++
    if (_pollCount % RESET_EVERY === 0) _lastIds = new Set()

    const batches = _chunk(watchlist, BATCH_SIZE)
    let totalReceived = 0, totalNew = 0

    for (const batch of batches) {
      try {
        const trades = await _fetchBatch(batch)
        totalReceived += trades.length
        totalNew += _processTrades(trades)
      } catch (e) {
        if (e.code === 'TOKEN_EXPIRED') {
          stop()
          if (_callbacks.onError) _callbacks.onError(e)
          return
        }
        console.warn('[haka/poll] batch error:', e.message)
      }
    }

    const elapsedSec = _startedAt ? ((Date.now() - _startedAt) / 1000).toFixed(1) : '?'
    console.log(`[haka/poll] poll #${_pollCount} (+${elapsedSec}s) — diterima:${totalReceived} baru:${totalNew} lastIds:${_lastIds.size}`)

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

  /**
   * Mode & threshold-AGNOSTIK sepenuhnya — kirim SEMUA trade buy/sell ke
   * coordinator tanpa klasifikasi apapun. Coordinator yang putuskan per-card:
   * relevan/tidak (simbol), lolos threshold card itu atau tidak (tiap card
   * threshold-nya sendiri-sendiri sekarang, bukan 1 nilai global lagi).
   */
  function _processTrades(trades) {
    let newCount = 0
    for (const t of trades) {
      const id = t.id || `${t.code}-${t.time}-${t.lot}-${t.price}-${t.action}`
      if (_lastIds.has(id)) continue
      _lastIds.add(id)
      newCount++

      // WAJIB strip koma — price/lot bisa berformat "1,740"
      const lot   = parseFloat((t.lot   || '0').toString().replace(/,/g, '')) || 0
      const price = parseFloat((t.price || '0').toString().replace(/,/g, '')) || 0
      const value = lot * price * 100   // 100 lembar per lot

      const isBuy  = t.action === 'buy'
      const isSell = t.action === 'sell'
      if (!isBuy && !isSell) continue

      const alert = {
        sym:    t.code,
        price,
        lot,
        value,
        action: t.action,
        type:   isBuy ? 'HAKA' : 'HAKI',
        board:      t.market_board || '',
        buyer:      t.buyer || '',
        seller:     t.seller || '',
        buyerType:  t.buyer_type || '',
        time:   t.time || new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }),
        id
      }
      const elapsedSec = _startedAt ? ((Date.now() - _startedAt) / 1000).toFixed(1) : '?'
      console.log(`[haka/poll] TRADE BARU (+${elapsedSec}s sejak start) — jam transaksi asli: ${alert.time}, ${alert.sym} ${alert.action} value:${value.toLocaleString('id-ID')}`)
      if (_callbacks.onAlert) _callbacks.onAlert(alert)
    }
    return newCount
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
