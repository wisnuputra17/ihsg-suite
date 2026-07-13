/**
 * shared/api.js
 * =============
 * Semua komunikasi ke luar — Stockbit & Google Apps Script.
 * Aturan ketat:
 *   - HANYA fetch & sanitasi data
 *   - TIDAK boleh simpan ke store, render, atau kalkulasi
 *   - Selalu throw error dengan nama jelas — koordinator yang catch
 *   - Semua angka di-sanitasi via toNum() sebelum di-return
 *
 * Error names yang di-throw:
 *   TOKEN_EXPIRED   → 401
 *   BAD_REQUEST     → 400
 *   NOT_FOUND       → 404
 *   RATE_LIMITED    → 429
 *   SERVER_ERROR    → 5xx
 *   FETCH_FAILED    → network error / unknown
 *   EMPTY_RESPONSE  → response kosong / tidak ada data
 */

import { TOKEN } from './store.js'

// ============================================================
// SEKSI 1: KONFIGURASI
// ============================================================

const HOST_STOCKBIT = 'https://exodus.stockbit.com'
const EMITEN_JSON_URL = 'https://raw.githubusercontent.com/wisnuputra17/ihsg-suite/main/emiten.json'

// ============================================================
// SEKSI 2: HELPER INTERNAL
// ============================================================

/** Header auth untuk semua request Stockbit */
function _headers() {
  const token = TOKEN.get()
  if (!token) throw Object.assign(new Error('TOKEN_NOT_SET'), { code: 'TOKEN_NOT_SET' })
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
}

/**
 * Sanitasi nilai angka dari response Stockbit.
 * Handles: number, string "1,234,567", object {raw:"7894601000", formatted:"7.89B"}
 */
function toNum(v) {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v.replace(/,/g, '')) || 0
  if (typeof v === 'object' && v.raw !== undefined) return parseFloat(String(v.raw).replace(/,/g, '')) || 0
  return 0
}

/**
 * Wrapper fetch dengan error handling terpusat.
 * Selalu throw Error dengan nama yang jelas.
 */
async function _fetch(url, options = {}) {
  // Timeout 15 detik — cegah UI freeze kalau Stockbit lambat/down
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15_000)
  let res
  try {
    res = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(timer)
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT', detail: 'Request timeout 15s' })
    throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', detail: e.message })
  }

  if (res.status === 401) throw Object.assign(new Error('TOKEN_EXPIRED'),  { code: 'TOKEN_EXPIRED' })
  if (res.status === 400) throw Object.assign(new Error('BAD_REQUEST'),    { code: 'BAD_REQUEST' })
  if (res.status === 404) throw Object.assign(new Error('NOT_FOUND'),      { code: 'NOT_FOUND' })
  if (res.status === 429) throw Object.assign(new Error('RATE_LIMITED'),   { code: 'RATE_LIMITED' })
  if (res.status >= 500)  throw Object.assign(new Error('SERVER_ERROR'),   { code: 'SERVER_ERROR', status: res.status })
  if (!res.ok)            throw Object.assign(new Error('FETCH_FAILED'),   { code: 'FETCH_FAILED', status: res.status })

  // Sanitize non-ASCII dari response Stockbit sebelum parse
  const text  = await res.text()
  const clean = text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
  const json  = JSON.parse(clean)
  return json
}

// ============================================================
// SEKSI 3: STOCKBIT — OHLCV
// ============================================================

/**
 * Fetch OHLCV harian (2005–sekarang, split-adjusted).
 * WAJIB pakai YYYY-MM-DD string (bukan unix) — cegah bug candle Jumat hilang.
 * @returns Array of {date, open, high, low, close, volume, foreignbuy, foreignsell}
 */
export async function fetchDaily(sym, from, to) {
  // WIB offset — new Date() UTC bisa beda tanggal antara 00:00-07:00 WIB
  const today = new Date(Date.now() + 7*3600*1000).toISOString().slice(0, 10)
  const _from = from || today
  const _to   = to   || '2000-01-01'

  const url = `${HOST_STOCKBIT}/chartbit/${sym}/price/daily?from=${_from}&to=${_to}&limit=0`
  const json = await _fetch(url, { headers: _headers() })

  // field: data.chartbit (sama seperti intraday)
  const raw = json?.data?.chartbit || json?.data?.candles || []
  if (!raw.length) throw Object.assign(new Error('EMPTY_RESPONSE'), { code: 'EMPTY_RESPONSE', sym })

  return raw.map(c => ({
    // date bisa 'date' (YYYY-MM-DD) atau 'datetime' (YYYY-MM-DD HH:MM:SS) — normalisasi ke YYYY-MM-DD
    date:        (c.date || c.datetime || '').slice(0, 10),
    unixdate:    toNum(c.unixdate || c.unix_timestamp),
    open:        toNum(c.open),
    high:        toNum(c.high),
    low:         toNum(c.low),
    close:       toNum(c.close),
    volume:      toNum(c.volume),
    foreignbuy:  toNum(c.foreignbuy ?? c.foreign_buy),
    foreignsell: toNum(c.foreignsell ?? c.foreign_sell)
  }))
}

