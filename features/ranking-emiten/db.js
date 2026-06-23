/**
 * features/ranking-emiten/db.js
 * ===============================
 * State Ranking Emiten: DB.emiten[sym] = {daily, intraday, iep} + DB.ihsg (GLOBAL)
 * Cache persisten via Sheets (4 sheet): ranking-daily, ranking-intraday,
 * ranking-iep, ranking-ihsg
 *
 * BEDA dari win-rate/db.js:
 *   - intraday 10 kolom: ENTRY_KEY (p0902) + 9 EXIT_KEYS -- key BEDA dari
 *     win-rate (jam exit-nya beda), JANGAN disamakan/reuse sheet win-rate.
 *   - iep cuma simpan RAW (totalVol/totalFreq), BUKAN surge final -- surge
 *     dihitung fresh tiap dibutuhkan via engine.js:withIEPSurge() dari
 *     sequence lengkap, supaya nambah data baru tidak perlu rewrite histori.
 *   - DB.ihsg GLOBAL (1 sheet, tidak per-simbol) -- dipakai bersama oleh
 *     SEMUA simbol saat menghitung kondisi 'IHSG H-1 Naik'.
 *
 * Pola yang diikuti (konsisten dgn win-rate/db.js & broker-analyzer/db.js):
 *   - Normalisasi tanggal WAJIB saat load dari Sheets (String(d).slice(0,10))
 *   - _persistedKeys Set utk cegah gsAppend dobel kalau scan di-rerun
 *   - Batch append (1 request utk banyak baris), bukan 1 request per hari
 */
import { gsLoad, gsAppend } from '../../shared/sheets.js'
import { ENTRY_KEY, EXIT_KEYS } from './engine.js'

const INTRADAY_KEYS = [ENTRY_KEY, ...EXIT_KEYS] // 10 kolom fix: p0902 + 9 exit

export const DB = {
  emiten: {}, // {sym: {daily:[], intraday:{date:{...}}, iep:[]}}
  ihsg: {}    // {date: {close, ret, trend}} -- GLOBAL, bukan per simbol
}

const _loadedSyms        = new Set()
const _ihsgLoaded         = { value: false }
const _persistedDailyKey  = new Set() // `${sym}|${date}`
const _persistedIntraKey  = new Set()
const _persistedIepKey    = new Set()
const _persistedIhsgKey   = new Set() // `${date}` saja, tidak per-simbol

function _ensureSym(sym) {
  if (!DB.emiten[sym]) DB.emiten[sym] = { daily: [], intraday: {}, iep: [] }
  return DB.emiten[sym]
}

// ============================================================
// SEKSI 1: MAPPER row Sheets <-> object (PURE, mudah ditest)
// ============================================================

const numOrNull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v)

export function rowToDaily(r) {
  return {
    date:       String(r.date).slice(0, 10), // normalisasi WAJIB
    open:       Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume:     Number(r.volume),
    foreignbuy: Number(r.foreignbuy), foreignsell: Number(r.foreignsell),
    rsi:        numOrNull(r.rsi),
    macdHist:   numOrNull(r.macdHist),
    atr:        numOrNull(r.atr),
    vmaRatio:   numOrNull(r.vmaRatio),
    foreignNet: numOrNull(r.foreignNet),
    returnPct:  numOrNull(r.returnPct)
  }
}

export function dailyToRow(sym, d) {
  return {
    sym, date: d.date, open: d.open, high: d.high, low: d.low, close: d.close,
    volume: d.volume, foreignbuy: d.foreignbuy, foreignsell: d.foreignsell,
    rsi: d.rsi, macdHist: d.macdHist, atr: d.atr, vmaRatio: d.vmaRatio,
    foreignNet: d.foreignNet, returnPct: d.returnPct
  }
}

/** Baris Sheets -> object intraday {p0902:number, p0905:number, ...} (skip kolom kosong). */
export function rowToIntraday(r) {
  const snap = {}
  for (const k of INTRADAY_KEYS) {
    if (r[k] !== '' && r[k] !== null && r[k] !== undefined) snap[k] = Number(r[k])
  }
  return snap
}

/** Object intraday -> baris siap kirim ke gsAppend (kolom hilang diisi ''). */
export function intradayToRow(sym, date, snap) {
  const row = { sym, date }
  for (const k of INTRADAY_KEYS) row[k] = (snap[k] ?? '')
  return row
}

/** Baris Sheets -> object IEP RAW (totalVol/totalFreq, BUKAN surge final). */
export function rowToIep(r) {
  return {
    date: String(r.date).slice(0, 10),
    totalVol: Number(r.totalVol), totalFreq: Number(r.totalFreq)
  }
}

export function iepToRow(sym, d) {
  return { sym, date: d.date, totalVol: d.totalVol, totalFreq: d.totalFreq }
}

/** Baris Sheets -> object IHSG (tidak ada field sym, ini GLOBAL). */
export function rowToIhsg(r) {
  return {
    date: String(r.date).slice(0, 10),
    close: Number(r.close), ret: numOrNull(r.ret), trend: r.trend || 'unknown'
  }
}

export function ihsgToRow(date, d) {
  return { date, close: d.close, ret: d.ret, trend: d.trend }
}

// ============================================================
// SEKSI 2: LOAD dari Sheets
// ============================================================

