/**
 * shared/sheets.js
 * ================
 * Helper generik untuk baca/tulis Google Sheets via Apps Script.
 * SATU pintu data untuk SEMUA fitur — tidak ada fungsi spesifik per fitur.
 *
 * Backend (Apps Script) hanya punya 2 action:
 *   GET  ?action=load&sheet=NAMA   → { ok:true, data:... } atau { ok:false, error }
 *   POST { action:'save', sheet:NAMA, data:... } → { ok:true } atau { ok:false, error }
 *
 * Data disimpan sebagai 1 JSON blob di sel A1 tiap sheet — bukan per-baris/kolom.
 * Sheet otomatis dibuat oleh Apps Script kalau belum ada.
 *
 * Pola pakai (di tiap db.js):
 *   import { gsLoad, gsSave } from '../../shared/sheets.js'
 *   const watchlist = await gsLoad('haka-watchlist')   // null kalau belum ada data
 *   await gsSave('haka-watchlist', ['BBCA','TLKM'])
 *
 * Error yang di-throw (semua punya .code):
 *   FETCH_FAILED   → network error / tidak bisa connect ke Apps Script
 *   SHEETS_ERROR   → Apps Script merespons { ok:false, error:'...' }
 */

// ============================================================
// SEKSI 1: KONFIGURASI
// ============================================================

// URL deployment Apps Script aktif (generic load/save).
// PENTING: tiap kali deploy ulang via "New deployment", URL ini ganti — update di sini.
const GS_URL = 'https://script.google.com/macros/s/AKfycbyDcGxsy9zAyTeh4ZZPFdG6gdDFD3tAGOnq4gxIuyXezNQoZWrFZN1G-uopCnE7YifD/exec'

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

// ============================================================
// SEKSI 3: API PUBLIK
// ============================================================

/**
 * Ambil data dari 1 sheet. Return data langsung (bukan wrapper {ok,data}).
 * @param {string} sheet - nama sheet/tab (akan dibuat otomatis kalau belum ada)
 * @returns {any} data tersimpan, atau null kalau sheet masih kosong
 */
export async function gsLoad(sheet) {
  const qs = new URLSearchParams({ action: 'load', sheet }).toString()
  const json = await _fetch(`${GS_URL}?${qs}`)
  return json.data ?? null
}

/**
 * Simpan data ke 1 sheet (timpa seluruh isi sebelumnya).
 * @param {string} sheet - nama sheet/tab
 * @param {any}    data  - apapun yang bisa di-JSON.stringify (array/object)
 */
export async function gsSave(sheet, data) {
  await _fetch(GS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'save', sheet, data })
  })
}
