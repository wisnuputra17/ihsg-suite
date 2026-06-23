/**
 * features/ranking-emiten/fetch.js
 * ===================================
 * Pipeline: ambil data Stockbit (daily + intraday 1-menit + IHSG), simpan ke
 * cache via db.js. db.js sudah dedup otomatis — pipeline ini boleh dipanggil
 * berkali-kali, hari yang sudah ter-cache TIDAK di-fetch ulang.
 *
 * Keputusan desain:
 *   - mult=1 (1-menit) utk checkpoint (p0902 dst) & IEP volume window —
 *     WAJIB granularitas menit (beda dgn win-rate yg semua kelipatan 5 menit
 *     jadi bisa pakai mult=5). Batch 30 HARI KALENDER per call — ini BUKAN
 *     tebakan konservatif, tapi MIRROR PERSIS dari ihsg-lab.html yang sudah
 *     terbukti jalan di produksi (`batchDays=30`, lihat _fetchEmiten asli).
 *   - mult=60 (per jam) utk IHSG, batch 30 hari — ini KEBALIKANNYA, justru
 *     terdokumentasi resmi di shared/api.js ("30m/60m = 30 hari"), bukan
 *     sekadar niru.
 *   - rawDaily WAJIB di-sort ascending sebelum enrichDaily() & fetchIhsgTrend
 *     WAJIB sort candle by unix sebelum diagregasi — pelajaran langsung dari
 *     bug krusial yang ketemu di win-rate/fetch.js (response Stockbit
 *     ternyata descending, tidak boleh diasumsikan ascending).
 */
import { fetchDaily, fetchIntraday } from '../../shared/api.js'
import { enrichDaily } from '../../shared/indicators.js'
import { ENTRY_KEY, EXIT_KEYS } from './engine.js'
import { loadSym, appendDaily, appendIntraday, appendIepRaw, loadIhsg, appendIhsg } from './db.js'

const CHECKPOINT_KEYS = [ENTRY_KEY, ...EXIT_KEYS] // p0902 + 9 exit = 10 target waktu
const BATCH_DAYS = 30 // hari kalender per call (lihat justifikasi di atas)

// ============================================================
// SEKSI 1: EKSTRAK DATA — PURE, mudah ditest
// ============================================================

/** 'p0902' -> 542 (menit dari tengah malam) */
function _keyToMinutes(key) { return Number(key.slice(1, 3)) * 60 + Number(key.slice(3, 5)) }

function _wibParts(unixSec) {
  const dt = new Date(unixSec * 1000)
  const hh = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2))
  const mm = Number(dt.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', minute: '2-digit' }))
  const date = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  return { hh, mm, date, totalMin: hh * 60 + mm }
}

/**
 * Ekstrak 10 checkpoint harga (CHECKPOINT_KEYS) dari candle 1-menit, lintas hari.
 * Forward-fill only dlm toleransi 0-2 menit SETELAH target — PERSIS pola
 * ihsg-lab.html _extractIntraday (BUKAN nearest 2 arah seperti win-rate/fetch.js).
 * Kalau candle pas target tidak ada, dipakai candle 1-2 menit SETELAHNYA;
 * TIDAK PERNAH mundur ke candle SEBELUM target.
 * @param {{unix:number, close:number}[]} minuteCandles
 * @returns {Object<string,Object>} {date: {p0902:harga, ...}}
 */
export function extractCheckpoints(minuteCandles) {
  const byDay = {}
  for (const c of minuteCandles) {
    const { date, totalMin } = _wibParts(c.unix)
    if (!byDay[date]) byDay[date] = {}
    for (const key of CHECKPOINT_KEYS) {
      const diff = totalMin - _keyToMinutes(key)
      if (diff >= 0 && diff <= 2 && byDay[date][key] == null) byDay[date][key] = c.close
    }
  }
  return byDay
}

