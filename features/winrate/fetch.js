/**
 * features/winrate/fetch.js
 * ============================
 * Pipeline: ambil data Stockbit (daily + intraday + IEP) utk 1/banyak simbol,
 * simpan ke cache via db.js. db.js sudah dedup otomatis — pipeline ini boleh
 * dipanggil berkali-kali, hari yang sudah ter-cache TIDAK di-fetch ulang.
 *
 * ⚠️ ASUMSI YANG BELUM DIVERIFIKASI — TOLONG DIKONFIRMASI:
 * shared/api.js dokumentasikan batas aman fetchIntraday cuma utk mult=5/15
 * (7 hari/call) dan mult=30/60 (30 hari/call) — TIDAK ADA dokumentasi utk
 * mult=1 (1-menit) yang dipakai di sini utk ekstrak IEP & checkpoint harga.
 * Saya pakai asumsi PALING KONSERVATIF: fetch 1 HARI per call (paling aman,
 * walau mungkin sebenarnya bisa lebih lebar). Saya TIDAK BISA tes ini sendiri
 * — domain exodus.stockbit.com tidak ada di whitelist network yang saya bisa
 * akses dari container ini. Kalau kamu sudah tau/tes ternyata mult=1 bisa
 * lebih dari 1 hari per call, ini SANGAT berpengaruh ke kecepatan scan watchlist
 * besar — tinggal ubah fetchOneDay() jadi fetchOneWindow(fromDate,toDate) dan
 * ekstrak checkpoint multi-hari dari 1 response.
 */
import { fetchDaily, fetchIntraday } from '../../shared/api.js'
import { enrichDaily, extractIEP } from '../../shared/indicators.js'
import { ENTRY_KEY, EXIT_KEYS } from './engine.js'
import { loadSym, appendDaily, appendIep, appendIntraday } from './db.js'

const CHECKPOINT_KEYS = [ENTRY_KEY, ...EXIT_KEYS]

// ============================================================
// SEKSI 1: EKSTRAK CHECKPOINT — PURE, mudah ditest
// ============================================================

/** 'p0902' -> 542 (menit dari tengah malam, 9*60+2) */
function _keyToMinutes(key) {
  return Number(key.slice(1, 3)) * 60 + Number(key.slice(3, 5))
}

/**
 * Ekstrak 10 harga checkpoint (ENTRY_KEY + EXIT_KEYS) dari candle 1-menit 1 hari.
 * Toleransi 2 menit kalau candle pas tidak ada (data API kadang bolong) —
 * ambil candle TERDEKAT ke target, bukan exact match wajib.
 * @param {{unix:number, close:number}[]} minuteCandles - hasil fetchIntraday mult=1
 * @returns {Object} {p0902: harga, ...} — key hilang kalau tidak ketemu candle cukup dekat
 */
export function extractCheckpoints(minuteCandles) {
  const withMinutes = minuteCandles.map(c => {
    const dt = new Date(c.unix * 1000)
    const hh = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2))
    const mm = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', minute: '2-digit' }))
    return { unix: c.unix, close: c.close, _min: hh * 60 + mm }
  })

  const snap = {}
  for (const key of CHECKPOINT_KEYS) {
    const target = _keyToMinutes(key)
    let best = null, bestDiff = Infinity
    for (const c of withMinutes) {
      const diff = Math.abs(c._min - target)
      if (diff <= 2 && diff < bestDiff) { bestDiff = diff; best = c }
    }
    if (best) snap[key] = best.close
  }
  return snap
}

// ============================================================
// SEKSI 2: FETCH 1 SIMBOL, 1 HARI (sesi 08:57-16:00 WIB)
// ============================================================

/**
 * Fetch candle 1-menit 1 hari, ekstrak checkpoint harga + IEP sekaligus
 * (1 call API melayani dua kebutuhan).
 * @returns {{snap:Object, iep:{price:number,vol:number}|null}}
 */
export async function fetchOneDay(sym, date) {
  const fromTs = Math.floor(new Date(`${date}T16:00:00+07:00`).getTime() / 1000) // lebih baru
  const toTs   = Math.floor(new Date(`${date}T08:57:00+07:00`).getTime() / 1000) // lebih lama (Stockbit: from > to)
  const candles = await fetchIntraday(sym, fromTs, toTs, 1)

  const snap   = extractCheckpoints(candles)
  const iepArr = extractIEP(candles.map(c => ({ unix: c.unix, close: c.close, volume: c.volume })))
  const iep    = iepArr.find(e => e.date === date) || null

  return { snap, iep }
}

// ============================================================
// SEKSI 3: ORKESTRASI — 1 simbol, rentang tanggal
// ============================================================

/**
 * Fetch lengkap 1 simbol utk rentang [fromDate, toDate] ('YYYY-MM-DD').
 * Cuma fetch hari yang BELUM ada di cache db.js (cek e.intraday, bukan tebak).
 * Daily = 1 call murah utk seluruh range. Intraday = 1 call PER HARI yang
 * belum ter-cache (lihat catatan asumsi konservatif di atas file).
 * @returns {{daysFetched:number, daysSkipped:number}}
 */
export async function fetchSymRange(sym, fromDate, toDate) {
  const e = await loadSym(sym)

  // 1. Daily — 1 call utk seluruh range (fetchDaily TIDAK perlu batching per hari)
  // Stockbit: from = tanggal lebih BARU, to = tanggal lebih LAMA (lihat shared/api.js)
  const rawDaily = await fetchDaily(sym, toDate, fromDate)
  const enriched = enrichDaily(rawDaily.map(d => ({ ...d })))
  await appendDaily(sym, enriched)

  // 2. Tentukan hari mana yang BELUM ada data intraday-nya — CEK cache, bukan tebak
  const tradingDates = enriched.map(d => d.date).filter(d => d >= fromDate && d <= toDate)
  const missingDates = tradingDates.filter(d => !e.intraday[d])

  let daysFetched = 0
  for (const date of missingDates) {
    try {
      const { snap, iep } = await fetchOneDay(sym, date)
      if (Object.keys(snap).length > 0) {
        await appendIntraday(sym, [{ date, snap }])
        daysFetched++
      }
      if (iep) await appendIep(sym, [{ date, price: iep.price, vol: iep.vol }])
    } catch (err) {
      // 1 hari gagal (misal hari libur/data kosong) TIDAK boleh gagalkan seluruh range
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
 * sebenarnya — angka pasti baru ketahuan setelah fetchDaily jalan. Cukup utk
 * kasih GAMBARAN ke user, bukan angka final.
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
