/**
 * scalping/iep.js
 * ===============
 * IEP (Indicative Equilibrium Price) Scanner.
 * Scan harga keseimbangan pre-market (08:55–08:59 WIB) untuk semua saham.
 *
 * Aturan ketat:
 *   - HANYA fetch + kalkulasi IEP
 *   - TIDAK ada render, TIDAK ada akses DB langsung
 *   - Semua hasil → koordinator via callback
 *   - STATE internal tidak di store/db
 *
 * Alur:
 *   1. Fetch intraday 1 menit untuk batch saham
 *   2. Extract candle 08:57–08:59 → harga IEP + volume
 *   3. Hitung surge vs IEP kemarin
 *   4. Hitung MA10 dari 10 hari terakhir
 *   5. onResult(sym, data) tiap saham selesai
 *   6. onDone() saat semua selesai
 *
 * Auto-scan:
 *   - Saat tab IEP dibuka: cek apakah data hari ini sudah ada
 *   - Jam 08:55 WIB: auto-scan (kalau halaman terbuka)
 *   - Manual: user klik Scan
 */

import { TOKEN, SYMS, LQ45, IDX80 } from '../shared/store.js'
import { fetchIntraday }             from '../shared/api.js'
import { calcSMA }                   from '../shared/indicators.js'

// ============================================================
// SEKSI 1: KONSTANTA
// ============================================================

const IEP_DAYS        = 12      // historis IEP berapa hari
const IEP_FETCH_DAYS  = 40      // fetch lebih banyak: IEP_DAYS(12) + MA10 warmup(10) + libur nasional buffer(18)
const BATCH_SIZE      = 5       // saham per batch (intraday berat)
const BATCH_DELAY_MS  = 500     // jeda antar batch (ms) — cegah rate limit
const IEP_START_HOUR  = 8       // jam mulai IEP WIB
const IEP_START_MIN   = 55      // menit mulai IEP WIB
const IEP_CANDLE_MINS = ['08:57', '08:58', '08:59'] // candle yang dicari

// ============================================================
// SEKSI 2: STATE INTERNAL
// ============================================================

let _running   = false
let _stopped   = false
let _callbacks = {}
let _autoTimer = null   // setInterval untuk auto-scan jam 08:55

// ============================================================
// SEKSI 3: INIT
// ============================================================

/**
 * Inisialisasi IEP Scanner.
 * Dipanggil koordinator sekali saat load.
 * @param {Object} callbacks
 * @param {Function} callbacks.onResult   - (sym, iepData[]) => void — tiap saham selesai
 * @param {Function} callbacks.onProgress - (done, total) => void
 * @param {Function} callbacks.onDone     - () => void — semua saham selesai
 * @param {Function} callbacks.onError    - (err) => void
 */
export function init(callbacks) {
  _callbacks = callbacks
  _startAutoScheduler()
}

// ============================================================
// SEKSI 4: START / STOP
// ============================================================

/**
 * Mulai scan IEP.
 * @param {string} filter - 'ALL' | 'LQ45' | 'IDX80' | string[] custom
 */
export async function start(filter = 'LQ45') {
  if (_running) return
  if (!TOKEN.isSet()) {
    if (_callbacks.onError) _callbacks.onError(new Error('TOKEN_NOT_SET'))
    return
  }

  _running = true
  _stopped = false

  const syms = _resolveFilter(filter)
  if (!syms.length) {
    _running = false
    if (_callbacks.onError) _callbacks.onError(new Error('EMPTY_WATCHLIST'))
    return
  }

  await _scan(syms)

  _running = false
  if (!_stopped && _callbacks.onDone) _callbacks.onDone()
}

/**
 * Stop scan yang sedang berjalan.
 */
export function stop() {
  _stopped = true
  _running = false
}

export function isRunning() { return _running }

// ============================================================
// SEKSI 5: SCAN LOGIC
// ============================================================

/**
 * Scan semua saham dalam list — batch per BATCH_SIZE.
 */
async function _scan(syms) {
  const total   = syms.length
  let   done    = 0

  if (_callbacks.onProgress) _callbacks.onProgress(0, total)

  // Tentukan range tanggal: IEP_DAYS hari terakhir
  const dates  = _lastNTradingDays(IEP_FETCH_DAYS) // ambil lebih untuk MA10 warmup + weekend
  const fromTs = _dateToUnixStart(dates[dates.length - 1])  // hari paling lama
  const toTs   = _dateToUnixEnd(dates[0])                   // hari paling baru (from > to di intraday)

  // Batch processing
  const batches = _chunk(syms, BATCH_SIZE)

  for (const batch of batches) {
    if (_stopped) break

    // Proses tiap saham dalam batch secara paralel
    await Promise.allSettled(batch.map(async sym => {
      try {
        const candles  = await fetchIntraday(sym, toTs, fromTs, 1)
        const iepData  = _extractIEP(candles, dates.slice(0, IEP_DAYS))
        if (iepData.length && _callbacks.onResult) {
          _callbacks.onResult(sym, iepData)
        }
      } catch (e) {
        // Token expired → stop semua
        if (e.code === 'TOKEN_EXPIRED') {
          stop()
          if (_callbacks.onError) _callbacks.onError(e)
          return
        }
        // Error lain (saham tidak ada data) → skip
        console.warn(`[iep] ${sym} skip:`, e.message)
      } finally {
        done++
        if (_callbacks.onProgress) _callbacks.onProgress(done, total)
      }
    }))

    // Jeda antar batch — cegah rate limit
    if (!_stopped) await _sleep(BATCH_DELAY_MS)
  }
}