/**
 * Load semua data 1 simbol dari Sheets ke DB.emiten[sym]. Idempoten per sesi.
 * SENGAJA berurutan (BUKAN Promise.all) -- kalau sheet belum pernah ada,
 * Apps Script harus insertSheet() otomatis; 3 request BERSAMAAN yang semua
 * butuh bikin sheet baru di spreadsheet yang sama bisa race condition (salah
 * satu gagal dgn respons error infrastruktur Google yang kadang tidak punya
 * header CORS -- kelihatan seperti "CORS blocked" padahal bukan itu akarnya).
 * Cuma berdampak di percobaan PERTAMA kali; request berurutan sedikit lebih
 * lambat tapi 100% aman dari race ini.
 */
export async function loadSym(sym) {
  if (_loadedSyms.has(sym)) return DB.emiten[sym]

  const dailyRows = await gsLoad('ranking-daily')
  const intraRows = await gsLoad('ranking-intraday')
  const iepRows   = await gsLoad('ranking-iep')

  const e = _ensureSym(sym)

  e.daily = dailyRows.filter(r => r.sym === sym).map(rowToDaily)
    .sort((a, b) => a.date.localeCompare(b.date))
  e.daily.forEach(d => _persistedDailyKey.add(`${sym}|${d.date}`))

  e.intraday = {}
  for (const r of intraRows.filter(r => r.sym === sym)) {
    const date = String(r.date).slice(0, 10)
    e.intraday[date] = rowToIntraday(r)
    _persistedIntraKey.add(`${sym}|${date}`)
  }

  e.iep = iepRows.filter(r => r.sym === sym).map(rowToIep)
    .sort((a, b) => a.date.localeCompare(b.date))
  e.iep.forEach(d => _persistedIepKey.add(`${sym}|${d.date}`))

  _loadedSyms.add(sym)
  return e
}

/** Load DB.ihsg (GLOBAL, 1x per sesi -- tidak per simbol). */
export async function loadIhsg() {
  if (_ihsgLoaded.value) return DB.ihsg
  const rows = await gsLoad('ranking-ihsg')
  DB.ihsg = {}
  for (const r of rows) {
    const obj = rowToIhsg(r)
    DB.ihsg[obj.date] = obj
    _persistedIhsgKey.add(obj.date)
  }
  _ihsgLoaded.value = true
  return DB.ihsg
}

// ============================================================
// SEKSI 3: APPEND ke Sheets (batch, dedup otomatis)
// ============================================================

export async function appendDaily(sym, days) {
  const e = _ensureSym(sym)
  const existingDates = new Set(e.daily.map(d => d.date))
  const newDays = days.filter(d => !existingDates.has(d.date))
  if (newDays.length === 0) return { written: 0 }

  e.daily.push(...newDays)
  e.daily.sort((a, b) => a.date.localeCompare(b.date))

  const toPersist = newDays.filter(d => !_persistedDailyKey.has(`${sym}|${d.date}`))
  if (toPersist.length > 0) {
    await gsAppend('ranking-daily', toPersist.map(d => dailyToRow(sym, d)))
    toPersist.forEach(d => _persistedDailyKey.add(`${sym}|${d.date}`))
  }
  return { written: newDays.length }
}

/** Tambah snapshot intraday utk hari-hari baru, skip yang sudah ada. */
export async function appendIntraday(sym, entries) {
  const e = _ensureSym(sym)
  const existingDates = new Set(Object.keys(e.intraday))
  const newEntries = entries.filter(en => !existingDates.has(en.date))
  if (newEntries.length === 0) return { written: 0 }

  for (const en of newEntries) e.intraday[en.date] = en.snap

  const toPersist = newEntries.filter(en => !_persistedIntraKey.has(`${sym}|${en.date}`))
  if (toPersist.length > 0) {
    await gsAppend('ranking-intraday', toPersist.map(en => intradayToRow(sym, en.date, en.snap)))
    toPersist.forEach(en => _persistedIntraKey.add(`${sym}|${en.date}`))
  }
  return { written: newEntries.length }
}

/** Tambah data IEP RAW (totalVol/totalFreq) utk hari-hari baru, skip yang sudah ada. */
export async function appendIepRaw(sym, entries) {
  const e = _ensureSym(sym)
  const existingDates = new Set(e.iep.map(d => d.date))
  const newEntries = entries.filter(d => !existingDates.has(d.date))
  if (newEntries.length === 0) return { written: 0 }

  e.iep.push(...newEntries)
  e.iep.sort((a, b) => a.date.localeCompare(b.date))

  const toPersist = newEntries.filter(d => !_persistedIepKey.has(`${sym}|${d.date}`))
  if (toPersist.length > 0) {
    await gsAppend('ranking-iep', toPersist.map(d => iepToRow(sym, d)))
    toPersist.forEach(d => _persistedIepKey.add(`${sym}|${d.date}`))
  }
  return { written: newEntries.length }
}

/** Tambah data IHSG (GLOBAL, tidak per simbol) utk hari-hari baru, skip yang sudah ada. */
export async function appendIhsg(entries) {
  const newEntries = Object.entries(entries)
    .filter(([date]) => !(date in DB.ihsg))
    .map(([date, d]) => ({ date, ...d }))
  if (newEntries.length === 0) return { written: 0 }

  for (const en of newEntries) DB.ihsg[en.date] = en

  const toPersist = newEntries.filter(en => !_persistedIhsgKey.has(en.date))
  if (toPersist.length > 0) {
    await gsAppend('ranking-ihsg', toPersist.map(en => ihsgToRow(en.date, en)))
    toPersist.forEach(en => _persistedIhsgKey.add(en.date))
  }
  return { written: newEntries.length }
}