/**
 * Fetch OHLCV intraday.
 * from > to (from=sekarang, to=masa lalu) — terbalik dari intuisi.
 * Batch size aman: 5m/15m = 7 hari, 30m/60m = 30 hari.
 * @param {number} fromTs - unix timestamp lebih baru (detik)
 * @param {number} toTs   - unix timestamp lebih lama (detik)
 * @param {number} mult   - minutes_multiplier: 1/5/15/30/60
 * @returns Array of {datetime, unix, open, high, low, close, volume, value, frequency, foreign_buy, foreign_sell}
 */
export async function fetchIntraday(sym, fromTs, toTs, mult = 5) {
  const url = `${HOST_STOCKBIT}/chartbit/${sym}/price/intraday?from=${fromTs}&to=${toTs}&limit=0&minutes_multiplier=${mult}`
  const json = await _fetch(url, { headers: _headers() })

  // field: data.chartbit (bukan data.candles)
  const raw = json?.data?.chartbit || json?.data?.candles || []
  if (!raw.length) throw Object.assign(new Error('EMPTY_RESPONSE'), { code: 'EMPTY_RESPONSE', sym })

  return raw.map(c => {
    // unix_timestamp adalah STRING di response
    const ts = toNum(c.unix_timestamp) ||
      Math.floor(new Date(c.datetime.replace(' ', 'T') + '+07:00').getTime() / 1000)
    return {
      datetime:     c.datetime,
      unix:         ts,
      open:         toNum(c.open),
      high:         toNum(c.high),
      low:          toNum(c.low),
      close:        toNum(c.close),
      volume:       toNum(c.volume),
      value:        toNum(c.value),
      frequency:    toNum(c.frequency),
      foreign_buy:  toNum(c.foreign_buy),
      foreign_sell: toNum(c.foreign_sell)
    }
  })
}

// ============================================================
// SEKSI 4: STOCKBIT — BROKER
// ============================================================

/**
 * Fetch data broker per saham (marketdetectors).
 * from = to → data 1 hari spesifik.
 * ⚠️ MARKET_BOARD_REGULER (bukan MARKET_TYPE_REGULER)
 * @returns {buys:[], sells:[], bandar:{}}
 */
export async function fetchBroker(sym, from, to) {
  const _to = to || from
  const url = `${HOST_STOCKBIT}/marketdetectors/${sym}` +
    `?transaction_type=TRANSACTION_TYPE_NET` +
    `&market_board=MARKET_BOARD_REGULER` +
    `&investor_type=INVESTOR_TYPE_ALL` +
    `&limit=100` +
    `&from=${from}&to=${_to}`

  const json = await _fetch(url, { headers: _headers() })
  const summary = json?.data?.broker_summary || {}
  const bandar  = json?.data?.bandar_detector || {}

  // ⚠️ Sell field = sval/slot/netbs_sell_avg_price (BUKAN bval/blot)
  // sval/slot sudah negatif — tidak perlu dibalik
  const buys = (summary.brokers_buy || []).map(b => ({
    code:  b.netbs_broker_code,
    type:  b.type,
    val:   toNum(b.bval),                  // net Rp positif
    lot:   toNum(b.blot),                  // lot positif
    avg:   toNum(b.netbs_buy_avg_price),
    freq:  toNum(b.freq),
    date:  b.netbs_date
  }))

  const sells = (summary.brokers_sell || []).map(b => ({
    code:  b.netbs_broker_code,
    type:  b.type,
    val:   toNum(b.sval),                  // net Rp negatif (sudah negatif)
    lot:   toNum(b.slot),                  // lot negatif (sudah negatif)
    avg:   toNum(b.netbs_sell_avg_price),
    freq:  toNum(b.freq),
    date:  b.netbs_date
  }))

  return { buys, sells, bandar }
}

/**
 * Fetch aktivitas 1 broker across semua saham (broker reverse).
 * ⚠️ MARKET_TYPE_REGULER (beda dari marketdetectors!)
 */
