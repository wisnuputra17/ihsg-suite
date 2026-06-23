/**
 * features/win-rate/fetch.js
 * ============================
 * Pipeline: ambil data Stockbit (daily + intraday 5-menitan), simpan ke
 * cache via db.js. db.js sudah dedup otomatis — pipeline ini boleh dipanggil
 * berkali-kali, hari yang sudah ter-cache TIDAK di-fetch ulang.
 *
 * Keputusan desain (DIKONFIRMASI Wisnu):
 *   - IEP = today.open dari fetchDaily() — TIDAK perlu fetch intraday sama
 *     sekali demi IEP, sudah otomatis didapat dari 1 call fetchDaily yang
 *     murah (seluruh range tanggal dalam 1 request).
 *   - Semua 9 EXIT_KEYS kelipatan 5 menit -> pakai candle intraday mult=5,
 *     batas aman 7 HARI KALENDER per call (terdokumentasi jelas di
 *     shared/api.js — bukan tebakan konservatif seperti versi mult=1 yang lama).
 *   - WINDOW_TRADING_DAYS=5 (1 minggu kerja) per call intraday — Senin-Jumat
 *     cuma 4 hari kalender span, aman jauh di bawah limit 7 hari.
 *
 * ⚠️ Candle mult=5 berlabel "09:05" mewakili interval [09:05,09:10) — field
 * `open`-nya = harga PERSIS jam 09:05, BUKAN `close` (yang justru harga jam
 * 09:10). extractCheckpoints() WAJIB pakai `open`, bukan `close`.
 */
import { fetchDaily, fetchIntraday } from '../../shared/api.js'
import { enrichDaily } from '../../shared/indicators.js'
import { EXIT_KEYS } from './engine.js'
import { loadSym, appendDaily, appendIntraday } from './db.js'

const WINDOW_TRADING_DAYS = 5 // 1 minggu kerja per call -- aman di bawah limit 7 hari kalender

// ============================================================
// SEKSI 1: EKSTRAK CHECKPOINT — PURE, mudah ditest
// ============================================================

/** 'p0905' -> 545 (menit dari tengah malam, 9*60+5) */
function _keyToMinutes(key) {
  return Number(key.slice(1, 3)) * 60 + Number(key.slice(3, 5))
}

/** Menit-dari-tengah-malam (WIB) di mana candle ini MULAI (bukan berakhir). */
function _candleStartMinutes(unix) {
  const dt = new Date(unix * 1000)
  const hh = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2))
  const mm = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', minute: '2-digit' }))
  return hh * 60 + mm
}

/**
 * Ekstrak 9 harga checkpoint (EXIT_KEYS) dari candle 5-menitan 1 hari.
 * WAJIB pakai field `open` candle (harga PERSIS di awal interval), BUKAN
 * `close` (yang mewakili harga 5 menit SETELAHNYA -- lihat catatan di atas).
 * Toleransi 2 menit kalau candle pas tidak ada (data API kadang bolong) —
 * karena grid candle persis kelipatan 5 menit sama seperti target, toleransi
 * ini cuma jaring pengaman, TIDAK PERNAH salah comot harga 5 menit lain
 * (tetangga candle selalu >=5 menit, otomatis di luar toleransi 2 menit).
 * @param {{unix:number, open:number}[]} candles - hasil fetchIntraday mult=5
 * @returns {Object} {p0905: harga, ...} — key hilang kalau tidak ketemu candle cukup dekat
 */
export function extractCheckpoints(candles) {
  const withMinutes = candles.map(c => ({ open: c.open, _min: _candleStartMinutes(c.unix) }))

  const snap = {}
  for (const key of EXIT_KEYS) {
    const target = _keyToMinutes(key)
    let best = null, bestDiff = Infinity
    for (const c of withMinutes) {
      const diff = Math.abs(c._min - target)
      if (diff <= 2 && diff < bestDiff) { bestDiff = diff; best = c }
    }
    if (best) snap[key] = best.open
  }
  return snap
}

// ============================================================
// SEKSI 2: FETCH 1 WINDOW (s.d. WINDOW_TRADING_DAYS hari) DALAM 1 CALL
// ============================================================

/**
 * Fetch candle 5-menitan utk sekumpulan tanggal (idealnya berurutan, dalam
 * 1 window <= WINDOW_TRADING_DAYS) — 1 call API melayani BANYAK hari sekaligus.
 * @param {string} sym
 * @param {string[]} dates - 'YYYY-MM-DD', sudah diurutkan ascending
 * @returns {Object<string,Object>} {date: {p0905:harga, ...}} — tanggal tanpa candle sama sekali tidak muncul
 */
