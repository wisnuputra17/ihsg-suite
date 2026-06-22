/**
 * features/haka/db.js
 * ====================
 * Database in-memory untuk fitur HAKA & HAKI.
 * Seperti spreadsheet — hanya data domain, tidak ada logic/UI/state aplikasi.
 *
 * Data yang PERLU sinkron multi-device (lewat Google Sheets):
 *   watchlist, hakahakiWatchlist, threshold, namedLists
 * Data yang TIDAK disimpan (real-time saja, hilang saat refresh — wajar):
 *   alerts, hakahakiAlerts
 *
 * Konversi bentuk data: Sheets HANYA terima/kasih array of objects (lihat
 * shared/sheets.js). Di sini, bentuk in-memory (array string, object, number)
 * dikonversi ke/dari array-of-objects saat sync — shared/sheets.js sendiri
 * tidak tahu apa-apa soal bentuk data spesifik HAKA.
 */

import { gsLoad, gsSave } from '../../shared/sheets.js'

// ============================================================
// SEKSI 1: DATABASE — in-memory
// ============================================================

export const DB = {
  watchlist:          [],        // ['BBCA','TLKM',...] — maks 100, untuk tab HAKA
  hakahakiWatchlist:   [],        // maks 20, untuk tab HAKA & HAKI
  threshold:           500e6,     // berlaku untuk kedua tab
  namedLists:          {},        // {nama: ['BBCA','TLKM']} — watchlist custom, 1 pool dipakai bersama haka & hakahaki
  alerts:              [],        // feed HAKA — real-time, tidak disimpan
  hakahakiAlerts:      []         // feed HAKA & HAKI — real-time, tidak disimpan
}

// ============================================================
// SEKSI 2: NAMA SHEET
// ============================================================

const SHEET_WATCHLIST   = 'haka-watchlist'
const SHEET_HAKAHAKI_WL = 'haka-hakahaki-watchlist'
const SHEET_CONFIG      = 'haka-config'
const SHEET_NAMED_LISTS = 'haka-named-lists'

// ============================================================
// SEKSI 3: LOAD — dari Sheets ke in-memory, dipanggil sekali saat init
// ============================================================

/**
 * Load semua data HAKA dari Sheets secara paralel.
 * Dipanggil koordinator sekali saat halaman dibuka.
 */
export async function loadAll() {
  const [wl, hhWl, cfg, named] = await Promise.allSettled([
    gsLoad(SHEET_WATCHLIST),
    gsLoad(SHEET_HAKAHAKI_WL),
    gsLoad(SHEET_CONFIG),
    gsLoad(SHEET_NAMED_LISTS)
  ])

  if (wl.status === 'fulfilled')    DB.watchlist          = wl.value.map(r => r.sym)
  if (hhWl.status === 'fulfilled')  DB.hakahakiWatchlist   = hhWl.value.map(r => r.sym)

  if (cfg.status === 'fulfilled') {
    const row = cfg.value.find(r => r.key === 'threshold')
    if (row) DB.threshold = Number(row.value)
  }

  if (named.status === 'fulfilled') {
    const obj = {}
    named.value.forEach(r => {
      obj[r.name] = String(r.syms || '').split(',').map(s => s.trim()).filter(Boolean)
    })
    DB.namedLists = obj
  }
}

// ============================================================
// SEKSI 4: WATCHLIST AKTIF (tab HAKA, maks 100)
// ============================================================

export function watchlistAdd(sym) {
  if (DB.watchlist.includes(sym)) return false
  if (DB.watchlist.length >= 100) return false
  DB.watchlist.push(sym)
  _syncWatchlist()
  return true
}

export function watchlistRemove(sym) {
  DB.watchlist = DB.watchlist.filter(s => s !== sym)
  _syncWatchlist()
}

/** Timpa seluruh watchlist sekaligus — dipakai preset (LQ45/IDX80/Semua/Reset). */
export function watchlistSet(syms) {
  DB.watchlist = syms.slice(0, 100)
  _syncWatchlist()
}

function _syncWatchlist() {
  gsSave(SHEET_WATCHLIST, DB.watchlist.map(sym => ({ sym }))).catch(e =>
    console.warn('[haka/db] sync watchlist gagal:', e.message)
  )
}

// ============================================================
// SEKSI 5: WATCHLIST HAKA+HAKI (maks 20)
// ============================================================

export function hakahakiWatchlistAdd(sym) {
  if (DB.hakahakiWatchlist.includes(sym)) return false
  if (DB.hakahakiWatchlist.length >= 20) return false
  DB.hakahakiWatchlist.push(sym)
  _syncHakahakiWatchlist()
  return true
}

export function hakahakiWatchlistRemove(sym) {
  DB.hakahakiWatchlist = DB.hakahakiWatchlist.filter(s => s !== sym)
  _syncHakahakiWatchlist()
}

/** Timpa seluruh watchlist sekaligus — dipakai preset (LQ45/IDX80/Semua/Reset). */
export function hakahakiWatchlistSet(syms) {
  DB.hakahakiWatchlist = syms.slice(0, 20)
  _syncHakahakiWatchlist()
}

function _syncHakahakiWatchlist() {
  gsSave(SHEET_HAKAHAKI_WL, DB.hakahakiWatchlist.map(sym => ({ sym }))).catch(e =>
    console.warn('[haka/db] sync hakahaki watchlist gagal:', e.message)
  )
}

// ============================================================
// SEKSI 6: THRESHOLD
// ============================================================

export function setThreshold(val) {
  DB.threshold = val
  gsSave(SHEET_CONFIG, [{ key: 'threshold', value: val }]).catch(e =>
    console.warn('[haka/db] sync threshold gagal:', e.message)
  )
}

// ============================================================
// SEKSI 7: WATCHLIST CUSTOM (named lists) — 1 pool dipakai bersama haka & hakahaki
// ============================================================

function _syncNamedLists() {
  const rows = Object.keys(DB.namedLists).map(name => ({
    name,
    syms: DB.namedLists[name].join(',')
  }))
  gsSave(SHEET_NAMED_LISTS, rows).catch(e =>
    console.warn('[haka/db] sync named lists gagal:', e.message)
  )
}

/** Simpan watchlist custom baru. */
export function namedListSave(name, syms) {
  DB.namedLists[name] = [...syms]
  _syncNamedLists()
}

export function namedListDelete(name) {
  delete DB.namedLists[name]
  _syncNamedLists()
}

// ============================================================
// SEKSI 8: ALERTS — real-time saja, FIFO maks 200, tidak disimpan
// ============================================================

export function alertAdd(alert) {
  DB.alerts.unshift(alert)
  if (DB.alerts.length > 200) DB.alerts.pop()
}

export function hakahakiAlertAdd(alert) {
  DB.hakahakiAlerts.unshift(alert)
  if (DB.hakahakiAlerts.length > 200) DB.hakahakiAlerts.pop()
}

export function clearAlerts(target = 'all') {
  if (target === 'haka'     || target === 'all') DB.alerts = []
  if (target === 'hakahaki' || target === 'all') DB.hakahakiAlerts = []
}