// ============================================================
// SEKSI 6: EKSTRAK IEP DARI CANDLE
// ============================================================

/**
 * Ekstrak harga IEP dari array intraday 1-menit.
 * Ambil candle 08:57–08:59 WIB per hari, prioritas 08:59.
 * Hitung surge vs hari sebelumnya + MA10.
 *
 * @param {{unix:number, close:number, volume:number}[]} candles
 * @param {string[]} dates - ['YYYY-MM-DD', ...] terbaru di index 0
 * @returns {{date, price, vol, surge, ma10}[]} terbaru di index 0
 */
function _extractIEP(candles, dates) {
  // Kelompokkan candle per hari
  const byDay = {}
  for (const c of candles) {
    const dt   = new Date(c.unix * 1000)
    const date = _toWIBDate(dt)
    const hhmm = _toWIBTime(dt)

    if (!IEP_CANDLE_MINS.includes(hhmm)) continue
    if (!byDay[date] || hhmm > byDay[date].hhmm) {
      byDay[date] = { hhmm, price: c.close, vol: c.volume }
    }
  }

  // Build array SEMUA hari dari byDay — terbaru di index 0
  // Hitung surge + MA10 dari semua data dulu, baru potong ke IEP_DAYS
  const allDays = Object.keys(byDay)
    .sort((a, b) => b.localeCompare(a))  // terbaru di index 0
    .map(date => ({ date, price: byDay[date].price, vol: byDay[date].vol }))

  if (!allDays.length) return []

  // Hitung MA10 volume dari seluruh data
  const volumes = allDays.map(d => d.vol)
  const ma10Vol = calcSMA(volumes, 10)
  allDays.forEach((d, i) => { d.ma10 = ma10Vol[i] })

  // Hitung surge = volume hari ini / MA10 volume
  allDays.forEach(d => {
    d.surge = (d.ma10 && d.ma10 > 0) ? d.vol / d.ma10 : null
  })

  // Ambil IEP_DAYS hari terbaru setelah MA terhitung
  return allDays.slice(0, IEP_DAYS)  // terbaru di index 0
}

// ============================================================
// SEKSI 7: AUTO SCHEDULER
// ============================================================

/**
 * Cek tiap menit apakah sudah jam 08:55 WIB → auto-scan.
 * Hanya jalan kalau halaman terbuka.
 */
function _startAutoScheduler() {
  // Clear scheduler lama kalau ada
  if (_autoTimer) clearInterval(_autoTimer)

  _autoTimer = setInterval(() => {
    const now  = new Date()
    const wib  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const h    = wib.getHours()
    const m    = wib.getMinutes()

    // Jam 08:55 WIB — trigger auto-scan
    if (h === IEP_START_HOUR && m === IEP_START_MIN && !_running) {
      if (_callbacks.onAutoScan) _callbacks.onAutoScan()
    }
  }, 60_000) // cek tiap 1 menit
}

export function stopAutoScheduler() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null }
}

// ============================================================
// SEKSI 8: HELPER — filter saham
// ============================================================

/**
 * Resolve filter menjadi array kode saham.
 * @param {'ALL'|'LQ45'|'IDX80'|string[]} filter
 * @returns {string[]}
 */
function _resolveFilter(filter) {
  if (Array.isArray(filter)) return filter
  if (filter === 'LQ45')  return [...LQ45]
  if (filter === 'IDX80') return [...IDX80]
  if (filter === 'ALL')   return [...SYMS]
  return [...LQ45]  // default LQ45
}

// ============================================================
// SEKSI 9: HELPER — tanggal & waktu WIB
// ============================================================

/**
 * Ambil N hari trading terakhir (weekday saja).
 * @param {number} n
 * @returns {string[]} ['YYYY-MM-DD', ...] terbaru di index 0
 */
function _lastNTradingDays(n) {
  const days = []
  const d    = new Date()
  // Konversi ke WIB
  const wib  = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

  while (days.length < n) {
    wib.setDate(wib.getDate() - 1)
    const dow = wib.getDay()
    if (dow !== 0 && dow !== 6) {  // bukan Minggu (0) atau Sabtu (6)
      days.push(_dateStr(wib))
    }
  }
  return days  // terbaru di index 0
}

function _dateStr(d) {
  return d.toISOString().slice(0, 10)
}

function _toWIBDate(dt) {
  return new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    .toISOString().slice(0, 10)
}

function _toWIBTime(dt) {
  return new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Unix timestamp awal hari (00:00 WIB) untuk tanggal YYYY-MM-DD.
 */
function _dateToUnixStart(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00+07:00').getTime() / 1000)
}

/**
 * Unix timestamp akhir hari (23:59 WIB) untuk tanggal YYYY-MM-DD.
 */
function _dateToUnixEnd(dateStr) {
  return Math.floor(new Date(dateStr + 'T23:59:59+07:00').getTime() / 1000)
}

// ============================================================
// SEKSI 10: HELPER — umum
// ============================================================

function _chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
