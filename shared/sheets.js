/**
 * shared/sheets.js
 * ================
 * Helper generik untuk baca/tulis Google Sheets via Apps Script.
 * SATU pintu data untuk SEMUA fitur — tidak ada fungsi spesifik per fitur.
 *
 * Backend (apps-script/Code.gs) menyimpan data sebagai BARIS (bukan blob JSON
 * di 1 sel) — bisa dibuka & dibaca langsung di Google Sheets.
 *
 * ATURAN BENTUK DATA — WAJIB array of objects:
 *   gsSave('sheet', [{sym:'BBCA', price:9500}, {sym:'TLKM', price:3200}])
 *   gsLoad('sheet') → [{sym:'BBCA', price:'9500'}, ...]   (lihat catatan tipe di bawah)
 *
 * Kalau data domain di db.js BUKAN array (misal object {BBCA:{...}, TLKM:{...}}
 * atau array string ['BBCA','TLKM']), KONVERSI dulu di db.js sebelum panggil
 * gsSave, dan konversi balik setelah gsLoad. shared/sheets.js TIDAK BOLEH tahu
 * bentuk data spesifik fitur apapun.
 *
 * CATATAN TIPE DATA: Google Sheets menyimpan semua sebagai teks/angka biasa.
 * Field yang aslinya number akan balik sebagai number (Sheets API otomatis
 * deteksi), tapi field yang aslinya boolean akan balik sebagai string "true"/
 * "false" — konversi manual di db.js kalau perlu. Field object/array nested
 * disimpan sebagai JSON string dalam 1 sel — JSON.parse() lagi setelah gsLoad.
 *
 * Pola pakai (di tiap db.js):
 *   import { gsLoad, gsSave, gsAppend, gsClear } from '../../shared/sheets.js'
 *   const rows = await gsLoad('haka-watchlist')   // [] kalau belum ada data
 *   await gsSave('haka-watchlist', rows)          // timpa semua
 *   await gsAppend('haka-alerts', [newAlert])     // tambah ke bawah, tidak hapus lama
 *   await gsClear('haka-alerts')                  // hapus semua data (sisakan header)
 *
 * Error yang di-throw (semua punya .code):
 *   FETCH_FAILED   → network error / tidak bisa connect ke Apps Script
 *   SHEETS_ERROR   → Apps Script merespons { ok:false, error:'...' }
 */

// ============================================================
// SEKSI 1: KONFIGURASI
// ============================================================

// URL deployment Apps Script aktif.
// PENTING: tiap kali deploy ulang via "New deployment", URL ini ganti — update di sini.
const GS_URL = 'https://script.google.com/macros/s/AKfycbwa0jBd25DPgD761zmHJQ2VPFh2iqQM3I7iAhxeJQRwREE5iEMhD7g0mfHmdwgVXrs/exec'

// ============================================================
// SEKSI 2: HELPER INTERNAL
// ============================================================

async function _fetch(url, options = {}) {
  let res
  try {
    res = await fetch(url, options)
  } catch (e) {
    throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', detail: e.message })
  }

  if (!res.ok) {
    throw Object.assign(new Error('FETCH_FAILED'), { code: 'FETCH_FAILED', status: res.status })
  }

  const json = await res.json()

  if (json?.ok === false) {
    throw Object.assign(new Error('SHEETS_ERROR'), { code: 'SHEETS_ERROR', detail: json.error })
  }

  return json
}

async function _post(action, sheet, data) {
  return _fetch(GS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, sheet, data })
  })
}

// ============================================================
// SEKSI 3: API PUBLIK
// ============================================================

/**
 * Baca semua baris dari 1 sheet.
 * @param {string} sheet - nama sheet/tab (dibuat otomatis kalau belum ada)
 * @returns {Object[]} array of objects, [] kalau sheet masih kosong
 */
export async function gsLoad(sheet) {
  const qs = new URLSearchParams({ action: 'load', sheet }).toString()
  const json = await _fetch(`${GS_URL}?${qs}`)
  return json.data ?? []
}

/**
 * Timpa seluruh isi sheet dengan data baru.
 * @param {string} sheet - nama sheet/tab
 * @param {Object[]} data - array of objects, semua harus punya key yang sama
 */
export async function gsSave(sheet, data) {
  await _post('save', sheet, data)
}

/**
 * Tambah baris baru ke bawah — TIDAK menghapus data lama.
 * Cocok untuk data log/riwayat (alert feed, hasil scan harian, dst).
 * @param {string} sheet
 * @param {Object[]} data - array of objects baru yang akan ditambahkan
 */
export async function gsAppend(sheet, data) {
  await _post('append', sheet, data)
}

/**
 * Hapus semua data di sheet (header tetap ada).
 * @param {string} sheet
 */
export async function gsClear(sheet) {
  await _post('clear', sheet, [])
}
