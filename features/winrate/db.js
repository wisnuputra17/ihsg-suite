/**
 * features/winrate/db.js
 * ========================
 * State Win Rate Scanner: DB.emiten[sym] = {daily, intraday, iep}
 * Cache persisten via Sheets (3 sheet): winrate-daily, winrate-intraday, winrate-iep
 *
 * Skema intraday SENGAJA cuma 10 kolom (p0902 + 9 ENTRY_KEY/EXIT_KEYS dari
 * engine.js) — BUKAN grid per-menit. Snapshot harga hanya disimpan di
 * titik-titik yang benar dipakai backtest, supaya hemat row & request API.
 *
 * Pola yang diikuti (konsisten dengan broker-analyzer/db.js):
 *   - Normalisasi tanggal WAJIB saat load dari Sheets (String(d).slice(0,10))
 *   - _persistedKeys Set utk cegah gsAppend dobel kalau backtest di-rerun
 *   - Batch append (1 request utk banyak baris), bukan 1 request per hari
 */
import { gsLoad, gsAppend } from '../../shared/sheets.js'
import { ENTRY_KEY, EXIT_KEYS } from './engine.js'

const INTRADAY_KEYS = [ENTRY_KEY, ...EXIT_KEYS] // 10 kolom fix, urutan konsisten

export const DB = {
  emiten: {} // {sym: {daily:[], intraday:{date:{...}}, iep:[]}}
}

const _loadedSyms        = new Set() // simbol yg sudah di-load dari Sheets sesi ini
const _persistedDailyKey = new Set() // `${sym}|${date}` yg sudah PASTI ada di sheet
const _persistedIepKey   = new Set()
const _persistedIntraKey = new Set()

function _ensureSym(sym) {
  if (!DB.emiten[sym]) DB.emiten[sym] = { daily: [], intraday: {}, iep: [] }
  return DB.emiten[sym]
}

// ============================================================
// SEKSI 1: MAPPER row Sheets <-> object (PURE, mudah ditest)
// ============================================================

/** Baris Sheets (string semua) -> object daily yang benar tipenya. */
export function rowToDaily(r) {
  const numOrNull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v)
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

/** Object daily (hasil enrichDaily()) -> baris siap kirim ke gsAppend. */
export function dailyToRow(sym, d) {
  return {
    sym, date: d.date, open: d.open, high: d.high, low: d.low, close: d.close,
    volume: d.volume, foreignbuy: d.foreignbuy, foreignsell: d.foreignsell,
    rsi: d.rsi, macdHist: d.macdHist, atr: d.atr, vmaRatio: d.vmaRatio,
    foreignNet: d.foreignNet, returnPct: d.returnPct
  }
}

export function rowToIep(r) {
  return { date: String(r.date).slice(0, 10), price: Number(r.price), vol: Number(r.vol) }
}

export function iepToRow(sym, e) {
  return { sym, date: e.date, price: e.price, vol: e.vol }
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
  for (const k of INTRADAY_KEYS) row[k] = (snap[k] ?? '') // selalu 10 kolom, urutan tetap
  return row
}

// ============================================================
// SEKSI 2: LOAD dari Sheets (sekali per simbol per sesi)
// ============================================================

/**
 * Load semua data 1 simbol dari Sheets ke DB.emiten[sym].
 * Idempoten dalam 1 sesi — kalau sudah pernah di-load, return cache in-memory.
 */
export async function loadSym(sym) {
  if (_loadedSyms.has(sym)) return DB.emiten[sym]

  const [dailyRows, iepRows, intraRows] = await Promise.all([
    gsLoad('winrate-daily'),
    gsLoad('winrate-iep'),
    gsLoad('winrate-intraday')
  ])

  const e = _ensureSym(sym)

  e.daily = dailyRows
    .filter(r => r.sym === sym)
    .map(rowToDaily)
    .sort((a, b) => a.date.localeCompare(b.date))
  e.daily.forEach(d => _persistedDailyKey.add(`${sym}|${d.date}`))

  e.iep = iepRows
    .filter(r => r.sym === sym)
    .map(rowToIep)
  e.iep.forEach(d => _persistedIepKey.add(`${sym}|${d.date}`))

  e.intraday = {}
  for (const r of intraRows.filter(r => r.sym === sym)) {
    const date = String(r.date).slice(0, 10)
    e.intraday[date] = rowToIntraday(r)
    _persistedIntraKey.add(`${sym}|${date}`)
  }

  _loadedSyms.add(sym)
  return e
}

// ============================================================
// SEKSI 3: APPEND ke Sheets (batch, dedup otomatis)
// ============================================================

/**
 * Tambah hari-hari baru ke DB.emiten[sym].daily + sheet, skip yang sudah ada.
 * @param {string} sym
 * @param {Object[]} days - hasil enrichDaily(), boleh campur lama+baru
 */
export async function appendDaily(sym, days) {
  const e = _ensureSym(sym)
  const existingDates = new Set(e.daily.map(d => d.date))
  const newDays = days.filter(d => !existingDates.has(d.date))
  if (newDays.length === 0) return { written: 0 }

  e.daily.push(...newDays)
  e.daily.sort((a, b) => a.date.localeCompare(b.date))

  const toPersist = newDays.filter(d => !_persistedDailyKey.has(`${sym}|${d.date}`))
  if (toPersist.length > 0) {
    await gsAppend('winrate-daily', toPersist.map(d => dailyToRow(sym, d)))
    toPersist.forEach(d => _persistedDailyKey.add(`${sym}|${d.date}`))
  }
  return { written: newDays.length }
}

/** Tambah entri IEP baru, skip yang sudah ada (per tanggal). */
export async function appendIep(sym, ieps) {
  const e = _ensureSym(sym)
  const existingDates = new Set(e.iep.map(d => d.date))
  const newIeps = ieps.filter(d => !existingDates.has(d.date))
  if (newIeps.length === 0) return { written: 0 }

  e.iep.push(...newIeps)

  const toPersist = newIeps.filter(d => !_persistedIepKey.has(`${sym}|${d.date}`))
  if (toPersist.length > 0) {
    await gsAppend('winrate-iep', toPersist.map(d => iepToRow(sym, d)))
    toPersist.forEach(d => _persistedIepKey.add(`${sym}|${d.date}`))
  }
  return { written: newIeps.length }
}

/**
 * Tambah snapshot intraday utk hari-hari baru, skip yang sudah ada.
 * Ini backtest data HISTORIS — sekali 1 hari sudah lewat, semua harga
 * menitan hari itu sudah lengkap & final (diambil sekali dari fetchIntraday
 * yang sudah lewat), jadi sama pola dedup-nya dengan appendDaily/appendIep —
 * TIDAK perlu progressive update/merge sepanjang hari.
 * @param {string} sym
 * @param {{date:string, snap:Object}[]} entries - [{date:'YYYY-MM-DD', snap:{p0902:1000,...}}]
 */
export async function appendIntraday(sym, entries) {
  const e = _ensureSym(sym)
  const existingDates = new Set(Object.keys(e.intraday))
  const newEntries = entries.filter(en => !existingDates.has(en.date))
  if (newEntries.length === 0) return { written: 0 }

  for (const en of newEntries) e.intraday[en.date] = en.snap

  const toPersist = newEntries.filter(en => !_persistedIntraKey.has(`${sym}|${en.date}`))
  if (toPersist.length > 0) {
    await gsAppend('winrate-intraday', toPersist.map(en => intradayToRow(sym, en.date, en.snap)))
    toPersist.forEach(en => _persistedIntraKey.add(`${sym}|${en.date}`))
  }
  return { written: newEntries.length }
}
