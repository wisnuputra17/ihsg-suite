/**
 * features/chart/db.js
 * =====================
 * Database in-memory untuk fitur Chart.
 * Data harga selalu fetch ulang (bukan input user) — tidak disimpan permanen.
 * Preferensi indikator (localStorage) dan garis gambar/drawings, LPM cache
 * — semua via shared/indexeddb.js (lokal per browser, lihat §⚠️ di bawah).
 *
 * ⚠️ TRADE-OFF YANG PERLU DISADARI (29 Jun 2026, migrasi dari Firestore ke
 * IndexedDB krn kuota gratis Firestore kena, Wisnu tidak punya kartu kredit
 * utk Blaze): drawings (garis gambar manual) SEBELUMNYA didesain explicit
 * utk SINKRON MULTI-DEVICE (gambar di laptop, kelihatan di device lain).
 * IndexedDB TIDAK BISA itu — data lokal per-browser/laptop saja. DITERIMA
 * krn Wisnu cuma pakai 1 laptop. Kalau nanti pakai >1 device, drawings
 * TIDAK akan muncul di device lain — perlu didesain ulang (mis. export/
 * import manual) kalau itu jadi kebutuhan nyata.
 */

import { gsLoad, gsSave, gsAppend } from '../../shared/indexeddb.js'

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
 * Load histori LPM untuk 1 saham (persist permanen di IndexedDB, sekali
 * fetch tidak perlu diulang lagi di sesi yang sama). Dipanggil tiap ganti saham.
 */
/** CATATAN HISTORIS (sudah tidak relevan utk IndexedDB, TAPI normalisasi ini
 * tetap aman & tidak mengganggu — dipertahankan sbg jaring pengaman, bukan
 * krn masih dibutuhkan): dulu Google Sheets otomatis ubah string tanggal
 * jadi Date cell, ASCII penuh saat dibaca balik. IndexedDB/Firestore tidak
 * punya masalah itu sama sekali.
 */
function _normalizeDate(d) {
  return String(d).slice(0, 10)
}

export async function loadLpmCacheForSym(sym) {
  try {
    const rows = await gsLoad(SHEET_LPM_CACHE)
    const cache = {}
    rows.filter(r => r.sym === sym).forEach(r => {
      const date = _normalizeDate(r.date)
      // Sentinel buy=-1 → tanggal sudah pernah dicek, API memang tidak punya data
      // (BUKAN net=0 sungguhan) — simpan null supaya tidak ikut hitungan kumulatif/bar.
      cache[date] = Number(r.buy) === -1 ? null : { buy: Number(r.buy), sell: Number(r.sell), net: Number(r.net) }
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
/**
 * Hapus SEMUA cache LPM untuk 1 simbol (dipakai saat cache tercemar
 * data lama dari masa bug elemen-terakhir-bukan-sum) lalu kosongkan
 * DB.lpmCache di memori supaya visible range difetch ulang bersih.
 */
export async function clearLpmCacheForSym(sym) {
  const rows = await gsLoad(SHEET_LPM_CACHE)
  const kept = rows.filter(r => r.sym !== sym)
  await gsSave(SHEET_LPM_CACHE, kept)
  DB.lpmCache = {}
}

export function appendLpmCache(sym, entries) {
  if (!entries.length) return
  const rows = entries.map(e => ({ sym, date: e.date, buy: e.buy, sell: e.sell, net: e.net }))
  gsAppend(SHEET_LPM_CACHE, rows).catch(e =>
    console.warn('[chart/db] append lpm cache gagal:', e.message)
  )
}

/** Load semua drawing (semua saham) dari IndexedDB — dipanggil sekali saat init. */
export async function loadDrawings() {
  try {
    const rows = await gsLoad(SHEET_DRAWINGS)
    DB.drawings = rows.map(r => ({
      id: r.id, sym: r.sym, type: r.type,
      // CATATAN HISTORIS (tidak relevan lagi utk IndexedDB, normalisasi
      // dipertahankan sbg jaring pengaman saja): dulu Google Sheets auto-
      // convert string tanggal jadi ISO penuh. t1/t2 utk timeframe D/W
      // berupa string tanggal ("2024-11-19"), intraday berupa unix timestamp
      // (number, tidak kena normalisasi ini, dibiarkan saja).
      t1: typeof r.t1 === 'number' ? r.t1 : _normalizeDate(r.t1), p1: Number(r.p1),
      t2: typeof r.t2 === 'number' ? r.t2 : _normalizeDate(r.t2), p2: Number(r.p2)
    }))
  } catch (e) {
    console.warn('[chart/db] load drawings gagal:', e.message)
    DB.drawings = []
  }
}

/** Tambah 1 drawing baru, simpan ke IndexedDB lokal (timpa seluruh list) -- TIDAK sinkron antar device, lihat catatan trade-off di header file. */
export function addDrawing(d) {
  DB.drawings.push(d)
  _saveDrawings()
}

/** Hapus 1 drawing by id, simpan ke IndexedDB lokal. */
export function removeDrawing(id) {
  DB.drawings = DB.drawings.filter(d => d.id !== id)
  _saveDrawings()
}

function _saveDrawings() {
  gsSave(SHEET_DRAWINGS, DB.drawings).catch(e =>
    console.warn('[chart/db] simpan drawings gagal:', e.message)
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