export async function fetchBrokerReverse(brokerCode, from, to) {
  const url = `${HOST_STOCKBIT}/order-trade/broker/activity` +
    `?broker_code=${brokerCode}` +
    `&from=${from}&to=${to}` +
    `&transaction_type=TRANSACTION_TYPE_NET` +
    `&market_board=MARKET_TYPE_REGULER` +
    `&investor_type=INVESTOR_TYPE_ALL` +
    `&limit=200&page=1`

  const json = await _fetch(url, { headers: _headers() })
  return json?.data || []
}

// ============================================================
// SEKSI 5: STOCKBIT — ABSORPTION (TRADE BOOK)
// ============================================================

/**
 * Fetch data absorption / trade book per menit.
 * buy[] & sell[] = CUMULATIVE → hitung delta sebelum pakai
 * net_values[] = sudah per menit → langsung pakai
 * @param {string} date - YYYY-MM-DD
 * @returns {net:[], buy:[], sell:[], bigMoneyNet:[], prices:[]}
 */
export async function fetchAbsorption(sym, date) {
  const url = `${HOST_STOCKBIT}/order-trade/trade-book/chart` +
    `?symbol=${sym}&time_interval=1m&date=${date}`

  const json = await _fetch(url, { headers: _headers() })
  const d = json?.data || {}

  // Helper: konversi "HH:MM" ke unix timestamp WIB
  function toTs(timeStr) {
    const [hh, mm] = timeStr.split(':')
    return Math.floor(new Date(`${date}T${hh}:${mm}:00+07:00`).getTime() / 1000)
  }

  // Helper: hitung delta dari array cumulative
  function toDelta(arr) {
    return (arr || []).map((item, i) => {
      const val  = toNum(item.value)
      const prev = i > 0 ? toNum(arr[i - 1].value) : 0
      return { time: toTs(item.time), value: Math.max(0, val - prev) }
    })
  }

  // net_values sudah per menit — langsung pakai
  const net = (d.net_values || []).map(r => ({
    time:  toTs(r.time),
    value: toNum(r.value)
  }))

  return {
    net,                         // per menit, langsung pakai
    buy:         toDelta(d.buy),  // delta dari cumulative
    sell:        toDelta(d.sell), // delta dari cumulative
    bigMoneyNet: (d.big_money_net_values || []).map(r => ({
      time:  toTs(r.time),
      value: toNum(r.value)
    })),
    prices: (d.prices || []).map(r => ({
      time:  toTs(r.time),
      value: toNum(r.value)
    })),
    isFca: d.is_fca_stock || false
  }
}

// ============================================================
// SEKSI 6: STOCKBIT — INFO & STATUS
// ============================================================

/**
 * Fetch info lengkap 1 emiten.
 * @returns {name, symbol, sector, sub_sector, indexes[], tradeable, price, ...}
 */
export async function fetchEmitenInfo(sym) {
  const url = `${HOST_STOCKBIT}/emitten/${sym}/info`
  const json = await _fetch(url, { headers: _headers() })
  return json?.data || {}
}

/**
 * Fetch status pasar real-time.
 * @returns {market, iepiev_regular, iepiev_fca} — masing-masing 'open'|'close'
 */
export async function fetchMarketStatus() {
  const url = `${HOST_STOCKBIT}/company-price-feed/market-time`
  const json = await _fetch(url, { headers: _headers() })
  const d = json?.data || {}
  return {
    market:         d.market?.status         === 'STATUS_OPEN' ? 'open' : 'close',
    iepiev_regular: d.iepiev_regular?.status === 'STATUS_OPEN' ? 'open' : 'close',
    iepiev_fca:     d.iepiev_fca?.status     === 'STATUS_OPEN' ? 'open' : 'close'
  }
}

/**
 * Fetch order book 1 saham.
 */
export async function fetchOrderBook(sym) {
  const url = `${HOST_STOCKBIT}/company-price-feed/v2/orderbook/companies/${sym}`
  const json = await _fetch(url, { headers: _headers() })
  return json?.data || {}
}

/**
 * Fetch IEP (Indicative Equilibrium Price) via intraday 1 menit.
 * Sama dengan fetchIntraday tapi khusus mult=1 untuk IEP Scanner.
 */
export async function fetchIEP(sym, fromTs, toTs) {
  return fetchIntraday(sym, fromTs, toTs, 1)
}

// ============================================================
// SEKSI 8: EMITEN.JSON
// ============================================================

/**
 * Fetch emiten.json dari repo ihsg-suite.
 * Di-panggil sekali saat pertama modul butuh EMITEN_INFO.
 * @returns raw JSON {generated, count, emiten:[]}
 */
export async function fetchEmitenJson() {
  const json = await _fetch(EMITEN_JSON_URL)
  if (!json?.emiten?.length) throw Object.assign(new Error('EMPTY_RESPONSE'), { code: 'EMPTY_RESPONSE' })
  return json
}