/**
 * Ekstrak total volume & frekuensi RAW window pre-opening 08:45-08:59 per hari.
 * BELUM hitung surge (itu dihitung fresh di engine.js:withIEPSurge() dari
 * sequence lengkap, lihat catatan di db.js).
 * @param {{unix:number, volume:number, frequency:number}[]} minuteCandles
 * @returns {{date:string, totalVol:number, totalFreq:number}[]}
 */
export function extractIEPRaw(minuteCandles) {
  const byDay = {}
  for (const c of minuteCandles) {
    const { hh, mm, date } = _wibParts(c.unix)
    if (hh !== 8 || mm < 45) continue
    if (!byDay[date]) byDay[date] = { date, totalVol: 0, totalFreq: 0 }
    byDay[date].totalVol += (c.volume || 0)
    byDay[date].totalFreq += (c.frequency || 0)
  }
  return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Fetch & agregasi candle IHSG (per jam) jadi {date: {close, ret, trend}}.
 * trend: ret>0.5%='up', ret<-0.5%='down', selain itu 'flat' (null='unknown').
 * @param {number} fromTs - unix lebih baru
 * @param {number} toTs   - unix lebih lama
 */
export async function fetchIhsgTrend(fromTs, toTs) {
  const raw = await fetchIntraday('IHSG', fromTs, toTs, 60)
  // WAJIB sort ascending by unix -- JANGAN asumsikan response API sudah
  // terurut (lihat catatan bug win-rate di atas file).
  const candles = [...raw].sort((a, b) => a.unix - b.unix)

  const byDay = {}
  for (const c of candles) {
    const { date } = _wibParts(c.unix)
    byDay[date] = c.close // overwrite tiap candle -- krn sudah ascending, yg terakhir = close hari itu
  }

  const dates = Object.keys(byDay).sort()
  const result = {}
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]
    const curr = byDay[date]
    const prev = i > 0 ? byDay[dates[i - 1]] : null
    const ret = prev ? (curr - prev) / prev * 100 : null
    result[date] = {
      close: curr, ret,
      trend: ret === null ? 'unknown' : ret > 0.5 ? 'up' : ret < -0.5 ? 'down' : 'flat'
    }
  }
  return result
}

// ============================================================
// SEKSI 2: CHUNKING — hari kalender, bukan hari trading
// ============================================================

/** Pecah [fromDate,toDate] jadi window maksimal `days` hari KALENDER. */
function _chunkCalendarDays(fromDate, toDate, days) {
  const chunks = []
  let start = new Date(fromDate)
  const end = new Date(toDate)
  while (start <= end) {
    const chunkEnd = new Date(start)
    chunkEnd.setDate(chunkEnd.getDate() + days - 1)
    const cappedEnd = chunkEnd > end ? end : chunkEnd
    chunks.push({ from: start.toISOString().slice(0, 10), to: cappedEnd.toISOString().slice(0, 10) })
    start = new Date(cappedEnd)
    start.setDate(start.getDate() + 1)
  }
  return chunks
}

// ============================================================
// SEKSI 3: ORKESTRASI — 1 simbol
// ============================================================

/**
 * Fetch lengkap 1 simbol utk rentang [fromDate, toDate] ('YYYY-MM-DD').
 * Cuma fetch hari yang BELUM ada di cache db.js. Daily = 1 call murah utk
 * seluruh range. Intraday+IEP = 1 call PER CHUNK 30 hari kalender — chunk
 * yang SEMUA harinya sudah ter-cache di-skip total (tidak fetch sama sekali).
 * @returns {{daysFetched:number, daysSkipped:number}}
 */
