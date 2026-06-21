/**
 * features/chart/db.js
 * =====================
 * Database in-memory untuk fitur Chart.
 * Data harga selalu fetch ulang (bukan input user) — tidak disimpan ke Sheets.
 * Hanya preferensi indikator (localStorage) dan garis gambar/drawings (Sheets,
 * karena itu hasil kerja manual user yang harus sinkron multi-device).
 */

import { gsLoad, gsSave } from '../../shared/sheets.js'

export const DB = {
  sym:    null,
  daily:  [],     // array OHLCV harian, urut lama → baru
  absorption: null, // { date, net, buy, sell, prices } — hasil fetch terakhir
  lpmCache: {},   // {date: {buy, sell, net}} — cache LPM per tanggal, hindari fetch ulang
  drawings: []    // [{id, sym, type, t1, p1, t2, p2}] — semua saham, difilter per-sym saat render
}

const SHEET_DRAWINGS = 'chart-drawings'

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