export async function fetchWindow(sym, dates) {
  if (dates.length === 0) return {}
  const firstDate = dates[0], lastDate = dates[dates.length - 1]
  const fromTs = Math.floor(new Date(`${lastDate}T16:00:00+07:00`).getTime() / 1000)  // lebih baru
  const toTs   = Math.floor(new Date(`${firstDate}T08:55:00+07:00`).getTime() / 1000) // lebih lama (Stockbit: from > to)
  const candles = await fetchIntraday(sym, fromTs, toTs, 5)

  const byDate = {}
  for (const c of candles) {
    const d = new Date(c.unix * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(c)
  }

  const result = {}
  for (const date of dates) {
    if (byDate[date] && byDate[date].length > 0) {
      const snap = extractCheckpoints(byDate[date])
      if (Object.keys(snap).length > 0) result[date] = snap
    }
  }
  return result
}

/** Pecah array tanggal jadi chunk maksimal WINDOW_TRADING_DAYS hari. */
function _chunk(dates, size) {
  const out = []
  for (let i = 0; i < dates.length; i += size) out.push(dates.slice(i, i + size))
  return out
}

// ============================================================
// SEKSI 3: ORKESTRASI — 1 simbol, rentang tanggal
// ============================================================

/**
 * Fetch lengkap 1 simbol utk rentang [fromDate, toDate] ('YYYY-MM-DD').
 * Cuma fetch hari yang BELUM ada di cache db.js (cek e.intraday, bukan tebak).
 * Daily = 1 call murah utk seluruh range (IEP otomatis ikut lewat field open).
 * Intraday = 1 call PER CHUNK ~5 hari kerja (bukan 1 call per hari).
 * @returns {{daysFetched:number, daysSkipped:number}}
 */
export async function fetchSymRange(sym, fromDate, toDate) {
  const e = await loadSym(sym)

  // 1. Daily — 1 call utk seluruh range. today.open = IEP, otomatis ikut.
  // Stockbit: from = tanggal lebih BARU, to = tanggal lebih LAMA (lihat shared/api.js)
  const rawDaily = await fetchDaily(sym, toDate, fromDate)
  const enriched = enrichDaily(rawDaily.map(d => ({ ...d })))
  await appendDaily(sym, enriched)

  // 2. Tentukan hari mana yang BELUM ada data intraday-nya — CEK cache, bukan tebak
  const tradingDates = enriched.map(d => d.date).filter(d => d >= fromDate && d <= toDate)
  const missingDates = tradingDates.filter(d => !e.intraday[d])

  let daysFetched = 0
  for (const chunk of _chunk(missingDates, WINDOW_TRADING_DAYS)) {
    try {
      const windowResult = await fetchWindow(sym, chunk)
      const entries = Object.entries(windowResult).map(([date, snap]) => ({ date, snap }))
      if (entries.length > 0) {
        await appendIntraday(sym, entries)
        daysFetched += entries.length
      }
    } catch (err) {
      // 1 chunk gagal (misal hari libur/data kosong semua) TIDAK boleh gagalkan seluruh range
      if (err.code !== 'EMPTY_RESPONSE') throw err
    }
  }

  return { daysFetched, daysSkipped: tradingDates.length - missingDates.length }
}

// ============================================================
// SEKSI 4: ORKESTRASI — banyak simbol (watchlist)
// ============================================================

/**
 * Estimasi jumlah hari yang BELUM ter-cache utk banyak simbol — dipakai UI
 * utk tampilkan konfirmasi SEBELUM fetch sungguhan (pola expensive-fetch.js).
 * Estimasi pakai hari kalender (skip weekend kasar), bukan hari trading
 * sebenarnya — angka pasti baru ketahuan setelah fetchDaily jalan.
 * @returns {{sym:string, missingDays:number}[]}
 */
export async function estimateFetch(syms, fromDate, toDate) {
  const out = []
  for (const sym of syms) {
    const e = await loadSym(sym)
    const cachedDates = new Set(Object.keys(e.intraday))
    let count = 0
    for (let d = new Date(fromDate); d <= new Date(toDate); d.setDate(d.getDate() + 1)) {
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue // skip weekend
      if (!cachedDates.has(d.toISOString().slice(0, 10))) count++
    }
    out.push({ sym, missingDays: count })
  }
  return out
}

/**
 * Fetch banyak simbol sekaligus, BERURUTAN (bukan paralel) — sengaja, biar
 * tidak membombardir Stockbit dgn ratusan request bersamaan & kena RATE_LIMITED.
 * @param {string[]} syms
 * @param {function} onProgress - (sym, i, total) => void, utk progress bar UI
 */
export async function fetchWatchlist(syms, fromDate, toDate, onProgress = () => {}) {
  const results = []
  for (let i = 0; i < syms.length; i++) {
    onProgress(syms[i], i, syms.length)
    const r = await fetchSymRange(syms[i], fromDate, toDate)
    results.push({ sym: syms[i], ...r })
  }
  return results
}