export async function fetchSymRange(sym, fromDate, toDate) {
  const e = await loadSym(sym)

  const rawDaily = await fetchDaily(sym, toDate, fromDate)
  rawDaily.sort((a, b) => a.date.localeCompare(b.date)) // WAJIB -- lihat catatan bug win-rate
  const enriched = enrichDaily(rawDaily.map(d => ({ ...d })))
  await appendDaily(sym, enriched)

  const tradingDates = enriched.map(d => d.date).filter(d => d >= fromDate && d <= toDate)
  const missingSet = new Set(tradingDates.filter(d => !e.intraday[d]))

  let daysFetched = 0
  for (const { from, to } of _chunkCalendarDays(fromDate, toDate, BATCH_DAYS)) {
    const datesInChunk = tradingDates.filter(d => d >= from && d <= to && missingSet.has(d))
    if (datesInChunk.length === 0) continue // semua hari di chunk ini sudah ter-cache

    try {
      const fromTs = Math.floor(new Date(`${to}T16:00:00+07:00`).getTime() / 1000)
      const toTs   = Math.floor(new Date(`${from}T08:45:00+07:00`).getTime() / 1000)
      const candles = await fetchIntraday(sym, fromTs, toTs, 1)

      const checkpointsByDay = extractCheckpoints(candles)
      const iepRawByDay = extractIEPRaw(candles)

      const intraEntries = datesInChunk.filter(d => checkpointsByDay[d]).map(d => ({ date: d, snap: checkpointsByDay[d] }))
      if (intraEntries.length > 0) {
        await appendIntraday(sym, intraEntries)
        daysFetched += intraEntries.length
      }

      const iepEntries = iepRawByDay.filter(d => datesInChunk.includes(d.date))
      if (iepEntries.length > 0) await appendIepRaw(sym, iepEntries)
    } catch (err) {
      // 1 chunk gagal (misal libur panjang/data kosong) TIDAK boleh gagalkan seluruh range
      if (err.code !== 'EMPTY_RESPONSE') throw err
    }
  }

  return { daysFetched, daysSkipped: tradingDates.length - missingSet.size }
}

// ============================================================
// SEKSI 4: ORKESTRASI — IHSG (global, dipanggil 1x sebelum loop simbol)
// ============================================================

/** Fetch IHSG kalau ada hari kerja yang belum ter-cache, skip total kalau sudah lengkap. */
export async function fetchIhsgRange(fromDate, toDate) {
  const ihsg = await loadIhsg()

  let hasMissing = false
  for (let d = new Date(fromDate); d <= new Date(toDate); d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    if (!(d.toISOString().slice(0, 10) in ihsg)) { hasMissing = true; break }
  }
  if (!hasMissing) return { written: 0 }

  let totalWritten = 0
  for (const { from, to } of _chunkCalendarDays(fromDate, toDate, BATCH_DAYS)) {
    const fromTs = Math.floor(new Date(`${to}T16:00:00+07:00`).getTime() / 1000)
    const toTs   = Math.floor(new Date(`${from}T00:00:00+07:00`).getTime() / 1000)
    try {
      const trend = await fetchIhsgTrend(fromTs, toTs)
      const r = await appendIhsg(trend)
      totalWritten += r.written
    } catch (err) {
      if (err.code !== 'EMPTY_RESPONSE') throw err
    }
  }
  return { written: totalWritten }
}

// ============================================================
// SEKSI 5: ORKESTRASI — banyak simbol (watchlist)
// ============================================================

/**
 * Estimasi jumlah hari yang BELUM ter-cache utk banyak simbol — dipakai UI
 * utk tampilkan konfirmasi SEBELUM fetch sungguhan.
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
      if (dow === 0 || dow === 6) continue
      if (!cachedDates.has(d.toISOString().slice(0, 10))) count++
    }
    out.push({ sym, missingDays: count })
  }
  return out
}

/**
 * Fetch IHSG dulu (sekali, dipakai semua simbol), lalu tiap simbol BERURUTAN
 * (bukan paralel) — sengaja, biar tidak membombardir Stockbit & kena RATE_LIMITED.
 * @param {string[]} syms
 * @param {function} onProgress - (sym, i, total) => void, utk progress bar UI
 */
export async function fetchWatchlist(syms, fromDate, toDate, onProgress = () => {}) {
  await fetchIhsgRange(fromDate, toDate)
  const results = []
  for (let i = 0; i < syms.length; i++) {
    onProgress(syms[i], i, syms.length)
    const r = await fetchSymRange(syms[i], fromDate, toDate)
    results.push({ sym: syms[i], ...r })
  }
  return results
}
