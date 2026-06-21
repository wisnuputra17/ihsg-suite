/**
 * features/chart/db.js
 * =====================
 * Database in-memory untuk fitur Chart.
 * Data harga selalu fetch ulang (bukan input user) — tidak disimpan ke Sheets.
 * Hanya preferensi indikator (localStorage) dan garis gambar/drawings (Sheets,
 * karena itu hasil kerja manual user yang harus sinkron multi-device).
 */

import { gsLoad, gsSave, gsAppend } from '../../shared/sheets.js'

export const DB = {
  sym:    null,
  daily:  [],     // array OHLCV harian, urut lama → baru
  absorption: null, // { date, net, buy, sell, prices } — hasil fetch terakhir
  lpmCache: {},   // {date: {buy, sell, net}} — utk SAHAM AKTIF saat ini saja
  drawings: []    // [{id, sym, type, t1, p1, t2, p2}] — semua saham, difilter per-sym saat render
}

const SHEET_DRAWINGS  = 'chart-drawings'
const SHEET_LPM_CACHE = 'chart-lpm-cache'

/**
 * Load histori LPM untuk 1 saham dari Sheets (persist permanen, sekali fetch
 * tidak perlu diulang lagi di sesi/device manapun). Dipanggil tiap ganti saham.
 */
export async function loadLpmCacheForSym(sym) {
  try {
    const rows = await gsLoad(SHEET_LPM_CACHE)
    const cache = {}
    rows.filter(r => r.sym === sym).forEach(r => {
      // Sentinel buy=-1 → tanggal sudah pernah dicek, API memang tidak punya data
      // (BUKAN net=0 sungguhan) — simpan null supaya tidak ikut hitungan kumulatif/bar.
      cache[r.date] = Number(r.buy) === -1 ? null : { buy: Number(r.buy), sell: Number(r.sell), net: Number(r.net) }
    })
    DB.lpmCache = cache
  } catch (e) {
    console.warn('[chart/db] load lpm cache gagal:', e.message)
    DB.lpmCache = {}
  }
}

/**
 * Simpan tanggal-tanggal LPM yang BARU saja di-fetch (append, bukan timpa semua
 * — supaya tidak upload ulang histori lama tiap kali ada tambahan kecil).
 * @param {string} sym
 * @param {{date, buy, sell, net}[]} entries
 */
export function appendLpmCache(sym, entries) {
  if (!entries.length) return
  const rows = entries.map(e => ({ sym, date: e.date, buy: e.buy, sell: e.sell, net: e.net }))
  gsAppend(SHEET_LPM_CACHE, rows).catch(e =>
    console.warn('[chart/db] append lpm cache gagal:', e.message)
  )
}

/** Load semua drawing (semua saham) dari Sheets — dipanggil sekali saat init. */
export async function loadDrawings() {
  try {
    const rows = await gsLoad(SHEET_DRAWINGS)
    DB.drawings = rows.map(r => ({
      id: r.id, sym: r.sym, type: r.type,
      t1: r.t1, p1: Number(r.p1), t2: r.t2, p2: Number(r.p2)
    }))
  } catch (e) {
    console.warn('[chart/db] load drawings gagal:', e.message)
    DB.drawings = []
  }
}

/** Tambah 1 drawing baru, sinkron ke Sheets (timpa seluruh list). */
export function addDrawing(d) {
  DB.drawings.push(d)
  _saveDrawings()
}

/** Hapus 1 drawing by id, sinkron ke Sheets. */
export function removeDrawing(id) {
  DB.drawings = DB.drawings.filter(d => d.id !== id)
  _saveDrawings()
}

function _saveDrawings() {
  gsSave(SHEET_DRAWINGS, DB.drawings).catch(e =>
    console.warn('[chart/db] sync drawings gagal:', e.message)
  )
}

// ============================================================
// PREFERENSI INDIKATOR — localStorage, wajar beda per-device
// ============================================================

const PREF_KEY = 'chart_indicator_prefs'

/**
 * Simpan indikator mana yang sedang aktif (checkbox state).
 * @param {Object} prefs - {ma:bool, bollinger:bool, volume:bool, rsi:bool, macd:bool, lpm:bool, lpmMode, maPeriod}
 */
export function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)) } catch (_) {}
}

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') } catch (_) { return {} }
}
